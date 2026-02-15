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
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SERVICES = new Set(['Apple Music', 'Spotify', 'SoundCloud']);
const AUTH_TOKEN_KEY = 'pulse_auth_token';
const PASSWORD_MIN_LENGTH = 10;

const tabGuest = document.getElementById('tabGuest');
const tabDj = document.getElementById('tabDj');
const tabSetup = document.getElementById('tabSetup');
const tabStatus = document.getElementById('tabStatus');
const tabHelp = document.getElementById('tabHelp');
const openSetupBtn = document.getElementById('openSetupBtn');
const setupBackBtn = document.getElementById('setupBackBtn');

const windowPanels = Array.from(document.querySelectorAll('.window-panel'));
const windowTabs = [tabGuest, tabDj, tabSetup, tabStatus, tabHelp];

const authForm = document.getElementById('authForm');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authResult = document.getElementById('authResult');
const authIdentity = document.getElementById('authIdentity');
const backendStatus = document.getElementById('backendStatus');

const createPartyBtn = document.getElementById('createPartyBtn');
const createResult = document.getElementById('createResult');
const partyCodeOut = document.getElementById('partyCodeOut');
const djKeyOut = document.getElementById('djKeyOut');
const djSecrets = document.getElementById('djSecrets');
const copyPartyCodeBtn = document.getElementById('copyPartyCodeBtn');
const copyDjKeyBtn = document.getElementById('copyDjKeyBtn');

const djSharePanel = document.getElementById('djSharePanel');
const djGuestLinkOut = document.getElementById('djGuestLinkOut');
const copyGuestLinkBtn = document.getElementById('copyGuestLinkBtn');
const openGuestWindowBtn = document.getElementById('openGuestWindowBtn');

const joinForm = document.getElementById('joinForm');
const partyCodeInput = document.getElementById('partyCode');
const joinResult = document.getElementById('joinResult');
const stopCheckingBtn = document.getElementById('stopCheckingBtn');

const requestSection = document.getElementById('requestSection');
const requestForm = document.getElementById('requestForm');
const requestResult = document.getElementById('requestResult');

const appleSearchSection = document.getElementById('appleSearchSection');
const appleSearchTermInput = document.getElementById('appleSearchTerm');
const appleSearchBtn = document.getElementById('appleSearchBtn');
const appleSearchStatus = document.getElementById('appleSearchStatus');
const appleSearchResults = document.getElementById('appleSearchResults');
const songUrlInput = document.getElementById('songUrl');
const songUrlSummary = document.querySelector('.advanced-link-block summary');
const songUrlAutofillBtn = document.getElementById('songUrlAutofillBtn');
const songUrlAutofillStatus = document.getElementById('songUrlAutofillStatus');

const guestPartyCodeOut = document.getElementById('guestPartyCodeOut');
const guestRequestCountOut = document.getElementById('guestRequestCountOut');
const guestLastRequestOut = document.getElementById('guestLastRequestOut');
const guestRecentRequestsList = document.getElementById('guestRecentRequests');

const apiBaseConfigForm = document.getElementById('apiBaseConfigForm');
const apiBaseConfigInput = document.getElementById('apiBaseConfig');
const saveApiBaseBtn = document.getElementById('saveApiBaseBtn');
const testApiBaseBtn = document.getElementById('testApiBaseBtn');
const clearApiBaseBtn = document.getElementById('clearApiBaseBtn');
const apiBaseConfigStatus = document.getElementById('apiBaseConfigStatus');
const effectiveApiBase = document.getElementById('effectiveApiBase');

const sysBackendValue = document.getElementById('sysBackendValue');
const sysAuthValue = document.getElementById('sysAuthValue');
const sysPartyValue = document.getElementById('sysPartyValue');
const sysGuestValue = document.getElementById('sysGuestValue');
const eventTimeline = document.getElementById('eventTimeline');
const clearTimelineBtn = document.getElementById('clearTimelineBtn');

let apiBase = readInitialApiBase();
let activeWindow = 'guest';
let activePartyCode = null;
let authToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
let authUser = null;
let supabaseClient = null;
let backendReachable = false;
let backendChecked = false;
let lastCreatedPartyCode = '';
let guestRequestCount = 0;
let guestLastRequest = '';

let joinDebounceTimer = null;
let joinInFlight = false;
let lastAutoJoinCode = '';
let joinPollTimer = null;
let joinPollCode = '';
let joinPollInFlight = false;
let joinPollAttempts = 0;

let guestRecentRequests = [];
const GUEST_RECENT_MAX = 5;

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

function setStatus(element, text, type = 'neutral') {
  element.classList.remove('status-neutral', 'status-info', 'status-success', 'status-error');
  element.classList.add(`status-${type}`);
  element.textContent = text;
}

function setSongUrlAutofillStatus(text, type = 'neutral') {
  if (!songUrlAutofillStatus) return;
  setStatus(songUrlAutofillStatus, text, type);
}

function setButtonLoading(button, loading, loadingLabel, idleLabel) {
  button.disabled = loading;
  button.textContent = loading ? loadingLabel : idleLabel;
}

function setButtonsLoading(buttons, loading) {
  for (const button of buttons) {
    button.disabled = loading;
  }
}

