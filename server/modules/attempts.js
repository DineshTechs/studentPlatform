// Computer-based test engine.
//
// Guarantees:
//  * The server owns time. Start/expiry/section windows are stored on the attempt and every
//    write is checked against the server clock; the browser timer is display only.
//  * Autosave is idempotent and order-safe: each save carries a per-question sequence number
//    and stale or replayed saves are ignored.
//  * Writes to one attempt are serialised with an optimistic revision counter, so section
//    limits (e.g. "attempt any 5 of 10") cannot be bypassed with parallel requests.
//  * Submission is idempotent: an atomic status transition (in_progress → submitting →
//    submitted) means double clicks, retries and the timeout sweeper all produce one result.
//  * Answer keys never leave the server while an attempt is open.
import { newId, round2, dayKey } from '../lib/ids.js';
import { HttpError, notFound, conflict, unprocessable, forbidden } from '../lib/http.js';
import { assertValid, obj, str, bool, num } from '../lib/validate.js';
import { can } from '../lib/rbac.js';
import { scoreQuestion, responseProblem, normalizeResponse, isEmptyResponse } from '../engine/scoring.js';

const paperCache = new Map();
export async function loadPaper(db, paperId) {
  if (paperCache.has(paperId)) return paperCache.get(paperId);
  const paper = await db.collection('papers').findOne({ _id: paperId });
  if (paper) {
    paper.byRef = new Map();
    paper.sections.forEach((s, si) => s.questions.forEach((q) => paper.byRef.set(q.ref, { q, si })));
    if (paperCache.size > 200) paperCache.delete(paperCache.keys().next().value);
    paperCache.set(paperId, paper);
  }
  return paper;
}

const closedError = (attempt) => new HttpError(409, 'ATTEMPT_CLOSED', 'This attempt has ended.', { status: attempt.status, attemptId: attempt._id });

// ------------------------------------------------------------------ result computation
export function computeResult(paper, attempt) {
  const evaluateMarked = paper.config.review?.evaluateAnsweredMarked !== false;
  const responses = attempt.responses || {};
  const evaluations = attempt.evaluations || {};
  const totals = { score: 0, maxScore: 0, correct: 0, incorrect: 0, partial: 0, unattempted: 0, pending: 0, timeSpentMs: 0 };
  const bySubject = {};
  const perQuestion = [];
  const sections = paper.sections.map((sec) => {
    const s = { key: sec.key, name: sec.name, score: 0, maxScore: 0, correct: 0, incorrect: 0, partial: 0, unattempted: 0, pending: 0, attempted: 0, timeSpentMs: 0 };
    let counted = 0;
    const cap = sec.maxAttempted ?? Infinity;
    for (const q of sec.questions) {
      const r = responses[q.ref] || {};
      let response = r.answer ?? null;
      if (r.marked && !evaluateMarked) response = null;
      if (!isEmptyResponse(q.type, response)) { counted += 1; if (counted > cap) response = null; } // defensive: never score beyond the cap
      const { outcome, marks } = scoreQuestion({ type: q.type, key: q.answer, response, rule: q.marking, evaluation: evaluations[q.ref] });
      const m = marks ?? 0;
      s.score += m;
      s.timeSpentMs += r.timeSpentMs || 0;
      if (outcome === 'correct') s.correct++;
      else if (outcome === 'incorrect') s.incorrect++;
      else if (outcome === 'partial') s.partial++;
      else if (outcome === 'pending') s.pending++;
      else if (outcome === 'evaluated') s.correct += m > 0 ? 1 : 0;
      else s.unattempted++;
      if (outcome !== 'unattempted') s.attempted++;
      const subj = (bySubject[q.subjectId] ||= { subjectId: q.subjectId, score: 0, maxScore: 0, attempted: 0, correct: 0 });
      subj.score += m; subj.maxScore += q.maxMarks;
      if (outcome !== 'unattempted') subj.attempted++;
      if (outcome === 'correct') subj.correct++;
      perQuestion.push({ ref: q.ref, outcome, marks: marks === null ? null : round2(m) });
    }
    // Section maximum honours "attempt any N" limits.
    s.maxScore = round2(sec.questions.map((q) => q.maxMarks).sort((a, b) => b - a).slice(0, cap).reduce((a, b) => a + b, 0));
    s.score = round2(s.score);
    for (const k of ['score', 'maxScore', 'correct', 'incorrect', 'partial', 'unattempted', 'pending', 'timeSpentMs']) totals[k] += s[k];
    return s;
  });
  totals.score = round2(totals.score);
  totals.maxScore = round2(totals.maxScore);
  const attempted = totals.correct + totals.incorrect + totals.partial;
  return {
    ...totals,
    attempted,
    accuracy: attempted ? round2(((totals.correct + totals.partial * 0.5) / attempted) * 100) : 0,
    percentage: totals.maxScore ? round2((totals.score / totals.maxScore) * 100) : 0,
    sections,
    bySubject: Object.values(bySubject).map((s) => ({ ...s, score: round2(s.score), maxScore: round2(s.maxScore) })),
    perQuestion,
  };
}

