const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const { io } = require('socket.io-client');

const PARTY_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const DEFAULT_GUEST_WEB_BASE = 'https://pulsedeck-dj.github.io/pulsedeck/guest.html';
const HEARTBEAT_INTERVAL_MS = 10000;
const POLL_INTERVAL_MS = 2000;

// Public Supabase project values (anon key is safe to embed).
const DEFAULT_SUPABASE_URL = 'https://dliaiwwudygtbagzhcxb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsaWFpd3d1ZHlndGJhZ3poY3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNDI2NTksImV4cCI6MjA4NjYxODY1OX0.3uyJh-HyDC2hGb2NRjlEjcu1bXW1unK5iWdGNS9U6-c';

const DEFAULT_CONFIG = {
  // Legacy server mode (still supported). Supabase mode is used when configured.
  apiBase: '',
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
  partyCode: '',
  djKey: '',
  guestWebBase: DEFAULT_GUEST_WEB_BASE,
  // Keep a stable, non-user-configured device name for session attribution.
  deviceName: 'PulseDeck DJ'
};

let mainWindow = null;
let liveConnection = null;
let overlayWindow = null;

let downloadsWatcher = {
  folderPath: '',
  timer: null,
  seen: new Set(),
  autoOpenDjay: true,
  lastFilePath: ''
};

const AUDIO_EXTENSIONS = new Set(['.m4a', '.mp3', '.wav', '.aiff', '.aif', '.flac', '.aac', '.ogg', '.alac']);

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function walkAudioFiles(rootDir, maxDepth = 2, limit = 800) {
  const results = [];
  const root = String(rootDir || '').trim();
  if (!root) return results;

  function walk(dir, depth) {
    if (results.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= limit) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(ext)) continue;
      const st = safeStat(fullPath);
      if (!st) continue;
      results.push({ filePath: fullPath, mtimeMs: st.mtimeMs || 0 });
    }
  }

  walk(root, 0);
  return results;
}

async function openInDjay(filePath) {
  const target = String(filePath || '').trim();
  if (!target) return false;
  if (process.platform !== 'darwin') return false;
  if (!fileExists(target)) return false;

  const candidates = ['djay', 'djay Pro', 'djay Pro AI'];
  for (const name of candidates) {
    // macOS: `open -a <AppName> <file>`
    const ok = await new Promise((resolve) => {
      execFile('/usr/bin/open', ['-a', name, target], (error) => resolve(!error));
    });
    if (ok) return true;
  }

  // Fallback: open with the OS default handler for the file.
  try {
    await shell.openPath(target);
    return true;
  } catch {
    return false;
  }
}

async function openTerminal() {
  if (process.platform === 'darwin') {
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/open', ['-a', 'Terminal'], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return true;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile('cmd.exe', ['/c', 'start', 'cmd.exe'], () => resolve());
    });
    return true;
  }

  // Best-effort on Linux.
  try {
    await shell.openExternal('terminal:');
    return true;
  } catch {
    return false;
  }
}

function stopDownloadsWatch() {
  if (downloadsWatcher.timer) {
    clearInterval(downloadsWatcher.timer);
  }
  downloadsWatcher.timer = null;
}

function startDownloadsWatch(folderPath, options = {}) {
  const folder = String(folderPath || '').trim();
  if (!folder) throw new Error('Folder path is required');
  const st = safeStat(folder);
  if (!st || !st.isDirectory()) throw new Error('Selected path is not a folder');

  downloadsWatcher.folderPath = folder;
  downloadsWatcher.autoOpenDjay = options.autoOpenDjay !== false;
  downloadsWatcher.lastFilePath = downloadsWatcher.lastFilePath || '';

  stopDownloadsWatch();

  // Prime: don't fire for existing files.
  downloadsWatcher.seen = new Set(walkAudioFiles(folder, 2).map((f) => f.filePath));

  downloadsWatcher.timer = setInterval(async () => {
    const found = walkAudioFiles(downloadsWatcher.folderPath, 2);
    let newestNew = null;

    for (const entry of found) {
      if (downloadsWatcher.seen.has(entry.filePath)) continue;
      downloadsWatcher.seen.add(entry.filePath);
      if (!newestNew || entry.mtimeMs > newestNew.mtimeMs) newestNew = entry;
    }

    if (!newestNew) return;

    downloadsWatcher.lastFilePath = newestNew.filePath;

    emit({
      type: 'downloads:new-file',
      filePath: newestNew.filePath,
      at: new Date().toISOString()
    });

    if (downloadsWatcher.autoOpenDjay) {
      const opened = await openInDjay(newestNew.filePath);
      emit({
        type: 'downloads:auto-open',
        filePath: newestNew.filePath,
        opened,
        at: new Date().toISOString()
      });
    }
  }, 1200);

  return {
    ok: true,
    folderPath: downloadsWatcher.folderPath,
    autoOpenDjay: downloadsWatcher.autoOpenDjay
  };
}

