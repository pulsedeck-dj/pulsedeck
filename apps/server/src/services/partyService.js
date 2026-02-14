import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const DJ_KEY_LENGTH = 10;
const PARTY_TTL_MS = Number(process.env.PARTY_TTL_MS || 12 * 60 * 60 * 1000);
const DJ_HEARTBEAT_TIMEOUT_MS = Number(process.env.DJ_HEARTBEAT_TIMEOUT_MS || 30 * 1000);
const MAX_REQUESTS_PER_PARTY = Number(process.env.MAX_REQUESTS_PER_PARTY || 500);
const ALLOWED_SERVICES = new Set(['Apple Music', 'Spotify', 'YouTube']);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomFromAlphabet(length) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, CODE_ALPHABET.length);
    result += CODE_ALPHABET[idx];
  }
  return result;
}

function randomPartyCode() {
  return randomFromAlphabet(CODE_LENGTH);
}

function randomDjKey() {
  return randomFromAlphabet(DJ_KEY_LENGTH);
}

function randomDjToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sanitizeText(input, maxLength) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizePartyCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

function isExpired(party) {
  return Date.now() > new Date(party.expiresAt).getTime();
}

function isSessionFresh(session) {
  return Date.now() - new Date(session.heartbeatAt).getTime() <= DJ_HEARTBEAT_TIMEOUT_MS;
}

function toPublicParty(party) {
  return {
    code: party.code,
    status: party.status,
    createdAt: party.createdAt,
    expiresAt: party.expiresAt,
    activeDjSessionId: party.activeDjSessionId
  };
}

function toRequestView(request, partyCode) {
  return {
    id: request.id,
    seqNo: request.seqNo,
    partyCode,
    title: request.title,
    artist: request.artist,
    service: request.service,
    appleMusicUrl: request.appleMusicUrl || '',
    status: request.status || 'queued',
    playedAt: request.playedAt || null,
    playedBy: request.playedBy || '',
    createdAt: request.createdAt
  };
}

function validateSongUrl(value, service) {
  const urlText = sanitizeText(value, 500);
  if (!urlText) return '';

  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;

  if (service === 'Apple Music' && !parsed.hostname.endsWith('music.apple.com')) {
    return null;
  }

  return parsed.toString().slice(0, 500);
}

function isUniqueConstraintError(error, fieldName) {
  if (!error || error.code !== 'P2002') return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  return target.includes(fieldName);
}

function isRetryableWriteError(error) {
  if (!error) return false;
  if (error.code === 'P2034') return true;
  if (error.code === 'P2002') return true;
  return false;
}

function validateDjCredentials(party, sessionIdInput, tokenInput, options = {}) {
  const sessionId = sanitizeText(sessionIdInput, 128);
  const token = sanitizeText(tokenInput, 256);

  if (!party) return { error: 'party_not_found' };
  if (isExpired(party)) return { error: 'party_expired' };
  if (!sessionId || !token) return { error: 'missing_auth' };

  const session = party.activeDjSession;
  if (!party.activeDjSessionId || !session || party.activeDjSessionId !== sessionId) {
    return { error: 'invalid_session' };
  }

  if (!session.active) return { error: 'invalid_session' };
  if (session.tokenHash !== sha256(token)) return { error: 'invalid_token' };

  if (!options.allowStaleHeartbeat && !isSessionFresh(session)) {
    return { error: 'session_stale' };
  }

  return { party, session };
}

export async function createPartyForUser(ownerIdInput) {
  const ownerId = sanitizeText(ownerIdInput, 64);
  if (!ownerId) return { error: 'invalid_owner' };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomPartyCode();
    const djKey = randomDjKey();

    try {
      const party = await prisma.party.create({
        data: {
          code,
          status: 'live',
          expiresAt: new Date(Date.now() + PARTY_TTL_MS),
          djKeyHash: sha256(djKey),
          ownerId
        }
      });

      return {
        party: toPublicParty(party),
        djKey
      };
    } catch (error) {
      if (isUniqueConstraintError(error, 'code')) {
        continue;
      }
      throw error;
    }
  }

  return { error: 'could_not_create_party' };
}

