function trimApiBase(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function detectDefaultApiBase() {
  const { hostname, port } = window.location;
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '5173') {
    return 'http://localhost:4000';
  }
  return '';
}

function normalizeApiBaseCandidate(value) {
  const candidate = trimApiBase(value);
  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function readInitialApiBase() {
  const stored = normalizeApiBaseCandidate(window.localStorage.getItem('pulse_api_base'));
  if (stored) return stored;

  const fromConfig = normalizeApiBaseCandidate(window.PULSE_CONFIG?.apiBase);
  if (fromConfig) {
    window.localStorage.setItem('pulse_api_base', fromConfig);
    return fromConfig;
  }

  return normalizeApiBaseCandidate(detectDefaultApiBase());
}

function readSupabaseConfig() {
  const url = String(window.PULSE_CONFIG?.supabaseUrl || '').trim();
  const anonKey = String(window.PULSE_CONFIG?.supabaseAnonKey || '').trim();
  if (!url || !anonKey) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.search = '';
    return { url: parsed.toString().replace(/\/+$/, ''), anonKey };
  } catch {
    return null;
  }
}

const PARTY_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const ALLOWED_SERVICES = new Set(['Apple Music']);

const joinForm = document.getElementById('joinForm');
const partyCodeInput = document.getElementById('partyCode');
const joinResult = document.getElementById('joinResult');
const stopCheckingBtn = document.getElementById('stopCheckingBtn');

const requestPanel = document.getElementById('requestPanel');
const requestForm = document.getElementById('requestForm');
const requestResult = document.getElementById('requestResult');

const appleSearchSection = document.getElementById('appleSearchSection');
const appleSearchTermInput = document.getElementById('appleSearchTerm');
const appleSearchBtn = document.getElementById('appleSearchBtn');
const appleSearchStatus = document.getElementById('appleSearchStatus');
const appleSearchResults = document.getElementById('appleSearchResults');

// Search-only guest flow: no link paste / manual entry UI.
const songUrlInput = null;

const pickedSongPanel = document.getElementById('pickedSongPanel');
const pickedSongTitle = document.getElementById('pickedSongTitle');
const pickedSongArtist = document.getElementById('pickedSongArtist');
const pickedChangeBtn = document.getElementById('pickedChangeBtn');
const pickedSubmitBtn = document.getElementById('pickedSubmitBtn');

let pickedSong = null;

let apiBase = readInitialApiBase();
let activePartyCode = null;
let supabaseClient = null;

let joinDebounceTimer = null;
let joinInFlight = false;
let lastAutoJoinCode = '';
let joinPollTimer = null;
let joinPollCode = '';
let joinPollInFlight = false;
let joinPollAttempts = 0;

function normalizePartyCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function setStatus(element, text, type = 'neutral') {
  if (!element) return;
  element.classList.remove('status-neutral', 'status-info', 'status-success', 'status-error');
  element.classList.add(`status-${type}`);
  element.textContent = text;
}

function setButtonLoading(button, loading, loadingLabel, idleLabel) {
  if (!button) return;
  button.disabled = loading;
  if (loadingLabel && idleLabel) {
    button.textContent = loading ? loadingLabel : idleLabel;
  }
}

function revealPanel(panel) {
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.classList.remove('panel-pop');
  void panel.offsetWidth;
  panel.classList.add('panel-pop');
}

function hidePanel(panel) {
  if (!panel) return;
  panel.classList.add('hidden');
  panel.classList.remove('panel-pop');
}

function makeAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchJson(url, { timeoutMs = 9000 } = {}) {
  const { signal, clear } = makeAbortSignal(timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const message = data?.error || data?.message || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out. Please retry.');
    throw error;
  } finally {
    clear();
  }
}

