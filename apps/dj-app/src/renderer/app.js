const apiBaseInput = document.getElementById('apiBase');
const partyCodeInput = document.getElementById('partyCode');
const djKeyInput = document.getElementById('djKey');
const guestWebBaseInput = document.getElementById('guestWebBase');
const deviceNameInput = document.getElementById('deviceName');

const saveBtn = document.getElementById('saveBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const showQrBtn = document.getElementById('showQrBtn');

const copyPartyCodeBtn = document.getElementById('copyPartyCodeBtn');
const copyGuestUrlBtn = document.getElementById('copyGuestUrlBtn');
const jumpRequestsBtn = document.getElementById('jumpRequestsBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

const tabBoothBtn = document.getElementById('tabBoothBtn');
const tabRequestsBtn = document.getElementById('tabRequestsBtn');
const boothWindow = document.getElementById('boothWindow');
const requestsWindow = document.getElementById('requestsWindow');

const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const requestsList = document.getElementById('requestsList');
const requestCount = document.getElementById('requestCount');
const requestCountTab = document.getElementById('requestCountTab');
const logList = document.getElementById('logList');

const qrModal = document.getElementById('qrModal');
const qrCloseBtn = document.getElementById('qrCloseBtn');
const qrPartyCode = document.getElementById('qrPartyCode');
const qrImage = document.getElementById('qrImage');
const qrUrl = document.getElementById('qrUrl');

let unsubscribe = null;
let queueItems = [];
let activeWindow = 'booth';

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

function setWindow(windowName) {
  activeWindow = windowName;

  const isBooth = windowName === 'booth';
  boothWindow.classList.toggle('hidden', !isBooth);
  requestsWindow.classList.toggle('hidden', isBooth);

  tabBoothBtn.classList.toggle('is-active', isBooth);
  tabRequestsBtn.classList.toggle('is-active', !isBooth);

  if (!isBooth) {
    tabRequestsBtn.classList.remove('has-alert');
  }
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

function sanitizeQueueEntry(entry) {
  const id = String(entry?.id || '').trim();
  if (!id) return null;

  const seqNo = Number.isFinite(Number(entry?.seqNo)) ? Number(entry.seqNo) : 0;

  return {
    id,
    seqNo,
    title: String(entry?.title || 'Untitled').trim() || 'Untitled',
    artist: String(entry?.artist || 'Unknown').trim() || 'Unknown',
    service: String(entry?.service || 'Unknown').trim() || 'Unknown',
    appleMusicUrl: String(entry?.appleMusicUrl || '').trim(),
    createdAt: String(entry?.createdAt || new Date().toISOString())
  };
}

function sortQueue(items) {
  items.sort((a, b) => {
    if (a.seqNo && b.seqNo) return b.seqNo - a.seqNo;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function updateQueueCounters() {
  const count = queueItems.length;
  requestCount.textContent = String(count);
  requestCountTab.textContent = String(count);
}

function setQueue(itemsInput) {
  const map = new Map();

  for (const raw of itemsInput) {
    const entry = sanitizeQueueEntry(raw);
    if (!entry) continue;
    map.set(entry.id, entry);
  }

  queueItems = Array.from(map.values());
  sortQueue(queueItems);
  renderRequestList();
}

function addQueueItem(itemInput) {
  const item = sanitizeQueueEntry(itemInput);
  if (!item) return;

  const existing = queueItems.findIndex((entry) => entry.id === item.id);
  if (existing >= 0) {
    queueItems[existing] = item;
  } else {
    queueItems.unshift(item);
  }

  sortQueue(queueItems);
  renderRequestList();

  if (activeWindow !== 'requests') {
    tabRequestsBtn.classList.add('has-alert');
  }
}

function clearQueue() {
  queueItems = [];
  renderRequestList();
  tabRequestsBtn.classList.remove('has-alert');
}

function renderRequestList() {
  requestsList.textContent = '';
  updateQueueCounters();

  if (!queueItems.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No requests yet. Share QR and wait for guests to submit songs.';
    requestsList.appendChild(empty);
    return;
  }

  for (const entry of queueItems) {
    const item = document.createElement('article');
    item.className = 'request-item';

    const top = document.createElement('div');
    top.className = 'request-top';

    const seq = document.createElement('span');
    seq.className = 'request-seq';
    seq.textContent = entry.seqNo > 0 ? `#${entry.seqNo}` : '#?';

    const service = document.createElement('span');
    service.className = 'request-service';
    service.textContent = entry.service;

    top.append(seq, service);

    const title = document.createElement('p');
    title.className = 'request-title';
    title.textContent = entry.title;

    const artist = document.createElement('p');
    artist.className = 'request-artist';
    artist.textContent = entry.artist;

    const meta = document.createElement('p');
    meta.className = 'request-sub';
    meta.textContent = `Queued ${nowLabel(entry.createdAt)}`;

    item.append(top, title, artist, meta);

    if (entry.appleMusicUrl) {
      const link = document.createElement('a');
      link.className = 'request-link';
      link.href = entry.appleMusicUrl;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = 'Open Song Link';
      item.appendChild(link);
    }

    requestsList.appendChild(item);
  }
}

function readFormConfig() {
  return {
    apiBase: String(apiBaseInput.value || '').trim(),
    partyCode: normalizePartyCode(partyCodeInput.value),
    djKey: String(djKeyInput.value || '').trim(),
    guestWebBase: String(guestWebBaseInput.value || '').trim(),
    deviceName: String(deviceNameInput.value || '').trim()
  };
}

function writeFormConfig(config) {
  apiBaseInput.value = config.apiBase || '';
  partyCodeInput.value = config.partyCode || '';
  djKeyInput.value = config.djKey || '';
  guestWebBaseInput.value = config.guestWebBase || '';
  deviceNameInput.value = config.deviceName || '';
}

function setQrVisible(visible) {
  if (visible) {
    qrModal.classList.remove('hidden');
    qrModal.setAttribute('aria-hidden', 'false');
  } else {
    qrModal.classList.add('hidden');
    qrModal.setAttribute('aria-hidden', 'true');
  }
}

async function copyToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const temp = document.createElement('textarea');
    temp.value = value;
    temp.setAttribute('readonly', 'true');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(temp);
    return Boolean(ok);
  } catch {
    return false;
  }
}

async function copyPartyCode() {
  const partyCode = normalizePartyCode(partyCodeInput.value);
  if (!partyCode) {
    appendLog('warning', 'Enter a valid party code first.', new Date().toISOString());
    return;
  }

  const ok = await copyToClipboard(partyCode);
  if (ok) {
    appendLog('success', `Party code ${partyCode} copied.`, new Date().toISOString());
  } else {
    appendLog('error', 'Could not copy party code.', new Date().toISOString());
  }
}

async function copyGuestUrl() {
  try {
    const payload = await window.djApi.buildGuestQr({
      partyCode: normalizePartyCode(partyCodeInput.value),
      guestWebBase: String(guestWebBaseInput.value || '').trim()
    });

    const ok = await copyToClipboard(payload.url);
    if (ok) {
      appendLog('success', 'Guest URL copied to clipboard.', new Date().toISOString());
    } else {
      appendLog('error', 'Could not copy guest URL.', new Date().toISOString());
    }
  } catch (error) {
    appendLog('error', error.message || 'Could not build guest URL.', new Date().toISOString());
  }
}

async function initialize() {
  clearQueue();
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

    if (event.type === 'queue:clear') {
      clearQueue();
      return;
    }

    if (event.type === 'queue:replace') {
      setQueue(Array.isArray(event.requests) ? event.requests : []);
      return;
    }

    if (event.type === 'queue:add') {
      addQueueItem(event.request);
    }
  });
}

tabBoothBtn.addEventListener('click', () => {
  setWindow('booth');
});

tabRequestsBtn.addEventListener('click', () => {
  setWindow('requests');
});

jumpRequestsBtn.addEventListener('click', () => {
  setWindow('requests');
});

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);
});

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
    const result = await window.djApi.connect(readFormConfig());
    appendLog('success', `DJ listener connected for ${result.partyCode}.`, new Date().toISOString());
    setWindow('requests');
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