function revealPanel(panel) {
  panel.classList.remove('hidden');
  panel.classList.remove('panel-pop');
  void panel.offsetWidth;
  panel.classList.add('panel-pop');
}

function hidePanel(panel) {
  panel.classList.add('hidden');
  panel.classList.remove('panel-pop');
}

function pushTimeline(level, message) {
  const item = document.createElement('article');
  item.className = `timeline-item timeline-${level || 'info'}`;

  const time = document.createElement('p');
  time.className = 'timeline-time';
  time.textContent = nowLabel();

  const text = document.createElement('p');
  text.className = 'timeline-msg';
  text.textContent = message;

  item.append(time, text);
  eventTimeline.prepend(item);

  while (eventTimeline.children.length > 120) {
    eventTimeline.removeChild(eventTimeline.lastElementChild);
  }
}

function setWindow(windowName) {
  activeWindow = windowName;

  for (const panel of windowPanels) {
    const isMatch = panel.dataset.window === windowName;
    panel.classList.toggle('hidden', !isMatch);
    panel.classList.toggle('is-active', isMatch);
  }

  for (const tab of windowTabs) {
    const isMatch = tab.dataset.window === windowName;
    tab.classList.toggle('is-active', isMatch);
    tab.setAttribute('aria-selected', isMatch ? 'true' : 'false');
  }

  if (windowName !== 'guest') {
    stopJoinPolling();
  }
}

function updateEffectiveApiBaseLabel() {
  if (supabaseClient) {
    const cfg = readSupabaseConfig();
    effectiveApiBase.textContent = cfg ? `Supabase: ${cfg.url}` : 'Supabase configured';
    return;
  }

  effectiveApiBase.textContent = apiBase || 'Not configured';
}

function updateGuestSummary() {
  guestPartyCodeOut.textContent = activePartyCode || '------';
  guestRequestCountOut.textContent = String(guestRequestCount);
  guestLastRequestOut.textContent = guestLastRequest || 'No requests sent yet.';
  renderGuestRecentRequests();
}

function guestRecentStorageKey(code) {
  const normalized = normalizePartyCode(code);
  if (!PARTY_CODE_PATTERN.test(normalized)) return '';
  return `pulse_guest_recent_requests_${normalized}`;
}

function sanitizeGuestRecentEntry(entry) {
  const title = String(entry?.title || '')
    .trim()
    .slice(0, 120);
  const artist = String(entry?.artist || '')
    .trim()
    .slice(0, 120);
  const service = String(entry?.service || '')
    .trim()
    .slice(0, 30);
  const seqNo = Number.isFinite(Number(entry?.seqNo)) ? Number(entry.seqNo) : 0;

  if (!title || !artist) return null;

  const createdAt = String(entry?.createdAt || new Date().toISOString());
  const created = new Date(createdAt);

  return {
    title,
    artist,
    service: service || 'Unknown',
    seqNo: seqNo > 0 ? Math.floor(seqNo) : 0,
    createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString()
  };
}

function loadGuestRecentRequests(code) {
  const key = guestRecentStorageKey(code);
  if (!key) return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    return list.map(sanitizeGuestRecentEntry).filter(Boolean).slice(0, GUEST_RECENT_MAX);
  } catch {
    return [];
  }
}

function saveGuestRecentRequests(code) {
  const key = guestRecentStorageKey(code);
  if (!key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(guestRecentRequests.slice(0, GUEST_RECENT_MAX)));
  } catch {
    // ignore
  }
}

function renderGuestRecentRequests() {
  guestRecentRequestsList.textContent = '';

  if (!guestRecentRequests.length) return;

  for (const entry of guestRecentRequests) {
    const li = document.createElement('li');
    li.className = 'recent-item';

    const title = document.createElement('strong');
    title.textContent = `${entry.title} - ${entry.artist}`;

    const sub = document.createElement('span');
    const seq = entry.seqNo > 0 ? `#${entry.seqNo}` : '';
    const time = nowLabel(entry.createdAt);
    sub.textContent = `${seq}${seq ? ' • ' : ''}${entry.service} • ${time}`;

    li.append(title, sub);
    guestRecentRequestsList.appendChild(li);
  }
}

function updateSystemStatus() {
  if (!apiBase && !supabaseClient) {
    sysBackendValue.textContent = 'Not configured';
  } else if (!backendChecked) {
    sysBackendValue.textContent = 'Checking...';
  } else {
    sysBackendValue.textContent = backendReachable ? 'Connected' : 'Unreachable';
  }

  sysAuthValue.textContent = authUser ? `Signed in: ${authUser.email}` : 'Signed out';
  sysPartyValue.textContent = lastCreatedPartyCode || '------';
  sysGuestValue.textContent = activePartyCode ? `Joined: ${activePartyCode}` : 'Not joined';
}

function initSupabase() {
  const cfg = readSupabaseConfig();
  if (!cfg) return null;
  if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;

  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  return supabaseClient;
}

function setApiBase(nextValue) {
  apiBase = normalizeApiBaseCandidate(nextValue);

  if (apiBase) {
    window.localStorage.setItem('pulse_api_base', apiBase);
  } else {
    window.localStorage.removeItem('pulse_api_base');
  }

  backendChecked = false;
  backendReachable = false;

  apiBaseConfigInput.value = apiBase;
  updateEffectiveApiBaseLabel();
  updateSystemStatus();
  setAuthUi();
}

