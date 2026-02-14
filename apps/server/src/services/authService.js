import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { issueAuthToken } from '../lib/auth.js';

const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 10);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizePassword(value) {
  return String(value || '').trim();
}

function isUniqueConstraintError(error, fieldName) {
  if (!error || error.code !== 'P2002') return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  return target.includes(fieldName);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt
  };
}

export async function registerUser(emailInput, passwordInput) {
  const email = normalizeEmail(emailInput);
  const password = sanitizePassword(passwordInput);

  if (!EMAIL_PATTERN.test(email)) return { error: 'invalid_email' };
  if (password.length < PASSWORD_MIN_LENGTH) return { error: 'weak_password' };

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash
      }
    });

    const token = issueAuthToken(user);

    return {
      token,
      user: publicUser(user)
    };
  } catch (error) {
    if (isUniqueConstraintError(error, 'email')) {
      return { error: 'email_taken' };
    }
    throw error;
  }
}

export async function loginUser(emailInput, passwordInput) {
  const email = normalizeEmail(emailInput);
  const password = sanitizePassword(passwordInput);

  if (!EMAIL_PATTERN.test(email)) return { error: 'invalid_credentials' };
  if (!password) return { error: 'invalid_credentials' };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: 'invalid_credentials' };

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: 'invalid_credentials' };

  const token = issueAuthToken(user);

  return {
    token,
    user: publicUser(user)
  };
}

export async function getUserById(userId) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(userId) } });
  if (!user) return null;
  return publicUser(user);
}
