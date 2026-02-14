function trimApiBase(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function detectDefaultApiBase() {
  const { protocol, hostname, port, origin } = window.location;
  if (hostname === 'localhost' && port === '5173') {
    return 'http://localhost:4000';
  }
  if (hostname === '127.0.0.1' && port === '5173') {
    return 'http://localhost:4000';
  }
  if (protocol.startsWith('http')) {
    return origin;
  }
  return 'http://localhost:4000';
}

const API_BASE =
  trimApiBase(window.localStorage.getItem('pulse_api_base')) ||
  trimApiBase(window.PULSE_CONFIG?.apiBase) ||
  detectDefaultApiBase();
const PARTY_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const ALLOWED_SERVICES = new Set(['Apple Music', 'Spotify', 'YouTube']);
const AUTH_TOKEN_KEY = 'pulse_auth_token';

const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authResult = document.getElementById('authResult');
const authIdentity = document.getElementById('authIdentity');

const createPartyBtn = document.getElementById('createPartyBtn');
const createResult = document.getElementById('createResult');
const partyCodeOut = document.getElementById('partyCodeOut');
const djKeyOut = document.getElementById('djKeyOut');
const djSecrets = document.getElementById('djSecrets');

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

let activePartyCode = null;
let authToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
let authUser = null;

function normalizePartyCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
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
  createPartyBtn.disabled = !isSignedIn;

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
  }
}

async function apiRequest(path, options = {}) {
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

    const res = await fetch(`${API_BASE}${path}`, {
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

async function refreshAuthIdentity() {
  if (!authToken) {
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
  const email = String(authEmailInput.value || '').trim();
  const password = String(authPasswordInput.value || '').trim();

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

function renderAppleSearchResults(items) {
  appleSearchResults.textContent = '';

  if (!items.length) {
    setStatus(appleSearchStatus, 'No results found. Try a different search term.', 'info');
    return;
  }

  setStatus(appleSearchStatus, `Found ${items.length} result(s). Pick one to autofill.`, 'success');

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

    const chooseButton = document.createElement('button');
    chooseButton.type = 'button';
    chooseButton.className = 'btn btn-primary';
    chooseButton.textContent = 'Use Song';
    chooseButton.addEventListener('click', () => fillRequestFieldsFromSearchResult(item));

    meta.append(title, sub);
    card.append(image, meta, chooseButton);
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

partyCodeInput.addEventListener('input', () => {
  partyCodeInput.value = normalizePartyCode(partyCodeInput.value);
});

registerBtn.addEventListener('click', () => {
  submitAuth('register');
});

loginBtn.addEventListener('click', () => {
  submitAuth('login');
});

logoutBtn.addEventListener('click', () => {
  authUser = null;
  setAuthToken('');
  setAuthUi();
});

createPartyBtn.addEventListener('click', async () => {
  setButtonLoading(createPartyBtn, true, 'Creating...', 'Create Party');
  setStatus(createResult, 'Generating secure party credentials...', 'info');

  try {
    const data = await apiRequest('/api/parties', { method: 'POST', auth: true });
    partyCodeOut.textContent = data.code;
    djKeyOut.textContent = data.djKey;
    djSecrets.classList.remove('hidden');

    setStatus(
      createResult,
      `Party ${data.code} created. Save the DJ key now and use it only in the DJ app.`,
      'success'
    );
  } catch (error) {
    if (error.status === 401) {
      authUser = null;
      setAuthToken('');
      setAuthUi();
    }
    setStatus(createResult, error.message || 'Failed to create party.', 'error');
  } finally {
    createPartyBtn.textContent = 'Create Party';
    createPartyBtn.disabled = !(authUser && authToken);
  }
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const code = normalizePartyCode(partyCodeInput.value);
  if (!PARTY_CODE_PATTERN.test(code)) {
    setStatus(joinResult, 'Party code must be exactly 6 letters/numbers.', 'error');
    requestSection.classList.add('hidden');
    activePartyCode = null;
    return;
  }

  setStatus(joinResult, `Checking party ${code}...`, 'info');

  try {
    const data = await apiRequest(`/api/parties/${code}/join`, { method: 'POST' });

    if (!data.djActive) {
      activePartyCode = null;
      requestSection.classList.add('hidden');
      setStatus(joinResult, 'Party found, but DJ is not active yet. Ask DJ to open the DJ app.', 'info');
      return;
    }

    activePartyCode = code;
    requestSection.classList.remove('hidden');
    setStatus(joinResult, `Connected to party ${code}. You can send requests now.`, 'success');
  } catch (error) {
    activePartyCode = null;
    requestSection.classList.add('hidden');
    setStatus(joinResult, error.message || 'Unable to join party.', 'error');
  }
});

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!activePartyCode) {
    setStatus(requestResult, 'Join a live party first.', 'error');
    return;
  }

  const service = readSelectedService();
  const title = String(document.getElementById('title').value || '').trim();
  const artist = String(document.getElementById('artist').value || '').trim();
  const appleMusicUrl = String(document.getElementById('appleMusicUrl').value || '').trim();

  if (!ALLOWED_SERVICES.has(service)) {
    setStatus(requestResult, 'Choose a valid music service.', 'error');
    return;
  }

  if (!title || title.length > 120) {
    setStatus(requestResult, 'Song title is required (max 120 chars).', 'error');
    return;
  }

  if (!artist || artist.length > 120) {
    setStatus(requestResult, 'Artist is required (max 120 chars).', 'error');
    return;
  }

  if (!isValidSongUrl(appleMusicUrl, service)) {
    setStatus(requestResult, 'Song URL must be a valid HTTPS link.', 'error');
    return;
  }

  const submitButton = requestForm.querySelector('button[type="submit"]');
  setButtonLoading(submitButton, true, 'Submitting...', 'Submit Request');
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
    requestForm.reset();
    toggleAppleSearchVisibility();
  } catch (error) {
    setStatus(requestResult, error.message || 'Request failed.', 'error');
  } finally {
    setButtonLoading(submitButton, false, 'Submitting...', 'Submit Request');
  }
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

refreshAuthIdentity();
toggleAppleSearchVisibility();