async function jsonp(urlInput, { timeoutMs = 9000, callbackParam = 'callback' } = {}) {
  const url = new URL(String(urlInput || '').trim());
  const callbackName = `__pulse_jsonp_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  url.searchParams.set(callbackParam, callbackName);

  return await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      try {
        delete window[callbackName];
      } catch {
        // ignore
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out. Please retry.'));
    }, timeoutMs);

    window[callbackName] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Network error. Please retry.'));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function itunesSongSearch(term, limit = 8) {
  const q = String(term || '').trim();
  if (q.length < 2) return [];

  // iTunes Search API doesn't send CORS headers, so use JSONP.
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', q);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('country', 'US');
  url.searchParams.set('limit', String(Math.max(1, Math.min(12, Number(limit) || 8))));

  const data = await jsonp(url.toString(), { timeoutMs: 9000, callbackParam: 'callback' });
  const rows = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((row) => {
      const title = String(row?.trackName || '').trim();
      const artist = String(row?.artistName || '').trim();
      if (!title || !artist) return null;

      const album = String(row?.collectionName || '').trim();
      const url = String(row?.trackViewUrl || '').trim();
      const artworkUrl = String(row?.artworkUrl100 || '').trim();

      return {
        title,
        artist,
        album,
        url,
        artworkUrl
      };
    })
    .filter(Boolean);
}

async function searchMusic(service, term) {
  if (String(service || '').trim() !== 'Apple Music') return [];
  return await itunesSongSearch(term, 10);
}

async function apiRequest(path, options = {}) {
  if (!apiBase) {
    throw new Error('This request site is not connected yet. Ask the DJ to finish setup.');
  }

  const { signal, clear } = makeAbortSignal(options.timeoutMs || 9000);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(`${apiBase}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : {};

    if (!res.ok) {
      const error = new Error(data.error || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please retry.');
    }
    throw error;
  } finally {
    clear();
  }
}

function initSupabase() {
  const cfg = readSupabaseConfig();
  if (!cfg) return null;
  if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;

  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false }
  });

  return supabaseClient;
}

async function supaJoinParty(code) {
  if (!supabaseClient) throw new Error('Supabase not initialized');

  const { data, error } = await supabaseClient.rpc('join_party', { p_code: code });
  if (error) throw new Error(error.message || 'Join failed');

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) throw new Error('Party not found');

  return {
    partyCode: String(row.party_code || code),
    djActive: Boolean(row.dj_active),
    expiresAt: row.expires_at ? String(row.expires_at) : null
  };
}

async function supaSubmitRequest(code, payload) {
  if (!supabaseClient) throw new Error('Supabase not initialized');

  const { data, error } = await supabaseClient.rpc('submit_request', {
    p_code: code,
    p_service: payload.service,
    p_title: payload.title,
    p_artist: payload.artist,
    p_song_url: payload.songUrl || '',
    p_idempotency_key: payload.idempotencyKey || ''
  });

  if (error) throw new Error(error.message || 'Request failed');

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('Request failed');

  return {
    id: row.id,
    seqNo: row.seq_no,
    title: row.title,
    artist: row.artist,
    service: row.service,
    songUrl: row.song_url || ''
  };
}

function makeIdempotencyKey() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readSelectedService() {
  return 'Apple Music';
}

function hostnameMatches(hostnameInput, allowedHostInput) {
  const hostname = String(hostnameInput || '').toLowerCase();
  const allowedHost = String(allowedHostInput || '').toLowerCase();
  if (!hostname || !allowedHost) return false;
  if (hostname === allowedHost) return true;
  return hostname.endsWith(`.${allowedHost}`);
}

function isValidSongUrl(urlText, service) {
  if (!urlText) return false;

  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname;

  if (service === 'Apple Music') {
    return hostnameMatches(hostname, 'music.apple.com');
  }

  return false;
}

function serviceIsAppleMusic() {
  return readSelectedService() === 'Apple Music';
}

function toggleAppleSearchVisibility() {
  if (!appleSearchSection) return;

  // Search is always available (Apple Music only).
  appleSearchSection.classList.remove('hidden');
}

function updateSongUrlUi() {
  // No-op (no manual link flow).
}

function stopJoinPolling(message) {
  if (joinPollTimer) {
    clearInterval(joinPollTimer);
    joinPollTimer = null;
  }

  joinPollCode = '';
  joinPollAttempts = 0;
  joinPollInFlight = false;

  if (stopCheckingBtn) stopCheckingBtn.classList.add('hidden');
  if (message) setStatus(joinResult, message, 'neutral');
}

function startJoinPolling(code) {
  pollJoinStatus(code);
}