function resetDjSecrets() {
  partyCodeOut.textContent = '------';
  djKeyOut.textContent = '----------';
  djSecrets.classList.add('hidden');

  djSharePanel.classList.add('hidden');
  djGuestLinkOut.textContent = '';
}

function buildGuestShareUrl(code) {
  const partyCode = normalizePartyCode(code);
  if (!PARTY_CODE_PATTERN.test(partyCode)) return '';

  const base = new URL(window.location.href);
  const dir = base.pathname.endsWith('/') ? base.pathname : base.pathname.replace(/\/[^/]*$/, '/');
  base.pathname = `${dir}guest.html`;
  base.search = '';
  base.hash = '';
  base.searchParams.set('partyCode', partyCode);
  return base.toString();
}

function setDjSharePanel(code) {
  const url = buildGuestShareUrl(code);
  if (!url) {
    djSharePanel.classList.add('hidden');
    djGuestLinkOut.textContent = '';
    return;
  }

  djGuestLinkOut.textContent = url;
  djSharePanel.classList.remove('hidden');
}

function makeIdempotencyKey() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readSelectedService() {
  const selected = requestForm.querySelector('input[name="service"]:checked');
  return selected ? selected.value : '';
}

function hostnameMatches(hostnameInput, allowedHostInput) {
  const hostname = String(hostnameInput || '').toLowerCase();
  const allowedHost = String(allowedHostInput || '').toLowerCase();
  if (!hostname || !allowedHost) return false;
  if (hostname === allowedHost) return true;
  return hostname.endsWith(`.${allowedHost}`);
}

function isValidSongUrl(urlText, service) {
  if (!urlText) return true;

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

  if (service === 'Spotify') {
    return hostnameMatches(hostname, 'spotify.com') || hostnameMatches(hostname, 'spotify.link');
  }

  if (service === 'SoundCloud') {
    return hostnameMatches(hostname, 'soundcloud.com') || hostnameMatches(hostname, 'on.soundcloud.com');
  }

  return false;
}

function readPartyCodeFromUrl() {
  const params = new URLSearchParams(window.location.search || '');
  const fromParam = params.get('partyCode') || params.get('code');
  return normalizePartyCode(fromParam);
}

function readPageModeFromUrl() {
  const params = new URLSearchParams(window.location.search || '');
  const mode = String(params.get('mode') || '').trim().toLowerCase();

  if (mode === 'guest' || params.get('guest') === '1') return 'guest';
  if (mode === 'dj') return 'dj';
  return '';
}

