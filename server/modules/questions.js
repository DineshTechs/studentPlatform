import { newId } from '../lib/ids.js';
import { notFound, conflict, unprocessable, forbidden } from '../lib/http.js';
import { assertValid, str, obj, bool, intParam, escapeRegex } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { can } from '../lib/rbac.js';
import { contentHash, similarity } from '../lib/text.js';
import { QUESTION_TYPES, DIFFICULTIES } from '../engine/pattern.js';

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SOURCE_KINDS = ['pyq', 'original', 'imported'];
const NEAR_DUPLICATE = 0.82;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Full structural validation of a question. Returns [{ field, message }]. */
export async function questionProblems(db, q) {
  const errs = [];
  const e = (field, message) => errs.push({ field, message });
  if (!QUESTION_TYPES.includes(q.type)) e('type', `must be one of ${QUESTION_TYPES.join(', ')}`);
  if (!DIFFICULTIES.includes(q.difficulty)) e('difficulty', 'must be easy, medium or hard');
  const langs = Object.keys(q.content || {});
  if (!langs.length) e('content', 'add the question in at least one language');
  const usesOptions = q.type === 'mcq_single' || q.type === 'mcq_multi';
  let optionKeys = null;
  for (const lang of langs) {
    const c = q.content[lang];
    const p = `content.${lang}`;
    if (!/^[a-z]{2}$/.test(lang)) e(p, 'language codes are two lowercase letters');
    if (!c || typeof c.stem !== 'string' || !c.stem.trim()) { e(`${p}.stem`, 'question text is required'); continue; }
    if (c.stem.length > 20000) e(`${p}.stem`, 'is too long');
    for (const f of ['explanation', 'solution', 'passage']) if (c[f] !== undefined && (typeof c[f] !== 'string' || c[f].length > 30000)) e(`${p}.${f}`, 'must be text up to 30,000 characters');
    if (usesOptions) {
      if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 6) { e(`${p}.options`, 'needs between 2 and 6 options'); continue; }
      const keys = c.options.map((o) => o?.key);
      if (keys.some((k, i) => k !== OPTION_KEYS[i])) e(`${p}.options`, 'option keys must be A, B, C… in order');
      if (c.options.some((o) => typeof o.text !== 'string' || !o.text.trim())) e(`${p}.options`, 'every option needs text');
      if (optionKeys && optionKeys.join() !== keys.join()) e(`${p}.options`, 'must have the same options in every language');
      optionKeys ??= keys;
    } else if (c.options?.length) e(`${p}.options`, `${q.type} questions do not have options`);
  }
  const a = q.answer || {};
  switch (q.type) {
    case 'mcq_single':
      if (!optionKeys?.includes(a.correct)) e('answer.correct', 'must be one of the option keys');
      break;
    case 'mcq_multi':
      if (!Array.isArray(a.correct) || a.correct.length < 1 || a.correct.some((k) => !optionKeys?.includes(k)) || new Set(a.correct).size !== a.correct.length) e('answer.correct', 'must list one or more distinct option keys');
      break;
    case 'numeric':
      if (isNum(a.min) || isNum(a.max)) { if (!isNum(a.min) || !isNum(a.max) || a.min > a.max) e('answer', 'a range needs numeric min ≤ max'); }
      else if (!isNum(a.value)) e('answer.value', 'is required (or give min and max for a range)');
      if (a.tolerance !== undefined && (!isNum(a.tolerance) || a.tolerance < 0)) e('answer.tolerance', 'must be zero or positive');
      break;
    case 'descriptive':
      if (!isNum(a.maxMarks) || a.maxMarks <= 0) e('answer.maxMarks', 'must be a positive number');
      if (a.wordLimit !== undefined && (!Number.isInteger(a.wordLimit) || a.wordLimit < 10)) e('answer.wordLimit', 'must be a whole number ≥ 10');
      break;
  }
  const src = q.source || {};
  if (!SOURCE_KINDS.includes(src.kind)) e('source.kind', `must be one of ${SOURCE_KINDS.join(', ')}`);
  if (src.kind === 'pyq') {
    if (!src.examId) e('source.examId', 'previous-year questions must name the examination');
    if (!Number.isInteger(src.year) || src.year < 1950 || src.year > 2100) e('source.year', 'previous-year questions need the year');
  }
  if (q.tags && (!Array.isArray(q.tags) || q.tags.length > 20 || q.tags.some((t) => typeof t !== 'string' || t.length > 40))) e('tags', 'up to 20 short text tags');
  if (q.media && (!Array.isArray(q.media) || q.media.some((m) => typeof m?.url !== 'string' || !/^(https:\/\/|\/media\/)/.test(m.url)))) e('media', 'image URLs must start with https:// or /media/');

  // Syllabus placement must be consistent: topic → chapter → subject.
  const ids = [q.subjectId, q.chapterId, q.topicId, q.subtopicId].filter(Boolean);
  const nodes = ids.length ? await db.collection('syllabus').find({ _id: { $in: ids } }).toArray() : [];
  const byId = Object.fromEntries(nodes.map((n) => [n._id, n]));
  const subject = byId[q.subjectId];
  if (!subject || subject.type !== 'subject') e('subjectId', 'choose a subject from the syllabus');
  const chapter = q.chapterId && byId[q.chapterId];
  if (!chapter || chapter.type !== 'chapter' || chapter.parentId !== q.subjectId) e('chapterId', 'choose a chapter of the selected subject');
  const topic = q.topicId && byId[q.topicId];
  if (!topic || topic.type !== 'topic' || topic.parentId !== q.chapterId) e('topicId', 'choose a topic of the selected chapter');
  if (q.subtopicId) {
    const st = byId[q.subtopicId];
    if (!st || st.type !== 'subtopic' || st.parentId !== q.topicId) e('subtopicId', 'choose a subtopic of the selected topic');
  }
  if (src.examId && !(await db.collection('exams').findOne({ _id: src.examId }))) e('source.examId', 'unknown examination');
  return errs;
}

