import crypto from 'node:crypto';

const API_BASE = String(process.env.SMOKE_API_BASE || 'http://127.0.0.1:4000').replace(/\/+$/, '');
const PASSWORD = 'SmokeTestPass1234!';

function makeEmail() {
  return `smoke-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.com`;
}

function makeAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function request(path, options = {}) {
  const { signal, clear } = makeAbortSignal(options.timeoutMs || 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${path}: ${JSON.stringify(data)}`);
    }
    return data;
  } finally {
    clear();
  }
}

async function main() {
  const email = makeEmail();

  const register = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email, password: PASSWORD }
  });

  if (!register?.token) throw new Error('Register failed: missing token');

  const create = await request('/api/parties', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${register.token}`
    }
  });

  const code = String(create?.code || '');
  const djKey = String(create?.djKey || '');
  if (!code || !djKey) throw new Error('Create party failed: missing code/djKey');

  const claim = await request(`/api/parties/${code}/claim-dj`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { djKey, deviceName: 'Smoke Runner' }
  });

  if (!claim?.sessionId || !claim?.token) throw new Error('Claim DJ failed');

  await request(`/api/parties/${code}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DJ-Token': claim.token
    },
    body: { sessionId: claim.sessionId }
  });

  const join = await request(`/api/parties/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!join?.djActive) throw new Error('Join party failed: DJ should be active');

  const requestIdempotency = crypto.randomUUID();
  const submit = await request(`/api/parties/${code}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': requestIdempotency
    },
    body: {
      service: 'Apple Music',
      title: 'Smoke Song',
      artist: 'Smoke Artist',
      appleMusicUrl: 'https://music.apple.com/us/song/example/123456789'
    }
  });

  if (!submit?.id || !submit?.seqNo) throw new Error('Submit request failed');

  const list = await request(`/api/parties/${code}/requests`, {
    method: 'GET',
    headers: {
      'X-DJ-Session-ID': claim.sessionId,
      'X-DJ-Token': claim.token
    }
  });

  if (!Array.isArray(list) || !list.length) throw new Error('Request list is empty');
  if (!list.find((entry) => entry.id === submit.id)) throw new Error('Submitted request not found in DJ list');

  const played = await request(`/api/parties/${code}/requests/${submit.id}/played`, {
    method: 'POST',
    headers: {
      'X-DJ-Session-ID': claim.sessionId,
      'X-DJ-Token': claim.token
    }
  });

  if (played?.status !== 'played') throw new Error('Mark played failed');

  const queued = await request(`/api/parties/${code}/requests/${submit.id}/queued`, {
    method: 'POST',
    headers: {
      'X-DJ-Session-ID': claim.sessionId,
      'X-DJ-Token': claim.token
    }
  });

  if (queued?.status !== 'queued') throw new Error('Mark queued failed');

  console.log(`Smoke test passed for party ${code}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