function setAuthToken(token) {
  authToken = token || '';
  if (authToken) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function setAuthUi() {
  const isSignedIn = supabaseClient ? Boolean(authUser) : Boolean(authUser && authToken);
  const backendReady = Boolean(apiBase || supabaseClient);
  createPartyBtn.disabled = !isSignedIn || !backendReady;

  if (isSignedIn) {
    // Hide auth inputs once signed in to keep the DJ flow focused.
    authForm.classList.add('hidden');
    authIdentity.textContent = `Signed in as ${authUser.email}`;
    authIdentity.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    setStatus(authResult, 'DJ account ready.', 'success');

    if (createResult.textContent === 'Sign in to create parties.') {
      setStatus(createResult, 'Ready to create a secure party.', 'neutral');
    }
  } else {
    authForm.classList.remove('hidden');
    authIdentity.classList.add('hidden');
    authIdentity.textContent = '';
    logoutBtn.classList.add('hidden');
    setStatus(authResult, 'Not signed in.', 'neutral');
    setStatus(createResult, 'Sign in to create parties.', 'neutral');
    resetDjSecrets();
  }

  updateSystemStatus();
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

async function copySecret(label, value) {
  const ok = await copyToClipboard(value);
  if (ok) {
    setStatus(createResult, `${label} copied.`, 'success');
    pushTimeline('success', `${label} copied to clipboard.`);
  } else {
    setStatus(createResult, `Could not copy ${label}.`, 'error');
  }
}

async function pingBackendHealth(targetBase) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(`${targetBase}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Health check failed (${res.status})`);
    }

    return true;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiRequest(path, options = {}) {
  if (!apiBase) {
    throw new Error('Backend is not configured. Open Setup Window and save API Base URL.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 9000);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (options.auth && authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const res = await fetch(`${apiBase}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
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
    clearTimeout(timeout);
  }
}

async function fetchJson(url, { timeoutMs = 9000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : null;

    if (!res.ok) {
      const message = data?.error || data?.message || `Request failed (${res.status})`;
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out. Please retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function itunesSongSearch(term, limit = 8) {
  const q = String(term || '').trim();
  if (q.length < 2) return [];

  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', q);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', String(Math.max(1, Math.min(12, Number(limit) || 8))));

  const data = await fetchJson(url.toString(), { timeoutMs: 9000 });
  const rows = Array.isArray(data?.results) ? data.results : [];

  return rows
    .map((row) => {
      const title = String(row?.trackName || '').trim();
      const artist = String(row?.artistName || '').trim();
      if (!title || !artist) return null;
      return {
        title,
        artist,
        album: String(row?.collectionName || '').trim(),
        url: String(row?.trackViewUrl || '').trim(),
        artworkUrl: String(row?.artworkUrl100 || '').trim()
      };
    })
    .filter(Boolean);
}

async function oembedAutofill(service, songUrl) {
  const url = String(songUrl || '').trim();
  if (!url) throw new Error('Missing URL');

  let endpoint = '';
  if (service === 'Apple Music') {
    endpoint = `https://music.apple.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (service === 'Spotify') {
    endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (service === 'SoundCloud') {
    endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  } else {
    throw new Error('Unsupported service');
  }

  const data = await fetchJson(endpoint, { timeoutMs: 9000 });
  return {
    title: String(data?.title || '').trim(),
    artist: String(data?.author_name || '').trim(),
    canonicalUrl: url
  };
}

async function checkBackendHealth() {
  if (supabaseClient) {
    backendChecked = true;
    backendReachable = true;
    setStatus(backendStatus, 'Backend connected (Supabase).', 'success');
    setStatus(apiBaseConfigStatus, 'Supabase configured via site config.', 'success');
    updateEffectiveApiBaseLabel();
    updateSystemStatus();
    return true;
  }

  if (!apiBase) {
    backendChecked = false;
    backendReachable = false;
    setStatus(backendStatus, 'Backend not configured. Open Setup Window and set API Base URL.', 'error');
    setStatus(apiBaseConfigStatus, 'No saved API base URL yet.', 'neutral');
    updateSystemStatus();
    return false;
  }

  setStatus(backendStatus, `Connecting to backend: ${apiBase}`, 'info');

  try {
    await pingBackendHealth(apiBase);
    backendChecked = true;
    backendReachable = true;
    setStatus(backendStatus, 'Backend connected.', 'success');
    setStatus(apiBaseConfigStatus, `Connected to ${apiBase}`, 'success');
    updateSystemStatus();
    return true;
  } catch (error) {
    backendChecked = true;
    backendReachable = false;
    setStatus(backendStatus, `Backend unreachable (${apiBase}). Check Setup Window.`, 'error');
    setStatus(apiBaseConfigStatus, error.message || 'Backend health check failed.', 'error');
    updateSystemStatus();
    return false;
  }
}

async function refreshAuthIdentity() {
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getUser();
      authUser = data?.user
        ? {
            id: data.user.id,
            email: data.user.email
          }
        : null;
    } catch {
      authUser = null;
    }

    setAuthUi();
    return;
  }

  if (!authToken || !apiBase) {
    authUser = null;
    setAuthUi();
    return;
  }

  try {
    const data = await apiRequest('/api/auth/me', {
      method: 'GET',
      auth: true
    });
    authUser = data.user;
  } catch {
    authUser = null;
    setAuthToken('');
  }

  setAuthUi();
}

async function submitAuth(mode) {
  const email = String(authEmailInput.value || '')
    .trim()
    .toLowerCase();
  const password = String(authPasswordInput.value || '').trim();

  if (supabaseClient) {
    if (!AUTH_EMAIL_PATTERN.test(email)) {
      setStatus(authResult, 'Enter a valid email address.', 'error');
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setStatus(authResult, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, 'error');
      return;
    }

    setButtonsLoading([registerBtn, loginBtn], true);
    setStatus(authResult, mode === 'register' ? 'Creating account...' : 'Signing in...', 'info');

    try {
      if (mode === 'register') {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw new Error(error.message || 'Sign up failed');
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message || 'Sign in failed');
      }

      authPasswordInput.value = '';
      await refreshAuthIdentity();
      setStatus(authResult, mode === 'register' ? 'Account created and signed in.' : 'Signed in.', 'success');
      pushTimeline('success', `DJ ${mode === 'register' ? 'registered' : 'signed in'}: ${email}`);
    } catch (error) {
      setStatus(authResult, error.message || 'Authentication failed.', 'error');
    } finally {
      setButtonsLoading([registerBtn, loginBtn], false);
    }

    return;
  }

  if (!apiBase) {
    setStatus(authResult, 'Backend is not configured. Open Setup Window first.', 'error');
    setWindow('setup');
    return;
  }

  if (!AUTH_EMAIL_PATTERN.test(email)) {
    setStatus(authResult, 'Enter a valid email address.', 'error');
    return;
  }

  if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) {
    setStatus(authResult, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, 'error');
    return;
  }

  if (!email || !password) {
    setStatus(authResult, 'Enter email and password.', 'error');
    return;
  }

  setButtonsLoading([registerBtn, loginBtn], true);
  setStatus(authResult, mode === 'register' ? 'Creating account...' : 'Signing in...', 'info');

  try {
    const data = await apiRequest(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: {
        email,
        password
      }
    });

    setAuthToken(data.token);
    authUser = data.user;
    setAuthUi();
    setStatus(authResult, mode === 'register' ? 'Account created and signed in.' : 'Signed in.', 'success');
    authPasswordInput.value = '';
    pushTimeline('success', `DJ ${mode === 'register' ? 'registered' : 'signed in'}: ${email}`);
  } catch (error) {
    setStatus(authResult, error.message || 'Authentication failed.', 'error');
  } finally {
    setButtonsLoading([registerBtn, loginBtn], false);
  }
}

function serviceIsAppleMusic() {
  return readSelectedService() === 'Apple Music';
}

function toggleAppleSearchVisibility() {
  if (serviceIsAppleMusic()) {
    appleSearchSection.classList.remove('hidden');
  } else {
    appleSearchSection.classList.add('hidden');
    appleSearchResults.textContent = '';
    setStatus(appleSearchStatus, 'Apple Music search is available only for Apple Music requests.', 'info');
  }
}

function updateSongUrlUi() {
  if (!songUrlInput) return;

  const service = readSelectedService();

  if (service === 'Apple Music') {
    songUrlInput.placeholder = 'https://music.apple.com/...';
    if (songUrlSummary) songUrlSummary.textContent = 'Advanced: Paste Apple Music Link (Optional)';
    setSongUrlAutofillStatus('Paste an Apple Music link and tap Autofill, or use Search to pick a song.', 'neutral');
  } else if (service === 'Spotify') {
    songUrlInput.placeholder = 'https://open.spotify.com/track/...';
    if (songUrlSummary) songUrlSummary.textContent = 'Advanced: Paste Spotify Link (Optional)';
    setSongUrlAutofillStatus('Paste a Spotify track link and tap Autofill to pull title + artist.', 'neutral');
  } else if (service === 'SoundCloud') {
    songUrlInput.placeholder = 'https://soundcloud.com/...';
    if (songUrlSummary) songUrlSummary.textContent = 'Advanced: Paste SoundCloud Link (Optional)';
    setSongUrlAutofillStatus('Paste a SoundCloud track link and tap Autofill to pull title + artist.', 'neutral');
  } else {
    songUrlInput.placeholder = 'https://...';
    if (songUrlSummary) songUrlSummary.textContent = 'Advanced: Paste Song Link (Optional)';
    setSongUrlAutofillStatus('Paste a link and tap Autofill to pull song details.', 'neutral');
  }

  const current = String(songUrlInput.value || '').trim();
  if (current && !isValidSongUrl(current, service)) {
    songUrlInput.value = '';
  }
}

function fillRequestFieldsFromSearchResult(result) {
  document.getElementById('title').value = result.title || '';
  document.getElementById('artist').value = result.artist || '';
  if (songUrlInput) songUrlInput.value = result.url || '';
  setStatus(appleSearchStatus, `Selected ${result.title} - ${result.artist}`, 'success');
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

  const submitButton = requestForm.querySelector('button[type="submit"]');
  if (options.loading !== false) {
    setButtonLoading(submitButton, true, 'Submitting...', 'Submit Request');
  }
  setStatus(requestResult, 'Submitting request to DJ queue...', 'info');

  try {
    const data = await apiRequest(`/api/parties/${activePartyCode}/requests`, {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': makeIdempotencyKey()
      },
      body: {
        service,
        title,
        artist,
        songUrl
      }
    });

    setStatus(requestResult, `Queued #${data.seqNo}: ${data.title} - ${data.artist}`, 'success');

    guestRequestCount += 1;
    guestLastRequest = `Last request: ${data.title} - ${data.artist}`;

    const recentEntry = sanitizeGuestRecentEntry(data);
    if (recentEntry) {
      guestRecentRequests.unshift(recentEntry);
      guestRecentRequests = guestRecentRequests.slice(0, GUEST_RECENT_MAX);
      saveGuestRecentRequests(activePartyCode);
    }

    updateGuestSummary();

    pushTimeline('success', `Guest submitted #${data.seqNo}: ${data.title} - ${data.artist}`);

    document.getElementById('title').value = '';
    document.getElementById('artist').value = '';
    document.getElementById('songUrl').value = '';
    appleSearchTermInput.value = '';
    appleSearchResults.textContent = '';
    toggleAppleSearchVisibility();

    return true;
  } catch (error) {
    setStatus(requestResult, error.message || 'Request failed.', 'error');
    return false;
  } finally {
    if (options.loading !== false) {
      setButtonLoading(submitButton, false, 'Submitting...', 'Submit Request');
    }
  }
}

function renderAppleSearchResults(items) {
  appleSearchResults.textContent = '';

  if (!items.length) {
    setStatus(appleSearchStatus, 'No results found. Try a different search term.', 'info');
    return;
  }

  setStatus(appleSearchStatus, `Found ${items.length} result(s). Pick one to autofill or request instantly.`, 'success');

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'search-card';

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

    const actions = document.createElement('div');
    actions.className = 'search-actions';

    const autofillButton = document.createElement('button');
    autofillButton.type = 'button';
    autofillButton.className = 'btn btn-ghost';
    autofillButton.textContent = 'Autofill';
    autofillButton.addEventListener('click', () => fillRequestFieldsFromSearchResult(item));

    const requestButton = document.createElement('button');
    requestButton.type = 'button';
    requestButton.className = 'btn btn-primary';
    requestButton.textContent = 'Request Song';
    requestButton.addEventListener('click', async () => {
      if (!activePartyCode) {
        setStatus(requestResult, 'Join a live party first.', 'error');
        return;
      }

      const ok = await submitSongRequest(
        {
          service: 'Apple Music',
          title: item.title,
          artist: item.artist,
          songUrl: item.url
        },
        { loading: true }
      );

      if (ok) {
        setStatus(appleSearchStatus, `Requested ${item.title} - ${item.artist}`, 'success');
      }
    });

    actions.append(autofillButton, requestButton);
    card.append(image, meta, actions);
    appleSearchResults.appendChild(card);
  }
}

async function runAppleMusicSearch() {
  if (!serviceIsAppleMusic()) return;

  const term = String(appleSearchTermInput.value || '').trim();
  if (term.length < 2) {
    setStatus(appleSearchStatus, 'Type at least 2 characters to search.', 'error');
    return;
  }

  setButtonLoading(appleSearchBtn, true, 'Searching...', 'Search');
  setStatus(appleSearchStatus, 'Searching Apple Music...', 'info');

  try {
    const results = await itunesSongSearch(term, 8);
    renderAppleSearchResults(results);
  } catch (error) {
    setStatus(appleSearchStatus, error.message || 'Apple Music search failed.', 'error');
    appleSearchResults.textContent = '';
  } finally {
    setButtonLoading(appleSearchBtn, false, 'Searching...', 'Search');
  }
}

function stopJoinPolling(message) {
  if (joinPollTimer) {
    clearInterval(joinPollTimer);
  }

  joinPollTimer = null;
  joinPollCode = '';
  joinPollInFlight = false;
  joinPollAttempts = 0;

  stopCheckingBtn.classList.add('hidden');

  if (message) {
    setStatus(joinResult, message, 'neutral');
  }
}

function startJoinPolling(codeInput) {
  const code = normalizePartyCode(codeInput);
  if (!apiBase) return;
  if (!PARTY_CODE_PATTERN.test(code)) return;

  if (joinPollTimer && joinPollCode === code) return;

  stopJoinPolling();
  joinPollCode = code;
  joinPollAttempts = 0;
  stopCheckingBtn.classList.remove('hidden');
  stopCheckingBtn.textContent = 'Stop Checking';

  const maxAttempts = 45;
  const intervalMs = 2600;

  joinPollTimer = setInterval(async () => {
    if (joinPollInFlight) return;

    joinPollInFlight = true;
    joinPollAttempts += 1;

    try {
      const data = await apiRequest(`/api/parties/${code}/join`, { method: 'POST', timeoutMs: 8000 });

      if (data.djActive) {
        stopJoinPolling();

        activePartyCode = code;
        guestRecentRequests = loadGuestRecentRequests(code);
        guestRequestCount = guestRecentRequests.length;
        guestLastRequest = guestRecentRequests.length
          ? `Last request: ${guestRecentRequests[0].title} - ${guestRecentRequests[0].artist}`
          : '';

        revealPanel(requestSection);
        setStatus(joinResult, `DJ is live. Connected to party ${code}.`, 'success');
        pushTimeline('success', `Guest joined party ${code}.`);
        updateGuestSummary();
        updateSystemStatus();
        return;
      }

      if (joinPollAttempts >= maxAttempts) {
        stopJoinPolling('Still waiting for DJ. Tap Join to retry.');
        return;
      }

      setStatus(joinResult, `Waiting for DJ to connect... (${joinPollAttempts}/${maxAttempts})`, 'info');
    } catch (error) {
      stopJoinPolling(error.message || 'Could not check DJ status. Tap Join to retry.');
    } finally {
      joinPollInFlight = false;
    }
  }, intervalMs);
}

async function joinPartyByCode(code) {
  if (!PARTY_CODE_PATTERN.test(code)) {
    setStatus(joinResult, 'Party code must be exactly 6 letters/numbers.', 'error');
    hidePanel(requestSection);
    activePartyCode = null;
    guestRequestCount = 0;
    guestLastRequest = '';
    guestRecentRequests = [];
    updateGuestSummary();
    updateSystemStatus();
    return false;
  }

  setStatus(joinResult, `Checking party ${code}...`, 'info');

  try {
    const data = await apiRequest(`/api/parties/${code}/join`, { method: 'POST' });

    if (!data.djActive) {
      activePartyCode = null;
      guestRequestCount = 0;
      guestLastRequest = '';
      guestRecentRequests = [];
      hidePanel(requestSection);
      setStatus(joinResult, 'Party found. Waiting for DJ to connect...', 'info');
      startJoinPolling(code);
      updateGuestSummary();
      updateSystemStatus();
      return false;
    }

    stopJoinPolling();
    activePartyCode = code;
    guestRecentRequests = loadGuestRecentRequests(code);
    guestRequestCount = guestRecentRequests.length;
    guestLastRequest = guestRecentRequests.length
      ? `Last request: ${guestRecentRequests[0].title} - ${guestRecentRequests[0].artist}`
      : '';
    revealPanel(requestSection);
    setStatus(joinResult, `Connected to party ${code}. You can send requests now.`, 'success');
    pushTimeline('success', `Guest joined party ${code}.`);
    updateGuestSummary();
    updateSystemStatus();
    return true;
  } catch (error) {
    activePartyCode = null;
    guestRequestCount = 0;
    guestLastRequest = '';
    guestRecentRequests = [];
    hidePanel(requestSection);
    stopJoinPolling();
    setStatus(joinResult, error.message || 'Unable to join party.', 'error');
    updateGuestSummary();
    updateSystemStatus();
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

windowTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setWindow(tab.dataset.window);
  });
});

openSetupBtn.addEventListener('click', () => {
  setWindow('setup');
  apiBaseConfigInput.focus();
});

setupBackBtn.addEventListener('click', () => {
  setWindow('guest');
  partyCodeInput.focus();
});

stopCheckingBtn.addEventListener('click', () => {
  stopJoinPolling('Stopped checking. Tap Join to retry.');
});

apiBaseConfigForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const candidate = normalizeApiBaseCandidate(apiBaseConfigInput.value);
  if (!candidate) {
    setStatus(apiBaseConfigStatus, 'Enter a valid http(s) API URL.', 'error');
    return;
  }

  setButtonLoading(saveApiBaseBtn, true, 'Saving...', 'Save');

  try {
    setApiBase(candidate);
    const ok = await checkBackendHealth();
    if (ok) {
      await refreshAuthIdentity();
      setStatus(apiBaseConfigStatus, `Saved and connected: ${apiBase}`, 'success');
      pushTimeline('success', `Backend API configured: ${apiBase}`);
      if (activeWindow === 'setup') {
        setWindow('guest');
      }
    }
  } finally {
    setButtonLoading(saveApiBaseBtn, false, 'Saving...', 'Save');
  }
});

