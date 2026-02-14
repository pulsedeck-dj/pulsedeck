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

const PARTY_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SERVICES = new Set(['Apple Music', 'Spotify', 'YouTube']);
const AUTH_TOKEN_KEY = 'pulse_auth_token';
const PASSWORD_MIN_LENGTH = 10;

const tabGuest = document.getElementById('tabGuest');
const tabDj = document.getElementById('tabDj');
const tabSetup = document.getElementById('tabSetup');
const tabStatus = document.getElementById('tabStatus');
const tabHelp = document.getElementById('tabHelp');
const openSetupBtn = document.getElementById('openSetupBtn');

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

const requestSection = document.getElementById('requestSection');
const requestForm = document.getElementById('requestForm');
const requestResult = document.getElementById('requestResult');

const appleSearchSection = document.getElementById('appleSearchSection');
const appleSearchTermInput = document.getElementById('appleSearchTerm');
const appleSearchBtn = document.getElementById('appleSearchBtn');
const appleSearchStatus = document.getElementById('appleSearchStatus');
const appleSearchResults = document.getElementById('appleSearchResults');

const guestPartyCodeOut = document.getElementById('guestPartyCodeOut');
const guestRequestCountOut = document.getElementById('guestRequestCountOut');
const guestLastRequestOut = document.getElementById('guestLastRequestOut');

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
let backendReachable = false;
let backendChecked = false;
let lastCreatedPartyCode = '';
let guestRequestCount = 0;
let guestLastRequest = '';

let joinDebounceTimer = null;
let joinInFlight = false;
let lastAutoJoinCode = '';

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
}

function updateEffectiveApiBaseLabel() {
  effectiveApiBase.textContent = apiBase || 'Not configured';
}

function updateGuestSummary() {
  guestPartyCodeOut.textContent = activePartyCode || '------';
  guestRequestCountOut.textContent = String(guestRequestCount);
  guestLastRequestOut.textContent = guestLastRequest || 'No requests sent yet.';
}