function sanitizeFolderName(nameInput, fallback) {
  const raw = sanitizeText(nameInput || '', 80);
  const cleaned = raw
    .replace(/[\\/:"*?<>|]+/g, ' ')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const limited = cleaned.slice(0, 60);
  return limited || fallback || 'PulseDeck Party';
}

function ensurePartyFolder(baseFolderPath, partyName, partyCode) {
  const base = String(baseFolderPath || '').trim();
  if (!base) throw new Error('Base folder is required');
  const st = safeStat(base);
  if (!st || !st.isDirectory()) throw new Error('Selected base path is not a folder');

  const fallback = partyCode ? `Party-${partyCode}` : 'PulseDeck Party';
  const folderName = sanitizeFolderName(partyName, fallback);
  const partyFolderPath = path.join(base, folderName);
  fs.mkdirSync(partyFolderPath, { recursive: true });
  return partyFolderPath;
}

function summarizeQueueForLog(requests) {
  const list = Array.isArray(requests) ? requests : [];
  let queued = 0;
  let played = 0;
  let rejected = 0;

  for (const r of list) {
    const status = String(r?.status || 'queued').trim().toLowerCase();
    if (status === 'played') played += 1;
    else if (status === 'rejected') rejected += 1;
    else queued += 1;
  }

  return {
    total: list.length,
    queued,
    played,
    rejected
  };
}

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

function emit(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('dj:event', event);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('dj:event', event);
  }
}

function buildOverlayState() {
  return {
    ok: true,
    connected: Boolean(liveConnection),
    partyCode: liveConnection?.partyCode || '',
    partyName: liveConnection?.partyName || '',
    requests: Array.isArray(liveConnection?.lastRequests) ? liveConnection.lastRequests : []
  };
}

function log(level, message) {
  emit({
    type: 'log',
    level,
    message,
    at: new Date().toISOString()
  });
}

async function savePngFile(payload) {
  const dataUrl = String(payload?.dataUrl || '').trim();
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Invalid PNG data');
  }

  const suggestedNameRaw = sanitizeText(payload?.suggestedName || 'PulseDeck-QR', 120);
  const suggestedName = suggestedNameRaw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'PulseDeck-QR';
  const defaultPath = path.join(app.getPath('downloads'), `${suggestedName}.png`);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save QR PNG',
    defaultPath,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(result.filePath, buffer);
  return { ok: true, filePath: result.filePath };
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
    supabaseUrl: sanitizeText(parsed.supabaseUrl || DEFAULT_CONFIG.supabaseUrl, 220),
    supabaseAnonKey: sanitizeText(parsed.supabaseAnonKey || DEFAULT_CONFIG.supabaseAnonKey, 4096),
    partyCode: normalizePartyCode(parsed.partyCode || ''),
    djKey: sanitizeText(parsed.djKey || '', 80),
    guestWebBase: sanitizeWebUrl(parsed.guestWebBase || DEFAULT_CONFIG.guestWebBase)
  };
}