testApiBaseBtn.addEventListener('click', async () => {
  const candidate = normalizeApiBaseCandidate(apiBaseConfigInput.value);
  if (!candidate) {
    setStatus(apiBaseConfigStatus, 'Enter a valid http(s) API URL.', 'error');
    return;
  }

  setButtonLoading(testApiBaseBtn, true, 'Testing...', 'Test');

  try {
    await pingBackendHealth(candidate);
    setStatus(apiBaseConfigStatus, `Reachable: ${candidate}`, 'success');
    pushTimeline('info', `Backend test passed for ${candidate}`);
  } catch (error) {
    setStatus(apiBaseConfigStatus, error.message || 'Could not reach backend.', 'error');
  } finally {
    setButtonLoading(testApiBaseBtn, false, 'Testing...', 'Test');
  }
});

clearApiBaseBtn.addEventListener('click', () => {
  setApiBase('');
  authUser = null;
  setAuthToken('');
  setAuthUi();
  hidePanel(requestSection);
  stopJoinPolling();
  activePartyCode = null;
  guestRequestCount = 0;
  guestLastRequest = '';
  guestRecentRequests = [];
  updateGuestSummary();
  updateSystemStatus();
  setStatus(apiBaseConfigStatus, 'API base cleared.', 'neutral');
  setStatus(backendStatus, 'Backend not configured. Open Setup Window and set API Base URL.', 'error');
  pushTimeline('warning', 'Backend API cleared from this browser.');
  setWindow('setup');
});

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);
  stopJoinPolling();

  const normalized = normalizePartyCode(partyCodeInput.value);
  if (activePartyCode && normalized !== activePartyCode) {
    activePartyCode = null;
    guestRequestCount = 0;
    guestLastRequest = '';
    guestRecentRequests = [];
    hidePanel(requestSection);
    setStatus(joinResult, 'Party code changed. Tap Join to connect.', 'neutral');
    updateGuestSummary();
    updateSystemStatus();
  }

  scheduleAutoJoin(normalized);
});