showQrBtn.addEventListener('click', async () => {
  try {
    const payload = await window.djApi.buildGuestQr({
      partyCode: normalizePartyCode(partyCodeInput.value),
      guestWebBase: String(guestWebBaseInput.value || '').trim()
    });

    qrPartyCode.textContent = payload.partyCode;
    qrImage.src = payload.qrDataUrl;
    qrUrl.textContent = payload.url;
    setQrVisible(true);

    appendLog('success', `Guest QR generated for party ${payload.partyCode}.`, new Date().toISOString());
  } catch (error) {
    appendLog('error', error.message || 'Could not generate guest QR.', new Date().toISOString());
  }
});

copyPartyCodeBtn.addEventListener('click', () => {
  copyPartyCode();
});

copyGuestUrlBtn.addEventListener('click', () => {
  copyGuestUrl();
});

clearLogBtn.addEventListener('click', () => {
  logList.textContent = '';
  appendLog('info', 'Activity log cleared.', new Date().toISOString());
});

qrCloseBtn.addEventListener('click', () => {
  setQrVisible(false);
});

qrModal.addEventListener('click', (event) => {
  if (event.target === qrModal) {
    setQrVisible(false);
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setQrVisible(false);
  }
});

window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});

setWindow('booth');

initialize().catch((error) => {
  setStatus('error', error.message || 'Initialization failed');
  appendLog('error', error.message || 'Initialization failed.', new Date().toISOString());
});
