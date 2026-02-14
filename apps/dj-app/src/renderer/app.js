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
const tabPlayedBtn = document.getElementById('tabPlayedBtn');
const tabShareBtn = document.getElementById('tabShareBtn');

const boothWindow = document.getElementById('boothWindow');
const requestsWindow = document.getElementById('requestsWindow');
const playedWindow = document.getElementById('playedWindow');
const shareWindow = document.getElementById('shareWindow');

const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const requestsList = document.getElementById('requestsList');
const queueOrderBtn = document.getElementById('queueOrderBtn');
const queueFilterInput = document.getElementById('queueFilter');
const requestCount = document.getElementById('requestCount');
const requestCountTab = document.getElementById('requestCountTab');
const playedList = document.getElementById('playedList');
const playedFilterInput = document.getElementById('playedFilter');
const playedCount = document.getElementById('playedCount');
const playedCountTab = document.getElementById('playedCountTab');
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
  const isPlayed = windowName === 'played';
  const isShare = windowName === 'share';

  boothWindow.classList.toggle('hidden', !isBooth);
  requestsWindow.classList.toggle('hidden', !isRequests);
  playedWindow.classList.toggle('hidden', !isPlayed);
  shareWindow.classList.toggle('hidden', !isShare);

  boothWindow.classList.toggle('is-active', isBooth);
  requestsWindow.classList.toggle('is-active', isRequests);
  playedWindow.classList.toggle('is-active', isPlayed);
  shareWindow.classList.toggle('is-active', isShare);

  tabBoothBtn.classList.toggle('is-active', isBooth);
  tabRequestsBtn.classList.toggle('is-active', isRequests);
  tabPlayedBtn.classList.toggle('is-active', isPlayed);
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
  renderPlayedList();
}

