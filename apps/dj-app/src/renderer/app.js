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
const tabShareBtn = document.getElementById('tabShareBtn');

const boothWindow = document.getElementById('boothWindow');
const requestsWindow = document.getElementById('requestsWindow');
const shareWindow = document.getElementById('shareWindow');

const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const requestsList = document.getElementById('requestsList');
const queueOrderBtn = document.getElementById('queueOrderBtn');
const queueFilterInput = document.getElementById('queueFilter');
const requestCount = document.getElementById('requestCount');
const requestCountTab = document.getElementById('requestCountTab');
const logList = document.getElementById('logList');

const sharePartyCode = document.getElementById('sharePartyCode');
const shareGuestUrl = document.getElementById('shareGuestUrl');
const shareQrImage = document.getElementById('shareQrImage');
const shareRefreshBtn = document.getElementById('shareRefreshBtn');
const shareCopyCodeBtn = document.getElementById('shareCopyCodeBtn');
const shareCopyUrlBtn = document.getElementById('shareCopyUrlBtn');
const shareFullscreenBtn = document.getElementById('shareFullscreenBtn');
const shareCopyQrUrlBtn = document.getElementById('shareCopyQrUrlBtn');

const qrModal = document.getElementById('qrModal');
const qrCloseBtn = document.getElementById('qrCloseBtn');
const qrPartyCode = document.getElementById('qrPartyCode');
const qrImage = document.getElementById('qrImage');
const qrUrl = document.getElementById('qrUrl');

let unsubscribe = null;
let queueItems = [];
let activeWindow = 'booth';
let lastSharePayload = null;
let queueOrder = 'oldest';