// ------------------------------------------------------------------ engine
export function createEngine({ db, config, clock }) {
  const attempts = db.collection('attempts');

  /** Moves a section-timed attempt past any sections whose time is up; finalises if all are. */
  async function advance(attempt, paper) {
    const now = clock.now();
    for (let guard = 0; guard < 50 && attempt.status === 'in_progress'; guard++) {
      if (now.valueOf() > attempt.expiresAt.valueOf() + config.saveGraceMs) {
        return finalize(attempt._id, 'timeout');
      }
      if (!attempt.sectionTimed) return attempt;
      const cur = attempt.sections[attempt.currentSection];
      if (now.valueOf() <= cur.expiresAt.valueOf() + config.saveGraceMs) return attempt;
      const nextIdx = attempt.currentSection + 1;
      if (nextIdx >= attempt.sections.length) return finalize(attempt._id, 'timeout');
      // The next section starts when the previous one ended, not when the client reconnects.
      const start = cur.expiresAt;
      const dur = paper.sections[nextIdx].durationSec * 1000;
      const updated = await attempts.findOneAndUpdate(
        { _id: attempt._id, status: 'in_progress', currentSection: attempt.currentSection },
        { $set: { currentSection: nextIdx, [`sections.${attempt.currentSection}.closedAt`]: cur.expiresAt, [`sections.${nextIdx}.startedAt`]: start, [`sections.${nextIdx}.expiresAt`]: new Date(start.valueOf() + dur) }, $inc: { rev: 1 } },
        { returnDocument: 'after' },
      );
      attempt = updated || (await attempts.findOne({ _id: attempt._id }));
    }
    return attempt;
  }

  async function applyStats(attempt, paper, result) {
    // Claim the one-time stats update so retries never double-count.
    const claimed = await attempts.findOneAndUpdate({ _id: attempt._id, statsApplied: { $ne: true } }, { $set: { statsApplied: true } });
    if (!claimed) return;
    const outcome = Object.fromEntries(result.perQuestion.map((p) => [p.ref, p.outcome]));
    const topicInc = new Map();
    let answered = 0;
    for (const sec of paper.sections) {
      for (const q of sec.questions) {
        const o = outcome[q.ref];
        if (o === 'unattempted' || o === 'pending' || o === 'evaluated') continue;
        answered++;
        const key = `${attempt.userId}:${q.topicId}`;
        const t = topicInc.get(key) || { topicId: q.topicId, subjectId: q.subjectId, attempted: 0, correct: 0 };
        t.attempted++; if (o === 'correct') t.correct++;
        topicInc.set(key, t);
        await db.collection('questions').updateOne({ _id: q.questionId }, { $inc: { 'stats.attempts': 1, 'stats.correct': o === 'correct' ? 1 : 0 } });
      }
    }
    for (const [key, t] of topicInc) {
      await db.collection('user_topic_stats').updateOne({ _id: key }, {
        $inc: { attempted: t.attempted, correct: t.correct },
        $set: { lastAt: clock.now() },
        $setOnInsert: { userId: attempt.userId, topicId: t.topicId, subjectId: t.subjectId },
      }, { upsert: true });
    }
    const day = dayKey(clock.now(), config.timezone);
    await db.collection('user_activity').updateOne({ _id: `${attempt.userId}:${day}` }, {
      $inc: { questions: answered, mocks: 1 }, $setOnInsert: { userId: attempt.userId, day },
    }, { upsert: true });
  }

  /** Idempotent finalisation. Safe to call concurrently from requests and the sweeper. */
  async function finalize(attemptId, reason) {
    const now = clock.now();
    let a = await attempts.findOneAndUpdate(
      { _id: attemptId, status: 'in_progress' },
      { $set: { status: 'submitting', submitLockAt: now, submitReason: reason }, $inc: { rev: 1 } },
      { returnDocument: 'after' },
    );
    if (!a) {
      const cur = await attempts.findOne({ _id: attemptId });
      if (!cur) throw notFound('Attempt');
      if (cur.status === 'submitted') return cur;
      // status === 'submitting': someone else is finalising. Take over only if they crashed.
      if (now.valueOf() - cur.submitLockAt.valueOf() < config.submitLockStaleMs) {
        throw new HttpError(409, 'SUBMIT_IN_PROGRESS', 'Your submission is being processed. Please wait a moment.', { retryAfterMs: 1000 });
      }
      a = await attempts.findOneAndUpdate({ _id: attemptId, status: 'submitting', submitLockAt: cur.submitLockAt }, { $set: { submitLockAt: now } }, { returnDocument: 'after' });
      if (!a) return finalize(attemptId, reason);
    }
    const paper = await loadPaper(db, a.paperId);
    const result = computeResult(paper, a);
    // Record when the attempt really ended: a timeout ends at expiry even if processed later.
    const endedAt = reason === 'timeout' ? new Date(Math.min(now.valueOf(), a.expiresAt.valueOf())) : now;
    const done = await attempts.findOneAndUpdate(
      { _id: a._id, status: 'submitting' },
      { $set: { status: 'submitted', submittedAt: now, endedAt, result }, $unset: { submitLockAt: '' } },
      { returnDocument: 'after' },
    );
    const final = done || (await attempts.findOne({ _id: a._id }));
    await db.collection('active_attempts').deleteOne({ _id: `${a.userId}:${a.mockTestId}` });
    await applyStats(final, paper, final.result);
    return final;
  }

  async function sweep() {
    const now = clock.now();
    const expired = await attempts.find({ status: 'in_progress', expiresAt: { $lt: new Date(now.valueOf() - config.saveGraceMs) } }, { projection: { _id: 1 } }).limit(200).toArray();
    const stuck = await attempts.find({ status: 'submitting', submitLockAt: { $lt: new Date(now.valueOf() - config.submitLockStaleMs) } }, { projection: { _id: 1 } }).limit(200).toArray();
    let n = 0;
    for (const { _id } of [...expired, ...stuck]) {
      try { await finalize(_id, 'timeout'); n++; } catch (e) { if (e.code !== 'SUBMIT_IN_PROGRESS') console.error('[sweep]', _id, e.message); }
    }
    // Section-timed attempts whose current section ended are advanced lazily on next access.
    return n;
  }

  return { advance, finalize, sweep };
}