export async function claimDjSession(codeInput, djKeyInput, deviceNameInput) {
  const code = normalizePartyCode(codeInput);
  const djKey = sanitizeText(djKeyInput, 80);
  const deviceName = sanitizeText(deviceNameInput || 'DJ Macbook', 80) || 'DJ Macbook';

  if (!code) return { error: 'invalid_party_code' };
  if (!djKey) return { error: 'invalid_dj_key' };

  const party = await prisma.party.findUnique({
    where: { code },
    include: {
      activeDjSession: true
    }
  });

  if (!party) return { error: 'party_not_found' };
  if (isExpired(party)) return { error: 'party_expired' };
  if (party.djKeyHash !== sha256(djKey)) return { error: 'invalid_dj_key' };

  const token = randomDjToken();

  const session = await prisma.$transaction(async (tx) => {
    await tx.djSession.updateMany({
      where: { partyId: party.id, active: true },
      data: { active: false }
    });

    const created = await tx.djSession.create({
      data: {
        partyId: party.id,
        tokenHash: sha256(token),
        deviceName,
        active: true,
        heartbeatAt: new Date()
      }
    });

    await tx.party.update({
      where: { id: party.id },
      data: { activeDjSessionId: created.id }
    });

    return created;
  });

  return {
    sessionId: session.id,
    token,
    partyCode: party.code,
    expiresAt: party.expiresAt
  };
}

export async function heartbeatSession(codeInput, sessionIdInput, tokenInput) {
  const code = normalizePartyCode(codeInput);
  if (!code) return { error: 'invalid_party_code' };

  const party = await prisma.party.findUnique({
    where: { code },
    include: { activeDjSession: true }
  });

  const auth = validateDjCredentials(party, sessionIdInput, tokenInput, { allowStaleHeartbeat: true });
  if (auth.error) return auth;

  const updated = await prisma.djSession.update({
    where: { id: auth.session.id },
    data: {
      active: true,
      heartbeatAt: new Date()
    }
  });

  return {
    sessionId: updated.id,
    heartbeatAt: updated.heartbeatAt
  };
}

export async function getPartyState(codeInput) {
  const code = normalizePartyCode(codeInput);
  if (!code) return { error: 'invalid_party_code' };

  const party = await prisma.party.findUnique({
    where: { code },
    include: { activeDjSession: true }
  });

  if (!party) return { error: 'party_not_found' };

  if (isExpired(party)) {
    return {
      state: 'expired',
      party: toPublicParty(party),
      djActive: false
    };
  }

  const session = party.activeDjSession;
  const djActive = Boolean(session && session.active && isSessionFresh(session));

  return {
    state: 'ok',
    party: toPublicParty(party),
    djActive
  };
}

export async function addSongRequest(codeInput, payloadInput, idempotencyKeyInput) {
  const code = normalizePartyCode(codeInput);
  if (!code) return { error: 'invalid_party_code' };

  const title = sanitizeText(payloadInput?.title, 120);
  const artist = sanitizeText(payloadInput?.artist, 120);
  const service = sanitizeText(payloadInput?.service, 30);
  const idempotencyKey = sanitizeText(idempotencyKeyInput, 80);

  if (!title || !artist || !service) return { error: 'invalid_payload' };
  if (!ALLOWED_SERVICES.has(service)) return { error: 'invalid_service' };

  const appleMusicUrl = validateSongUrl(payloadInput?.appleMusicUrl, service);
  if (appleMusicUrl === null) return { error: 'invalid_song_url' };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const party = await tx.party.findUnique({
            where: { code },
            include: { activeDjSession: true }
          });

          if (!party) return { error: 'party_not_found' };
          if (isExpired(party)) return { error: 'party_expired' };

          const session = party.activeDjSession;
          if (!session || !session.active || !isSessionFresh(session)) {
            return { error: 'dj_not_active' };
          }

          const requestCount = await tx.songRequest.count({ where: { partyId: party.id } });
          if (requestCount >= MAX_REQUESTS_PER_PARTY) {
            return { error: 'party_request_limit_reached' };
          }

          if (idempotencyKey) {
            const existing = await tx.idempotencyKey.findUnique({
              where: {
                partyId_key: {
                  partyId: party.id,
                  key: idempotencyKey
                }
              },
              include: {
                request: true
              }
            });

            if (existing?.request) {
              return {
                request: toRequestView(existing.request, party.code),
                duplicate: true
              };
            }
          }

          const lastRequest = await tx.songRequest.findFirst({
            where: { partyId: party.id },
            orderBy: { seqNo: 'desc' },
            select: { seqNo: true }
          });

          const request = await tx.songRequest.create({
            data: {
              partyId: party.id,
              seqNo: (lastRequest?.seqNo || 0) + 1,
              title,
              artist,
              service,
              appleMusicUrl
            }
          });

          if (idempotencyKey) {
            await tx.idempotencyKey.create({
              data: {
                partyId: party.id,
                key: idempotencyKey,
                requestId: request.id
              }
            });
          }

          return {
            request: toRequestView(request, party.code),
            duplicate: false
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );

      return result;
    } catch (error) {
      if (attempt < 2 && isRetryableWriteError(error)) {
        continue;
      }
      throw error;
    }
  }

  return { error: 'request_retry_exhausted' };
}

