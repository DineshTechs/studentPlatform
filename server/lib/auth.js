import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { sha256 } from './ids.js';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, N, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, expected);
}

// A precomputed hash so login timing does not reveal whether an email exists.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
}

export function passwordProblems(pw) {
  const problems = [];
  if (typeof pw !== 'string' || pw.length < 8) problems.push('at least 8 characters');
  if (typeof pw === 'string' && pw.length > 128) problems.push('at most 128 characters');
  if (!/[A-Za-z]/.test(pw || '') || !/\d/.test(pw || '')) problems.push('both letters and numbers');
  return problems;
}

export const SESSION_COOKIE = 'sid';

export async function createSession(db, userId, { ttlHours, now, ip, userAgent }) {
  const token = randomBytes(32).toString('base64url');
  await db.collection('sessions').insertOne({
    _id: sha256(token), // only the hash is stored; a DB leak does not leak live sessions
    userId,
    createdAt: now,
    expiresAt: new Date(now.valueOf() + ttlHours * 3600_000),
    ip,
    userAgent: (userAgent || '').slice(0, 200),
  });
  return token;
}

export async function resolveSession(db, token, now) {
  if (!token || token.length > 100) return null;
  const session = await db.collection('sessions').findOne({ _id: sha256(token) });
  if (!session || session.expiresAt <= now) return null;
  const user = await db.collection('users').findOne({ _id: session.userId }, { projection: { passwordHash: 0 } });
  if (!user || user.status !== 'active') return null;
  return { session, user };
}

export async function destroySession(db, token) {
  if (token) await db.collection('sessions').deleteOne({ _id: sha256(token) });
}
