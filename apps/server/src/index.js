import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { verifyAuthToken } from './lib/auth.js';
import {
  addSongRequest,
  claimDjSession,
  createPartyForUser,
  getPartyState,
  getRequestsForDj,
  heartbeatSession,
  markRequestPlayed,
  markRequestQueued,
  normalizePartyCode,
  validateDjSocketRegistration
} from './services/partyService.js';
import { getUserById, loginUser, registerUser } from './services/authService.js';
import { searchAppleMusicSongs } from './services/appleMusicService.js';

const app = express();
const server = http.createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRootDir = path.resolve(__dirname, '../../web');
const webIndexPath = path.join(webRootDir, 'index.html');
const serveWeb = String(process.env.SERVE_WEB || 'true').toLowerCase() !== 'false';

function normalizeAllowedOrigin(entry) {
  let value = String(entry || '').trim();
  if (!value) return '';

  // Accept full URLs (including paths) and bare host:port entries.
  if (!/^https?:\/\//i.test(value)) {
    if (value.startsWith('localhost') || value.startsWith('127.0.0.1')) {
      value = `http://${value}`;
    } else {
      value = `https://${value}`;
    }
  }

  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function readAllowedOrigins() {
  const envValue = String(process.env.WEB_ORIGIN || '').trim();
  const rawList = envValue ? envValue.split(',') : ['http://localhost:5173'];
  const list = rawList.map(normalizeAllowedOrigin).filter(Boolean);
  return Array.from(new Set(list));
}

const allowedOrigins = readAllowedOrigins();

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const codePattern = /^[A-Z0-9]{6}$/;

if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
  app.set('trust proxy', 1);
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function readCode(req, res) {
  const code = normalizePartyCode(req.params.code);
  if (!codePattern.test(code)) {
    res.status(400).json({ error: 'Invalid party code format' });
    return null;
  }
  return code;
}

function mapAuthError(res, error) {
  switch (error) {
    case 'invalid_email':
      return res.status(400).json({ error: 'Enter a valid email address' });
    case 'weak_password':
      return res.status(400).json({ error: 'Password is too short' });
    case 'email_taken':
      return res.status(409).json({ error: 'Email already registered' });
    case 'invalid_credentials':
      return res.status(401).json({ error: 'Invalid credentials' });
    default:
      return res.status(400).json({ error: 'Authentication request failed' });
  }
}

function mapPartyError(res, error) {
  switch (error) {
    case 'invalid_owner':
      return res.status(400).json({ error: 'Invalid owner account' });
    case 'could_not_create_party':
      return res.status(500).json({ error: 'Could not create party' });
    case 'invalid_party_code':
      return res.status(400).json({ error: 'Invalid party code' });
    case 'party_not_found':
      return res.status(404).json({ error: 'Party not found' });
    case 'party_expired':
      return res.status(410).json({ error: 'Party has expired' });
    case 'invalid_dj_key':
      return res.status(401).json({ error: 'Invalid DJ key' });
    case 'missing_auth':
      return res.status(400).json({ error: 'Missing authentication values' });
    case 'invalid_session':
      return res.status(401).json({ error: 'Invalid DJ session' });
    case 'invalid_token':
      return res.status(401).json({ error: 'Invalid DJ token' });
    case 'session_stale':
      return res.status(409).json({ error: 'DJ session is stale. Reconnect DJ app.' });
    case 'dj_not_active':
      return res.status(409).json({ error: 'DJ is not active for this party' });
    case 'invalid_payload':
      return res.status(400).json({ error: 'Invalid request payload' });
    case 'invalid_service':
      return res.status(400).json({ error: 'Unsupported music service' });
    case 'invalid_song_url':
      return res.status(400).json({ error: 'Invalid song URL' });
    case 'invalid_request_id':
      return res.status(400).json({ error: 'Invalid request ID' });
    case 'request_not_found':
      return res.status(404).json({ error: 'Request not found' });
    case 'party_request_limit_reached':
      return res.status(429).json({ error: 'Party request limit reached' });
    case 'request_retry_exhausted':
      return res.status(503).json({ error: 'Please retry request submission' });
    default:
      return res.status(400).json({ error: 'Request rejected' });
  }
}

function mapAppleMusicError(res, error) {
  switch (error) {
    case 'search_term_too_short':
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    case 'apple_music_search_failed':
      return res.status(502).json({ error: 'Apple Music search is temporarily unavailable' });
    default:
      return res.status(400).json({ error: 'Apple Music search failed' });
  }
}

const baseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please wait.' }
});

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many party creations. Please wait.' }
});

const claimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many DJ claim attempts. Please wait.' }
});

const joinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 220,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many join attempts. Please wait.' }
});

const requestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 360,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many request submissions. Please wait.' }
});

const musicSearchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Apple Music searches. Slow down.' }
});

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.includes(origin));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Idempotency-Key',
      'X-DJ-Session-ID',
      'X-DJ-Token'
    ]
  })
);
app.use(express.json({ limit: '32kb' }));
app.use(baseLimiter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pulse-party-server' });
});