function saveConfig(input) {
  const normalized = {
    apiBase: sanitizeText(input?.apiBase || DEFAULT_CONFIG.apiBase, 200),
    supabaseUrl: sanitizeText(input?.supabaseUrl || DEFAULT_CONFIG.supabaseUrl, 220),
    supabaseAnonKey: sanitizeText(input?.supabaseAnonKey || DEFAULT_CONFIG.supabaseAnonKey, 4096),
    partyCode: normalizePartyCode(input?.partyCode || ''),
    djKey: sanitizeText(input?.djKey || '', 80),
    guestWebBase: sanitizeWebUrl(input?.guestWebBase || DEFAULT_CONFIG.guestWebBase)
  };

  const filePath = configPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

function isSupabaseUrl(value) {
  const text = String(value || '').trim().toLowerCase();
  return Boolean(text && text.includes('.supabase.co'));
}

function buildSupabaseClient(config) {
  const url = sanitizeText(config?.supabaseUrl || DEFAULT_SUPABASE_URL, 220).replace(/\/+$/, '');
  const anonKey = sanitizeText(config?.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY, 4096);

  if (!/^https:\/\//.test(url)) {
    throw new Error('Supabase URL must start with https://');
  }
  if (!anonKey) {
    throw new Error('Supabase anon key is missing.');
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function buildGuestJoinUrl(guestWebBaseInput, partyCodeInput) {
  const partyCode = normalizePartyCode(partyCodeInput);
  if (!PARTY_CODE_PATTERN.test(partyCode)) {
    throw new Error('Party code must be exactly 6 letters/numbers.');
  }

  const guestWebBase = sanitizeWebUrl(guestWebBaseInput, DEFAULT_GUEST_WEB_BASE);
  const guestUrl = new URL(guestWebBase);
  guestUrl.searchParams.set('partyCode', partyCode);
  guestUrl.searchParams.set('mode', 'guest');

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

function sanitizeQueueRequest(request, fallbackPartyCode) {
  const id = sanitizeText(request?.id, 128);
  if (!id) return null;

  const parsedSeqNo = Number(request?.seqNo ?? request?.seq_no);
  const seqNo = Number.isFinite(parsedSeqNo) && parsedSeqNo > 0 ? Math.floor(parsedSeqNo) : 0;

  let createdAt = new Date().toISOString();
  const createdRaw = request?.createdAt ?? request?.created_at;
  if (createdRaw) {
    const date = new Date(createdRaw);
    if (!Number.isNaN(date.getTime())) {
      createdAt = date.toISOString();
    }
  }

  const statusRaw = String(request?.status || 'queued').trim().toLowerCase();
  const status = statusRaw === 'played' ? 'played' : statusRaw === 'rejected' ? 'rejected' : 'queued';

  let playedAt = null;
  const playedRaw = request?.playedAt ?? request?.played_at;
  if (playedRaw) {
    const date = new Date(playedRaw);
    if (!Number.isNaN(date.getTime())) {
      playedAt = date.toISOString();
    }
  }

  return {
    id,
    seqNo,
    partyCode: sanitizeText(request?.partyCode || fallbackPartyCode, 12),
    title: sanitizeText(request?.title, 120) || 'Untitled',
    artist: sanitizeText(request?.artist, 120) || 'Unknown',
    service: sanitizeText(request?.service, 30) || 'Unknown',
    songUrl: sanitizeText(request?.songUrl || request?.song_url || request?.appleMusicUrl, 500),
    status,
    playedAt,
    playedBy: sanitizeText(request?.playedBy || request?.played_by, 80),
    createdAt
  };
}

function queueFingerprint(requests) {
  const list = Array.isArray(requests) ? requests : [];
  return list
    .map((r) => {
      return [
        r.id,
        r.seqNo,
        r.status,
        r.title,
        r.artist,
        r.service,
        r.songUrl || '',
        r.playedAt || ''
      ].join('|');
    })
    .join('\n');
}

function emitQueueReplace(connection, requestsInput) {
  const list = [];
  const seen = new Set();

  for (const entry of requestsInput) {
    const request = sanitizeQueueRequest(entry, connection.partyCode);
    if (!request) continue;
    if (seen.has(request.id)) continue;
    seen.add(request.id);
    list.push(request);
  }

  list.sort((a, b) => {
    if (a.seqNo && b.seqNo) return a.seqNo - b.seqNo;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const fp = queueFingerprint(list);
  const prevFp = connection.lastQueueFingerprint || '';

  connection.requestIds = new Set(list.map((entry) => entry.id));
  connection.lastQueueFingerprint = fp;
  connection.lastRequests = list;

  // Avoid UI flicker: only re-render the full list when something changed.
  if (fp !== prevFp) {
    emit({
      type: 'queue:replace',
      requests: list,
      at: new Date().toISOString()
    });
  }

  return list;
}

function emitQueueUpsert(connection, requestInput, source = 'realtime', options = {}) {
  const request = sanitizeQueueRequest(requestInput, connection.partyCode);
  if (!request) return null;

  const isNew = !connection.requestIds.has(request.id);
  connection.requestIds.add(request.id);

  emit({
    type: 'queue:add',
    source,
    request,
    at: new Date().toISOString()
  });

  if (options.announce) {
    if (isNew && request.status === 'queued') {
      log('success', `Queued #${request.seqNo || '?'}: ${request.title} - ${request.artist}`);
    } else if (!isNew && request.status === 'played') {
      log('info', `Marked played #${request.seqNo || '?'}: ${request.title} - ${request.artist}`);
    } else if (!isNew && request.status === 'queued') {
      log('info', `Returned to queue #${request.seqNo || '?'}: ${request.title} - ${request.artist}`);
    }
  }

  return { request, isNew };
}

async function syncQueue(connection) {
  if (connection.mode === 'supabase') {
    const { data, error } = await connection.supabase.rpc('dj_list_requests', {
      p_code: connection.partyCode,
      p_session_id: connection.sessionId,
      p_dj_token: connection.token
    });

    if (error) {
      throw new Error(error.message || 'Failed to load requests');
    }

    const requests = Array.isArray(data) ? data : [];
    const replaced = emitQueueReplace(connection, requests);

    // Polling runs frequently; only log if something changed or if this is the first sync.
    const summary = summarizeQueueForLog(replaced);
    const prev = connection.lastQueueSummary;
    const shouldLog =
      !prev ||
      prev.total !== summary.total ||
      prev.queued !== summary.queued ||
      prev.played !== summary.played ||
      prev.rejected !== summary.rejected;

    connection.lastQueueSummary = summary;
    if (shouldLog) {
      log('info', `Queue synced (${summary.total} total, ${summary.queued} queued).`);
    }
    return;
  }

  const response = await axios.get(`${connection.apiBase}/api/parties/${connection.partyCode}/requests`, {
    headers: {
      'X-DJ-Session-ID': connection.sessionId,
      'X-DJ-Token': connection.token
    },
    timeout: 9000
  });

  const requests = Array.isArray(response.data) ? response.data : [];
  const replaced = emitQueueReplace(connection, requests);
  const summary = summarizeQueueForLog(replaced);
  const prev = connection.lastQueueSummary;
  const shouldLog =
    !prev ||
    prev.total !== summary.total ||
    prev.queued !== summary.queued ||
    prev.played !== summary.played ||
    prev.rejected !== summary.rejected;

  connection.lastQueueSummary = summary;
  if (shouldLog) {
    log('info', `Queue synced (${summary.total} total, ${summary.queued} queued).`);
  }
}

async function disconnectDj(reason = 'Disconnected') {
  if (!liveConnection) {
    setStatus('idle', 'Not connected');
    return { ok: true };
  }

  if (liveConnection.heartbeatTimer) {
    clearInterval(liveConnection.heartbeatTimer);
  }

  if (liveConnection.pollTimer) {
    clearInterval(liveConnection.pollTimer);
  }

  if (liveConnection.socket) {
    liveConnection.socket.removeAllListeners();
    liveConnection.socket.disconnect();
  }

  liveConnection = null;
  emit({ type: 'queue:clear', at: new Date().toISOString() });
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

    const useSupabase = isSupabaseUrl(config.supabaseUrl) || !String(config.apiBase || '').trim() || isSupabaseUrl(config.apiBase);

    setStatus('connecting', 'Claiming DJ role...');
    log('info', `Claiming DJ role for ${partyCode}...`);

    let connection;

    if (useSupabase) {
      const supabase = buildSupabaseClient(config);
      const { data, error } = await supabase.rpc('claim_dj', {
        p_code: partyCode,
        p_dj_key: config.djKey,
        p_device_name: DEFAULT_CONFIG.deviceName
      });

      if (error) {
        throw new Error(error.message || 'Failed to claim DJ role');
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.session_id || !row?.dj_token) {
        throw new Error('Failed to claim DJ role');
      }

      connection = {
        mode: 'supabase',
        supabase,
        apiBase: '',
        partyCode,
        partyName: '',
        sessionId: String(row.session_id),
        token: String(row.dj_token),
        expiresAt: row.expires_at ? String(row.expires_at) : '',
        requestIds: new Set(),
        lastQueueSummary: null,
        lastQueueFingerprint: '',
        socket: null,
        heartbeatTimer: null,
        pollTimer: null
      };

      // Party name is public metadata returned by join_party; safe to use for UI/folder naming.
      try {
        const meta = await supabase.rpc('join_party', { p_code: partyCode });
        const metaRow = Array.isArray(meta?.data) ? meta.data[0] : meta?.data;
        connection.partyName = String(metaRow?.party_name || '').trim();
      } catch {
        // ignore
      }
    } else {
      const apiBase = config.apiBase.replace(/\/+$/, '');
      if (!/^https?:\/\//.test(apiBase)) {
        throw new Error('API Base URL must start with http:// or https://');
      }

      const claim = await axios.post(
        `${apiBase}/api/parties/${partyCode}/claim-dj`,
        {
          djKey: config.djKey,
          deviceName: DEFAULT_CONFIG.deviceName
        },
        {
          timeout: 9000
        }
      );

      connection = {
        mode: 'api',
        supabase: null,
        apiBase,
        partyCode,
        partyName: '',
        sessionId: claim.data.sessionId,
        token: claim.data.token,
        expiresAt: claim.data.expiresAt,
        requestIds: new Set(),
        lastQueueSummary: null,
        lastQueueFingerprint: '',
        socket: null,
        heartbeatTimer: null,
        pollTimer: null
      };
    }

    liveConnection = connection;
    emit({ type: 'queue:clear', at: new Date().toISOString() });

    setStatus('connecting', `Session ${connection.sessionId.slice(0, 8)} established`);
    log('success', `DJ role claimed. Party expires at ${connection.expiresAt}`);

    await syncQueue(connection);

    connection.heartbeatTimer = setInterval(async () => {
      try {
        if (connection.mode === 'supabase') {
          const { error } = await connection.supabase.rpc('dj_heartbeat', {
            p_code: connection.partyCode,
            p_session_id: connection.sessionId,
            p_dj_token: connection.token
          });
          if (error) throw new Error(error.message || 'Heartbeat failed');
        } else {
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
        }
      } catch (error) {
        log('warning', `Heartbeat warning: ${error.response?.data?.error || error.message}`);
      }
    }, HEARTBEAT_INTERVAL_MS);

    if (connection.mode === 'supabase') {
      setStatus('connected', `Live queue ready for party ${connection.partyCode}`);
      log('success', `Connected (Supabase) for party ${connection.partyCode}`);

      connection.pollTimer = setInterval(async () => {
        try {
          await syncQueue(connection);
        } catch (error) {
          log('warning', `Sync warning: ${error.message || error}`);
        }
      }, POLL_INTERVAL_MS);
    } else {
      const socket = io(connection.apiBase, {
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
        setStatus('connected', `Live queue ready for party ${connection.partyCode}`);
        log('success', `Realtime connected for party ${connection.partyCode}`);

        try {
          await syncQueue(connection);
        } catch (error) {
          log('warning', `Sync warning: ${error.response?.data?.error || error.message}`);
        }
      });

      socket.on('register_error', (payload) => {
        setStatus('error', 'Socket registration failed');
        log('error', `Socket registration failed: ${payload?.error || 'unknown error'}`);
      });

      socket.on('request:new', (request) => {
        emitQueueUpsert(connection, request, 'realtime', { announce: true });
      });

      socket.on('request:update', (request) => {
        emitQueueUpsert(connection, request, 'update', { announce: true });
      });

      socket.on('disconnect', () => {
        setStatus('connecting', 'Socket disconnected. Reconnecting...');
        log('warning', 'Socket disconnected. Waiting for reconnect...');
      });
    }

    return {
      ok: true,
      partyCode: connection.partyCode,
      queueSize: connection.requestIds.size
    };
  } catch (error) {
    await disconnectDj('Connection failed');
    throw error;
  }
}

async function updateRequestStatus(requestIdInput, nextStatus) {
  if (!liveConnection) {
    throw new Error('Not connected. Connect to a party first.');
  }

  const requestId = sanitizeText(requestIdInput, 128);
  if (!requestId) {
    throw new Error('Request ID is missing.');
  }

  const status = nextStatus === 'played' ? 'played' : nextStatus === 'rejected' ? 'rejected' : 'queued';

  if (liveConnection.mode === 'supabase') {
    const fn = status === 'played' ? 'dj_mark_played' : status === 'rejected' ? 'dj_mark_rejected' : 'dj_mark_queued';
    const { error } = await liveConnection.supabase.rpc(fn, {
      p_code: liveConnection.partyCode,
      p_request_id: requestId,
      p_session_id: liveConnection.sessionId,
      p_dj_token: liveConnection.token
    });
    if (error) throw new Error(error.message || 'Update failed');

    await syncQueue(liveConnection);
    return { ok: true };
  }

  if (status === 'rejected') {
    throw new Error('Reject is not supported in legacy API mode. Use Supabase mode.');
  }

  const response = await axios.post(
    `${liveConnection.apiBase}/api/parties/${liveConnection.partyCode}/requests/${requestId}/${status}`,
    {},
    {
      headers: {
        'X-DJ-Session-ID': liveConnection.sessionId,
        'X-DJ-Token': liveConnection.token
      },
      timeout: 9000
    }
  );

  const payload = response.data || {};
  emitQueueUpsert(liveConnection, payload, 'action', { announce: true });
  return payload;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'PulseDeck DJ',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function openOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 360,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    transparent: true,
    title: 'PulseDeck Overlay',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  return overlayWindow;
}

app.whenReady().then(() => {
  ipcMain.handle('config:load', () => loadConfig());
  ipcMain.handle('config:save', (_event, payload) => saveConfig(payload));
  ipcMain.handle('dj:build-guest-qr', async (_event, payload) => buildGuestQr(payload));
  ipcMain.handle('dj:connect', async (_event, payload) => connectDj(payload));
  ipcMain.handle('dj:disconnect', async () => disconnectDj('Disconnected by user'));
  ipcMain.handle('dj:mark-played', async (_event, payload) => updateRequestStatus(payload?.requestId, 'played'));
  ipcMain.handle('dj:mark-queued', async (_event, payload) => updateRequestStatus(payload?.requestId, 'queued'));
  ipcMain.handle('dj:mark-rejected', async (_event, payload) => updateRequestStatus(payload?.requestId, 'rejected'));
  ipcMain.handle('file:save-png', async (_event, payload) => savePngFile(payload));
  ipcMain.handle('file:pick-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose folder (cookies.txt, downloads, etc.)',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true };
    return { ok: true, folderPath: result.filePaths[0] };
  });
  ipcMain.handle('overlay:open', async () => {
    openOverlayWindow();
    return { ok: true };
  });
  ipcMain.handle('overlay:close', async () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    overlayWindow = null;
    return { ok: true };
  });
  ipcMain.handle('overlay:state', async () => buildOverlayState());
  ipcMain.handle('system:open-url', async (_event, payload) => {
    const url = String(payload?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Invalid URL');
    }
    await shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('system:open-path', async (_event, payload) => {
    const target = String(payload?.path || '').trim();
    if (!target) throw new Error('Missing path');
    await shell.openPath(target);
    return { ok: true };
  });
  ipcMain.handle('system:open-terminal', async () => {
    const ok = await openTerminal();
    return { ok };
  });
  ipcMain.handle('dj:party-info', async () => {
    return {
      ok: Boolean(liveConnection),
      partyCode: liveConnection?.partyCode || '',
      partyName: liveConnection?.partyName || ''
    };
  });

  ipcMain.handle('downloads:start', async (_event, payload) => {
    return startDownloadsWatch(payload?.folderPath, { autoOpenDjay: payload?.autoOpenDjay });
  });
  ipcMain.handle('downloads:stop', async () => {
    stopDownloadsWatch();
    return { ok: true };
  });
  ipcMain.handle('downloads:status', async () => {
    return {
      ok: true,
      folderPath: downloadsWatcher.folderPath,
      watching: Boolean(downloadsWatcher.timer),
      autoOpenDjay: Boolean(downloadsWatcher.autoOpenDjay),
      lastFilePath: downloadsWatcher.lastFilePath
    };
  });
  ipcMain.handle('downloads:ensure-party-folder', async (_event, payload) => {
    const baseFolderPath = String(payload?.baseFolderPath || '').trim();
    const partyName = String(payload?.partyName || '').trim();
    const partyCode = String(payload?.partyCode || '').trim();
    const partyFolderPath = ensurePartyFolder(baseFolderPath, partyName, partyCode);
    return { ok: true, partyFolderPath };
  });
  ipcMain.handle('downloads:reveal', async (_event, payload) => {
    const filePath = String(payload?.filePath || '').trim();
    if (!filePath) throw new Error('Missing file path');
    shell.showItemInFolder(filePath);
    return { ok: true };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopDownloadsWatch();
  if (liveConnection?.heartbeatTimer) {
    clearInterval(liveConnection.heartbeatTimer);
  }
  if (liveConnection?.pollTimer) {
    clearInterval(liveConnection.pollTimer);
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
