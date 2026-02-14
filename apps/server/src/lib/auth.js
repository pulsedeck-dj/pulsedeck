import jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function issueAuthToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'access'
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyAuthToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!payload || typeof payload !== 'object') return null;
    if (!payload.sub || !payload.email || payload.type !== 'access') return null;

    return {
      userId: String(payload.sub),
      email: String(payload.email)
    };
  } catch {
    return null;
  }
}
