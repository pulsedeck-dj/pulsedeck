const partyCodeInput = document.getElementById('partyCode');
const djKeyInput = document.getElementById('djKey');

const saveBtn = document.getElementById('saveBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const showQrBtn = document.getElementById('showQrBtn');

const copyPartyCodeBtn = document.getElementById('copyPartyCodeBtn');
const copyGuestUrlBtn = document.getElementById('copyGuestUrlBtn');
const jumpRequestsBtn = document.getElementById('jumpRequestsBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

const tabBoothBtn = document.getElementById('tabBoothBtn');
const tabStageBtn = document.getElementById('tabStageBtn');
const tabRequestsBtn = document.getElementById('tabRequestsBtn');
const tabPlayedBtn = document.getElementById('tabPlayedBtn');
const tabShareBtn = document.getElementById('tabShareBtn');

const boothWindow = document.getElementById('boothWindow');
const stageWindow = document.getElementById('stageWindow');
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

const stageSeq = document.getElementById('stageSeq');
const stageService = document.getElementById('stageService');
const stageTitle = document.getElementById('stageTitle');
const stageArtist = document.getElementById('stageArtist');
const stageMeta = document.getElementById('stageMeta');
const stageOverlayBtn = document.getElementById('stageOverlayBtn');
const stageSetupBtn = document.getElementById('stageSetupBtn');
const stageMarkPlayedBtn = document.getElementById('stageMarkPlayedBtn');
const stageSkipBtn = document.getElementById('stageSkipBtn');
const stageOpenLinkBtn = document.getElementById('stageOpenLinkBtn');
const stageDownloadBtn = document.getElementById('stageDownloadBtn');
const stageCopyBtn = document.getElementById('stageCopyBtn');
const stagePreviewCount = document.getElementById('stagePreviewCount');
const stagePreviewList = document.getElementById('stagePreviewList');

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
const qrDownloadBtn = document.getElementById('qrDownloadBtn');
const qrPresetIphoneBtn = document.getElementById('qrPresetIphoneBtn');
const qrPresetIpadBtn = document.getElementById('qrPresetIpadBtn');

const setupModal = document.getElementById('setupModal');
const setupCloseBtn = document.getElementById('setupCloseBtn');
const setupOpenAppleMusicWebBtn = document.getElementById('setupOpenAppleMusicWebBtn');
const setupOpenGuestSiteBtn = document.getElementById('setupOpenGuestSiteBtn');

const downloadModal = document.getElementById('downloadModal');
const downloadCloseBtn = document.getElementById('downloadCloseBtn');
const downloadStepChecklist = document.getElementById('downloadStepChecklist');
const downloadStepCommand = document.getElementById('downloadStepCommand');
const dlCheckCookies = document.getElementById('dlCheckCookies');
const dlCheckPython = document.getElementById('dlCheckPython');
const dlCheckFfmpeg = document.getElementById('dlCheckFfmpeg');
const dlCheckGamdl = document.getElementById('dlCheckGamdl');
const dlPickFolderBtn = document.getElementById('dlPickFolderBtn');
const dlOpenGamdlBtn = document.getElementById('dlOpenGamdlBtn');
const dlFolderLabel = document.getElementById('dlFolderLabel');
const dlPartyFolderLabel = document.getElementById('dlPartyFolderLabel');
const dlChecklistDoneBtn = document.getElementById('dlChecklistDoneBtn');
const dlCommandBlock = document.getElementById('dlCommandBlock');
const dlCopyCmdBtn = document.getElementById('dlCopyCmdBtn');
const dlAutoOpenDjay = document.getElementById('dlAutoOpenDjay');
const dlOpenPartyFolder = document.getElementById('dlOpenPartyFolder');
const dlWatchLabel = document.getElementById('dlWatchLabel');
const dlRevealLastBtn = document.getElementById('dlRevealLastBtn');
const dlOpenTerminalBtn = document.getElementById('dlOpenTerminalBtn');
const dlBackBtn = document.getElementById('dlBackBtn');

let unsubscribe = null;
let queueItems = [];
let activeWindow = 'booth';
let lastSharePayload = null;
let queueOrder = 'oldest';
let qrExportPreset = 'iphone';

const DOWNLOAD_HELPER_KEY = 'pulse_dj_download_helper';
const GAMDL_REPO_URL = 'https://github.com/glomatico/gamdl';

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
  const isStage = windowName === 'stage';
  const isRequests = windowName === 'requests';
  const isPlayed = windowName === 'played';
  const isShare = windowName === 'share';

  boothWindow.classList.toggle('hidden', !isBooth);
  stageWindow.classList.toggle('hidden', !isStage);
  requestsWindow.classList.toggle('hidden', !isRequests);
  playedWindow.classList.toggle('hidden', !isPlayed);
  shareWindow.classList.toggle('hidden', !isShare);

  boothWindow.classList.toggle('is-active', isBooth);
  stageWindow.classList.toggle('is-active', isStage);
  requestsWindow.classList.toggle('is-active', isRequests);
  playedWindow.classList.toggle('is-active', isPlayed);
  shareWindow.classList.toggle('is-active', isShare);

  tabBoothBtn.classList.toggle('is-active', isBooth);
  tabStageBtn.classList.toggle('is-active', isStage);
  tabRequestsBtn.classList.toggle('is-active', isRequests);
  tabPlayedBtn.classList.toggle('is-active', isPlayed);
  tabShareBtn.classList.toggle('is-active', isShare);

  if (isRequests || isStage) {
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
  renderStage();
}

function sanitizeQueueEntry(entry) {
  const id = String(entry?.id || '').trim();
  if (!id) return null;

  const seqNo = Number.isFinite(Number(entry?.seqNo)) ? Number(entry.seqNo) : 0;
  const statusRaw = String(entry?.status || 'queued').trim().toLowerCase();
  const status = statusRaw === 'played' ? 'played' : statusRaw === 'rejected' ? 'rejected' : 'queued';

  return {
    id,
    seqNo,
    title: String(entry?.title || 'Untitled').trim() || 'Untitled',
    artist: String(entry?.artist || 'Unknown').trim() || 'Unknown',
    service: String(entry?.service || 'Unknown').trim() || 'Unknown',
    songUrl: String(entry?.songUrl || entry?.appleMusicUrl || '').trim(),
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
  const queued = queueItems.filter((entry) => entry.status === 'queued').length;
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
  renderStage();
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
  renderStage();

  if (activeWindow !== 'requests' && activeWindow !== 'stage' && existing < 0 && item.status === 'queued') {
    tabRequestsBtn.classList.add('has-alert');
  }
}

function clearQueue() {
  queueItems = [];
  renderRequestList();
  renderPlayedList();
  renderStage();
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

async function markRequestRejected(requestId, button, labels = {}) {
  const busyLabel = labels?.busyLabel || 'Removing...';
  const idleLabel = labels?.idleLabel || (button?.textContent?.trim() ? button.textContent.trim() : 'X');
  setButtonBusy(button, true, busyLabel, idleLabel);
  try {
    await window.djApi.markRejected({ requestId });
  } catch (error) {
    appendLog('error', error.message || 'Failed to reject request.', new Date().toISOString());
  } finally {
    setButtonBusy(button, false, busyLabel, idleLabel);
  }
}

function renderRequestList() {
  requestsList.textContent = '';
  updateQueueCounters();

  const filterTerm = String(queueFilterInput?.value || '')
    .trim()
    .toLowerCase();
  const queuedItems = queueItems;
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
    item.className = `request-item request-${entry.status}`;

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
    playedButton.textContent = entry.status === 'played' ? 'Played' : 'Played';
    playedButton.addEventListener('click', () => markRequestPlayed(entry.id, playedButton));

    const rejectButton = document.createElement('button');
    rejectButton.type = 'button';
    rejectButton.className = 'btn btn-danger btn-mini';
    rejectButton.textContent = 'X';
    rejectButton.addEventListener('click', () => markRequestRejected(entry.id, rejectButton));

    if (entry.status === 'played' || entry.status === 'rejected') {
      playedButton.disabled = true;
      rejectButton.disabled = true;
    }

    if (entry.songUrl) {
      const open = document.createElement('a');
      open.className = 'btn btn-ghost btn-mini';
      open.href = entry.songUrl;
      open.target = '_blank';
      open.rel = 'noreferrer noopener';
      open.textContent = 'Open Link';
      actions.append(playedButton, rejectButton, open);
    } else {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-ghost btn-mini';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => copySongSummary(entry));
      actions.append(playedButton, rejectButton, copy);
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
    .filter((entry) => entry.status === 'played' || entry.status === 'rejected')
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
    empty.textContent = 'No played or removed requests yet.';
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
    item.className = `request-item request-${entry.status}`;

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

    if (entry.songUrl) {
      const open = document.createElement('a');
      open.className = 'btn btn-ghost btn-mini';
      open.href = entry.songUrl;
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

function renderStagePreview(entries) {
  if (!stagePreviewList) return;

  stagePreviewList.textContent = '';
  stagePreviewCount.textContent = String(entries.length);

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing else queued right now.';
    stagePreviewList.appendChild(empty);
    return;
  }

  for (const entry of entries) {
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
    stagePreviewList.appendChild(item);
  }
}

function renderStage() {
  if (!stageTitle || !stageArtist || !stageService || !stageSeq) return;

  const queued = queueItems.filter((entry) => entry.status === 'queued');

  const current = queued[0] || null;
  if (!current) {
    stageSeq.textContent = '--';
    stageService.textContent = 'No queued songs yet.';
    stageTitle.textContent = 'Waiting for guests...';
    stageArtist.textContent = 'Share your QR and let the requests roll in.';
    stageMeta.textContent = '';

    if (stageMarkPlayedBtn) stageMarkPlayedBtn.disabled = true;
    if (stageSkipBtn) stageSkipBtn.disabled = true;
    if (stageOpenLinkBtn) stageOpenLinkBtn.classList.add('hidden');
    if (stageCopyBtn) stageCopyBtn.classList.add('hidden');
    if (stageDownloadBtn) stageDownloadBtn.disabled = true;

    renderStagePreview([]);
    return;
  }

  stageSeq.textContent = current.seqNo > 0 ? `#${current.seqNo}` : '#?';
  stageService.textContent = current.service;
  stageTitle.textContent = current.title;
  stageArtist.textContent = current.artist;
  stageMeta.textContent = `Queued ${nowLabel(current.createdAt)}`;

  if (stageMarkPlayedBtn) {
    stageMarkPlayedBtn.disabled = false;
    stageMarkPlayedBtn.onclick = () => markRequestPlayed(current.id, stageMarkPlayedBtn);
  }

  if (stageSkipBtn) {
    stageSkipBtn.disabled = false;
    stageSkipBtn.onclick = () =>
      markRequestRejected(current.id, stageSkipBtn, {
        busyLabel: 'Skipping...',
        idleLabel: 'Skip'
      });
  }

  if (stageCopyBtn) {
    stageCopyBtn.classList.remove('hidden');
    stageCopyBtn.onclick = () => copySongSummary(current);
  }

  if (stageOpenLinkBtn) {
    if (current.songUrl) {
      stageOpenLinkBtn.href = current.songUrl;
      stageOpenLinkBtn.classList.remove('hidden');
    } else {
      stageOpenLinkBtn.removeAttribute('href');
      stageOpenLinkBtn.classList.add('hidden');
    }
  }

  if (stageDownloadBtn) {
    stageDownloadBtn.disabled = !Boolean(current.songUrl);
    stageDownloadBtn.onclick = () => openDownloadFlowForSong(current.songUrl);
  }

  renderStagePreview(queued.slice(1, 6));
}

function readFormConfig() {
  return {
    partyCode: normalizePartyCode(partyCodeInput.value),
    djKey: String(djKeyInput.value || '').trim()
  };
}

function writeFormConfig(config) {
  partyCodeInput.value = config.partyCode || '';
  djKeyInput.value = config.djKey || '';
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

function setSetupVisible(visible) {
  if (!setupModal) return;
  if (visible) {
    setupModal.classList.remove('hidden');
    setupModal.setAttribute('aria-hidden', 'false');
  } else {
    setupModal.classList.add('hidden');
    setupModal.setAttribute('aria-hidden', 'true');
  }
}

function safeParseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadDownloadHelper() {
  try {
    const raw = window.localStorage.getItem(DOWNLOAD_HELPER_KEY);
    const parsed = safeParseJson(raw, {});
    const baseFolderPath = String(parsed.baseFolderPath || parsed.folderPath || '').trim();
    return {
      visitedRepo: Boolean(parsed.visitedRepo),
      hasCookies: Boolean(parsed.hasCookies),
      hasPython: Boolean(parsed.hasPython),
      hasFfmpeg: Boolean(parsed.hasFfmpeg),
      hasGamdl: Boolean(parsed.hasGamdl),
      autoOpenDjay: parsed.autoOpenDjay !== false,
      openPartyFolder: parsed.openPartyFolder !== false,
      baseFolderPath,
      partyFolderPath: String(parsed.partyFolderPath || '').trim(),
      partyName: String(parsed.partyName || '').trim(),
      partyCode: String(parsed.partyCode || '').trim()
    };
  } catch {
    return {
      visitedRepo: false,
      hasCookies: false,
      hasPython: false,
      hasFfmpeg: false,
      hasGamdl: false,
      autoOpenDjay: true,
      openPartyFolder: true,
      baseFolderPath: '',
      partyFolderPath: '',
      partyName: '',
      partyCode: ''
    };
  }
}

function saveDownloadHelper(state) {
  try {
    window.localStorage.setItem(DOWNLOAD_HELPER_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function downloadChecklistComplete(state) {
  return Boolean(
    state?.hasCookies &&
      state?.hasPython &&
      state?.hasFfmpeg &&
      state?.hasGamdl &&
      (state?.baseFolderPath || state?.partyFolderPath)
  );
}

function setDownloadVisible(visible) {
  if (!downloadModal) return;
  if (visible) {
    downloadModal.classList.remove('hidden');
    downloadModal.setAttribute('aria-hidden', 'false');
  } else {
    downloadModal.classList.add('hidden');
    downloadModal.setAttribute('aria-hidden', 'true');
  }
}

function showDownloadStep(step) {
  const showChecklist = step === 'checklist';
  if (downloadStepChecklist) downloadStepChecklist.classList.toggle('hidden', !showChecklist);
  if (downloadStepCommand) downloadStepCommand.classList.toggle('hidden', showChecklist);
}

function basename(pathLike) {
  const value = String(pathLike || '').trim();
  if (!value) return '';
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || value;
}

function shellPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  // Avoid `cd "~/..."` because quoting prevents ~ expansion in most shells.
  // Use $HOME so it works inside quotes: cd "$HOME/..."
  const homeMatch = text.match(/^\/Users\/[^/]+\/(.+)$/);
  if (homeMatch) return `$HOME/${homeMatch[1]}`;

  return text;
}

function buildGamdlCommand({ baseFolderPath, partyFolderPath, songUrl }) {
  const cookiesPath = shellPath(`${String(baseFolderPath || '').trim()}/cookies.txt`);
  const outputPath = shellPath(String(partyFolderPath || baseFolderPath || '').trim());
  const url = String(songUrl || '').trim();
  // Explicitly set cookies + output so gamdl never searches cookies in the party folder.
  // Then flatten audio files into the party folder root and remove non-audio extras.
  // `&& exit` closes the terminal session after a successful download.
  return `OUT=\"${outputPath}\" && gamdl --cookies-path \"${cookiesPath}\" --output-path \"$OUT\" \"${url}\" && find \"$OUT\" -type f \\( -iname \"*.m4a\" -o -iname \"*.mp3\" -o -iname \"*.wav\" -o -iname \"*.aiff\" -o -iname \"*.aif\" -o -iname \"*.flac\" -o -iname \"*.aac\" -o -iname \"*.ogg\" -o -iname \"*.alac\" \\) -print0 | while IFS= read -r -d '' f; do b=\"$(basename \"$f\")\"; [ \"$f\" = \"$OUT/$b\" ] && continue; t=\"$OUT/$b\"; if [ -e \"$t\" ]; then i=1; n=\"\${b%.*}\"; e=\"\${b##*.}\"; while [ -e \"$OUT/\${n} (\${i}).\${e}\" ]; do i=$((i+1)); done; t=\"$OUT/\${n} (\${i}).\${e}\"; fi; mv \"$f\" \"$t\"; done && find \"$OUT\" -type f ! \\( -iname \"*.m4a\" -o -iname \"*.mp3\" -o -iname \"*.wav\" -o -iname \"*.aiff\" -o -iname \"*.aif\" -o -iname \"*.flac\" -o -iname \"*.aac\" -o -iname \"*.ogg\" -o -iname \"*.alac\" \\) -delete && find \"$OUT\" -depth -type d -empty -delete && exit`;
}

async function hydratePartyInfoIntoDownloadState(state) {
  try {
    const info = await window.djApi.getPartyInfo();
    const partyCode = String(info?.partyCode || '').trim();
    const partyName = String(info?.partyName || '').trim();
    return {
      ...state,
      partyCode: partyCode || state.partyCode || '',
      partyName: partyName || state.partyName || ''
    };
  } catch {
    return state;
  }
}

async function ensurePartyFolderForState(state) {
  const baseFolderPath = String(state.baseFolderPath || '').trim();
  if (!baseFolderPath) return state;

  const partyCode = String(state.partyCode || '').trim();
  const partyName = String(state.partyName || '').trim();

  try {
    const result = await window.djApi.ensurePartyFolder({ baseFolderPath, partyName, partyCode });
    if (result?.ok && result.partyFolderPath) {
      return { ...state, partyFolderPath: String(result.partyFolderPath || '').trim() };
    }
  } catch {
    // ignore
  }
  return state;
}

function syncDownloadUiFromState(state) {
  if (dlCheckCookies) dlCheckCookies.checked = Boolean(state.hasCookies);
  if (dlCheckPython) dlCheckPython.checked = Boolean(state.hasPython);
  if (dlCheckFfmpeg) dlCheckFfmpeg.checked = Boolean(state.hasFfmpeg);
  if (dlCheckGamdl) dlCheckGamdl.checked = Boolean(state.hasGamdl);
  if (dlAutoOpenDjay) dlAutoOpenDjay.checked = state.autoOpenDjay !== false;
  if (dlOpenPartyFolder) dlOpenPartyFolder.checked = state.openPartyFolder !== false;
  if (dlFolderLabel) {
    dlFolderLabel.textContent = state.baseFolderPath ? `Cookies folder: ${state.baseFolderPath}` : 'Cookies folder: not selected';
  }
  if (dlPartyFolderLabel) {
    const label = state.partyFolderPath
      ? `Party folder: ${state.partyFolderPath}`
      : state.partyName
        ? `Party folder: (will create "${state.partyName}")`
        : '';
    dlPartyFolderLabel.textContent = label;
  }
  if (dlChecklistDoneBtn) {
    dlChecklistDoneBtn.disabled = !downloadChecklistComplete(state);
  }
}

function syncStateFromDownloadUi(state) {
  return {
    ...state,
    hasCookies: Boolean(dlCheckCookies?.checked),
    hasPython: Boolean(dlCheckPython?.checked),
    hasFfmpeg: Boolean(dlCheckFfmpeg?.checked),
    hasGamdl: Boolean(dlCheckGamdl?.checked),
    autoOpenDjay: dlAutoOpenDjay ? Boolean(dlAutoOpenDjay.checked) : state.autoOpenDjay !== false,
    openPartyFolder: dlOpenPartyFolder ? Boolean(dlOpenPartyFolder.checked) : state.openPartyFolder !== false
  };
}

let downloadActiveSongUrl = '';

async function openDownloadFlowForSong(songUrl) {
  if (!songUrl) {
    appendLog('warning', 'This request has no Apple Music URL to download.', new Date().toISOString());
    return;
  }

  downloadActiveSongUrl = String(songUrl || '').trim();

  let state = loadDownloadHelper();
  state = await hydratePartyInfoIntoDownloadState(state);
  saveDownloadHelper(state);

  // 1st click: send them to official repo.
  if (!state.visitedRepo) {
    try {
      await window.djApi.openUrl({ url: GAMDL_REPO_URL });
      state.visitedRepo = true;
      saveDownloadHelper(state);
      appendLog('info', 'Opened gamdl GitHub. Install it, then click Download Cmd again.', new Date().toISOString());
    } catch {
      appendLog('error', 'Could not open browser. Visit gamdl GitHub manually.', new Date().toISOString());
    }
    return;
  }

  // 2nd click: checklist until complete.
  if (!downloadChecklistComplete(state)) {
    showDownloadStep('checklist');
    syncDownloadUiFromState(state);
    setDownloadVisible(true);
    return;
  }

  state = await ensurePartyFolderForState(state);
  saveDownloadHelper(state);
  syncDownloadUiFromState(state);

  // After checklist complete: show command for current song.
  showDownloadStep('command');
  if (dlCommandBlock) {
    dlCommandBlock.textContent = buildGamdlCommand({
      baseFolderPath: state.baseFolderPath,
      partyFolderPath: state.partyFolderPath,
      songUrl
    });
  }
  try {
    const watchFolder = state.partyFolderPath || state.baseFolderPath;
    await window.djApi.downloadsStart({ folderPath: watchFolder, autoOpenDjay: state.autoOpenDjay !== false });
    if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: on';
  } catch {
    if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: off';
  }

  if (state.openPartyFolder !== false) {
    const folderToOpen = state.partyFolderPath || state.baseFolderPath;
    if (folderToOpen) {
      window.djApi.openPath({ path: folderToOpen }).catch(() => {});
    }
  }
  setDownloadVisible(true);
}
function setQrPreset(preset) {
  qrExportPreset = preset === 'ipad' ? 'ipad' : 'iphone';
  if (qrPresetIphoneBtn) qrPresetIphoneBtn.classList.toggle('is-active', qrExportPreset === 'iphone');
  if (qrPresetIpadBtn) qrPresetIpadBtn.classList.toggle('is-active', qrExportPreset === 'ipad');
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load QR image'));
    img.src = String(dataUrl || '');
  });
}

function drawRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function presetSpec(preset) {
  if (preset === 'ipad') return { key: 'ipad', w: 2732, h: 2048, label: 'iPad Landscape' };
  return { key: 'iphone', w: 2532, h: 1170, label: 'iPhone Landscape' };
}

async function buildQrPosterPng(payload, preset) {
  const spec = presetSpec(preset);
  const partyCode = String(payload?.partyCode || '').trim() || '------';
  const guestUrl = String(payload?.url || '').trim();
  const qrDataUrl = String(payload?.qrDataUrl || '').trim();
  if (!qrDataUrl) throw new Error('QR not generated yet.');

  const canvas = document.createElement('canvas');
  canvas.width = spec.w;
  canvas.height = spec.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const bg = ctx.createLinearGradient(0, 0, spec.w, spec.h);
  bg.addColorStop(0, '#070A12');
  bg.addColorStop(0.6, '#121B34');
  bg.addColorStop(1, '#15102A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, spec.w, spec.h);

  // Soft glow blobs.
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = 'rgba(0, 187, 248, 0.22)';
  ctx.beginPath();
  ctx.ellipse(spec.w * 0.22, spec.h * 0.22, spec.w * 0.34, spec.w * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 95, 64, 0.18)';
  ctx.beginPath();
  ctx.ellipse(spec.w * 0.78, spec.h * 0.18, spec.w * 0.42, spec.w * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(143, 70, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(spec.w * 0.7, spec.h * 0.88, spec.w * 0.56, spec.w * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Frosted landscape card.
  const pad = Math.round(spec.w * 0.055);
  const cardX = pad;
  const cardW = spec.w - pad * 2;
  const cardY = Math.round(spec.h * 0.11);
  const cardH = Math.round(spec.h * 0.78);
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();

  const leftX = cardX + Math.round(cardW * 0.07);
  const leftW = Math.round(cardW * 0.58);
  let y = cardY + Math.round(cardH * 0.22);

  ctx.fillStyle = 'rgba(255,255,255,0.84)';
  ctx.font = `700 ${Math.round(cardH * 0.12)}px "Space Grotesk", system-ui, -apple-system`;
  ctx.fillText('PulseDeck', leftX, y, leftW);

  y += Math.round(cardH * 0.23);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(cardH * 0.28)}px "Bebas Neue", Impact, system-ui`;
  ctx.fillText(partyCode, leftX, y, leftW);

  y += Math.round(cardH * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `600 ${Math.round(cardH * 0.09)}px "Space Grotesk", system-ui, -apple-system`;
  ctx.fillText('Scan to request a song', leftX, y, leftW);

  const qrImg = await loadImageFromDataUrl(qrDataUrl);
  const qrSize = Math.round(Math.min(cardH * 0.68, cardW * 0.30));
  const qrX = Math.round(cardX + cardW * 0.68);
  const qrY = Math.round(cardY + (cardH - qrSize) / 2);
  drawRoundRect(ctx, qrX - 18, qrY - 18, qrSize + 36, qrSize + 36, 30);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  if (guestUrl) {
    const maxChars = spec.w >= 2500 ? 74 : 60;
    const urlDisplay = guestUrl.length > maxChars ? `${guestUrl.slice(0, maxChars - 1)}…` : guestUrl;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `500 ${Math.round(cardH * 0.06)}px "Space Grotesk", system-ui, -apple-system`;
    ctx.fillText(urlDisplay, leftX, cardY + cardH - Math.round(cardH * 0.08), leftW);
  }

  return canvas.toDataURL('image/png');
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
    const payload = await window.djApi.buildGuestQr({ partyCode });

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

    if (event.type === 'downloads:new-file') {
      const filePath = String(event.filePath || '').trim();
      const name = filePath ? basename(filePath) : 'download';
      appendLog('success', `Download detected: ${name}`, event.at);
      if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: on';
      return;
    }

    if (event.type === 'downloads:auto-open') {
      const opened = Boolean(event.opened);
      if (opened) appendLog('info', 'Opened new download in djay.', event.at);
      else appendLog('warning', 'New download detected, but could not open djay. Use Reveal Last.', event.at);
      return;
    }
  });
}

tabBoothBtn.addEventListener('click', () => {
  setWindow('booth');
});

tabStageBtn.addEventListener('click', () => {
  renderStage();
  setWindow('stage');
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
    renderStage();
    setWindow('stage');
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

if (qrPresetIphoneBtn) {
  qrPresetIphoneBtn.addEventListener('click', () => setQrPreset('iphone'));
}

if (qrPresetIpadBtn) {
  qrPresetIpadBtn.addEventListener('click', () => setQrPreset('ipad'));
}

if (qrDownloadBtn) {
  qrDownloadBtn.addEventListener('click', async () => {
    const payload = lastSharePayload || (await refreshShare({ openModal: true }));
    if (!payload) return;

    try {
      setButtonBusy(qrDownloadBtn, true, 'Building...', 'Download PNG');
      const dataUrl = await buildQrPosterPng(payload, qrExportPreset);
      const suggestedName = `PulseDeck-${payload.partyCode}-${qrExportPreset}`;
      const result = await window.djApi.savePng({ dataUrl, suggestedName });
      if (!result?.canceled) {
        appendLog('success', `QR poster saved (${qrExportPreset}).`, new Date().toISOString());
      }
    } catch (error) {
      appendLog('error', error.message || 'Could not export PNG.', new Date().toISOString());
    } finally {
      setButtonBusy(qrDownloadBtn, false, 'Building...', 'Download PNG');
    }
  });
}

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
    setSetupVisible(false);
    setDownloadVisible(false);
  }
});

window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});

setWindow('booth');

if (stageOverlayBtn) {
  stageOverlayBtn.addEventListener('click', async () => {
    try {
      await window.djApi.openOverlay();
    } catch (error) {
      appendLog('error', error.message || 'Could not open overlay.', new Date().toISOString());
    }
  });
}

if (stageSetupBtn) {
  stageSetupBtn.addEventListener('click', () => {
    setSetupVisible(true);
  });
}

if (setupCloseBtn) {
  setupCloseBtn.addEventListener('click', () => setSetupVisible(false));
}

if (setupModal) {
  setupModal.addEventListener('click', (event) => {
    if (event.target === setupModal) setSetupVisible(false);
  });
}

if (setupOpenAppleMusicWebBtn) {
  setupOpenAppleMusicWebBtn.addEventListener('click', async () => {
    try {
      await window.djApi.openUrl({ url: 'https://music.apple.com/' });
    } catch {
      // ignore
    }
  });
}

if (setupOpenGuestSiteBtn) {
  setupOpenGuestSiteBtn.addEventListener('click', async () => {
    const payload = lastSharePayload || (await refreshShare());
    if (!payload?.url) return;
    try {
      await window.djApi.openUrl({ url: payload.url });
    } catch {
      // ignore
    }
  });
}

function updateDownloadHelperFromUi() {
  let state = loadDownloadHelper();
  state = syncStateFromDownloadUi(state);
  saveDownloadHelper(state);
  syncDownloadUiFromState(state);
}

if (downloadCloseBtn) {
  downloadCloseBtn.addEventListener('click', () => setDownloadVisible(false));
}

if (downloadModal) {
  downloadModal.addEventListener('click', (event) => {
    if (event.target === downloadModal) setDownloadVisible(false);
  });
}

if (dlOpenGamdlBtn) {
  dlOpenGamdlBtn.addEventListener('click', async () => {
    try {
      await window.djApi.openUrl({ url: GAMDL_REPO_URL });
      const state = { ...loadDownloadHelper(), visitedRepo: true };
      saveDownloadHelper(state);
      syncDownloadUiFromState(state);
    } catch {
      // ignore
    }
  });
}

if (dlPickFolderBtn) {
  dlPickFolderBtn.addEventListener('click', async () => {
    try {
      const result = await window.djApi.pickFolder();
      if (!result?.ok || !result.folderPath) return;
      let state = {
        ...loadDownloadHelper(),
        baseFolderPath: String(result.folderPath || '').trim(),
        partyFolderPath: ''
      };

      // If we already know the party name/code (DJ connected), create the party folder immediately
      // so the DJ can add it in djay right away.
      state = await hydratePartyInfoIntoDownloadState(state);
      state = await ensurePartyFolderForState(state);
      saveDownloadHelper(state);
      syncDownloadUiFromState(state);
      if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: off';

      if (state.openPartyFolder !== false) {
        const folderToOpen = state.partyFolderPath || state.baseFolderPath;
        if (folderToOpen) {
          window.djApi.openPath({ path: folderToOpen }).catch(() => {});
        }
      }
    } catch {
      // ignore
    }
  });
}

for (const el of [dlCheckCookies, dlCheckPython, dlCheckFfmpeg, dlCheckGamdl, dlOpenPartyFolder]) {
  if (!el) continue;
  el.addEventListener('change', () => updateDownloadHelperFromUi());
}

if (dlAutoOpenDjay) {
  dlAutoOpenDjay.addEventListener('change', async () => {
    updateDownloadHelperFromUi();
    let state = loadDownloadHelper();
    state = await hydratePartyInfoIntoDownloadState(state);
    state = await ensurePartyFolderForState(state);
    saveDownloadHelper(state);
    syncDownloadUiFromState(state);
    if (downloadChecklistComplete(state)) {
      try {
        const watchFolder = state.partyFolderPath || state.baseFolderPath;
        await window.djApi.downloadsStart({ folderPath: watchFolder, autoOpenDjay: state.autoOpenDjay !== false });
        if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: on';
      } catch {
        if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: off';
      }
    }
  });
}

if (dlChecklistDoneBtn) {
  dlChecklistDoneBtn.addEventListener('click', async () => {
    updateDownloadHelperFromUi();
    let state = loadDownloadHelper();
    state = await hydratePartyInfoIntoDownloadState(state);
    if (!downloadChecklistComplete(state)) return;
    state = await ensurePartyFolderForState(state);
    saveDownloadHelper(state);
    syncDownloadUiFromState(state);
    showDownloadStep('command');
    if (dlCommandBlock) {
      dlCommandBlock.textContent = buildGamdlCommand({
        baseFolderPath: state.baseFolderPath,
        partyFolderPath: state.partyFolderPath,
        songUrl: downloadActiveSongUrl
      });
    }
    const watchFolder = state.partyFolderPath || state.baseFolderPath;
    window.djApi
      .downloadsStart({ folderPath: watchFolder, autoOpenDjay: state.autoOpenDjay !== false })
      .then(() => {
        if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: on';
      })
      .catch(() => {
        if (dlWatchLabel) dlWatchLabel.textContent = 'Watching: off';
      });

    if (state.openPartyFolder !== false) {
      const folderToOpen = state.partyFolderPath || state.baseFolderPath;
      if (folderToOpen) {
        window.djApi.openPath({ path: folderToOpen }).catch(() => {});
      }
    }
  });
}

if (dlBackBtn) {
  dlBackBtn.addEventListener('click', () => {
    showDownloadStep('checklist');
    syncDownloadUiFromState(loadDownloadHelper());
  });
}

if (dlCopyCmdBtn) {
  dlCopyCmdBtn.addEventListener('click', async () => {
    const text = String(dlCommandBlock?.textContent || '').trim();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) appendLog('success', 'Command copied. Paste it in Terminal.', new Date().toISOString());
    else appendLog('error', 'Could not copy command.', new Date().toISOString());
  });
}

if (dlOpenTerminalBtn) {
  dlOpenTerminalBtn.addEventListener('click', async () => {
    try {
      await window.djApi.openTerminal();
      appendLog('info', 'Terminal opened. Paste the command and press Enter.', new Date().toISOString());
    } catch {
      appendLog('warning', 'Could not open Terminal automatically.', new Date().toISOString());
    }
  });
}

if (dlRevealLastBtn) {
  dlRevealLastBtn.addEventListener('click', async () => {
    try {
      const status = await window.djApi.downloadsStatus();
      if (!status?.lastFilePath) {
        appendLog('warning', 'No new download detected yet.', new Date().toISOString());
        return;
      }
      await window.djApi.revealFile({ filePath: status.lastFilePath });
    } catch {
      // ignore
    }
  });
}

initialize().catch((error) => {
  setStatus('error', error.message || 'Initialization failed');
  appendLog('error', error.message || 'Initialization failed.', new Date().toISOString());
});