async function authRequired(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }

    const token = header.slice(7).trim();
    const decoded = verifyAuthToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const user = await getUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: 'Account no longer exists' });
      return;
    }

    req.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

app.post(
  '/api/auth/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body?.email, req.body?.password);
    if (result.error) {
      mapAuthError(res, result.error);
      return;
    }

    res.status(201).json(result);
  })
);

app.post(
  '/api/auth/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.body?.email, req.body?.password);
    if (result.error) {
      mapAuthError(res, result.error);
      return;
    }

    res.json(result);
  })
);

app.get(
  '/api/auth/me',
  authRequired,
  asyncHandler(async (req, res) => {
    res.json({ user: req.authUser });
  })
);

app.get(
  '/api/music/apple/search',
  musicSearchLimiter,
  asyncHandler(async (req, res) => {
    const result = await searchAppleMusicSongs(req.query.term, req.query.storefront, req.query.limit);
    if (result.error) {
      mapAppleMusicError(res, result.error);
      return;
    }

    res.json(result);
  })
);

app.post(
  '/api/parties',
  createLimiter,
  authRequired,
  asyncHandler(async (req, res) => {
    const result = await createPartyForUser(req.authUser.id);
    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    res.status(201).json({
      code: result.party.code,
      createdAt: result.party.createdAt,
      expiresAt: result.party.expiresAt,
      djKey: result.djKey
    });
  })
);

app.post(
  '/api/parties/:code/claim-dj',
  claimLimiter,
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const result = await claimDjSession(code, req.body?.djKey, req.body?.deviceName || 'DJ Macbook');
    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    res.json(result);
  })
);

app.post(
  '/api/parties/:code/heartbeat',
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const sessionId = String(req.body?.sessionId || '').trim();
    const token = String(req.headers['x-dj-token'] || '').trim();

    const result = await heartbeatSession(code, sessionId, token);
    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    res.json({ ok: true, heartbeatAt: result.heartbeatAt });
  })
);

app.post(
  '/api/parties/:code/join',
  joinLimiter,
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const state = await getPartyState(code);
    if (state.error) {
      mapPartyError(res, state.error);
      return;
    }

    if (state.state === 'expired') {
      res.status(410).json({ error: 'Party has expired', partyCode: code });
      return;
    }

    res.json({
      ok: true,
      partyCode: code,
      expiresAt: state.party.expiresAt,
      djActive: state.djActive
    });
  })
);

app.post(
  '/api/parties/:code/requests',
  requestLimiter,
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const idempotencyKey = String(req.headers['x-idempotency-key'] || '').trim();
    const result = await addSongRequest(code, req.body || {}, idempotencyKey);

    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    io.to(`party:${code}:dj`).emit('request:new', result.request);
    res.status(result.duplicate ? 200 : 201).json(result.request);
  })
);

app.get(
  '/api/parties/:code/requests',
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const sessionId = String(req.headers['x-dj-session-id'] || '').trim();
    const token = String(req.headers['x-dj-token'] || '').trim();

    const result = await getRequestsForDj(code, sessionId, token);
    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    res.json(result.requests);
  })
);

app.post(
  '/api/parties/:code/requests/:id/played',
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const requestId = String(req.params.id || '').trim();
    const sessionId = String(req.headers['x-dj-session-id'] || '').trim();
    const token = String(req.headers['x-dj-token'] || '').trim();

    const result = await markRequestPlayed(code, requestId, sessionId, token);
    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    io.to(`party:${code}:dj`).emit('request:update', result.request);
    res.json(result.request);
  })
);

app.post(
  '/api/parties/:code/requests/:id/queued',
  asyncHandler(async (req, res) => {
    const code = readCode(req, res);
    if (!code) return;

    const requestId = String(req.params.id || '').trim();
    const sessionId = String(req.headers['x-dj-session-id'] || '').trim();
    const token = String(req.headers['x-dj-token'] || '').trim();

    const result = await markRequestQueued(code, requestId, sessionId, token);
    if (result.error) {
      mapPartyError(res, result.error);
      return;
    }

    io.to(`party:${code}:dj`).emit('request:update', result.request);
    res.json(result.request);
  })
);

if (serveWeb && fs.existsSync(webIndexPath)) {
  app.use(express.static(webRootDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      next();
      return;
    }

    res.sendFile(webIndexPath);
  });
} else if (serveWeb) {
  console.warn(`Web assets not found at ${webRootDir}. API-only mode is running.`);
}

app.use((error, _req, res, _next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

io.on('connection', (socket) => {
  socket.on('register_dj', async ({ partyCode, sessionId, token }) => {
    try {
      const session = await validateDjSocketRegistration(partyCode, sessionId, token);
      if (!session) {
        socket.emit('register_error', { error: 'Invalid DJ credentials' });
        return;
      }

      socket.join(`party:${session.partyCode}:dj`);
      socket.emit('register_ok', { partyCode: session.partyCode, sessionId: session.id });
    } catch (error) {
      console.error('Socket registration error:', error);
      socket.emit('register_error', { error: 'Could not register DJ socket' });
    }
  });
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
});
