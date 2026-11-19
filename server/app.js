import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  Router, HttpError, readJson, sendJson, parseCookies, serveStatic, unauthorized, forbidden,
} from './lib/http.js';
import { resolveSession, SESSION_COOKIE } from './lib/auth.js';
import { can } from './lib/rbac.js';
import { createRateLimiter, LIMITS } from './lib/ratelimit.js';

import registerAuth from './modules/auth.js';
import registerExams from './modules/exams.js';
import registerSyllabus from './modules/syllabus.js';
import registerQuestions from './modules/questions.js';
import registerTests from './modules/tests.js';
import registerAttempts from './modules/attempts.js';
import registerPractice from './modules/practice.js';
import registerDashboard from './modules/dashboard.js';
import registerAdmin from './modules/admin.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const systemClock = { now: () => new Date() };

export function createApp({ db, config, clock = systemClock, logger = console }) {
  const router = new Router();
  const limiter = createRateLimiter();
  const deps = { db, config, clock };

  for (const register of [registerAuth, registerExams, registerSyllabus, registerQuestions, registerTests,
    registerAttempts, registerPractice, registerDashboard, registerAdmin]) {
    register(router, deps);
  }

  router.get('/api/health', { auth: false }, async () => ({ ok: true, db: db.kind, time: clock.now(), demo: config.showDemoAccounts === true }));

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const ip = (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
      if (!serveStatic(PUBLIC_DIR, req, res, pathname)) sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
      return;
    }

    const started = Date.now();
    const ctx = { req, res, db, config, clock, ip, query: url.searchParams, now: clock.now(), user: null, session: null };
    try {
      const found = router.match(req.method, pathname);
      if (!found) throw new HttpError(404, 'NOT_FOUND', 'No such API endpoint.');
      if (found.methodNotAllowed) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      const { route, params } = found;
      ctx.params = params;

      // CSRF: state-changing requests must carry a custom header, which cross-site forms
      // cannot set, on top of SameSite=Lax session cookies.
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') {
        throw new HttpError(403, 'CSRF', 'Missing X-Requested-With header.');
      }

      const limitName = route.opts.limit || (req.method === 'GET' ? 'read' : 'write');
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const resolved = token ? await resolveSession(db, token, ctx.now) : null;
      if (resolved) { ctx.user = resolved.user; ctx.session = resolved.session; ctx.sessionToken = token; }

      const rl = limiter.take(`${limitName}:${ctx.user?._id || ip}`, LIMITS[limitName]);
      if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');
      }

      if (route.opts.auth !== false && !ctx.user) throw unauthorized();
      if (route.opts.perm) {
        const perms = Array.isArray(route.opts.perm) ? route.opts.perm : [route.opts.perm];
        if (!perms.some((p) => can(ctx.user, p))) throw forbidden();
      }

      ctx.body = await readJson(req);
      const result = await route.handler(ctx);
      if (res.writableEnded) return;
      sendJson(res, route.opts.status || 200, { data: result ?? null }, ctx.responseHeaders);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: { code: err.code, message: err.message, details: err.details } });
      } else if (err?.code === 11000) {
        sendJson(res, 409, { error: { code: 'DUPLICATE', message: 'A record with the same unique value already exists.' } });
      } else {
        logger.error(`[${req.method} ${pathname}]`, err);
        sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
      }
    } finally {
      if (process.env.LOG_REQUESTS === 'true') logger.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}
