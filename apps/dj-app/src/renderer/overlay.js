const overlayCloseBtn = document.getElementById('overlayCloseBtn');
const overlaySeq = document.getElementById('overlaySeq');
const overlayService = document.getElementById('overlayService');
const overlaySongTitle = document.getElementById('overlaySongTitle');
const overlaySongArtist = document.getElementById('overlaySongArtist');
const overlayPlayedBtn = document.getElementById('overlayPlayedBtn');
const overlaySkipBtn = document.getElementById('overlaySkipBtn');
const overlayOpenBtn = document.getElementById('overlayOpenBtn');
const overlayCopyBtn = document.getElementById('overlayCopyBtn');

let queueItems = [];
let unsubscribe = null;

function nowLabel(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sortQueue(items) {
  items.sort((a, b) => {
    if (a.seqNo && b.seqNo) return a.seqNo - b.seqNo;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
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
    songUrl: String(entry?.songUrl || '').trim(),
    status,
    createdAt: String(entry?.createdAt || new Date().toISOString()),
    playedAt: String(entry?.playedAt || ''),
    playedBy: String(entry?.playedBy || '')
  };
}

function setQueue(itemsInput) {
  const map = new Map();
  for (const raw of itemsInput || []) {
    const entry = sanitizeQueueEntry(raw);
    if (!entry) continue;
    map.set(entry.id, entry);
  }
  queueItems = Array.from(map.values());
  sortQueue(queueItems);
  render();
}

function addQueueItem(itemInput) {
  const item = sanitizeQueueEntry(itemInput);
  if (!item) return;
  const idx = queueItems.findIndex((e) => e.id === item.id);
  if (idx >= 0) queueItems[idx] = item;
  else queueItems.unshift(item);
  sortQueue(queueItems);
  render();
}

function render() {
  const queued = queueItems.filter((e) => e.status === 'queued');
  const current = queued[0] || null;

  if (!current) {
    overlaySeq.textContent = '--';
    overlayService.textContent = 'No queue';
    overlaySongTitle.textContent = 'Waiting for requests...';
    overlaySongArtist.textContent = '';
    overlayPlayedBtn.disabled = true;
    overlaySkipBtn.disabled = true;
    overlayOpenBtn.classList.add('hidden');
    overlayCopyBtn.classList.add('hidden');
    return;
  }

  overlaySeq.textContent = current.seqNo > 0 ? `#${current.seqNo}` : '#?';
  overlayService.textContent = current.service;
  overlaySongTitle.textContent = current.title;
  overlaySongArtist.textContent = `${current.artist} • queued ${nowLabel(current.createdAt)}`;

  overlayPlayedBtn.disabled = false;
  overlaySkipBtn.disabled = false;
  overlayPlayedBtn.onclick = async () => {
    overlayPlayedBtn.disabled = true;
    try {
      await window.djApi.markPlayed({ requestId: current.id });
    } finally {
      overlayPlayedBtn.disabled = false;
    }
  };
  overlaySkipBtn.onclick = async () => {
    overlaySkipBtn.disabled = true;
    try {
      await window.djApi.markRejected({ requestId: current.id });
    } finally {
      overlaySkipBtn.disabled = false;
    }
  };

  if (current.songUrl) {
    overlayOpenBtn.href = current.songUrl;
    overlayOpenBtn.classList.remove('hidden');
    overlayCopyBtn.classList.add('hidden');
  } else {
    overlayOpenBtn.classList.add('hidden');
    overlayCopyBtn.classList.remove('hidden');
    overlayCopyBtn.onclick = async () => {
      await navigator.clipboard.writeText(`${current.title} - ${current.artist}`).catch(() => {});
    };
  }
}

overlayCloseBtn?.addEventListener('click', async () => {
  await window.djApi.closeOverlay();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.djApi.closeOverlay();
  }
});

async function init() {
  try {
    const state = await window.djApi.getOverlayState();
    if (state?.requests) setQueue(state.requests);
  } catch {
    // ignore
  }

  unsubscribe = window.djApi.onEvent((event) => {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'queue:replace') setQueue(event.requests);
    if (event.type === 'queue:add') addQueueItem(event.request);
    if (event.type === 'queue:clear') setQueue([]);
  });
}

init();

window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});

