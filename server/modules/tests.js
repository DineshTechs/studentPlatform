import { newId } from '../lib/ids.js';
import { notFound, conflict, unprocessable } from '../lib/http.js';
import { assertValid, str, num, obj, arr } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { selectQuestions, sectionFilter } from '../engine/selection.js';
import { resolveRule, summarizePattern } from '../engine/pattern.js';
import { maxMarksFor } from '../engine/scoring.js';
import { staffView } from './questions.js';

const KINDS = ['full', 'sectional', 'practice'];

function testView(t, extra = {}) {
  return {
    id: t._id, examId: t.examId, patternId: t.patternId, patternVersion: t.patternVersion, title: t.title,
    description: t.description || '', kind: t.kind, status: t.status, availableFrom: t.availableFrom ?? null,
    availableUntil: t.availableUntil ?? null, maxAttempts: t.maxAttempts ?? null, publishedAt: t.publishedAt ?? null,
    createdAt: t.createdAt, ...extra,
  };
}

/** Checks that chosen question ids satisfy the section composition exactly. */
async function compositionProblems(db, config, sections) {
  const problems = [];
  const all = sections.flatMap((s) => s.questionIds);
  if (new Set(all).size !== all.length) problems.push({ field: 'sections', message: 'a question appears more than once in the paper' });
  const docs = await db.collection('questions').find({ _id: { $in: all } }).toArray();
  const byId = Object.fromEntries(docs.map((d) => [d._id, d]));
  for (const sec of config.sections) {
    const chosen = sections.find((s) => s.key === sec.key)?.questionIds || [];
    for (const part of sec.composition) {
      const have = chosen.filter((id) => byId[id]?.type === part.type).length;
      if (have !== part.count) problems.push({ field: `sections.${sec.key}`, message: `needs ${part.count} ${part.type} question(s), has ${have}` });
    }
    for (const id of chosen) {
      const q = byId[id];
      if (!q) problems.push({ field: `sections.${sec.key}`, message: `question ${id} does not exist` });
      else if (q.status !== 'approved') problems.push({ field: `sections.${sec.key}`, message: `question ${id} is not approved (${q.status})` });
      else if (!sec.composition.some((p) => p.type === q.type)) problems.push({ field: `sections.${sec.key}`, message: `question ${id} is ${q.type}, which this section does not allow` });
    }
  }
  return { problems, byId };
}

export function buildPaper(test, pattern, byId) {
  const config = pattern.config;
  let n = 0;
  const sections = config.sections.map((sec) => {
    const ids = test.sections.find((s) => s.key === sec.key).questionIds;
    // Order questions block by block, as candidates see them in the real exam.
    const ordered = sec.composition.flatMap((part) => ids.filter((id) => byId[id].type === part.type).map((id) => ({ id, part })));
    return {
      key: sec.key, name: sec.name, durationSec: sec.durationSec ?? null, maxAttempted: sec.maxAttempted ?? null,
      instructions: sec.instructions || '',
      questions: ordered.map(({ id, part }) => {
        const q = byId[id];
        const rule = resolveRule(config, sec, part) || {};
        n += 1;
        return {
          ref: `q${n}`, number: n, questionId: q._id, version: q.version, type: q.type, content: q.content, media: q.media || [],
          answer: q.answer, marking: rule, maxMarks: maxMarksFor(q.type, rule, q.answer),
          subjectId: q.subjectId, chapterId: q.chapterId, topicId: q.topicId, difficulty: q.difficulty,
        };
      }),
    };
  });
  return {
    _id: newId('ppr'), mockTestId: test._id, examId: test.examId, patternId: pattern._id, patternVersion: pattern.version,
    config, summary: summarizePattern(config), sections, questionCount: n,
  };
}