export async function getRequestsForDj(codeInput, sessionIdInput, tokenInput) {
  const code = normalizePartyCode(codeInput);
  if (!code) return { error: 'invalid_party_code' };

  const party = await prisma.party.findUnique({
    where: { code },
    include: { activeDjSession: true }
  });

  const auth = validateDjCredentials(party, sessionIdInput, tokenInput, { allowStaleHeartbeat: true });
  if (auth.error) return auth;

  const requests = await prisma.songRequest.findMany({
    where: { partyId: party.id },
    orderBy: { seqNo: 'asc' }
  });

  return {
    requests: requests.map((entry) => toRequestView(entry, party.code))
  };
}

export async function validateDjSocketRegistration(codeInput, sessionIdInput, tokenInput) {
  const code = normalizePartyCode(codeInput);
  if (!code) return null;

  const party = await prisma.party.findUnique({
    where: { code },
    include: { activeDjSession: true }
  });

  const auth = validateDjCredentials(party, sessionIdInput, tokenInput, { allowStaleHeartbeat: true });
  if (auth.error) return null;

  return {
    id: auth.session.id,
    partyCode: party.code,
    deviceName: auth.session.deviceName
  };
}

function normalizeRequestId(value) {
  return sanitizeText(value, 128);
}

export async function markRequestPlayed(codeInput, requestIdInput, sessionIdInput, tokenInput) {
  const code = normalizePartyCode(codeInput);
  const requestId = normalizeRequestId(requestIdInput);
  if (!code) return { error: 'invalid_party_code' };
  if (!requestId) return { error: 'invalid_request_id' };

  const party = await prisma.party.findUnique({
    where: { code },
    include: { activeDjSession: true }
  });

  const auth = validateDjCredentials(party, sessionIdInput, tokenInput);
  if (auth.error) return auth;

  const existing = await prisma.songRequest.findFirst({
    where: { id: requestId, partyId: party.id }
  });
  if (!existing) return { error: 'request_not_found' };

  if (existing.status === 'played') {
    return { request: toRequestView(existing, party.code), unchanged: true };
  }

  const updated = await prisma.songRequest.update({
    where: { id: existing.id },
    data: {
      status: 'played',
      playedAt: new Date(),
      playedBy: auth.session.deviceName
    }
  });

  return { request: toRequestView(updated, party.code), unchanged: false };
}

export async function markRequestQueued(codeInput, requestIdInput, sessionIdInput, tokenInput) {
  const code = normalizePartyCode(codeInput);
  const requestId = normalizeRequestId(requestIdInput);
  if (!code) return { error: 'invalid_party_code' };
  if (!requestId) return { error: 'invalid_request_id' };

  const party = await prisma.party.findUnique({
    where: { code },
    include: { activeDjSession: true }
  });

  const auth = validateDjCredentials(party, sessionIdInput, tokenInput);
  if (auth.error) return auth;

  const existing = await prisma.songRequest.findFirst({
    where: { id: requestId, partyId: party.id }
  });
  if (!existing) return { error: 'request_not_found' };

  if (existing.status === 'queued') {
    return { request: toRequestView(existing, party.code), unchanged: true };
  }

  const updated = await prisma.songRequest.update({
    where: { id: existing.id },
    data: {
      status: 'queued',
      playedAt: null,
      playedBy: null
    }
  });

  return { request: toRequestView(updated, party.code), unchanged: false };
}