async function joinPartyByCode(code) {
  if (!PARTY_CODE_PATTERN.test(code)) {
    setStatus(joinResult, 'Party code must be exactly 6 letters/numbers.', 'error');
    hidePanel(requestPanel);
    activePartyCode = null;
    return false;
  }

  setStatus(joinResult, `Checking party ${code}...`, 'info');

  try {
    const data = supabaseClient
      ? await supaJoinParty(code)
      : await apiRequest(`/api/parties/${code}/join`, { method: 'POST' });

    if (!data.djActive) {
      activePartyCode = null;
      hidePanel(requestPanel);
      setStatus(joinResult, 'Party found. Waiting for DJ to connect...', 'info');
      startJoinPolling(code);
      return false;
    }

    stopJoinPolling();
    activePartyCode = code;
    revealPanel(requestPanel);
    setStatus(joinResult, `Connected to party ${code}. You can send requests now.`, 'success');
    if (appleSearchTermInput) appleSearchTermInput.focus();
    return true;
  } catch (error) {
    activePartyCode = null;
    hidePanel(requestPanel);
    stopJoinPolling();
    setStatus(joinResult, error.message || 'Unable to join party.', 'error');
    return false;
  }
}

function scheduleAutoJoin(code) {
  if (joinDebounceTimer) {
    clearTimeout(joinDebounceTimer);
  }

  const normalized = normalizePartyCode(code);
  if (!apiBase) return;
  if (!PARTY_CODE_PATTERN.test(normalized)) return;
  if (normalized === activePartyCode) return;
  if (normalized === lastAutoJoinCode) return;

  joinDebounceTimer = setTimeout(async () => {
    if (joinInFlight) return;
    joinInFlight = true;
    lastAutoJoinCode = normalized;

    try {
      await joinPartyByCode(normalized);
    } finally {
      joinInFlight = false;
    }
  }, 450);
}

async function pollJoinStatus(code) {
  const maxAttempts = 60;
  const intervalMs = 2000;

  stopJoinPolling();
  joinPollCode = code;
  joinPollAttempts = 0;
  joinPollInFlight = false;

  if (stopCheckingBtn) stopCheckingBtn.classList.remove('hidden');

  joinPollTimer = setInterval(async () => {
    if (joinPollInFlight) return;
    joinPollInFlight = true;
    joinPollAttempts += 1;

    try {
      const data = supabaseClient
        ? await supaJoinParty(code)
        : await apiRequest(`/api/parties/${code}/join`, { method: 'POST', timeoutMs: 8000 });

      if (data.djActive) {
        stopJoinPolling();
        activePartyCode = code;
        revealPanel(requestPanel);
        setStatus(joinResult, `DJ is live. Connected to party ${code}.`, 'success');
        if (appleSearchTermInput) appleSearchTermInput.focus();
        return;
      }

      if (joinPollAttempts >= maxAttempts) {
        stopJoinPolling('Still waiting for DJ. Please ask the DJ to open the DJ app.');
        return;
      }

      setStatus(joinResult, `Waiting for DJ to connect... (${joinPollAttempts}/${maxAttempts})`, 'info');
    } catch (error) {
      stopJoinPolling(error.message || 'Could not check DJ status.');
    } finally {
      joinPollInFlight = false;
    }
  }, intervalMs);
}

function fillRequestFieldsFromSearchResult(result) {
  const titleInput = document.getElementById('title');
  const artistInput = document.getElementById('artist');
  if (titleInput) titleInput.value = result.title || '';
  if (artistInput) artistInput.value = result.artist || '';
  pickedSong = {
    service: readSelectedService(),
    title: String(result.title || '').trim(),
    artist: String(result.artist || '').trim(),
    songUrl: String(result.url || '').trim()
  };

  if (pickedSongTitle) pickedSongTitle.textContent = pickedSong.title || 'Selected song';
  if (pickedSongArtist) pickedSongArtist.textContent = pickedSong.artist ? `by ${pickedSong.artist}` : '';
  if (pickedSongPanel) pickedSongPanel.classList.remove('hidden');
  setStatus(appleSearchStatus, `Selected: ${pickedSong.title} - ${pickedSong.artist}`, 'success');
}