function updateSystemStatus() {
  if (!apiBase) {
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

function isValidSongUrl(urlText, service) {
  if (!urlText) return true;

  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  if (service === 'Apple Music') {
    return parsed.hostname.endsWith('music.apple.com');
  }

  return true;
}

function readPartyCodeFromUrl() {
  const params = new URLSearchParams(window.location.search || '');
  const fromParam = params.get('partyCode') || params.get('code');
  return normalizePartyCode(fromParam);
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
  const isSignedIn = Boolean(authUser && authToken);
  const backendReady = Boolean(apiBase);
  createPartyBtn.disabled = !isSignedIn || !backendReady;

  if (isSignedIn) {
    authIdentity.textContent = `Signed in as ${authUser.email}`;
    authIdentity.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    setStatus(authResult, 'DJ account ready.', 'success');

    if (createResult.textContent === 'Sign in to create parties.') {
      setStatus(createResult, 'Ready to create a secure party.', 'neutral');
    }
  } else {
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

async function checkBackendHealth() {
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

function fillRequestFieldsFromSearchResult(result) {
  document.getElementById('title').value = result.title || '';
  document.getElementById('artist').value = result.artist || '';
  document.getElementById('appleMusicUrl').value = result.url || '';
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
  const appleMusicUrl = String(input?.appleMusicUrl || '').trim();

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

  if (!isValidSongUrl(appleMusicUrl, service)) {
    setStatus(requestResult, 'Song URL must be a valid HTTPS link.', 'error');
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
        appleMusicUrl
      }
    });

    setStatus(requestResult, `Queued #${data.seqNo}: ${data.title} - ${data.artist}`, 'success');

    guestRequestCount += 1;
    guestLastRequest = `Last request: ${data.title} - ${data.artist}`;
    updateGuestSummary();

    pushTimeline('success', `Guest submitted #${data.seqNo}: ${data.title} - ${data.artist}`);

    document.getElementById('title').value = '';
    document.getElementById('artist').value = '';
    document.getElementById('appleMusicUrl').value = '';
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
          appleMusicUrl: item.url
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
  setStatus(appleSearchStatus, 'Searching Apple Music catalog...', 'info');

  try {
    const query = new URLSearchParams({ term, limit: '8' });
    const data = await apiRequest(`/api/music/apple/search?${query.toString()}`, {
      method: 'GET'
    });

    const results = Array.isArray(data.results) ? data.results : [];
    renderAppleSearchResults(results);
  } catch (error) {
    setStatus(appleSearchStatus, error.message || 'Apple Music search failed.', 'error');
    appleSearchResults.textContent = '';
  } finally {
    setButtonLoading(appleSearchBtn, false, 'Searching...', 'Search');
  }
}

async function joinPartyByCode(code) {
  if (!PARTY_CODE_PATTERN.test(code)) {
    setStatus(joinResult, 'Party code must be exactly 6 letters/numbers.', 'error');
    hidePanel(requestSection);
    activePartyCode = null;
    updateGuestSummary();
    updateSystemStatus();
    return false;
  }

  setStatus(joinResult, `Checking party ${code}...`, 'info');

  try {
    const data = await apiRequest(`/api/parties/${code}/join`, { method: 'POST' });

    if (!data.djActive) {
      activePartyCode = null;
      hidePanel(requestSection);
      setStatus(joinResult, 'Party found, but DJ is not active yet. Ask DJ to open the DJ app.', 'info');
      updateGuestSummary();
      updateSystemStatus();
      return false;
    }

    activePartyCode = code;
    revealPanel(requestSection);
    setStatus(joinResult, `Connected to party ${code}. You can send requests now.`, 'success');
    pushTimeline('success', `Guest joined party ${code}.`);
    updateGuestSummary();
    updateSystemStatus();
    return true;
  } catch (error) {
    activePartyCode = null;
    hidePanel(requestSection);
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
  activePartyCode = null;
  guestRequestCount = 0;
  guestLastRequest = '';
  updateGuestSummary();
  updateSystemStatus();
  setStatus(apiBaseConfigStatus, 'API base cleared.', 'neutral');
  setStatus(backendStatus, 'Backend not configured. Open Setup Window and set API Base URL.', 'error');
  pushTimeline('warning', 'Backend API cleared from this browser.');
  setWindow('setup');
});

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);
  scheduleAutoJoin(partyCodeInput.value);
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

logoutBtn.addEventListener('click', () => {
  authUser = null;
  setAuthToken('');
  setAuthUi();
  setStatus(joinResult, 'Waiting for code.', 'neutral');
  hidePanel(requestSection);
  activePartyCode = null;
  updateGuestSummary();
  updateSystemStatus();
  pushTimeline('info', 'DJ signed out.');
  setWindow('dj');
});

createPartyBtn.addEventListener('click', async () => {
  setButtonLoading(createPartyBtn, true, 'Creating...', 'Create Party');
  setStatus(createResult, 'Generating secure party credentials...', 'info');

  try {
    const data = await apiRequest('/api/parties', { method: 'POST', auth: true });
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
    createPartyBtn.disabled = !(authUser && authToken && apiBase);
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
    appleMusicUrl: String(document.getElementById('appleMusicUrl').value || '')
  });
});

appleSearchBtn.addEventListener('click', () => {
  runAppleMusicSearch();
});

appleSearchTermInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runAppleMusicSearch();
  }
});

requestForm.querySelectorAll('input[name="service"]').forEach((input) => {
  input.addEventListener('change', toggleAppleSearchVisibility);
});

clearTimelineBtn.addEventListener('click', () => {
  eventTimeline.textContent = '';
  pushTimeline('info', 'Timeline cleared.');
});

setApiBase(apiBase);
setWindow('guest');
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

  if (!apiBase) {
    setWindow('setup');
  }
})();