registerBtn.addEventListener('click', () => {
  submitAuth('register');
});

loginBtn.addEventListener('click', () => {
  submitAuth('login');
});

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuth('login');
});

authEmailInput.addEventListener('blur', () => {
  authEmailInput.value = String(authEmailInput.value || '')
    .trim()
    .toLowerCase();
});

logoutBtn.addEventListener('click', async () => {
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch {
      // ignore
    }
  }
  authUser = null;
  setAuthToken('');
  setAuthUi();
  setStatus(joinResult, 'Waiting for code.', 'neutral');
  hidePanel(requestSection);
  stopJoinPolling();
  activePartyCode = null;
  guestRequestCount = 0;
  guestLastRequest = '';
  guestRecentRequests = [];
  updateGuestSummary();
  updateSystemStatus();
  pushTimeline('info', 'DJ signed out.');
  setWindow('dj');
});

createPartyBtn.addEventListener('click', async () => {
  setButtonLoading(createPartyBtn, true, 'Creating...', 'Create Party');
  setStatus(createResult, 'Generating secure party credentials...', 'info');

  try {
    let data;
    if (supabaseClient) {
      const { data: rpcData, error } = await supabaseClient.rpc('create_party');
      if (error) throw new Error(error.message || 'Failed to create party');
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      data = { code: row.code, djKey: row.dj_key };
    } else {
      data = await apiRequest('/api/parties', { method: 'POST', auth: true });
    }
    partyCodeOut.textContent = data.code;
    djKeyOut.textContent = data.djKey;
    revealPanel(djSecrets);

    lastCreatedPartyCode = data.code;
    updateSystemStatus();

    setDjSharePanel(data.code);

    setStatus(
      createResult,
      `Party ${data.code} created. Save the DJ key now and use it only in the DJ app.`,
      'success'
    );

    partyCodeInput.value = data.code;
    setStatus(joinResult, `Party code ${data.code} copied into Guest Window input.`, 'info');
    pushTimeline('success', `Party ${data.code} created.`);
  } catch (error) {
    if (error.status === 401) {
      authUser = null;
      setAuthToken('');
      setAuthUi();
    }
    setStatus(createResult, error.message || 'Failed to create party.', 'error');
  } finally {
    createPartyBtn.textContent = 'Create Party';
    createPartyBtn.disabled = supabaseClient ? !authUser : !(authUser && authToken && apiBase);
  }
});