function renderAppleSearchResults(items) {
  if (!appleSearchResults) return;
  appleSearchResults.textContent = '';

  if (!items.length) {
    const note = document.createElement('p');
    note.className = 'micro-note';
    note.textContent = 'No results found.';
    appleSearchResults.appendChild(note);
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'search-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Select ${item.title} by ${item.artist}`);
    card.addEventListener('click', () => fillRequestFieldsFromSearchResult(item));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fillRequestFieldsFromSearchResult(item);
      }
    });

    const image = document.createElement('img');
    image.alt = `${item.title} artwork`;
    image.src = item.artworkUrl || '';

    const meta = document.createElement('div');
    meta.className = 'search-meta';

    const title = document.createElement('p');
    title.className = 'search-title';
    title.textContent = item.title || 'Unknown title';

    const sub = document.createElement('p');
    sub.className = 'search-sub';
    sub.textContent = `${item.artist || 'Unknown artist'}${item.album ? ` • ${item.album}` : ''}`;

    meta.append(title, sub);

    card.append(image, meta);
    appleSearchResults.appendChild(card);
  }
}

async function runAppleMusicSearch() {
  const service = readSelectedService();

  const term = String(appleSearchTermInput?.value || '').trim();
  if (term.length < 2) {
    setStatus(appleSearchStatus, 'Type at least 2 characters to search.', 'error');
    return;
  }

  setButtonLoading(appleSearchBtn, true, 'Searching...', 'Search');
  setStatus(appleSearchStatus, `Searching ${service}...`, 'info');

  try {
    const results = await searchMusic(service, term);
    renderAppleSearchResults(results);

    if (results.length) {
      setStatus(appleSearchStatus, `Found ${results.length} results. Tap a song to select it.`, 'success');
    } else {
      setStatus(
        appleSearchStatus,
        service === 'Apple Music'
          ? 'No results. Try another search.'
          : `No results yet. DJ must enable ${service} search (Edge Function). Or paste a ${service} link in Advanced.`,
        'neutral'
      );
    }
  } catch (error) {
    setStatus(appleSearchStatus, error.message || 'Apple Music search failed.', 'error');
  } finally {
    setButtonLoading(appleSearchBtn, false, 'Searching...', 'Search');
  }
}

async function submitSongRequest(input, options = {}) {
  if (!activePartyCode) {
    setStatus(requestResult, 'Join a live party first.', 'error');
    return false;
  }

  const service = String(input?.service || '').trim();
  const title = String(input?.title || '').trim();
  const artist = String(input?.artist || '').trim();
  const songUrl = String(input?.songUrl || '').trim();

  if (!ALLOWED_SERVICES.has(service)) {
    setStatus(requestResult, 'Choose a valid music service.', 'error');
    return false;
  }

  if (!title || title.length > 120) {
    setStatus(requestResult, 'Song title is required (max 120 chars).', 'error');
    return false;
  }

  if (!artist || artist.length > 120) {
    setStatus(requestResult, 'Artist is required (max 120 chars).', 'error');
    return false;
  }

  if (!isValidSongUrl(songUrl, service)) {
    setStatus(requestResult, 'Song URL must be a valid HTTPS link for the selected service.', 'error');
    return false;
  }

  const submitButton = requestForm?.querySelector('button[type="submit"]');
  if (options.loading !== false) {
    setButtonLoading(submitButton, true, 'Submitting...', 'Submit Request');
  }
  setStatus(requestResult, 'Submitting request to DJ queue...', 'info');

  try {
    const idempotencyKey = makeIdempotencyKey();

    const data = supabaseClient
      ? await supaSubmitRequest(activePartyCode, { service, title, artist, songUrl, idempotencyKey })
      : await apiRequest(`/api/parties/${activePartyCode}/requests`, {
          method: 'POST',
          headers: {
            'X-Idempotency-Key': idempotencyKey
          },
          body: {
            service,
            title,
            artist,
            songUrl
          }
        });

    const seqNo = data.seqNo ?? data.seq_no;
    setStatus(requestResult, `Queued #${seqNo}: ${data.title} - ${data.artist}`, 'success');

    pickedSong = null;
    if (pickedSongPanel) pickedSongPanel.classList.add('hidden');

    const titleInput = document.getElementById('title');
    const artistInput = document.getElementById('artist');
    if (titleInput) titleInput.value = '';
    if (artistInput) artistInput.value = '';
    if (appleSearchTermInput) appleSearchTermInput.value = '';
    if (appleSearchResults) appleSearchResults.textContent = '';
    toggleAppleSearchVisibility();
    updateSongUrlUi();

    return true;
  } catch (error) {
    if (error.status === 409) {
      hidePanel(requestPanel);
      activePartyCode = null;
      setStatus(joinResult, 'DJ is not active right now. Waiting for DJ to connect...', 'info');
      startJoinPolling(joinPollCode || normalizePartyCode(partyCodeInput.value));
    }

    setStatus(requestResult, error.message || 'Request failed.', 'error');
    return false;
  } finally {
    if (options.loading !== false) {
      setButtonLoading(submitButton, false, 'Submitting...', 'Submit Request');
    }
  }
}

