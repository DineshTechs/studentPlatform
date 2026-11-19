import { newId, dayKey } from '../lib/ids.js';
import { notFound, unprocessable } from '../lib/http.js';
import { assertValid, obj, str, num, intParam } from '../lib/validate.js';
import { scoreQuestion, responseProblem, normalizeResponse, isEmptyResponse } from '../engine/scoring.js';

const PRACTICE_RULE = { correct: 1, incorrect: 0, unattempted: 0, partial: { perCorrectOption: 0.25 } };

function practiceView(q, extra = {}) {
  const content = {};
  for (const [lang, c] of Object.entries(q.content)) content[lang] = { stem: c.stem, passage: c.passage, options: c.options };
  return {
    id: q._id, type: q.type, content, media: q.media || [], difficulty: q.difficulty, subjectId: q.subjectId,
    chapterId: q.chapterId, topicId: q.topicId, source: q.source?.kind === 'pyq' && q.source.verified ? { kind: 'pyq', year: q.source.year, examId: q.source.examId } : { kind: q.source?.kind || 'original' },
    ...extra,
  };
}

export async function examSubjectIds(db, examId) {
  const subs = await db.collection('syllabus').find({ type: 'subject', examIds: examId }, { projection: { _id: 1 } }).toArray();
  return subs.map((s) => s._id);
}

export default function register(router, { db, config, clock }) {
  const questions = db.collection('questions');
  const log = db.collection('practice_log');

  router.get('/api/practice/questions', { perm: 'practice' }, async (ctx) => {
    const qp = ctx.query;
    const examId = qp.get('examId') || ctx.user.activeExamId;
    if (!examId) throw unprocessable('Choose a target examination first.');
    const limit = intParam(qp.get('limit'), 10, 1, 50);
    const mode = qp.get('mode') || 'all';
    const f = { status: 'approved', type: { $ne: 'descriptive' } };
    const subjectIds = await examSubjectIds(db, examId);
    f.subjectId = qp.get('subjectId') && subjectIds.includes(qp.get('subjectId')) ? qp.get('subjectId') : { $in: subjectIds };
    for (const k of ['chapterId', 'topicId']) if (qp.get(k)) f[k] = qp.get(k);
    if (qp.get('difficulty')) f.difficulty = qp.get('difficulty');
    if (qp.get('source') === 'pyq') { f['source.kind'] = 'pyq'; f['source.verified'] = true; }

    const history = await log.find({ userId: ctx.user._id }, { projection: { questionId: 1, outcome: 1, at: 1 } }).sort({ at: -1 }).limit(5000).toArray();
    const last = new Map();
    for (const h of history) if (!last.has(h.questionId)) last.set(h.questionId, h.outcome);
    if (mode === 'incorrect') f._id = { $in: [...last].filter(([, o]) => o === 'incorrect' || o === 'partial').map(([id]) => id) };
    if (mode === 'new') f._id = { $nin: [...last.keys()] };
    if (mode === 'bookmarked') {
      const bms = await db.collection('bookmarks').find({ userId: ctx.user._id }, { projection: { questionId: 1 } }).toArray();
      f._id = { $in: bms.map((b) => b.questionId) };
    }
    const skip = intParam(qp.get('offset'), 0, 0, 100000);
    const [items, total] = await Promise.all([
      questions.find(f).sort({ createdAt: 1 }).skip(skip).limit(limit).toArray(),
      questions.countDocuments(f),
    ]);
    return { items: items.map((q) => practiceView(q, { lastOutcome: last.get(q._id) ?? null })), total, offset: skip };
  });

  router.post('/api/practice/answer', { perm: 'practice', limit: 'autosave' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ questionId: str({ required: true, max: 40 }), answer: { type: 'any', required: true }, timeSpentMs: num({ integer: true, min: 0, max: 3600_000 }) }));
    const q = await questions.findOne({ _id: b.questionId, status: 'approved' });
    if (!q || q.type === 'descriptive') throw notFound('Question');
    const keys = (Object.values(q.content)[0]?.options || []).map((o) => o.key);
    const problem = responseProblem(q.type, b.answer, keys);
    if (problem) throw unprocessable(problem);
    if (isEmptyResponse(q.type, b.answer)) throw unprocessable('Choose or enter an answer first.');
    const response = normalizeResponse(q.type, b.answer);
    const { outcome } = scoreQuestion({ type: q.type, key: q.answer, response, rule: PRACTICE_RULE });
    const now = clock.now();
    await log.insertOne({ _id: newId('pl'), userId: ctx.user._id, questionId: q._id, subjectId: q.subjectId, topicId: q.topicId, response, outcome, timeSpentMs: b.timeSpentMs ?? null, at: now });
    await db.collection('user_topic_stats').updateOne({ _id: `${ctx.user._id}:${q.topicId}` }, {
      $inc: { attempted: 1, correct: outcome === 'correct' ? 1 : 0 }, $set: { lastAt: now },
      $setOnInsert: { userId: ctx.user._id, topicId: q.topicId, subjectId: q.subjectId },
    }, { upsert: true });
    const day = dayKey(now, config.timezone);
    await db.collection('user_activity').updateOne({ _id: `${ctx.user._id}:${day}` }, { $inc: { questions: 1 }, $setOnInsert: { userId: ctx.user._id, day } }, { upsert: true });
    await questions.updateOne({ _id: q._id }, { $inc: { 'stats.attempts': 1, 'stats.correct': outcome === 'correct' ? 1 : 0 } });
    return { outcome, answer: q.answer, content: q.content, stats: q.stats || { attempts: 0, correct: 0 } };
  });

  router.get('/api/bookmarks', { perm: 'bookmark' }, async (ctx) => {
    const bms = await db.collection('bookmarks').find({ userId: ctx.user._id }).sort({ createdAt: -1 }).limit(500).toArray();
    const qs = bms.length ? await questions.find({ _id: { $in: bms.map((b) => b.questionId) } }).toArray() : [];
    const byId = Object.fromEntries(qs.map((q) => [q._id, q]));
    return bms.filter((b) => byId[b.questionId]).map((b) => ({ ...practiceView(byId[b.questionId]), bookmarkedAt: b.createdAt, note: b.note || '' }));
  });

  router.put('/api/bookmarks/:questionId', { perm: 'bookmark' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ note: str({ max: 1000 }) }));
    if (!(await questions.findOne({ _id: ctx.params.questionId }, { projection: { _id: 1 } }))) throw notFound('Question');
    await db.collection('bookmarks').updateOne({ _id: `${ctx.user._id}:${ctx.params.questionId}` }, {
      $set: { note: b.note || '' }, $setOnInsert: { userId: ctx.user._id, questionId: ctx.params.questionId, createdAt: clock.now() },
    }, { upsert: true });
    return { bookmarked: true };
  });

  router.delete('/api/bookmarks/:questionId', { perm: 'bookmark' }, async (ctx) => {
    await db.collection('bookmarks').deleteOne({ _id: `${ctx.user._id}:${ctx.params.questionId}` });
    return { bookmarked: false };
  });
}
