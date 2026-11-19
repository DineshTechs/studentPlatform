import {
  hashPassword, verifyPassword, burnPasswordCheck, passwordProblems, createSession, destroySession, SESSION_COOKIE,
} from '../lib/auth.js';
import { serializeCookie, unauthorized, unprocessable, forbidden, conflict } from '../lib/http.js';
import { assertValid, str, arr, obj } from '../lib/validate.js';
import { newId } from '../lib/ids.js';
import { permissionsFor } from '../lib/rbac.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u._id, email: u.email, name: u.name, role: u.role, status: u.status,
    targetExamIds: u.targetExamIds || [], activeExamId: u.activeExamId || null,
    preferences: u.preferences || {}, createdAt: u.createdAt, permissions: permissionsFor(u.role),
  };
}

export default function register(router, { db, config }) {
  const setCookie = (ctx, token, maxAgeSec) => {
    ctx.responseHeaders = { 'Set-Cookie': serializeCookie(SESSION_COOKIE, token, { maxAgeSec, secure: config.secureCookies }) };
  };

  router.post('/api/auth/register', { auth: false, limit: 'auth', status: 201 }, async (ctx) => {
    if (!config.allowSelfRegistration) throw forbidden('Registration is closed.');
    const b = assertValid(ctx.body, obj({
      name: str({ required: true, min: 2, max: 80 }),
      email: str({ required: true, max: 120, pattern: EMAIL, patternMessage: 'must be a valid email address' }),
      password: str({ required: true }),
    }));
    const problems = passwordProblems(b.password);
    if (problems.length) throw unprocessable('Password is too weak.', [{ field: 'password', message: `needs ${problems.join(', ')}` }]);
    const email = b.email.trim().toLowerCase();
    if (await db.collection('users').findOne({ email })) throw conflict('An account with this email already exists.');
    const user = {
      _id: newId('usr'), email, name: b.name.trim(), role: 'student', status: 'active',
      passwordHash: await hashPassword(b.password), targetExamIds: [], activeExamId: null,
      preferences: { language: 'en' }, createdAt: ctx.now,
    };
    try {
      await db.collection('users').insertOne(user);
    } catch (e) {
      if (e.code === 11000) throw conflict('An account with this email already exists.');
      throw e;
    }
    const token = await createSession(db, user._id, { ttlHours: config.sessionTtlHours, now: ctx.now, ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    setCookie(ctx, token, config.sessionTtlHours * 3600);
    return { user: publicUser(user) };
  });

  router.post('/api/auth/login', { auth: false, limit: 'auth' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ email: str({ required: true, max: 120 }), password: str({ required: true, max: 128 }) }));
    const user = await db.collection('users').findOne({ email: b.email.trim().toLowerCase() });
    if (!user) { await burnPasswordCheck(b.password); throw unauthorized('Incorrect email or password.'); }
    if (!(await verifyPassword(b.password, user.passwordHash))) throw unauthorized('Incorrect email or password.');
    if (user.status !== 'active') throw forbidden('This account is suspended. Contact support.');
    const token = await createSession(db, user._id, { ttlHours: config.sessionTtlHours, now: ctx.now, ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    await db.collection('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: ctx.now } });
    setCookie(ctx, token, config.sessionTtlHours * 3600);
    return { user: publicUser(user) };
  });

  router.post('/api/auth/logout', { auth: false }, async (ctx) => {
    await destroySession(db, ctx.sessionToken);
    setCookie(ctx, '', 0);
    return { ok: true };
  });

  router.get('/api/me', {}, async (ctx) => ({ user: publicUser(ctx.user) }));

  router.patch('/api/me', { perm: 'profile.self' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({
      name: str({ min: 2, max: 80 }),
      targetExamIds: arr(str({ max: 40 }), { max: 10 }),
      activeExamId: str({ max: 40 }),
      preferences: obj({ language: str({ enum: ['en', 'hi'] }) }),
    }));
    const $set = {};
    if (b.name) $set.name = b.name.trim();
    if (b.preferences?.language) $set['preferences.language'] = b.preferences.language;
    let targets = ctx.user.targetExamIds || [];
    if (b.targetExamIds) {
      const unique = [...new Set(b.targetExamIds)];
      const found = await db.collection('exams').countDocuments({ _id: { $in: unique }, isActive: true });
      if (found !== unique.length) throw unprocessable('One or more selected examinations do not exist.');
      $set.targetExamIds = targets = unique;
      if (!unique.includes(ctx.user.activeExamId)) $set.activeExamId = unique[0] || null;
    }
    if (b.activeExamId) {
      if (!targets.includes(b.activeExamId)) throw unprocessable('Add the examination to your targets before switching to it.');
      $set.activeExamId = b.activeExamId;
    }
    const user = await db.collection('users').findOneAndUpdate({ _id: ctx.user._id }, { $set }, { returnDocument: 'after', projection: { passwordHash: 0 } });
    return { user: publicUser(user) };
  });

  router.post('/api/me/password', { perm: 'profile.self', limit: 'auth' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ currentPassword: str({ required: true }), newPassword: str({ required: true }) }));
    const full = await db.collection('users').findOne({ _id: ctx.user._id });
    if (!(await verifyPassword(b.currentPassword, full.passwordHash))) throw unauthorized('Current password is incorrect.');
    const problems = passwordProblems(b.newPassword);
    if (problems.length) throw unprocessable('Password is too weak.', [{ field: 'newPassword', message: `needs ${problems.join(', ')}` }]);
    await db.collection('users').updateOne({ _id: ctx.user._id }, { $set: { passwordHash: await hashPassword(b.newPassword) } });
    // Sign out every other device.
    await db.collection('sessions').deleteMany({ userId: ctx.user._id, _id: { $ne: ctx.session._id } });
    return { ok: true };
  });
}