function readPartyCodeFromUrl() {
  const params = new URLSearchParams(window.location.search || '');
  const fromParam = params.get('partyCode') || params.get('code');
  return normalizePartyCode(fromParam);
}

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const code = normalizePartyCode(partyCodeInput.value);
  lastAutoJoinCode = code;
  await joinPartyByCode(code);
});

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);
  stopJoinPolling();

  const normalized = normalizePartyCode(partyCodeInput.value);
  if (activePartyCode && normalized !== activePartyCode) {
    activePartyCode = null;
    hidePanel(requestPanel);
    setStatus(joinResult, 'Party code changed. Tap Join to connect.', 'neutral');
  }

  scheduleAutoJoin(normalized);
});

stopCheckingBtn.addEventListener('click', () => {
  stopJoinPolling('Stopped checking. Tap Join to retry.');
});

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!pickedSong) {
    setStatus(requestResult, 'Tap a song from the results first.', 'error');
    return;
  }

  await submitSongRequest({
    service: pickedSong.service,
    title: pickedSong.title,
    artist: pickedSong.artist,
    songUrl: pickedSong.songUrl
  });
});

if (appleSearchBtn) {
  appleSearchBtn.addEventListener('click', () => runAppleMusicSearch());
}

appleSearchTermInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runAppleMusicSearch();
  }
});

let appleTypeaheadTimer = null;
let appleTypeaheadLast = '';

appleSearchTermInput.addEventListener('input', () => {
  if (!serviceIsAppleMusic()) return;
  const term = String(appleSearchTermInput.value || '').trim();
  if (term === appleTypeaheadLast) return;
  appleTypeaheadLast = term;

  if (appleTypeaheadTimer) clearTimeout(appleTypeaheadTimer);
  appleTypeaheadTimer = setTimeout(() => {
    if (String(appleSearchTermInput.value || '').trim().length >= 2) {
      runAppleMusicSearch();
    } else {
      if (appleSearchResults) appleSearchResults.textContent = '';
      setStatus(appleSearchStatus, 'Type at least 2 characters to search.', 'neutral');
    }
  }, 250);
});

toggleAppleSearchVisibility();
updateSongUrlUi();

if (pickedChangeBtn) {
  pickedChangeBtn.addEventListener('click', () => {
    pickedSong = null;
    if (pickedSongPanel) pickedSongPanel.classList.add('hidden');
    setStatus(requestResult, 'Pick a song from the results.', 'neutral');
    if (appleSearchTermInput) appleSearchTermInput.focus();
  });
}

if (pickedSubmitBtn) {
  pickedSubmitBtn.addEventListener('click', async () => {
    if (!pickedSong) {
      setStatus(requestResult, 'Tap a song from the results first.', 'error');
      return;
    }

    await submitSongRequest({
      service: pickedSong.service,
      title: pickedSong.title,
      artist: pickedSong.artist,
      songUrl: pickedSong.songUrl
    });
  });
}

initSupabase();

if (!supabaseClient && !apiBase) {
  setStatus(joinResult, 'This request site is not connected yet. Ask the DJ to finish setup.', 'error');
}

const codeFromUrl = readPartyCodeFromUrl();
if (PARTY_CODE_PATTERN.test(codeFromUrl)) {
  partyCodeInput.value = codeFromUrl;
  setStatus(joinResult, `Party code ${codeFromUrl} loaded. Checking now...`, 'info');
  lastAutoJoinCode = codeFromUrl;
  joinPartyByCode(codeFromUrl);
}