function primaryContent(q) {
  return q.content?.en || Object.values(q.content || {})[0] || {};
}

export function hashOf(q) {
  const c = primaryContent(q);
  return contentHash(c.stem, (c.options || []).map((o) => o.text));
}

export async function findDuplicates(db, q, { excludeId } = {}) {
  const hash = hashOf(q);
  const exact = await db.collection('questions').find({ hash, _id: { $ne: excludeId ?? '' }, status: { $ne: 'archived' } }, { projection: { _id: 1 } }).limit(5).toArray();
  const stem = primaryContent(q).stem || '';
  const near = [];
  if (q.subjectId) {
    // Bounded scan of the same subject. For very large banks, move this to a search index.
    const pool = await db.collection('questions').find({ subjectId: q.subjectId, _id: { $ne: excludeId ?? '' }, status: { $ne: 'archived' } }, { projection: { content: 1, hash: 1 } }).sort({ createdAt: -1 }).limit(3000).toArray();
    for (const other of pool) {
      if (other.hash === hash) continue;
      const s = similarity(stem, primaryContent(other).stem);
      if (s >= NEAR_DUPLICATE) near.push({ id: other._id, similarity: Math.round(s * 100) / 100 });
    }
    near.sort((a, b) => b.similarity - a.similarity);
  }
  return { exact: exact.map((d) => d._id), near: near.slice(0, 5) };
}

function sanitizeInput(b) {
  return {
    type: b.type, content: b.content, answer: b.answer, subjectId: b.subjectId, chapterId: b.chapterId,
    topicId: b.topicId, subtopicId: b.subtopicId || null, difficulty: b.difficulty, source: b.source || { kind: 'original' },
    tags: b.tags || [], media: b.media || [], examIds: Array.isArray(b.examIds) ? b.examIds.slice(0, 20) : [],
  };
}

export function staffView(q) {
  return {
    id: q._id, type: q.type, content: q.content, answer: q.answer, subjectId: q.subjectId, chapterId: q.chapterId,
    topicId: q.topicId, subtopicId: q.subtopicId, difficulty: q.difficulty, source: q.source, tags: q.tags, media: q.media,
    examIds: q.examIds, status: q.status, version: q.version, createdBy: q.createdBy, updatedBy: q.updatedBy,
    reviewedBy: q.reviewedBy ?? null, reviewNotes: q.reviewNotes ?? null, createdAt: q.createdAt, updatedAt: q.updatedAt,
    stats: q.stats || { attempts: 0, correct: 0 },
  };
}

