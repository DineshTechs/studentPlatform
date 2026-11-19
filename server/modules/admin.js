import { newId } from '../lib/ids.js';
import { notFound, unprocessable, forbidden } from '../lib/http.js';
import { assertValid, obj, str, arr, intParam, escapeRegex } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { ROLES } from '../lib/rbac.js';
import { hashPassword, passwordProblems } from '../lib/auth.js';
import { publicUser } from './auth.js';

export default function register(router, { db, clock }) {
  const users = db.collection('users');

  router.get('/api/admin/overview', { perm: 'analytics.view' }, async () => {
    const c = (n, f = {}) => db.collection(n).countDocuments(f);
    const [students, staff, questions, approved, inReview, published, attempts, submitted] = await Promise.all([
      c('users', { role: 'student' }), c('users', { role: { $ne: 'student' } }), c('questions'), c('questions', { status: 'approved' }),
      c('questions', { status: 'in_review' }), c('mock_tests', { status: 'published' }), c('attempts'), c('attempts', { status: 'submitted' }),
    ]);
    return { students, staff, questions, approved, inReview, publishedTests: published, attempts, submittedAttempts: submitted };
  });

  router.get('/api/admin/users', { perm: 'user.manage' }, async (ctx) => {
    const f = {};
    if (ctx.query.get('role')) f.role = ctx.query.get('role');
    if (ctx.query.get('q')) {
      const re = { $regex: escapeRegex(ctx.query.get('q').slice(0, 80)), $options: 'i' };
      f.$or = [{ email: re }, { name: re }];
    }
    const limit = intParam(ctx.query.get('limit'), 50, 1, 200);
    const page = intParam(ctx.query.get('page'), 1, 1, 10000);
    const [items, total] = await Promise.all([
      users.find(f, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      users.countDocuments(f),
    ]);
    return { items: items.map((u) => ({ ...publicUser(u), lastLoginAt: u.lastLoginAt ?? null })), total, page, limit };
  });

  router.post('/api/admin/users', { perm: 'user.manage', status: 201 }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ name: str({ required: true, min: 2, max: 80 }), email: str({ required: true, max: 120 }), role: str({ required: true, enum: ROLES }), password: str({ required: true }) }));
    const problems = passwordProblems(b.password);
    if (problems.length) throw unprocessable('Password is too weak.', [{ field: 'password', message: `needs ${problems.join(', ')}` }]);
    const doc = { _id: newId('usr'), email: b.email.trim().toLowerCase(), name: b.name.trim(), role: b.role, status: 'active', passwordHash: await hashPassword(b.password), targetExamIds: [], activeExamId: null, preferences: { language: 'en' }, createdAt: clock.now() };
    await users.insertOne(doc);
    await audit(ctx, 'user.create', 'user', doc._id, { role: doc.role });
    return publicUser(doc);
  });

  router.patch('/api/admin/users/:id', { perm: 'user.manage' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ role: str({ enum: ROLES }), status: str({ enum: ['active', 'suspended'] }) }));
    if (ctx.params.id === ctx.user._id && (b.role && b.role !== 'admin' || b.status === 'suspended')) throw forbidden('You cannot demote or suspend your own account.');
    const before = await users.findOne({ _id: ctx.params.id }, { projection: { role: 1, status: 1 } });
    if (!before) throw notFound('User');
    const u = await users.findOneAndUpdate({ _id: ctx.params.id }, { $set: { ...b, updatedAt: clock.now() } }, { returnDocument: 'after', projection: { passwordHash: 0 } });
    if (b.status === 'suspended' || (b.role && b.role !== before.role)) await db.collection('sessions').deleteMany({ userId: u._id });
    await audit(ctx, 'user.update', 'user', u._id, { from: { role: before.role, status: before.status }, to: b });
    return publicUser(u);
  });

  router.get('/api/admin/audit', { perm: 'audit.view' }, async (ctx) => {
    const f = {};
    for (const k of ['actorId', 'entity', 'entityId', 'action']) if (ctx.query.get(k)) f[k] = ctx.query.get(k);
    const limit = intParam(ctx.query.get('limit'), 50, 1, 200);
    const page = intParam(ctx.query.get('page'), 1, 1, 10000);
    const items = await db.collection('audit_log').find(f).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    const actors = await users.find({ _id: { $in: [...new Set(items.map((i) => i.actorId).filter(Boolean))] } }, { projection: { name: 1, email: 1 } }).toArray();
    const name = Object.fromEntries(actors.map((a) => [a._id, `${a.name} <${a.email}>`]));
    return { items: items.map((i) => ({ id: i._id, at: i.at, actor: name[i.actorId] || i.actorId, actorRole: i.actorRole, action: i.action, entity: i.entity, entityId: i.entityId, data: i.data, ip: i.ip })), page, limit };
  });

  router.get('/api/admin/announcements', { perm: 'notification.manage' }, async () => {
    const list = await db.collection('announcements').find({}).sort({ publishedAt: -1 }).limit(100).toArray();
    return list.map((a) => ({ id: a._id, title: a.title, body: a.body, examIds: a.examIds, publishedAt: a.publishedAt }));
  });

  router.post('/api/admin/announcements', { perm: 'notification.manage', status: 201 }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ title: str({ required: true, min: 3, max: 160 }), body: str({ required: true, max: 4000 }), examIds: arr(str({ max: 40 }), { max: 50 }), publishAt: str({ max: 40 }) }));
    const doc = { _id: newId('ann'), title: b.title.trim(), body: b.body, examIds: b.examIds || [], publishedAt: b.publishAt ? new Date(b.publishAt) : clock.now(), createdBy: ctx.user._id };
    await db.collection('announcements').insertOne(doc);
    await audit(ctx, 'announcement.create', 'announcement', doc._id, {});
    return { id: doc._id };
  });

  router.delete('/api/admin/announcements/:id', { perm: 'notification.manage' }, async (ctx) => {
    const r = await db.collection('announcements').deleteOne({ _id: ctx.params.id });
    if (!r.deletedCount) throw notFound('Announcement');
    await audit(ctx, 'announcement.delete', 'announcement', ctx.params.id, {});
    return { ok: true };
  });
}