// ------------------------------------------------------------------ views
function studentView(attempt, paper, extras) {
  const sequential = attempt.navigation === 'sequential';
  const langs = paper.config.languages;
  return {
    id: attempt._id, status: attempt.status, mockTestId: attempt.mockTestId, title: extras.title, examName: extras.examName,
    candidateName: extras.candidateName, serverNow: extras.now, startedAt: attempt.startedAt, expiresAt: attempt.expiresAt,
    navigation: attempt.navigation, sectionTimed: attempt.sectionTimed, currentSection: attempt.currentSection,
    allowEarlySectionExit: paper.config.navigation?.allowEarlySectionExit ?? !attempt.sectionTimed,
    calculator: paper.config.calculator || 'none', languages: langs, language: attempt.language,
    allowMarkForReview: paper.config.review?.allowMarkForReview !== false,
    sections: paper.sections.map((sec, si) => {
      const st = attempt.sections[si];
      const state = !sequential ? 'open' : si < attempt.currentSection ? 'closed' : si === attempt.currentSection ? 'open' : 'locked';
      return {
        key: sec.key, name: sec.name, durationSec: sec.durationSec, maxAttempted: sec.maxAttempted, instructions: sec.instructions,
        startedAt: st.startedAt ?? null, expiresAt: st.expiresAt ?? null, state,
        // Content of sections the candidate cannot open yet (or any more) is withheld.
        questions: sec.questions.map((q) => ({
          ref: q.ref, number: q.number, type: q.type,
          marks: { correct: q.marking.correct ?? q.maxMarks, incorrect: q.marking.incorrect ?? 0, maxMarks: q.maxMarks, partial: q.marking.partial?.perCorrectOption ?? null },
          ...(state === 'open' ? { content: pickContent(q.content, langs), media: q.media, wordLimit: q.answer?.wordLimit ?? null } : {}),
        })),
      };
    }),
    responses: Object.fromEntries(Object.entries(attempt.responses || {}).map(([ref, r]) => [ref, { answer: r.answer ?? null, marked: !!r.marked, visited: true, seq: r.seq || 0, timeSpentMs: r.timeSpentMs || 0 }])),
  };
}