export default function register(router, { db }) {
  const questions = db.collection('questions');

  async function createOne(ctx, input, { allowDuplicate = false, submit = false } = {}) {
    const q = sanitizeInput(input);
    const problems = await questionProblems(db, q);
    if (problems.length) return { errors: problems };
    const dups = await findDuplicates(db, q);
    if (dups.exact.length && !allowDuplicate) return { errors: [{ field: 'content', message: 'An identical question already exists.' }], duplicateOf: dups.exact };
    const doc = {
      _id: newId('q'), ...q, hash: hashOf(q), status: submit ? 'in_review' : 'draft', version: 1,
      createdBy: ctx.user._id, updatedBy: ctx.user._id, createdAt: ctx.now, updatedAt: ctx.now, stats: { attempts: 0, correct: 0 },
    };
    if (doc.source.kind === 'pyq') doc.source.verified = false; // only a reviewer can verify a PYQ
    await questions.insertOne(doc);
    return { doc, near: dups.near };
  }

  router.get('/api/questions', { perm: ['question.read_all', 'question.create'] }, async (ctx) => {
    const qp = ctx.query;
    const f = {};
    for (const k of ['status', 'type', 'subjectId', 'chapterId', 'topicId', 'difficulty', 'createdBy']) if (qp.get(k)) f[k] = qp.get(k);
    if (qp.get('mine') === 'true') f.createdBy = ctx.user._id;
    if (qp.get('source')) f['source.kind'] = qp.get('source');
    if (qp.get('examId')) f.$or = [{ examIds: qp.get('examId') }, { 'source.examId': qp.get('examId') }];
    if (qp.get('q')) f['content.en.stem'] = { $regex: escapeRegex(qp.get('q').slice(0, 100)), $options: 'i' };
    const limit = intParam(qp.get('limit'), 25, 1, 100);
    const page = intParam(qp.get('page'), 1, 1, 10000);
    const [items, total] = await Promise.all([
      questions.find(f).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      questions.countDocuments(f),
    ]);
    return { items: items.map(staffView), total, page, limit };
  });

  router.get('/api/questions/:id', { perm: ['question.read_all', 'question.create'] }, async (ctx) => {
    const q = await questions.findOne({ _id: ctx.params.id });
    if (!q) throw notFound('Question');
    const reviews = await db.collection('question_reviews').find({ questionId: q._id }).sort({ at: -1 }).limit(20).toArray();
    return { question: staffView(q), reviews: reviews.map((r) => ({ id: r._id, decision: r.decision, notes: r.notes, reviewerId: r.reviewerId, version: r.version, at: r.at })) };
  });

  router.get('/api/questions/:id/duplicates', { perm: ['question.read_all', 'question.create'] }, async (ctx) => {
    const q = await questions.findOne({ _id: ctx.params.id });
    if (!q) throw notFound('Question');
    return findDuplicates(db, q, { excludeId: q._id });
  });

  router.post('/api/questions', { perm: 'question.create', status: 201 }, async (ctx) => {
    const r = await createOne(ctx, ctx.body, { allowDuplicate: ctx.body.allowDuplicate === true, submit: ctx.body.submitForReview === true });
    if (r.errors) {
      if (r.duplicateOf) throw conflict('An identical question already exists.', { duplicateOf: r.duplicateOf });
      throw unprocessable('The question has problems.', r.errors);
    }
    await audit(ctx, 'question.create', 'question', r.doc._id, {});
    return { question: staffView(r.doc), nearDuplicates: r.near };
  });

  router.put('/api/questions/:id', { perm: ['question.edit_own', 'question.create'] }, async (ctx) => {
    const existing = await questions.findOne({ _id: ctx.params.id });
    if (!existing) throw notFound('Question');
    const isAdmin = can(ctx.user, 'question.edit_any');
    if (!isAdmin) {
      if (existing.createdBy !== ctx.user._id) throw forbidden('You can only edit questions you created.');
      if (!['draft', 'rejected'].includes(existing.status)) throw conflict('Only draft or rejected questions can be edited. Ask an admin to revise approved questions.');
    }
    if (existing.status === 'archived') throw conflict('Archived questions cannot be edited.');
    const q = sanitizeInput({ ...staffView(existing), ...ctx.body });
    const problems = await questionProblems(db, q);
    if (problems.length) throw unprocessable('The question has problems.', problems);
    // Any edit to an approved question creates a new version that must be reviewed again.
    // Published papers keep their own snapshot, so past attempts are never re-scored.
    const nextStatus = existing.status === 'approved' ? 'in_review' : existing.status === 'rejected' ? 'draft' : existing.status;
    const updated = await questions.findOneAndUpdate(
      { _id: existing._id, version: existing.version },
      { $set: { ...q, hash: hashOf(q), status: nextStatus, updatedBy: ctx.user._id, updatedAt: ctx.now, ...(q.source.kind === 'pyq' && existing.status === 'approved' ? { 'source.verified': false } : {}) }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw conflict('Someone else changed this question. Reload and try again.');
    await audit(ctx, 'question.update', 'question', existing._id, { fromVersion: existing.version, status: nextStatus });
    return { question: staffView(updated) };
  });

  router.post('/api/questions/:id/submit', { perm: ['question.edit_own', 'question.create'] }, async (ctx) => {
    const filter = { _id: ctx.params.id, status: { $in: ['draft', 'rejected'] } };
    if (!can(ctx.user, 'question.edit_any')) filter.createdBy = ctx.user._id;
    const q = await questions.findOneAndUpdate(filter, { $set: { status: 'in_review', submittedAt: ctx.now } }, { returnDocument: 'after' });
    if (!q) throw conflict('Only your draft or rejected questions can be submitted for review.');
    await audit(ctx, 'question.submit', 'question', q._id, {});
    return { question: staffView(q) };
  });

  router.get('/api/review/queue', { perm: 'question.review' }, async (ctx) => {
    const f = { status: 'in_review', createdBy: { $ne: ctx.user._id } };
    if (ctx.query.get('subjectId')) f.subjectId = ctx.query.get('subjectId');
    const items = await questions.find(f).sort({ submittedAt: 1, updatedAt: 1 }).limit(50).toArray();
    return { items: items.map(staffView), total: await questions.countDocuments(f) };
  });

  router.post('/api/questions/:id/review', { perm: 'question.review' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({
      decision: str({ required: true, enum: ['approve', 'reject'] }), notes: str({ max: 4000 }),
      version: { type: 'number', required: true }, verifySource: bool(),
    }));
    if (b.decision === 'reject' && !b.notes?.trim()) throw unprocessable('Explain what needs fixing when rejecting.', [{ field: 'notes', message: 'is required when rejecting' }]);
    const q = await questions.findOne({ _id: ctx.params.id });
    if (!q) throw notFound('Question');
    // Separation of duties: nobody approves their own work.
    if (q.createdBy === ctx.user._id || q.updatedBy === ctx.user._id) throw forbidden('You cannot review a question you wrote or last edited.');
    const $set = { status: b.decision === 'approve' ? 'approved' : 'rejected', reviewedBy: ctx.user._id, reviewedAt: ctx.now, reviewNotes: b.notes || null };
    if (b.decision === 'approve' && q.source?.kind === 'pyq' && b.verifySource) $set['source.verified'] = true;
    const updated = await questions.findOneAndUpdate({ _id: q._id, status: 'in_review', version: b.version }, { $set }, { returnDocument: 'after' });
    if (!updated) throw conflict('This question changed or was already reviewed. Reload the queue.');
    await db.collection('question_reviews').insertOne({ _id: newId('rev'), questionId: q._id, version: q.version, reviewerId: ctx.user._id, decision: b.decision, notes: b.notes || null, at: ctx.now });
    await audit(ctx, `question.${b.decision}`, 'question', q._id, { version: q.version });
    return { question: staffView(updated) };
  });

  router.post('/api/questions/:id/archive', { perm: 'question.edit_any' }, async (ctx) => {
    const q = await questions.findOneAndUpdate({ _id: ctx.params.id, status: { $ne: 'archived' } }, { $set: { status: 'archived', archivedAt: ctx.now } }, { returnDocument: 'after' });
    if (!q) throw notFound('Question');
    await audit(ctx, 'question.archive', 'question', q._id, {});
    return { question: staffView(q) };
  });

  router.post('/api/questions/import', { perm: 'question.import' }, async (ctx) => {
    const list = ctx.body.questions;
    if (!Array.isArray(list) || !list.length) throw unprocessable('Send { "questions": [ ... ] } with at least one question.');
    if (list.length > 500) throw unprocessable('Import at most 500 questions per batch.');
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const r = await createOne(ctx, list[i] || {}, { submit: ctx.body.submitForReview === true });
      if (r.errors) results.push({ index: i, ok: false, errors: r.errors, duplicateOf: r.duplicateOf });
      else results.push({ index: i, ok: true, id: r.doc._id, nearDuplicates: r.near });
    }
    const created = results.filter((r) => r.ok).length;
    await audit(ctx, 'question.import', 'question', null, { created, failed: results.length - created });
    return { created, failed: results.length - created, results };
  });
}
