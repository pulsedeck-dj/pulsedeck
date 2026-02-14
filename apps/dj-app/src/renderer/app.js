const apiBaseInput = document.getElementById('apiBase');
const partyCodeInput = document.getElementById('partyCode');
const djKeyInput = document.getElementById('djKey');
const deviceNameInput = document.getElementById('deviceName');
const requestsDirInput = document.getElementById('requestsDir');
const autoDownloadInput = document.getElementById('autoDownload');
const downloadCommandInput = document.getElementById('downloadCommand');
const cookieFilePathInput = document.getElementById('cookieFilePath');

const saveBtn = document.getElementById('saveBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const requestsList = document.getElementById('requestsList');
const requestCount = document.getElementById('requestCount');
const logList = document.getElementById('logList');

let unsubscribe = null;
const requestEvents = [];

function normalizePartyCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function nowLabel(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setStatus(status, detail) {
  statusPill.classList.remove('status-idle', 'status-connecting', 'status-connected', 'status-error');

  if (status === 'connected') {
    statusPill.classList.add('status-connected');
    statusPill.textContent = 'Connected';
  } else if (status === 'connecting') {
    statusPill.classList.add('status-connecting');
    statusPill.textContent = 'Connecting';
  } else if (status === 'error') {
    statusPill.classList.add('status-error');
    statusPill.textContent = 'Error';
  } else {
    statusPill.classList.add('status-idle');
    statusPill.textContent = 'Idle';
  }

  statusText.textContent = detail || 'Ready.';
}

function appendLog(level, message, at) {
  const item = document.createElement('article');
  item.className = `log-item log-${level || 'info'}`;

  const time = document.createElement('p');
  time.className = 'log-time';
  time.textContent = nowLabel(at);

  const text = document.createElement('p');
  text.className = 'log-msg';
  text.textContent = message;

  item.append(time, text);
  logList.prepend(item);

  while (logList.children.length > 120) {
    logList.removeChild(logList.lastElementChild);
  }
}

function renderRequestList() {
  requestsList.textContent = '';
  requestCount.textContent = String(requestEvents.length);

  if (!requestEvents.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No requests saved yet.';
    requestsList.appendChild(empty);
    return;
  }

  for (const entry of requestEvents) {
    const item = document.createElement('article');
    item.className = 'request-item';

    const title = document.createElement('p');
    title.className = 'request-title';
    title.textContent = `#${entry.seqNo} ${entry.title} - ${entry.artist}`;

    const sub = document.createElement('p');
    sub.className = 'request-sub';
    sub.textContent = `${nowLabel(entry.at)} • ${entry.folderPath}`;

    item.append(title, sub);
    requestsList.appendChild(item);
  }
}

function pushRequestEvent(payload) {
  requestEvents.unshift({
    seqNo: payload.request?.seqNo || '?',
    title: payload.request?.title || 'Untitled',
    artist: payload.request?.artist || 'Unknown',
    folderPath: payload.folderPath || '',
    at: payload.at
  });

  while (requestEvents.length > 80) {
    requestEvents.pop();
  }

  renderRequestList();
}

function readFormConfig() {
  return {
    apiBase: String(apiBaseInput.value || '').trim(),
    partyCode: normalizePartyCode(partyCodeInput.value),
    djKey: String(djKeyInput.value || '').trim(),
    deviceName: String(deviceNameInput.value || '').trim(),
    requestsDir: String(requestsDirInput.value || '').trim(),
    autoDownload: Boolean(autoDownloadInput.checked),
    downloadCommand: String(downloadCommandInput.value || '').trim(),
    cookieFilePath: String(cookieFilePathInput.value || '').trim()
  };
}

function writeFormConfig(config) {
  apiBaseInput.value = config.apiBase || '';
  partyCodeInput.value = config.partyCode || '';
  djKeyInput.value = config.djKey || '';
  deviceNameInput.value = config.deviceName || '';
  requestsDirInput.value = config.requestsDir || '';
  autoDownloadInput.checked = Boolean(config.autoDownload);
  downloadCommandInput.value = config.downloadCommand || '';
  cookieFilePathInput.value = config.cookieFilePath || '';
  syncAutoDownloadInputs();
}

function syncAutoDownloadInputs() {
  const enabled = Boolean(autoDownloadInput.checked);
  downloadCommandInput.disabled = !enabled;
  cookieFilePathInput.disabled = !enabled;
}

async function initialize() {
  renderRequestList();
  setStatus('idle', 'Loading settings...');

  const config = await window.djApi.loadConfig();
  writeFormConfig(config);
  setStatus('idle', 'Ready. Configure values and connect.');

  unsubscribe = window.djApi.onEvent((event) => {
    if (!event || typeof event !== 'object') return;

    if (event.type === 'status') {
      setStatus(event.status, event.detail || '');
      return;
    }

    if (event.type === 'log') {
      appendLog(event.level || 'info', event.message || '', event.at);
      return;
    }

    if (event.type === 'request-saved') {
      pushRequestEvent(event);
    }
  });
}

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);
});

autoDownloadInput.addEventListener('change', syncAutoDownloadInputs);

saveBtn.addEventListener('click', async () => {
  try {
    const config = await window.djApi.saveConfig(readFormConfig());
    writeFormConfig(config);
    appendLog('success', 'Settings saved.', new Date().toISOString());
  } catch (error) {
    appendLog('error', error.message || 'Failed to save settings.', new Date().toISOString());
  }
});

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  try {
    setStatus('connecting', 'Connecting to party...');
    await window.djApi.connect(readFormConfig());
    appendLog('success', 'DJ listener connected.', new Date().toISOString());
  } catch (error) {
    setStatus('error', error.message || 'Connection failed');
    appendLog('error', error.message || 'Connection failed.', new Date().toISOString());
  } finally {
    connectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener('click', async () => {
  try {
    await window.djApi.disconnect();
    appendLog('info', 'Disconnected.', new Date().toISOString());
  } catch (error) {
    appendLog('error', error.message || 'Disconnect failed.', new Date().toISOString());
  }
});

window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});

initialize().catch((error) => {
  setStatus('error', error.message || 'Initialization failed');
  appendLog('error', error.message || 'Initialization failed.', new Date().toISOString());
});