function pickContent(content, langs) {
  // Strip anything that could reveal the answer: only stem, options, passage are sent.
  const out = {};
  for (const [lang, c] of Object.entries(content)) {
    if (!langs.includes(lang) && Object.keys(content).length > 1) continue;
    out[lang] = { stem: c.stem, passage: c.passage, options: c.options };
  }
  return out;
}

export function responseStatus(r) {
  if (!r) return 'not_visited';
  const answered = r.answer !== null && r.answer !== undefined && !(Array.isArray(r.answer) && !r.answer.length) && r.answer !== '';
  if (answered && r.marked) return 'answered_marked';
  if (answered) return 'answered';
  if (r.marked) return 'marked';
  return 'not_answered';
}

// ------------------------------------------------------------------ routes
export default function register(router, deps) {
  const { db, config, clock } = deps;
  const attempts = db.collection('attempts');
  const engine = createEngine(deps);
  deps.engine = engine;

  async function ownAttempt(ctx, { allowStaff = false } = {}) {
    const a = await attempts.findOne({ _id: ctx.params.id });
    if (!a) throw notFound('Attempt');
    if (a.userId !== ctx.user._id && !(allowStaff && can(ctx.user, 'student.performance.read'))) throw notFound('Attempt');
    return a;
  }

  router.post('/api/mock-tests/:id/attempts', { perm: 'test.take', status: 201 }, async (ctx) => {
    const now = clock.now();
    const t = await db.collection('mock_tests').findOne({ _id: ctx.params.id, status: 'published' });
    if (!t) throw notFound('Mock test');
    const lockId = `${ctx.user._id}:${t._id}`;
    for (let tries = 0; tries < 3; tries++) {
      const lock = await db.collection('active_attempts').findOne({ _id: lockId });
      if (lock) {
        const existing = await attempts.findOne({ _id: lock.attemptId });
        if (existing?.status === 'in_progress') {
          const paper = await loadPaper(db, existing.paperId);
          const fresh = await engine.advance(existing, paper);
          if (fresh.status === 'in_progress') return { attemptId: fresh._id, resumed: true };
        }
        await db.collection('active_attempts').deleteOne({ _id: lockId, attemptId: lock.attemptId });
        continue;
      }
      if (t.availableFrom && t.availableFrom > now) throw conflict('This test has not opened yet.');
      if (t.availableUntil && t.availableUntil <= now) throw conflict('This test has closed.');
      if (t.maxAttempts) {
        const used = await attempts.countDocuments({ userId: ctx.user._id, mockTestId: t._id });
        if (used >= t.maxAttempts) throw conflict(`You have used all ${t.maxAttempts} attempt(s) for this test.`);
      }
      const paper = await db.collection('papers').findOne({ mockTestId: t._id }, { projection: { _id: 1 } });
      const full = await loadPaper(db, paper._id);
      const sequential = full.config.navigation.mode === 'sequential';
      const sectionTimed = full.sections.every((s) => s.durationSec);
      const attemptId = newId('att');
      try {
        // The lock document makes "one open attempt per student per test" atomic.
        await db.collection('active_attempts').insertOne({ _id: lockId, attemptId, createdAt: now });
      } catch (e) {
        if (e.code === 11000) continue;
        throw e;
      }
      const lang = full.config.languages.includes(ctx.user.preferences?.language) ? ctx.user.preferences.language : full.config.languages[0];
      const doc = {
        _id: attemptId, userId: ctx.user._id, mockTestId: t._id, examId: t.examId, paperId: full._id,
        patternId: full.patternId, patternVersion: full.patternVersion, status: 'in_progress', rev: 0,
        startedAt: now, expiresAt: new Date(now.valueOf() + full.config.durationSec * 1000),
        navigation: sequential ? 'sequential' : 'free', sectionTimed, currentSection: 0, language: lang,
        sections: full.sections.map((s, i) => (
          !sequential || i === 0
            ? { key: s.key, startedAt: now, expiresAt: sectionTimed ? new Date(now.valueOf() + s.durationSec * 1000) : null }
            : { key: s.key, startedAt: null, expiresAt: null })),
        responses: {}, eventCounts: {}, events: [],
        client: { ip: ctx.ip, userAgent: (ctx.req.headers['user-agent'] || '').slice(0, 200) },
      };
      await attempts.insertOne(doc);
      return { attemptId, resumed: false };
    }
    throw conflict('Could not start the test. Please try again.');
  });

  router.get('/api/attempts', { perm: 'test.take' }, async (ctx) => {
    const list = await attempts.find({ userId: ctx.user._id }, { projection: { responses: 0, events: 0 } }).sort({ startedAt: -1 }).limit(100).toArray();
    const testIds = [...new Set(list.map((a) => a.mockTestId))];
    const tests = testIds.length ? await db.collection('mock_tests').find({ _id: { $in: testIds } }, { projection: { title: 1 } }).toArray() : [];
    const title = Object.fromEntries(tests.map((t) => [t._id, t.title]));
    return list.map((a) => ({
      id: a._id, mockTestId: a.mockTestId, title: title[a.mockTestId] || 'Mock test', status: a.status, startedAt: a.startedAt,
      submittedAt: a.submittedAt ?? null, submitReason: a.submitReason ?? null, patternVersion: a.patternVersion,
      score: a.result?.score ?? null, maxScore: a.result?.maxScore ?? null, accuracy: a.result?.accuracy ?? null, pending: a.result?.pending ?? 0,
    }));
  });

  router.get('/api/attempts/:id', { perm: 'test.take' }, async (ctx) => {
    let a = await ownAttempt(ctx);
    const paper = await loadPaper(db, a.paperId);
    if (a.status === 'in_progress') a = await engine.advance(a, paper);
    if (a.status !== 'in_progress') return { id: a._id, status: a.status, submitReason: a.submitReason ?? null };
    const t = await db.collection('mock_tests').findOne({ _id: a.mockTestId }, { projection: { title: 1, examId: 1 } });
    const exam = await db.collection('exams').findOne({ _id: t.examId }, { projection: { name: 1 } });
    return studentView(a, paper, { title: t.title, examName: exam?.name, candidateName: ctx.user.name, now: clock.now() });
  });

  router.put('/api/attempts/:id/responses/:ref', { perm: 'test.take', limit: 'autosave' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({
      answer: { type: 'any' }, marked: bool(), seq: num({ required: true, integer: true, min: 1 }),
      timeSpentMs: num({ integer: true, min: 0, max: 24 * 3600_000 }),
    }));
    const { ref } = ctx.params;
    for (let attemptNo = 0; attemptNo < 8; attemptNo++) {
      let a = await ownAttempt(ctx);
      const paper = await loadPaper(db, a.paperId);
      if (a.status === 'in_progress') a = await engine.advance(a, paper);
      if (a.status !== 'in_progress') throw closedError(a);
      const entry = paper.byRef.get(ref);
      if (!entry) throw notFound('Question');
      const { q, si } = entry;
      const now = clock.now();
      if (a.navigation === 'sequential' && si !== a.currentSection) {
        throw new HttpError(409, 'SECTION_LOCKED', si < a.currentSection ? 'That section is closed.' : 'That section has not started yet.');
      }
      const prev = a.responses?.[ref];
      if (prev && prev.seq >= b.seq) {
        // Replay or out-of-order retry: acknowledge without changing anything.
        return { ref, seq: prev.seq, status: responseStatus(prev), stale: true, serverNow: now };
      }
      const hasAnswer = Object.prototype.hasOwnProperty.call(b, 'answer');
      let answer = prev?.answer ?? null;
      if (hasAnswer) {
        const optionKeys = (Object.values(q.content)[0]?.options || []).map((o) => o.key);
        const problem = responseProblem(q.type, b.answer, optionKeys);
        if (problem) throw unprocessable(problem, [{ field: 'answer', message: problem }]);
        answer = normalizeResponse(q.type, b.answer);
      }
      const sec = paper.sections[si];
      if (sec.maxAttempted && answer !== null && isEmptyResponse(q.type, prev?.answer ?? null)) {
        const answered = sec.questions.filter((x) => x.ref !== ref && !isEmptyResponse(x.type, a.responses?.[x.ref]?.answer ?? null)).length;
        if (answered >= sec.maxAttempted) {
          throw new HttpError(422, 'SECTION_LIMIT', `You can answer at most ${sec.maxAttempted} questions in ${sec.name}. Clear another response first.`);
        }
      }
      const next = {
        answer, marked: b.marked ?? prev?.marked ?? false, seq: b.seq,
        timeSpentMs: Math.min(b.timeSpentMs ?? prev?.timeSpentMs ?? 0, a.expiresAt.valueOf() - a.startedAt.valueOf()),
        updatedAt: now,
      };
      const res = await attempts.updateOne({ _id: a._id, status: 'in_progress', rev: a.rev }, { $set: { [`responses.${ref}`]: next }, $inc: { rev: 1 } });
      if (res.matchedCount === 1) return { ref, seq: next.seq, status: responseStatus(next), stale: false, serverNow: now };
      // Another write landed first; reload and re-check against the latest state.
    }
    throw new HttpError(409, 'BUSY', 'Too many simultaneous updates. Please retry.');
  });

  router.post('/api/attempts/:id/sections/next', { perm: 'test.take' }, async (ctx) => {
    let a = await ownAttempt(ctx);
    const paper = await loadPaper(db, a.paperId);
    if (a.status === 'in_progress') a = await engine.advance(a, paper);
    if (a.status !== 'in_progress') throw closedError(a);
    if (a.navigation !== 'sequential') throw conflict('Sections can be switched freely in this test.');
    if (ctx.body.fromSection !== a.currentSection) throw new HttpError(409, 'SECTION_CHANGED', 'The section already changed. Reloading.');
    const allowEarly = paper.config.navigation?.allowEarlySectionExit ?? !a.sectionTimed;
    if (!allowEarly) throw conflict('You must stay in this section until its time is up.');
    const nextIdx = a.currentSection + 1;
    if (nextIdx >= paper.sections.length) throw conflict('This is the last section. Submit the test to finish.');
    const now = clock.now();
    const $set = { currentSection: nextIdx, [`sections.${a.currentSection}.closedAt`]: now, [`sections.${nextIdx}.startedAt`]: now };
    if (a.sectionTimed) {
      $set[`sections.${nextIdx}.expiresAt`] = new Date(now.valueOf() + paper.sections[nextIdx].durationSec * 1000);
      const remaining = paper.sections.slice(nextIdx).reduce((s, x) => s + x.durationSec, 0);
      $set.expiresAt = new Date(now.valueOf() + remaining * 1000);
    }
    const updated = await attempts.findOneAndUpdate({ _id: a._id, status: 'in_progress', currentSection: a.currentSection }, { $set, $inc: { rev: 1 } }, { returnDocument: 'after' });
    if (!updated) throw new HttpError(409, 'SECTION_CHANGED', 'The section already changed. Reloading.');
    return { currentSection: updated.currentSection };
  });

  router.post('/api/attempts/:id/language', { perm: 'test.take' }, async (ctx) => {
    const a = await ownAttempt(ctx);
    const paper = await loadPaper(db, a.paperId);
    if (!paper.config.languages.includes(ctx.body.language)) throw unprocessable('Language not available for this test.');
    await attempts.updateOne({ _id: a._id, status: 'in_progress' }, { $set: { language: ctx.body.language } });
    return { language: ctx.body.language };
  });

  router.post('/api/attempts/:id/events', { perm: 'test.take', limit: 'autosave' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ type: str({ required: true, enum: ['fullscreen_exit', 'tab_hidden', 'offline', 'online', 'copy_attempt'] }) }));
    const a = await ownAttempt(ctx);
    if (a.status !== 'in_progress') return { ok: true };
    await attempts.updateOne({ _id: a._id }, { $push: { events: { $each: [{ type: b.type, at: clock.now() }], $slice: -200 } }, $inc: { [`eventCounts.${b.type}`]: 1 } });
    return { ok: true };
  });

  router.post('/api/attempts/:id/submit', { perm: 'test.take' }, async (ctx) => {
    const a = await ownAttempt(ctx);
    const late = clock.now().valueOf() > a.expiresAt.valueOf();
    const final = a.status === 'submitted' ? a : await engine.finalize(a._id, late ? 'timeout' : 'user');
    return { id: final._id, status: final.status, submittedAt: final.submittedAt, submitReason: final.submitReason, score: final.result.score, maxScore: final.result.maxScore };
  });

  router.get('/api/attempts/:id/result', { perm: ['test.take', 'student.performance.read'] }, async (ctx) => {
    let a = await ownAttempt(ctx, { allowStaff: true });
    if (a.status === 'in_progress') {
      const paper = await loadPaper(db, a.paperId);
      a = await engine.advance(a, paper);
    }
    if (a.status !== 'submitted') throw conflict('Results are available after the test is submitted.');
    const paper = await loadPaper(db, a.paperId);
    const t = await db.collection('mock_tests').findOne({ _id: a.mockTestId }, { projection: { title: 1, examId: 1 } });
    const [better, total, notBetter] = await Promise.all([
      attempts.countDocuments({ mockTestId: a.mockTestId, status: 'submitted', 'result.score': { $gt: a.result.score } }),
      attempts.countDocuments({ mockTestId: a.mockTestId, status: 'submitted' }),
      attempts.countDocuments({ mockTestId: a.mockTestId, status: 'submitted', 'result.score': { $lte: a.result.score } }),
    ]);
    const subjectIds = [...new Set(paper.sections.flatMap((s) => s.questions.map((q) => q.subjectId)))];
    const subjects = await db.collection('syllabus').find({ _id: { $in: subjectIds } }, { projection: { name: 1 } }).toArray();
    const subjectName = Object.fromEntries(subjects.map((s) => [s._id, s.name]));
    const showSolutions = (paper.config.result?.showSolutions ?? 'after_submit') === 'after_submit';
    const outcome = Object.fromEntries(a.result.perQuestion.map((p) => [p.ref, p]));
    const bookmarks = await db.collection('bookmarks').find({ userId: a.userId }, { projection: { questionId: 1 } }).toArray();
    const marked = new Set(bookmarks.map((b) => b.questionId));
    return {
      id: a._id, title: t?.title, status: a.status, startedAt: a.startedAt, submittedAt: a.submittedAt, endedAt: a.endedAt,
      submitReason: a.submitReason, patternVersion: a.patternVersion, receipt: { attemptId: a._id, submittedAt: a.submittedAt },
      result: { ...a.result, perQuestion: undefined, bySubject: a.result.bySubject.map((s) => ({ ...s, name: subjectName[s.subjectId] || 'Subject' })) },
      rank: { rank: better + 1, total, percentile: total ? round2((notBetter / total) * 100) : null },
      showSolutions,
      sections: paper.sections.map((sec) => ({
        key: sec.key, name: sec.name,
        questions: sec.questions.map((q) => {
          const r = a.responses?.[q.ref] || {};
          return {
            ref: q.ref, number: q.number, type: q.type, questionId: q.questionId, subject: subjectName[q.subjectId],
            content: showSolutions ? q.content : pickContent(q.content, paper.config.languages), media: q.media,
            response: r.answer ?? null, marked: !!r.marked, timeSpentMs: r.timeSpentMs || 0,
            outcome: outcome[q.ref]?.outcome, marks: outcome[q.ref]?.marks, maxMarks: q.maxMarks,
            answer: showSolutions ? q.answer : undefined, evaluation: a.evaluations?.[q.ref] ?? null, bookmarked: marked.has(q.questionId),
          };
        }),
      })),
    };
  });

  // ---------- descriptive answer evaluation (mentors) ----------
  router.get('/api/mentor/evaluations', { perm: 'evaluation.descriptive' }, async () => {
    const list = await attempts.find({ status: 'submitted', 'result.pending': { $gt: 0 } }, { projection: { userId: 1, mockTestId: 1, submittedAt: 1, result: 1 } }).sort({ submittedAt: 1 }).limit(100).toArray();
    const users = await db.collection('users').find({ _id: { $in: list.map((a) => a.userId) } }, { projection: { name: 1 } }).toArray();
    const tests = await db.collection('mock_tests').find({ _id: { $in: list.map((a) => a.mockTestId) } }, { projection: { title: 1 } }).toArray();
    const un = Object.fromEntries(users.map((u) => [u._id, u.name]));
    const tn = Object.fromEntries(tests.map((t) => [t._id, t.title]));
    return list.map((a) => ({ attemptId: a._id, student: un[a.userId], test: tn[a.mockTestId], submittedAt: a.submittedAt, pending: a.result.pending }));
  });

  router.post('/api/attempts/:id/evaluations/:ref', { perm: 'evaluation.descriptive' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ marks: num({ required: true, min: 0 }), feedback: str({ max: 8000 }) }));
    for (let i = 0; i < 8; i++) {
      const a = await attempts.findOne({ _id: ctx.params.id });
      if (!a) throw notFound('Attempt');
      if (a.status !== 'submitted') throw conflict('Only submitted attempts can be evaluated.');
      if (a.userId === ctx.user._id) throw forbidden('You cannot evaluate your own answers.');
      const paper = await loadPaper(db, a.paperId);
      const entry = paper.byRef.get(ctx.params.ref);
      if (!entry || entry.q.type !== 'descriptive') throw notFound('Descriptive question');
      if (b.marks > entry.q.maxMarks) throw unprocessable(`Marks cannot exceed ${entry.q.maxMarks}.`);
      const evaluations = { ...(a.evaluations || {}), [ctx.params.ref]: { marks: b.marks, feedback: b.feedback || '', by: ctx.user._id, at: clock.now() } };
      const result = computeResult(paper, { ...a, evaluations });
      const res = await attempts.updateOne({ _id: a._id, rev: a.rev }, { $set: { evaluations, result }, $inc: { rev: 1 } });
      if (res.matchedCount) return { result: { score: result.score, pending: result.pending } };
    }
    throw new HttpError(409, 'BUSY', 'Too many simultaneous updates. Please retry.');
  });
}
