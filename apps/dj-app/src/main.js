const { app, BrowserWindow, ipcMain } = require('electron');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { io } = require('socket.io-client');

const PARTY_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const DEFAULT_GUEST_WEB_BASE = 'https://pulsedeck-dj.github.io/pulsedeck/';
const DEFAULT_CONFIG = {
  apiBase: 'http://localhost:4000',
  partyCode: '',
  djKey: '',
  guestWebBase: DEFAULT_GUEST_WEB_BASE,
  deviceName: 'DJ-Macbook',
  requestsDir: path.join(os.homedir(), 'Desktop', 'Requests'),
  autoDownload: false,
  downloadCommand: '',
  cookieFilePath: ''
};

let mainWindow = null;
let liveConnection = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function normalizePartyCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function sanitizeText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeName(value) {
  return sanitizeText(value, 120).replace(/[\\/:*?"<>|]/g, '');
}

function sanitizeWebUrl(value, fallback = DEFAULT_GUEST_WEB_BASE) {
  const candidate = sanitizeText(value || fallback, 400);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function sanitizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function emit(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('dj:event', event);
}

function log(level, message) {
  emit({
    type: 'log',
    level,
    message,
    at: new Date().toISOString()
  });
}

function setStatus(status, detail = '') {
  emit({
    type: 'status',
    status,
    detail,
    at: new Date().toISOString()
  });
}

function safeParseJson(content, fallback) {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadConfig() {
  const filePath = configPath();
  if (!fs.existsSync(filePath)) return { ...DEFAULT_CONFIG };

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = safeParseJson(content, {});

  return {
    apiBase: sanitizeText(parsed.apiBase || DEFAULT_CONFIG.apiBase, 200),
    partyCode: normalizePartyCode(parsed.partyCode || ''),
    djKey: sanitizeText(parsed.djKey || '', 80),
    guestWebBase: sanitizeWebUrl(parsed.guestWebBase || DEFAULT_CONFIG.guestWebBase),
    deviceName: sanitizeText(parsed.deviceName || DEFAULT_CONFIG.deviceName, 80) || DEFAULT_CONFIG.deviceName,
    requestsDir: sanitizeText(parsed.requestsDir || DEFAULT_CONFIG.requestsDir, 300) || DEFAULT_CONFIG.requestsDir,
    autoDownload: sanitizeBoolean(parsed.autoDownload),
    downloadCommand: String(parsed.downloadCommand || '').trim().slice(0, 1000),
    cookieFilePath: sanitizeText(parsed.cookieFilePath || '', 400)
  };
}

function saveConfig(input) {
  const normalized = {
    apiBase: sanitizeText(input?.apiBase || DEFAULT_CONFIG.apiBase, 200),
    partyCode: normalizePartyCode(input?.partyCode || ''),
    djKey: sanitizeText(input?.djKey || '', 80),
    guestWebBase: sanitizeWebUrl(input?.guestWebBase || DEFAULT_CONFIG.guestWebBase),
    deviceName: sanitizeText(input?.deviceName || DEFAULT_CONFIG.deviceName, 80) || DEFAULT_CONFIG.deviceName,
    requestsDir: sanitizeText(input?.requestsDir || DEFAULT_CONFIG.requestsDir, 300) || DEFAULT_CONFIG.requestsDir,
    autoDownload: sanitizeBoolean(input?.autoDownload),
    downloadCommand: String(input?.downloadCommand || '').trim().slice(0, 1000),
    cookieFilePath: sanitizeText(input?.cookieFilePath || '', 400)
  };

  const filePath = configPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

function ensureRequestsDir(requestsDir) {
  if (!fs.existsSync(requestsDir)) {
    fs.mkdirSync(requestsDir, { recursive: true });
  }
}

function processedStorePath(requestsDir) {
  return path.join(requestsDir, '.processed.json');
}

function loadProcessedIds(requestsDir) {
  ensureRequestsDir(requestsDir);
  const filePath = processedStorePath(requestsDir);
  if (!fs.existsSync(filePath)) return new Set();

  const parsed = safeParseJson(fs.readFileSync(filePath, 'utf-8'), { ids: [] });
  if (!Array.isArray(parsed.ids)) return new Set();
  return new Set(parsed.ids.map((entry) => String(entry)));
}

function saveProcessedIds(requestsDir, processedIds) {
  const filePath = processedStorePath(requestsDir);
  fs.writeFileSync(filePath, JSON.stringify({ ids: Array.from(processedIds) }, null, 2), 'utf-8');
}

function buildFolderName(seqNo, title) {
  const safeTitle = sanitizeName(title) || 'Untitled Request';
  return `#${seqNo} - ${safeTitle}`;
}

function uniqueFolderPath(baseDir, folderName) {
  let candidate = path.join(baseDir, folderName);
  if (!fs.existsSync(candidate)) return candidate;

  let index = 2;
  while (true) {
    candidate = path.join(baseDir, `${folderName} (${index})`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

function shellEscape(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function buildGuestJoinUrl(guestWebBaseInput, partyCodeInput) {
  const partyCode = normalizePartyCode(partyCodeInput);
  if (!PARTY_CODE_PATTERN.test(partyCode)) {
    throw new Error('Party code must be exactly 6 letters/numbers.');
  }

  const guestWebBase = sanitizeWebUrl(guestWebBaseInput, DEFAULT_GUEST_WEB_BASE);
  const guestUrl = new URL(guestWebBase);
  guestUrl.searchParams.set('partyCode', partyCode);

  return {
    partyCode,
    url: guestUrl.toString(),
    guestWebBase
  };
}

async function buildGuestQr(payload) {
  const config = loadConfig();
  const info = buildGuestJoinUrl(payload?.guestWebBase || config.guestWebBase, payload?.partyCode || config.partyCode);
  const qrDataUrl = await QRCode.toDataURL(info.url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 420,
    color: {
      dark: '#0f1322',
      light: '#ffffffff'
    }
  });

  return {
    partyCode: info.partyCode,
    guestWebBase: info.guestWebBase,
    url: info.url,
    qrDataUrl
  };
}

function renderDownloadCommand(templateInput, variables) {
  let template = String(templateInput || '').trim();
  if (!template) return '';

  for (const [key, value] of Object.entries(variables)) {
    template = template.replaceAll(`{{${key}}}`, shellEscape(value));
  }

  return template;
}

function runShellCommand(command, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 20000) stdout = stdout.slice(-20000);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }

      const error = new Error(`Command exited with code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function shouldAttemptAutoDownload(connection, request) {
  if (!connection.autoDownload) return { ok: false, reason: '' };
  if (request.service !== 'Apple Music') {
    return {
      ok: false,
      level: 'info',
      reason: 'Auto-download skipped (service is not Apple Music).'
    };
  }
  if (!sanitizeText(request.appleMusicUrl, 500)) {
    return {
      ok: false,
      level: 'warning',
      reason: 'Auto-download skipped (Apple Music URL missing).'
    };
  }
  if (!connection.downloadCommand) {
    return {
      ok: false,
      level: 'warning',
      reason: 'Auto-download is enabled but command template is empty.'
    };
  }
  return { ok: true, reason: '', level: 'info' };
}

async function runAutoDownload(connection, request, folderPath) {
  const check = shouldAttemptAutoDownload(connection, request);
  if (!check.ok) {
    if (check.reason) log(check.level || 'warning', check.reason);
    return;
  }

  const variables = {
    url: sanitizeText(request.appleMusicUrl, 500),
    outputDir: folderPath,
    cookieFile: connection.cookieFilePath,
    title: sanitizeText(request.title, 120),
    artist: sanitizeText(request.artist, 120),
    seqNo: String(request.seqNo || ''),
    service: sanitizeText(request.service, 30),
    partyCode: connection.partyCode
  };

  const command = renderDownloadCommand(connection.downloadCommand, variables);
  if (!command) {
    log('warning', 'Download command template resolved to an empty command.');
    return;
  }

  const env = {
    PULSE_URL: variables.url,
    PULSE_OUTPUT_DIR: variables.outputDir,
    PULSE_COOKIE_FILE: variables.cookieFile,
    PULSE_TITLE: variables.title,
    PULSE_ARTIST: variables.artist,
    PULSE_SEQ_NO: variables.seqNo,
    PULSE_SERVICE: variables.service,
    PULSE_PARTY_CODE: variables.partyCode
  };

  log('info', `Running auto-download for #${variables.seqNo || '?'}...`);

  try {
    const result = await runShellCommand(command, folderPath, env);
    const output = [
      `timestamp=${new Date().toISOString()}`,
      `command=${command}`,
      '',
      '[stdout]',
      result.stdout || '(none)',
      '',
      '[stderr]',
      result.stderr || '(none)'
    ].join('\n');

    fs.writeFileSync(path.join(folderPath, 'download.log'), output, 'utf-8');
    log('success', `Auto-download completed for #${variables.seqNo || '?'}.`);
  } catch (error) {
    const output = [
      `timestamp=${new Date().toISOString()}`,
      `command=${command}`,
      `error=${error.message}`,
      '',
      '[stdout]',
      error.stdout || '(none)',
      '',
      '[stderr]',
      error.stderr || '(none)'
    ].join('\n');

    fs.writeFileSync(path.join(folderPath, 'download-error.log'), output, 'utf-8');
    log('error', `Auto-download failed for #${variables.seqNo || '?'}: ${error.message}`);
  }
}

function persistRequest(connection, request) {
  const requestId = String(request?.id || '');
  if (!requestId || connection.processedIds.has(requestId)) return;

  const seqNo = Number.isInteger(request.seqNo) && request.seqNo > 0 ? request.seqNo : Date.now();
  const folderPath = uniqueFolderPath(connection.requestsDir, buildFolderName(seqNo, request.title));

  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(
    path.join(folderPath, 'request.json'),
    JSON.stringify(
      {
        receivedAt: new Date().toISOString(),
        ...request
      },
      null,
      2
    ),
    'utf-8'
  );
  fs.writeFileSync(path.join(folderPath, 'song-url.txt'), request.appleMusicUrl || 'No URL provided', 'utf-8');

  connection.processedIds.add(requestId);
  saveProcessedIds(connection.requestsDir, connection.processedIds);

  emit({
    type: 'request-saved',
    request,
    folderPath,
    at: new Date().toISOString()
  });

  log('success', `Saved #${seqNo}: ${request.title} - ${request.artist}`);

  connection.downloadChain = connection.downloadChain
    .then(() => runAutoDownload(connection, request, folderPath))
    .catch((error) => {
      log('error', `Auto-download queue error: ${error.message}`);
    });
}

async function syncMissedRequests(connection) {
  const response = await axios.get(`${connection.apiBase}/api/parties/${connection.partyCode}/requests`, {
    headers: {
      'X-DJ-Session-ID': connection.sessionId,
      'X-DJ-Token': connection.token
    },
    timeout: 9000
  });

  const requests = Array.isArray(response.data) ? response.data : [];
  requests.sort((a, b) => Number(a.seqNo) - Number(b.seqNo));

  for (const request of requests) {
    persistRequest(connection, request);
  }

  log('info', `Synced ${requests.length} request(s).`);
}

async function disconnectDj(reason = 'Disconnected') {
  if (!liveConnection) {
    setStatus('idle', 'Not connected');
    return { ok: true };
  }

  if (liveConnection.heartbeatTimer) {
    clearInterval(liveConnection.heartbeatTimer);
  }

  if (liveConnection.socket) {
    liveConnection.socket.removeAllListeners();
    liveConnection.socket.disconnect();
  }

  liveConnection = null;
  setStatus('idle', reason);
  log('info', reason);
  return { ok: true };
}

async function connectDj(configInput) {
  await disconnectDj('Restarting connection...');

  try {
    const config = saveConfig(configInput);
    const partyCode = normalizePartyCode(config.partyCode);

    if (!PARTY_CODE_PATTERN.test(partyCode)) {
      throw new Error('Party code must be exactly 6 letters/numbers.');
    }

    if (!config.djKey) {
      throw new Error('DJ key is required.');
    }

    const apiBase = config.apiBase.replace(/\/+$/, '');
    ensureRequestsDir(config.requestsDir);

    setStatus('connecting', 'Claiming DJ role...');
    log('info', `Claiming DJ role for ${partyCode}...`);

    const claim = await axios.post(
      `${apiBase}/api/parties/${partyCode}/claim-dj`,
      {
        djKey: config.djKey,
        deviceName: config.deviceName
      },
      {
        timeout: 9000
      }
    );

    const connection = {
      apiBase,
      partyCode,
      sessionId: claim.data.sessionId,
      token: claim.data.token,
      expiresAt: claim.data.expiresAt,
      requestsDir: config.requestsDir,
      processedIds: loadProcessedIds(config.requestsDir),
      autoDownload: config.autoDownload,
      downloadCommand: config.downloadCommand,
      cookieFilePath: config.cookieFilePath,
      downloadChain: Promise.resolve(),
      socket: null,
      heartbeatTimer: null
    };

    liveConnection = connection;

    setStatus('connecting', `Session ${connection.sessionId.slice(0, 8)} established`);
    log('success', `DJ role claimed. Party expires at ${connection.expiresAt}`);
    if (connection.autoDownload) {
      log('info', 'Auto-download is enabled for new Apple Music requests.');
      if (connection.downloadCommand.includes('{{cookieFile}}') && !connection.cookieFilePath) {
        log('warning', 'Command uses {{cookieFile}} but Cookie File Path is empty.');
      }
    }

    await syncMissedRequests(connection);

    const socket = io(apiBase, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity
    });

    connection.socket = socket;

    socket.on('connect', () => {
      setStatus('connecting', 'Socket connected. Registering listener...');
      socket.emit('register_dj', {
        partyCode: connection.partyCode,
        sessionId: connection.sessionId,
        token: connection.token
      });
    });

    socket.on('register_ok', async () => {
      setStatus('connected', `Listening for ${connection.partyCode} requests`);
      log('success', `Realtime connected for party ${connection.partyCode}`);

      try {
        await syncMissedRequests(connection);
      } catch (error) {
        log('warning', `Sync warning: ${error.response?.data?.error || error.message}`);
      }
    });

    socket.on('register_error', (payload) => {
      setStatus('error', 'Socket registration failed');
      log('error', `Socket registration failed: ${payload?.error || 'unknown error'}`);
    });

    socket.on('request:new', (request) => {
      persistRequest(connection, request);
    });

    socket.on('disconnect', () => {
      setStatus('connecting', 'Socket disconnected. Reconnecting...');
      log('warning', 'Socket disconnected. Waiting for reconnect...');
    });

    connection.heartbeatTimer = setInterval(async () => {
      try {
        await axios.post(
          `${connection.apiBase}/api/parties/${connection.partyCode}/heartbeat`,
          {
            sessionId: connection.sessionId
          },
          {
            headers: {
              'X-DJ-Token': connection.token
            },
            timeout: 9000
          }
        );
      } catch (error) {
        log('warning', `Heartbeat warning: ${error.response?.data?.error || error.message}`);
      }
    }, 10000);

    return {
      ok: true,
      partyCode: connection.partyCode,
      requestsDir: connection.requestsDir
    };
  } catch (error) {
    await disconnectDj('Connection failed');
    throw error;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    title: 'PulseDeck DJ',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('config:load', () => loadConfig());
  ipcMain.handle('config:save', (_event, payload) => saveConfig(payload));
  ipcMain.handle('dj:build-guest-qr', async (_event, payload) => buildGuestQr(payload));
  ipcMain.handle('dj:connect', async (_event, payload) => connectDj(payload));
  ipcMain.handle('dj:disconnect', async () => disconnectDj('Disconnected by user'));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (liveConnection?.heartbeatTimer) {
    clearInterval(liveConnection.heartbeatTimer);
  }
  if (liveConnection?.socket) {
    liveConnection.socket.disconnect();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