const QUEUE_ORDER_KEY = 'pulse_dj_queue_order';

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
  const isRequests = windowName === 'requests';
  const isShare = windowName === 'share';

  boothWindow.classList.toggle('hidden', !isBooth);
  requestsWindow.classList.toggle('hidden', !isRequests);
  shareWindow.classList.toggle('hidden', !isShare);

  boothWindow.classList.toggle('is-active', isBooth);
  requestsWindow.classList.toggle('is-active', isRequests);
  shareWindow.classList.toggle('is-active', isShare);

  tabBoothBtn.classList.toggle('is-active', isBooth);
  tabRequestsBtn.classList.toggle('is-active', isRequests);
  tabShareBtn.classList.toggle('is-active', isShare);

  if (isRequests) {
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

function readQueueOrder() {
  try {
    const stored = String(window.localStorage.getItem(QUEUE_ORDER_KEY) || '').trim();
    if (stored === 'newest') return 'newest';
  } catch {
    // ignore
  }
  return 'oldest';
}

function writeQueueOrder(value) {
  try {
    window.localStorage.setItem(QUEUE_ORDER_KEY, value);
  } catch {
    // ignore
  }
}

function updateQueueOrderUi() {
  if (!queueOrderBtn) return;
  queueOrderBtn.textContent = queueOrder === 'newest' ? 'Newest first' : 'Oldest first';
}

function setQueueOrder(nextOrder) {
  queueOrder = nextOrder === 'newest' ? 'newest' : 'oldest';
  writeQueueOrder(queueOrder);
  updateQueueOrderUi();
  sortQueue(queueItems);
  renderRequestList();
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
    const aHasSeq = a.seqNo > 0;
    const bHasSeq = b.seqNo > 0;

    if (aHasSeq && bHasSeq) {
      return queueOrder === 'newest' ? b.seqNo - a.seqNo : a.seqNo - b.seqNo;
    }

    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return queueOrder === 'newest' ? bTime - aTime : aTime - bTime;
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

  const filterTerm = String(queueFilterInput?.value || '')
    .trim()
    .toLowerCase();
  const visibleItems = filterTerm
    ? queueItems.filter((entry) => {
        const hay = `${entry.title} ${entry.artist} ${entry.service}`.toLowerCase();
        return hay.includes(filterTerm);
      })
    : queueItems;

  if (!queueItems.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No requests yet. Share QR and wait for guests to submit songs.';
    requestsList.appendChild(empty);
    return;
  }

  if (filterTerm) {
    const note = document.createElement('p');
    note.className = 'filter-note';
    note.textContent = `Showing ${visibleItems.length} of ${queueItems.length} requests.`;
    requestsList.appendChild(note);

    if (!visibleItems.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = `No matches for "${filterTerm}".`;
      requestsList.appendChild(empty);
      return;
    }
  }

  for (const entry of visibleItems) {
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

function setSharePlaceholder(message) {
  const partyCode = normalizePartyCode(partyCodeInput.value);
  sharePartyCode.textContent = partyCode || '------';
  shareGuestUrl.textContent = message || 'Set party code to generate link.';
  shareQrImage.removeAttribute('src');
  shareQrImage.classList.add('hidden');
  lastSharePayload = null;
}

function applySharePayload(payload) {
  lastSharePayload = payload;

  sharePartyCode.textContent = payload.partyCode;
  shareGuestUrl.textContent = payload.url;

  shareQrImage.src = payload.qrDataUrl;
  shareQrImage.classList.remove('hidden');
}

function applySharePayloadToModal(payload) {
  qrPartyCode.textContent = payload.partyCode;
  qrImage.src = payload.qrDataUrl;
  qrUrl.textContent = payload.url;
}

async function refreshShare({ openModal } = {}) {
  const partyCode = normalizePartyCode(partyCodeInput.value);
  if (!partyCode) {
    setSharePlaceholder('Enter a party code first.');
    appendLog('warning', 'Share card needs a party code.', new Date().toISOString());
    return null;
  }

  try {
    const payload = await window.djApi.buildGuestQr({
      partyCode,
      guestWebBase: String(guestWebBaseInput.value || '').trim()
    });

    applySharePayload(payload);

    if (openModal) {
      applySharePayloadToModal(payload);
      setQrVisible(true);
    }

    return payload;
  } catch (error) {
    setSharePlaceholder('Could not build guest link. Check party code and guest URL.');
    appendLog('error', error.message || 'Could not generate share card.', new Date().toISOString());
    return null;
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
  const payload = lastSharePayload || (await refreshShare());
  if (!payload) return;

  const ok = await copyToClipboard(payload.url);
  if (ok) {
    appendLog('success', 'Guest URL copied to clipboard.', new Date().toISOString());
  } else {
    appendLog('error', 'Could not copy guest URL.', new Date().toISOString());
  }
}

async function initialize() {
  clearQueue();
  setStatus('idle', 'Loading settings...');
  setSharePlaceholder('Set party code to generate link.');
  queueOrder = readQueueOrder();
  updateQueueOrderUi();

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

tabShareBtn.addEventListener('click', () => {
  setWindow('share');
});

queueOrderBtn.addEventListener('click', () => {
  setQueueOrder(queueOrder === 'oldest' ? 'newest' : 'oldest');
  appendLog('info', `Queue order set: ${queueOrder === 'newest' ? 'Newest first' : 'Oldest first'}`, new Date().toISOString());
});

queueFilterInput.addEventListener('input', () => {
  renderRequestList();
});

jumpRequestsBtn.addEventListener('click', () => {
  setWindow('requests');
});

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);

  const partyCode = normalizePartyCode(partyCodeInput.value);
  if (!partyCode) {
    setSharePlaceholder('Set party code to generate link.');
  } else if (!lastSharePayload || lastSharePayload.partyCode !== partyCode) {
    sharePartyCode.textContent = partyCode;
    shareGuestUrl.textContent = 'Click Generate / Refresh to update QR.';
  }
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
  setWindow('share');
  const payload = await refreshShare({ openModal: true });
  if (payload) {
    appendLog('success', `Guest QR generated for party ${payload.partyCode}.`, new Date().toISOString());
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

shareRefreshBtn.addEventListener('click', async () => {
  const payload = await refreshShare();
  if (payload) {
    appendLog('success', 'Share card refreshed.', new Date().toISOString());
  }
});

shareCopyCodeBtn.addEventListener('click', () => {
  copyPartyCode();
});

shareCopyUrlBtn.addEventListener('click', () => {
  copyGuestUrl();
});

shareCopyQrUrlBtn.addEventListener('click', () => {
  copyGuestUrl();
});

shareFullscreenBtn.addEventListener('click', async () => {
  const payload = lastSharePayload || (await refreshShare());
  if (!payload) return;

  applySharePayloadToModal(payload);
  setQrVisible(true);
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