function sanitizeQueueEntry(entry) {
  const id = String(entry?.id || '').trim();
  if (!id) return null;

  const seqNo = Number.isFinite(Number(entry?.seqNo)) ? Number(entry.seqNo) : 0;
  const statusRaw = String(entry?.status || 'queued').trim().toLowerCase();
  const status = statusRaw === 'played' ? 'played' : 'queued';

  return {
    id,
    seqNo,
    title: String(entry?.title || 'Untitled').trim() || 'Untitled',
    artist: String(entry?.artist || 'Unknown').trim() || 'Unknown',
    service: String(entry?.service || 'Unknown').trim() || 'Unknown',
    appleMusicUrl: String(entry?.appleMusicUrl || '').trim(),
    status,
    playedAt: entry?.playedAt ? String(entry.playedAt) : '',
    playedBy: String(entry?.playedBy || '').trim(),
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
  const queued = queueItems.filter((entry) => entry.status !== 'played').length;
  const played = queueItems.filter((entry) => entry.status === 'played').length;

  requestCount.textContent = String(queued);
  requestCountTab.textContent = String(queued);
  playedCount.textContent = String(played);
  playedCountTab.textContent = String(played);
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
  renderPlayedList();
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
  renderPlayedList();

  if (activeWindow !== 'requests' && existing < 0 && item.status === 'queued') {
    tabRequestsBtn.classList.add('has-alert');
  }
}

function clearQueue() {
  queueItems = [];
  renderRequestList();
  renderPlayedList();
  tabRequestsBtn.classList.remove('has-alert');
}

function setButtonBusy(button, busy, busyLabel, idleLabel) {
  if (!button) return;
  button.disabled = busy;
  if (busyLabel && idleLabel) {
    button.textContent = busy ? busyLabel : idleLabel;
  }
}

async function copySongSummary(entry) {
  const text = `${entry.title} - ${entry.artist}`;
  const ok = await copyToClipboard(text);
  if (ok) {
    appendLog('success', 'Copied song title + artist.', new Date().toISOString());
  } else {
    appendLog('error', 'Could not copy song info.', new Date().toISOString());
  }
}

async function markRequestPlayed(requestId, button) {
  setButtonBusy(button, true, 'Marking...', 'Mark Played');
  try {
    await window.djApi.markPlayed({ requestId });
  } catch (error) {
    appendLog('error', error.message || 'Failed to mark request as played.', new Date().toISOString());
  } finally {
    setButtonBusy(button, false, 'Marking...', 'Mark Played');
  }
}

async function markRequestQueued(requestId, button) {
  setButtonBusy(button, true, 'Undoing...', 'Undo');
  try {
    await window.djApi.markQueued({ requestId });
  } catch (error) {
    appendLog('error', error.message || 'Failed to return request to queue.', new Date().toISOString());
  } finally {
    setButtonBusy(button, false, 'Undoing...', 'Undo');
  }
}

function renderRequestList() {
  requestsList.textContent = '';
  updateQueueCounters();

  const filterTerm = String(queueFilterInput?.value || '')
    .trim()
    .toLowerCase();
  const queuedItems = queueItems.filter((entry) => entry.status !== 'played');
  const visibleItems = filterTerm
    ? queuedItems.filter((entry) => {
        const hay = `${entry.title} ${entry.artist} ${entry.service}`.toLowerCase();
        return hay.includes(filterTerm);
      })
    : queuedItems;

  if (!queuedItems.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No requests yet. Share QR and wait for guests to submit songs.';
    requestsList.appendChild(empty);
    return;
  }

  if (filterTerm) {
    const note = document.createElement('p');
    note.className = 'filter-note';
    note.textContent = `Showing ${visibleItems.length} of ${queuedItems.length} queued requests.`;
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

    const actions = document.createElement('div');
    actions.className = 'request-actions';

    const playedButton = document.createElement('button');
    playedButton.type = 'button';
    playedButton.className = 'btn btn-success btn-mini';
    playedButton.textContent = 'Mark Played';
    playedButton.addEventListener('click', () => markRequestPlayed(entry.id, playedButton));

    if (entry.appleMusicUrl) {
      const open = document.createElement('a');
      open.className = 'btn btn-ghost btn-mini';
      open.href = entry.appleMusicUrl;
      open.target = '_blank';
      open.rel = 'noreferrer noopener';
      open.textContent = 'Open Link';
      actions.append(playedButton, open);
    } else {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-ghost btn-mini';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => copySongSummary(entry));
      actions.append(playedButton, copy);
    }

    item.append(top, title, artist, meta, actions);

    requestsList.appendChild(item);
  }
}

function renderPlayedList() {
  playedList.textContent = '';
  updateQueueCounters();

  const filterTerm = String(playedFilterInput?.value || '')
    .trim()
    .toLowerCase();

  const playedItems = queueItems
    .filter((entry) => entry.status === 'played')
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.playedAt || a.createdAt).getTime();
      const bTime = new Date(b.playedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

  const visibleItems = filterTerm
    ? playedItems.filter((entry) => {
        const hay = `${entry.title} ${entry.artist} ${entry.service}`.toLowerCase();
        return hay.includes(filterTerm);
      })
    : playedItems;

  if (!playedItems.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No played requests yet.';
    playedList.appendChild(empty);
    return;
  }

  if (filterTerm) {
    const note = document.createElement('p');
    note.className = 'filter-note';
    note.textContent = `Showing ${visibleItems.length} of ${playedItems.length} played requests.`;
    playedList.appendChild(note);

    if (!visibleItems.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = `No matches for "${filterTerm}".`;
      playedList.appendChild(empty);
      return;
    }
  }

  for (const entry of visibleItems) {
    const item = document.createElement('article');
    item.className = 'request-item is-played';

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

    const playedLabel = nowLabel(entry.playedAt || entry.createdAt);
    const playedBy = entry.playedBy ? ` by ${entry.playedBy}` : '';

    const meta = document.createElement('p');
    meta.className = 'request-sub';
    meta.textContent = `Played ${playedLabel}${playedBy}`;

    const actions = document.createElement('div');
    actions.className = 'request-actions';

    const undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'btn btn-ghost btn-mini';
    undoButton.textContent = 'Undo';
    undoButton.addEventListener('click', () => markRequestQueued(entry.id, undoButton));

    if (entry.appleMusicUrl) {
      const open = document.createElement('a');
      open.className = 'btn btn-ghost btn-mini';
      open.href = entry.appleMusicUrl;
      open.target = '_blank';
      open.rel = 'noreferrer noopener';
      open.textContent = 'Open Link';
      actions.append(undoButton, open);
    } else {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-ghost btn-mini';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => copySongSummary(entry));
      actions.append(undoButton, copy);
    }

    item.append(top, title, artist, meta, actions);
    playedList.appendChild(item);
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

tabPlayedBtn.addEventListener('click', () => {
  setWindow('played');
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

playedFilterInput.addEventListener('input', () => {
  renderPlayedList();
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
