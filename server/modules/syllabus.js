import { assertValid, str, arr, obj, num } from '../lib/validate.js';
import { newId } from '../lib/ids.js';
import { notFound, conflict, unprocessable } from '../lib/http.js';
import { audit } from '../lib/audit.js';

const CHILD = { subject: 'chapter', chapter: 'topic', topic: 'subtopic' };
const PARENT_FIELD = { chapter: 'chapterId', topic: 'topicId', subtopic: 'subtopicId' };

export async function buildTree(db, examId) {
  const subjects = await db.collection('syllabus').find({ type: 'subject', examIds: examId }).sort({ order: 1, name: 1 }).toArray();
  const subjectIds = subjects.map((s) => s._id);
  const rest = subjectIds.length
    ? await db.collection('syllabus').find({ subjectId: { $in: subjectIds }, type: { $ne: 'subject' } }).sort({ order: 1, name: 1 }).toArray()
    : [];
  const byParent = new Map();
  for (const n of rest) {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  }
  const shape = (n) => ({
    id: n._id, type: n.type, name: n.name, description: n.description || '', weightage: n.weightage ?? null, order: n.order,
    children: (byParent.get(n._id) || []).map(shape),
  });
  return subjects.map(shape);
}

export default function register(router, { db }) {
  const nodes = db.collection('syllabus');

  router.get('/api/exams/:id/syllabus', { perm: 'syllabus.read' }, async (ctx) => {
    const tree = await buildTree(db, ctx.params.id);
    // Attach this student's practice coverage so the syllabus doubles as a progress map.
    const stats = await db.collection('user_topic_stats').find({ userId: ctx.user._id }).toArray();
    const byTopic = Object.fromEntries(stats.map((s) => [s.topicId, { attempted: s.attempted, correct: s.correct }]));
    const counts = await questionCounts(db, tree);
    const decorate = (n) => ({ ...n, progress: byTopic[n.id] || null, questionCount: counts[n.id] || 0, children: n.children.map(decorate) });
    return tree.map(decorate);
  });

  router.get('/api/syllabus/nodes', { perm: ['syllabus.read'] }, async (ctx) => {
    const f = {};
    if (ctx.query.get('examId')) { f.examIds = ctx.query.get('examId'); f.type = 'subject'; }
    if (ctx.query.get('parentId')) f.parentId = ctx.query.get('parentId');
    if (ctx.query.get('type')) f.type = ctx.query.get('type');
    if (ctx.query.get('subjectId')) f.subjectId = ctx.query.get('subjectId');
    const list = await nodes.find(f).sort({ order: 1, name: 1 }).limit(1000).toArray();
    return list.map((n) => ({ id: n._id, type: n.type, name: n.name, parentId: n.parentId, subjectId: n.subjectId, examIds: n.examIds, order: n.order }));
  });

  router.post('/api/admin/syllabus', { perm: 'syllabus.manage', status: 201 }, async (ctx) => {
    const b = assertValid(ctx.body, obj({
      type: str({ required: true, enum: ['subject', 'chapter', 'topic', 'subtopic'] }),
      name: str({ required: true, min: 1, max: 160 }), parentId: str({ max: 40 }), examIds: arr(str({ max: 40 }), { max: 50 }),
      order: num({ integer: true }), description: str({ max: 4000 }), weightage: num({ min: 0, max: 100 }),
    }));
    const doc = { _id: newId('syl'), type: b.type, name: b.name.trim(), order: b.order ?? 100, description: b.description || '', weightage: b.weightage ?? null, createdAt: ctx.now, createdBy: ctx.user._id };
    if (b.type === 'subject') {
      if (b.parentId) throw unprocessable('Subjects sit at the top of the tree and have no parent.');
      doc.parentId = null; doc.subjectId = doc._id; doc.examIds = b.examIds || [];
    } else {
      const parent = b.parentId && await nodes.findOne({ _id: b.parentId });
      if (!parent) throw unprocessable('Parent node not found.', [{ field: 'parentId', message: 'unknown parent' }]);
      if (CHILD[parent.type] !== b.type) throw unprocessable(`A ${b.type} must sit under a ${Object.keys(CHILD).find((k) => CHILD[k] === b.type)}.`);
      doc.parentId = parent._id; doc.subjectId = parent.subjectId; doc.examIds = parent.examIds;
      doc.path = { ...(parent.path || {}), [parent.type + 'Id']: parent._id };
    }
    await nodes.insertOne(doc);
    await audit(ctx, 'syllabus.create', 'syllabus', doc._id, { type: doc.type, name: doc.name });
    return { id: doc._id };
  });

  router.patch('/api/admin/syllabus/:id', { perm: 'syllabus.manage' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ name: str({ min: 1, max: 160 }), order: num({ integer: true }), description: str({ max: 4000 }), examIds: arr(str({ max: 40 })), weightage: num({ min: 0, max: 100 }) }));
    const node = await nodes.findOne({ _id: ctx.params.id });
    if (!node) throw notFound('Syllabus node');
    if (b.examIds && node.type !== 'subject') throw unprocessable('Exam mapping is set on the subject.');
    await nodes.updateOne({ _id: node._id }, { $set: { ...b, updatedAt: ctx.now } });
    if (b.examIds) await nodes.updateMany({ subjectId: node._id }, { $set: { examIds: b.examIds } });
    await audit(ctx, 'syllabus.update', 'syllabus', node._id, { fields: Object.keys(b) });
    return { id: node._id };
  });

  router.delete('/api/admin/syllabus/:id', { perm: 'syllabus.manage' }, async (ctx) => {
    const node = await nodes.findOne({ _id: ctx.params.id });
    if (!node) throw notFound('Syllabus node');
    if (await nodes.countDocuments({ parentId: node._id })) throw conflict('Remove or move the items under this node first.');
    const field = node.type === 'subject' ? 'subjectId' : PARENT_FIELD[node.type];
    if (await db.collection('questions').countDocuments({ [field]: node._id })) throw conflict('Questions are tagged to this node. Re-tag them before deleting.');
    await nodes.deleteOne({ _id: node._id });
    await audit(ctx, 'syllabus.delete', 'syllabus', node._id, { name: node.name });
    return { ok: true };
  });
}

async function questionCounts(db, tree) {
  const out = {};
  const topicIds = [];
  const walk = (n) => { if (n.type === 'topic') topicIds.push(n.id); n.children.forEach(walk); };
  tree.forEach(walk);
  if (!topicIds.length) return out;
  const qs = await db.collection('questions').find({ status: 'approved', topicId: { $in: topicIds } }, { projection: { topicId: 1 } }).toArray();
  for (const q of qs) out[q.topicId] = (out[q.topicId] || 0) + 1;
  return out;
}