export default function register(router, { db }) {
  const tests = db.collection('mock_tests');
  const patterns = db.collection('patterns');

  // ---------- student-facing ----------
  router.get('/api/mock-tests', { perm: 'test.take' }, async (ctx) => {
    const examId = ctx.query.get('examId') || ctx.user.activeExamId;
    if (!examId) return { items: [] };
    const list = await tests.find({ examId, status: 'published' }).sort({ availableFrom: -1, publishedAt: -1 }).limit(100).toArray();
    const ids = list.map((t) => t._id);
    const attempts = ids.length ? await db.collection('attempts').find({ userId: ctx.user._id, mockTestId: { $in: ids } }, { projection: { mockTestId: 1, status: 1, result: 1, startedAt: 1 } }).toArray() : [];
    const papers = ids.length ? await db.collection('papers').find({ mockTestId: { $in: ids } }, { projection: { mockTestId: 1, summary: 1 } }).toArray() : [];
    const summaryOf = Object.fromEntries(papers.map((p) => [p.mockTestId, p.summary]));
    return {
      items: list.map((t) => {
        const mine = attempts.filter((a) => a.mockTestId === t._id);
        const open = (!t.availableFrom || t.availableFrom <= ctx.now) && (!t.availableUntil || t.availableUntil > ctx.now);
        return testView(t, {
          summary: summaryOf[t._id] ? { totalQuestions: summaryOf[t._id].totalQuestions, totalMarks: summaryOf[t._id].totalMarks, durationSec: summaryOf[t._id].durationSec } : null,
          isOpen: open,
          attemptsUsed: mine.length,
          inProgressAttemptId: mine.find((a) => a.status !== 'submitted')?._id ?? null,
          bestScore: mine.filter((a) => a.result).reduce((m, a) => Math.max(m, a.result.score), -Infinity),
          lastAttemptId: mine.filter((a) => a.status === 'submitted').sort((a, b) => b.startedAt - a.startedAt)[0]?._id ?? null,
        });
      }).map((t) => ({ ...t, bestScore: Number.isFinite(t.bestScore) ? t.bestScore : null })),
    };
  });

  router.get('/api/mock-tests/:id', { perm: 'test.take' }, async (ctx) => {
    const t = await tests.findOne({ _id: ctx.params.id, status: 'published' });
    if (!t) throw notFound('Mock test');
    const paper = await db.collection('papers').findOne({ mockTestId: t._id }, { projection: { summary: 1, config: 1 } });
    const exam = await db.collection('exams').findOne({ _id: t.examId }, { projection: { name: 1 } });
    const used = await db.collection('attempts').countDocuments({ userId: ctx.user._id, mockTestId: t._id });
    return testView(t, {
      examName: exam?.name, summary: paper.summary, instructions: paper.config.instructions || '',
      sectionInstructions: paper.config.sections.map((s) => ({ key: s.key, name: s.name, instructions: s.instructions || '' })),
      attemptsUsed: used,
    });
  });

  // ---------- admin ----------
  router.get('/api/admin/mock-tests', { perm: 'test.manage' }, async (ctx) => {
    const f = {};
    if (ctx.query.get('examId')) f.examId = ctx.query.get('examId');
    if (ctx.query.get('status')) f.status = ctx.query.get('status');
    const list = await tests.find(f).sort({ createdAt: -1 }).limit(200).toArray();
    return list.map((t) => testView(t, { questionCount: (t.sections || []).reduce((a, s) => a + s.questionIds.length, 0) }));
  });

  router.post('/api/admin/mock-tests', { perm: 'test.manage', status: 201 }, async (ctx) => {
    const b = assertValid(ctx.body, obj({
      examId: str({ required: true }), patternId: str({ required: true }), title: str({ required: true, min: 3, max: 160 }),
      description: str({ max: 4000 }), kind: str({ enum: KINDS }), availableFrom: str({ max: 40 }), availableUntil: str({ max: 40 }),
      maxAttempts: num({ integer: true, min: 1, max: 100 }), seed: str({ max: 60 }),
    }));
    const pattern = await patterns.findOne({ _id: b.patternId, examId: b.examId });
    if (!pattern) throw unprocessable('Pattern version not found for this examination.', [{ field: 'patternId', message: 'unknown pattern' }]);
    if (pattern.status !== 'published') throw unprocessable('Mock tests can only use a published pattern version.', [{ field: 'patternId', message: `pattern is ${pattern.status}` }]);
    const from = b.availableFrom ? new Date(b.availableFrom) : null;
    const until = b.availableUntil ? new Date(b.availableUntil) : null;
    if ((from && isNaN(from)) || (until && isNaN(until)) || (from && until && until <= from)) throw unprocessable('Check the availability window.', [{ field: 'availableUntil', message: 'must be a valid date after availableFrom' }]);
    const doc = {
      _id: newId('mt'), examId: b.examId, patternId: pattern._id, patternVersion: pattern.version, title: b.title.trim(),
      description: b.description || '', kind: b.kind || 'full', status: 'draft', seed: b.seed || newId('seed'),
      sections: pattern.config.sections.map((s) => ({ key: s.key, questionIds: [] })), availableFrom: from, availableUntil: until,
      maxAttempts: b.maxAttempts ?? null, createdBy: ctx.user._id, createdAt: ctx.now,
    };
    await tests.insertOne(doc);
    await audit(ctx, 'mocktest.create', 'mock_test', doc._id, { patternId: pattern._id });
    return testView(doc);
  });

  router.get('/api/admin/mock-tests/:id', { perm: 'test.manage' }, async (ctx) => {
    const t = await tests.findOne({ _id: ctx.params.id });
    if (!t) throw notFound('Mock test');
    const pattern = await patterns.findOne({ _id: t.patternId });
    const ids = t.sections.flatMap((s) => s.questionIds);
    const qs = ids.length ? await db.collection('questions').find({ _id: { $in: ids } }).toArray() : [];
    const { problems } = await compositionProblems(db, pattern.config, t.sections);
    const attemptCount = await db.collection('attempts').countDocuments({ mockTestId: t._id });
    return testView(t, {
      sections: t.sections, pattern: { id: pattern._id, label: pattern.label, version: pattern.version, summary: summarizePattern(pattern.config) },
      questions: qs.map(staffView), problems, attemptCount,
    });
  });

  router.patch('/api/admin/mock-tests/:id', { perm: 'test.manage' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ title: str({ min: 3, max: 160 }), description: str({ max: 4000 }), availableFrom: str({ max: 40 }), availableUntil: str({ max: 40 }), maxAttempts: num({ integer: true, min: 1, max: 100 }) }));
    const $set = { updatedAt: ctx.now };
    if (b.title) $set.title = b.title.trim();
    if (b.description !== undefined) $set.description = b.description;
    if (b.availableFrom !== undefined) $set.availableFrom = b.availableFrom ? new Date(b.availableFrom) : null;
    if (b.availableUntil !== undefined) $set.availableUntil = b.availableUntil ? new Date(b.availableUntil) : null;
    if (b.maxAttempts !== undefined) $set.maxAttempts = b.maxAttempts;
    const t = await tests.findOneAndUpdate({ _id: ctx.params.id, status: { $ne: 'archived' } }, { $set }, { returnDocument: 'after' });
    if (!t) throw notFound('Mock test');
    await audit(ctx, 'mocktest.update', 'mock_test', t._id, { fields: Object.keys(b) });
    return testView(t);
  });

  router.post('/api/admin/mock-tests/:id/generate', { perm: 'test.manage' }, async (ctx) => {
    const t = await tests.findOne({ _id: ctx.params.id });
    if (!t) throw notFound('Mock test');
    if (t.status !== 'draft') throw conflict('Questions can only be changed while the test is a draft.');
    const pattern = await patterns.findOne({ _id: t.patternId });
    const pools = {};
    for (const sec of pattern.config.sections) {
      pools[sec.key] = {};
      for (const part of sec.composition) {
        pools[sec.key][part.type] = await db.collection('questions')
          .find(sectionFilter(sec, part.type), { projection: { _id: 1, difficulty: 1, type: 1 } }).limit(5000).toArray();
      }
    }
    // Avoid reusing questions from this exam's other papers where the pool allows.
    const otherPapers = await tests.find({ examId: t.examId, _id: { $ne: t._id }, status: { $in: ['published', 'draft'] } }, { projection: { sections: 1 } }).toArray();
    const excludeIds = new Set(otherPapers.flatMap((p) => p.sections.flatMap((s) => s.questionIds)));
    const seed = ctx.body.seed || t.seed;
    const { sections, shortfalls } = selectQuestions(pattern.config, pools, { seed, excludeIds });
    if (shortfalls.length) {
      throw unprocessable('Not enough approved questions match this pattern.', shortfalls.map((s) => ({ field: `sections.${s.section}`, message: `${s.type}: need ${s.needed}, found ${s.available}` })));
    }
    await tests.updateOne({ _id: t._id, status: 'draft' }, { $set: { sections, seed, generatedAt: ctx.now } });
    await audit(ctx, 'mocktest.generate', 'mock_test', t._id, { seed });
    return { sections };
  });

  router.put('/api/admin/mock-tests/:id/sections', { perm: 'test.manage' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ sections: arr(obj({ key: str({ required: true }), questionIds: arr(str({ max: 40 }), { max: 500 }) }), { required: true }) }));
    const t = await tests.findOne({ _id: ctx.params.id });
    if (!t) throw notFound('Mock test');
    if (t.status !== 'draft') throw conflict('Questions can only be changed while the test is a draft.');
    const pattern = await patterns.findOne({ _id: t.patternId });
    const keys = pattern.config.sections.map((s) => s.key);
    if (b.sections.length !== keys.length || b.sections.some((s) => !keys.includes(s.key))) throw unprocessable(`Provide exactly these sections: ${keys.join(', ')}`);
    const sections = keys.map((k) => ({ key: k, questionIds: b.sections.find((s) => s.key === k).questionIds || [] }));
    await tests.updateOne({ _id: t._id }, { $set: { sections, updatedAt: ctx.now } });
    const { problems } = await compositionProblems(db, pattern.config, sections);
    await audit(ctx, 'mocktest.sections', 'mock_test', t._id, {});
    return { sections, problems };
  });

  router.post('/api/admin/mock-tests/:id/publish', { perm: 'test.publish' }, async (ctx) => {
    const t = await tests.findOne({ _id: ctx.params.id });
    if (!t) throw notFound('Mock test');
    if (t.status !== 'draft') throw conflict(`This test is already ${t.status}.`);
    const pattern = await patterns.findOne({ _id: t.patternId });
    if (pattern.status !== 'published') throw conflict(`Pattern version ${pattern.version} is ${pattern.status}; choose a published version.`);
    const { problems, byId } = await compositionProblems(db, pattern.config, t.sections);
    if (problems.length) throw unprocessable('The paper does not match its pattern yet.', problems);
    const paper = buildPaper(t, pattern, byId);
    try {
      await db.collection('papers').insertOne(paper);
    } catch (e) {
      if (e.code !== 11000) throw e; // paper from an earlier, interrupted publish — reuse it
    }
    const updated = await tests.findOneAndUpdate({ _id: t._id, status: 'draft' }, { $set: { status: 'published', publishedAt: ctx.now, publishedBy: ctx.user._id } }, { returnDocument: 'after' });
    if (!updated) throw conflict('This test changed while publishing.');
    await audit(ctx, 'mocktest.publish', 'mock_test', t._id, { questions: paper.questionCount });
    return testView(updated);
  });

  router.post('/api/admin/mock-tests/:id/archive', { perm: 'test.publish' }, async (ctx) => {
    const t = await tests.findOneAndUpdate({ _id: ctx.params.id, status: { $ne: 'archived' } }, { $set: { status: 'archived', archivedAt: ctx.now } }, { returnDocument: 'after' });
    if (!t) throw notFound('Mock test');
    await audit(ctx, 'mocktest.archive', 'mock_test', t._id, {});
    return testView(t);
  });
}