copyPartyCodeBtn.addEventListener('click', async () => {
  await copySecret('Party code', partyCodeOut.textContent);
});

copyDjKeyBtn.addEventListener('click', async () => {
  await copySecret('DJ key', djKeyOut.textContent);
});

copyGuestLinkBtn.addEventListener('click', async () => {
  const url = String(djGuestLinkOut.textContent || '').trim();
  if (!url) {
    setStatus(createResult, 'Create a party first to get a guest link.', 'error');
    return;
  }

  const ok = await copyToClipboard(url);
  if (ok) {
    setStatus(createResult, 'Guest link copied.', 'success');
    pushTimeline('success', 'Guest link copied to clipboard.');
  } else {
    setStatus(createResult, 'Could not copy guest link.', 'error');
  }
});

openGuestWindowBtn.addEventListener('click', () => {
  setWindow('guest');
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const code = normalizePartyCode(partyCodeInput.value);
  lastAutoJoinCode = code;
  await joinPartyByCode(code);
});

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  await submitSongRequest({
    service: readSelectedService(),
    title: String(document.getElementById('title').value || ''),
    artist: String(document.getElementById('artist').value || ''),
    songUrl: String(document.getElementById('songUrl').value || '')
  });
});

if (songUrlAutofillBtn) {
  songUrlAutofillBtn.addEventListener('click', async () => {
    const service = readSelectedService();
    const url = String(songUrlInput?.value || '').trim();

    if (!url) {
      setSongUrlAutofillStatus('Paste a song link first.', 'error');
      return;
    }

    if (!isValidSongUrl(url, service)) {
      setSongUrlAutofillStatus('That link does not match the selected service.', 'error');
      return;
    }

    setButtonLoading(songUrlAutofillBtn, true, 'Autofilling...', 'Autofill From Link');
    setSongUrlAutofillStatus('Looking up song details...', 'info');

    try {
      const data = await oembedAutofill(service, url);
      const title = String(data?.title || '').trim();
      const artist = String(data?.artist || '').trim();
      const canonical = String(data?.canonicalUrl || '').trim();

      if (title) document.getElementById('title').value = title;
      if (artist) document.getElementById('artist').value = artist;
      if (canonical && songUrlInput) songUrlInput.value = canonical;

      if (title && artist) {
        setSongUrlAutofillStatus(`Autofilled: ${title} - ${artist}`, 'success');
      } else {
        setSongUrlAutofillStatus('Autofill completed, but some fields are missing. Please review.', 'info');
      }
    } catch (error) {
      setSongUrlAutofillStatus(error.message || 'Could not autofill from link.', 'error');
    } finally {
      setButtonLoading(songUrlAutofillBtn, false, 'Autofilling...', 'Autofill From Link');
    }
  });
}

