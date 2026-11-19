// In-process token-bucket rate limiter. For multiple server instances, back this with a
// shared store (e.g. Redis); the interface stays the same.
export function createRateLimiter() {
  const buckets = new Map();
  let lastSweep = Date.now();

  return {
    // returns { ok, retryAfterSec }
    take(key, { capacity, refillPerSec }) {
      const nowMs = Date.now();
      if (nowMs - lastSweep > 60_000) {
        for (const [k, b] of buckets) if (nowMs - b.updated > 600_000) buckets.delete(k);
        lastSweep = nowMs;
      }
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, updated: nowMs }; buckets.set(key, b); }
      b.tokens = Math.min(capacity, b.tokens + ((nowMs - b.updated) / 1000) * refillPerSec);
      b.updated = nowMs;
      if (b.tokens < 1) return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / refillPerSec) };
      b.tokens -= 1;
      return { ok: true };
    },
  };
}

export const LIMITS = {
  auth: { capacity: 10, refillPerSec: 10 / 60 },        // 10 login/register attempts per minute per IP
  autosave: { capacity: 60, refillPerSec: 3 },          // bursts while a student clicks quickly
  write: { capacity: 60, refillPerSec: 1 },
  read: { capacity: 300, refillPerSec: 10 },
};
