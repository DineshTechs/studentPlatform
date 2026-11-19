import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env loader (no dependency). Real environment variables take precedence.
export function loadEnvFile(path = resolve(process.cwd(), '.env')) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function readConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  return {
    isProd,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dbDriver: env.DB_DRIVER || 'mongodb',
    mongoUri: env.MONGODB_URI,
    mongoDbName: env.MONGODB_DB || 'exam_prep',
    sessionTtlHours: Number(env.SESSION_TTL_HOURS || 24 * 7),
    secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : isProd,
    trustProxy: env.TRUST_PROXY === 'true',
    // Grace window for answer saves that were in flight at the moment time ran out.
    saveGraceMs: Number(env.SAVE_GRACE_MS || 3000),
    // A submission that holds the lock for longer than this is considered crashed and is retried.
    submitLockStaleMs: Number(env.SUBMIT_LOCK_STALE_MS || 30_000),
    sweepIntervalMs: Number(env.SWEEP_INTERVAL_MS || 30_000),
    timezone: env.APP_TIMEZONE || 'Asia/Kolkata',
    allowSelfRegistration: env.ALLOW_REGISTRATION !== 'false',
    // Shows one-click demo logins on the login page. Never enable on a live site.
    showDemoAccounts: env.SHOW_DEMO_ACCOUNTS === 'true' || env.DB_DRIVER === 'memory',
  };
}