appleSearchBtn.addEventListener('click', () => {
  runAppleMusicSearch();
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
      appleSearchResults.textContent = '';
      setStatus(appleSearchStatus, 'Type at least 2 characters to search.', 'neutral');
    }
  }, 250);
});

appleSearchTermInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runAppleMusicSearch();
  }
});

requestForm.querySelectorAll('input[name="service"]').forEach((input) => {
  input.addEventListener('change', () => {
    toggleAppleSearchVisibility();
    updateSongUrlUi();
  });
});

clearTimelineBtn.addEventListener('click', () => {
  eventTimeline.textContent = '';
  pushTimeline('info', 'Timeline cleared.');
});

toggleAppleSearchVisibility();
updateSongUrlUi();
initSupabase();
setApiBase(apiBase);
const pageMode = readPageModeFromUrl();
if (pageMode === 'guest') {
  document.body.classList.add('mode-guest');
}

setWindow(pageMode === 'dj' ? 'dj' : 'guest');
toggleAppleSearchVisibility();
updateGuestSummary();
updateSystemStatus();

(async () => {
  const backendOk = await checkBackendHealth();
  if (backendOk) {
    await refreshAuthIdentity();
  }

  const codeFromUrl = readPartyCodeFromUrl();
  if (PARTY_CODE_PATTERN.test(codeFromUrl)) {
    setWindow('guest');
    partyCodeInput.value = codeFromUrl;
    setStatus(joinResult, `Party code ${codeFromUrl} loaded from QR link. Checking now...`, 'info');
    pushTimeline('info', `QR party link opened for ${codeFromUrl}.`);
    lastAutoJoinCode = codeFromUrl;
    await joinPartyByCode(codeFromUrl);
    return;
  }

  if (!apiBase && !supabaseClient) {
    setWindow('setup');
  }
})();
