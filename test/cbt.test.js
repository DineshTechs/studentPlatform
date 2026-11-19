import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, answerKeyFor, correctResponse, wrongResponse } from './support/harness.js';

let app;
let student;
let admin;
let examIds;

before(async () => {
  app = await startServer();
  examIds = app.seeded.examIds;
  student = await app.login('student');
  admin = await app.login('admin');
});
after(() => app.stop());

async function testId(examSlug, titlePart) {
  const r = await student.get(`/api/mock-tests?examId=${examIds[examSlug]}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const t = r.body.data.items.find((x) => x.title.includes(titlePart));
  assert.ok(t, `mock test ${titlePart} not found`);
  return t.id;
}

async function start(examSlug, titlePart, who = student) {
  const id = await testId(examSlug, titlePart);
  const r = await who.post(`/api/mock-tests/${id}/attempts`);
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  return r.body.data.attemptId;
}

test('an open attempt never exposes answer keys or explanations', async () => {
  const attemptId = await start('jee-main', 'Mini Mock');
  const r = await student.get(`/api/attempts/${attemptId}`);
  assert.equal(r.status, 200);
  const text = r.text;
  assert.ok(!/"answer":\{/.test(text), 'answer key object leaked');
  assert.ok(!text.includes('"explanation"'), 'explanation leaked');
  assert.ok(!text.includes('"correct":"'), 'correct option leaked');
  const v = r.body.data;
  assert.equal(v.sections.length, 3);
  assert.equal(v.sections.flatMap((s) => s.questions).length, 15);
  assert.ok(new Date(v.expiresAt) > new Date(v.serverNow));
  // Starting again resumes the same attempt instead of creating a second one.
  const again = await student.post(`/api/mock-tests/${v.mockTestId}/attempts`);
  assert.equal(again.body.data.attemptId, attemptId);
  assert.equal(again.body.data.resumed, true);
  await student.post(`/api/attempts/${attemptId}/submit`);
});

test('autosave validates input, ignores stale sequence numbers and survives reloads', async () => {
  const attemptId = await start('ssc-cgl', 'Mini Mock');
  const keys = await answerKeyFor(app.db, attemptId);
  const ref = Object.keys(keys)[0];
  const bad = await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: 'Z', seq: 1 });
  assert.equal(bad.status, 422);
  const s2 = await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: 'A', seq: 2, timeSpentMs: 4000 });
  assert.equal(s2.body.data.status, 'answered');
  const s3 = await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: 'B', marked: true, seq: 3 });
  assert.equal(s3.body.data.status, 'answered_marked');
  // A delayed retry of seq 2 arrives late: it must not overwrite seq 3.
  const late = await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: 'A', seq: 2 });
  assert.equal(late.body.data.stale, true);
  const state = await student.get(`/api/attempts/${attemptId}`);
  assert.deepEqual(state.body.data.responses[ref], { answer: 'B', marked: true, visited: true, seq: 3, timeSpentMs: 4000 });
  // Clearing keeps the review mark.
  const cleared = await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: null, seq: 4 });
  assert.equal(cleared.body.data.status, 'marked');
  await student.post(`/api/attempts/${attemptId}/submit`);
});

test('scoring end to end, idempotent concurrent submission, stats counted once', async () => {
  const attemptId = await start('upsc-cse-prelims', 'Mini Mock');
  const keys = await answerKeyFor(app.db, attemptId);
  const refs = Object.keys(keys);
  // 6 correct, 2 wrong, 2 unattempted → 6×2 − 2×0.66 = 10.68
  let seq = 1;
  for (const [i, ref] of refs.entries()) {
    if (i >= 8) break;
    const answer = i < 6 ? correctResponse(keys[ref]) : wrongResponse(keys[ref]);
    const r = await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer, seq: seq++ });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const results = await Promise.all(Array.from({ length: 6 }, () => student.post(`/api/attempts/${attemptId}/submit`)));
  const ok = results.filter((r) => r.status === 200);
  assert.ok(ok.length >= 1);
  for (const r of results) assert.ok([200, 409].includes(r.status), JSON.stringify(r.body));
  for (const r of ok) assert.equal(r.body.data.score, 10.68);
  const again = await student.post(`/api/attempts/${attemptId}/submit`);
  assert.equal(again.body.data.score, 10.68);

  const res = await student.get(`/api/attempts/${attemptId}/result`);
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.result.correct, 6);
  assert.equal(d.result.incorrect, 2);
  assert.equal(d.result.unattempted, 2);
  assert.equal(d.result.maxScore, 20);
  assert.equal(d.rank.total, 1);
  assert.ok(d.sections[0].questions[0].answer, 'solutions are shown after submission');

  const stats = await app.db.collection('user_topic_stats').find({ userId: student.user.id }).toArray();
  const attempted = stats.reduce((a, s) => a + s.attempted, 0);
  assert.equal(attempted, 8, 'topic stats applied exactly once');

  // Saving after submission is refused.
  const late = await student.put(`/api/attempts/${attemptId}/responses/${refs[9]}`, { answer: 'A', seq: 99 });
  assert.equal(late.status, 409);
  assert.equal(late.body.error.code, 'ATTEMPT_CLOSED');
});

test('another student cannot read someone else\'s attempt', async () => {
  const attemptId = await start('neet-ug', 'Mini Mock');
  const other = app.client();
  const reg = await other.post('/api/auth/register', { name: 'Other Student', email: 'other@example.com', password: 'Passw0rdX' });
  assert.equal(reg.status, 201);
  assert.equal((await other.get(`/api/attempts/${attemptId}`)).status, 404);
  assert.equal((await other.put(`/api/attempts/${attemptId}/responses/q1`, { answer: 'A', seq: 1 })).status, 404);
  await student.post(`/api/attempts/${attemptId}/submit`);
  assert.equal((await other.get(`/api/attempts/${attemptId}/result`)).status, 404);
});

test('the server clock decides: saves after expiry are refused and the attempt auto-submits', async () => {
  const attemptId = await start('jee-main', 'Mini Mock');
  const keys = await answerKeyFor(app.db, attemptId);
  const ref = Object.keys(keys)[0];
  assert.equal((await student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: correctResponse(keys[ref]), seq: 1 })).status, 200);
  app.clock.advance(36 * 60 * 1000 + 1000); // within the grace window: an in-flight save still lands
  assert.equal((await student.put(`/api/attempts/${attemptId}/responses/${Object.keys(keys)[1]}`, { answer: correctResponse(keys[Object.keys(keys)[1]]), seq: 1 })).status, 200);
  app.clock.advance(5000); // past grace
  const r = await student.put(`/api/attempts/${attemptId}/responses/${Object.keys(keys)[2]}`, { answer: 'A', seq: 1 });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'ATTEMPT_CLOSED');
  const doc = await app.db.collection('attempts').findOne({ _id: attemptId });
  assert.equal(doc.status, 'submitted');
  assert.equal(doc.submitReason, 'timeout');
  assert.equal(doc.result.score, 8);
  assert.ok(doc.endedAt <= doc.expiresAt);
});

test('the background sweeper finalises abandoned attempts', async () => {
  const attemptId = await start('neet-ug', 'Mini Mock');
  app.clock.advance(31 * 60 * 1000);
  const { createEngine } = await import('../server/modules/attempts.js');
  const n = await createEngine({ db: app.db, config: app.config, clock: app.clock }).sweep();
  assert.ok(n >= 1);
  assert.equal((await app.db.collection('attempts').findOne({ _id: attemptId })).status, 'submitted');
});

test('sectional timing locks sections and advances on the server clock', async () => {
  const attemptId = await start('ssc-cgl', 'Sectional-timed');
  const keys = await answerKeyFor(app.db, attemptId);
  const bySection = {};
  for (const [ref, k] of Object.entries(keys)) (bySection[k.section] ||= []).push(ref);
  const [first, second] = Object.keys(bySection);

  let v = (await student.get(`/api/attempts/${attemptId}`)).body.data;
  assert.equal(v.currentSection, 0);
  assert.equal(v.sections[1].state, 'locked');
  assert.equal(v.sections[1].questions[0].content, undefined, 'locked section content is withheld');

  const early = await student.put(`/api/attempts/${attemptId}/responses/${bySection[second][0]}`, { answer: 'A', seq: 1 });
  assert.equal(early.body.error.code, 'SECTION_LOCKED');
  assert.equal((await student.put(`/api/attempts/${attemptId}/responses/${bySection[first][0]}`, { answer: 'A', seq: 1 })).status, 200);

  app.clock.advance(180_000 + 4000); // first section's 3 minutes (+grace) are over
  v = (await student.get(`/api/attempts/${attemptId}`)).body.data;
  assert.equal(v.currentSection, 1);
  assert.equal(v.sections[0].state, 'closed');
  const back = await student.put(`/api/attempts/${attemptId}/responses/${bySection[first][1]}`, { answer: 'A', seq: 1 });
  assert.equal(back.body.error.code, 'SECTION_LOCKED');
  // The second section started when the first one ended, not when the student came back.
  assert.equal(new Date(v.sections[1].startedAt).valueOf(), new Date(v.sections[0].expiresAt).valueOf());

  // This pattern allows leaving a section early.
  const next = await student.post(`/api/attempts/${attemptId}/sections/next`, { fromSection: 1 });
  assert.equal(next.body.data.currentSection, 2);
  const replay = await student.post(`/api/attempts/${attemptId}/sections/next`, { fromSection: 1 });
  assert.equal(replay.status, 409);
  await student.post(`/api/attempts/${attemptId}/submit`);
});

test('"answer any N" limits hold even under parallel requests', async () => {
  // Admin builds a pattern with an attempt limit, a mock test from it, and publishes it.
  const exam = examIds['ssc-cgl'];
  const subjects = (await admin.get(`/api/syllabus/nodes?examId=${exam}`)).body.data;
  const quant = subjects.find((s) => s.name === 'Quantitative Aptitude').id;
  const config = {
    durationSec: 600, languages: ['en'], navigation: { mode: 'free' },
    marking: { mcq_single: { correct: 1, incorrect: 0 } },
    sections: [{ key: 'q', name: 'Quant', maxAttempted: 2, selection: { subjectIds: [quant] }, composition: [{ type: 'mcq_single', count: 4 }] }],
  };
  const pv = await admin.post('/api/admin/patterns/validate', { examId: exam, config });
  assert.equal(pv.body.data.valid, true, JSON.stringify(pv.body));
  assert.equal(pv.body.data.summary.totalMarks, 2);
  const p = await admin.post(`/api/admin/exams/${exam}/patterns`, { stageKey: 'practice', label: 'Attempt-any-2 drill', config });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal((await admin.post(`/api/admin/patterns/${p.body.data.id}/publish`)).status, 200);
  // Published versions are immutable.
  assert.equal((await admin.put(`/api/admin/patterns/${p.body.data.id}`, { label: 'changed' })).status, 409);
  const mt = await admin.post('/api/admin/mock-tests', { examId: exam, patternId: p.body.data.id, title: 'Attempt any two', maxAttempts: 1 });
  assert.equal(mt.status, 201, JSON.stringify(mt.body));
  const gen = await admin.post(`/api/admin/mock-tests/${mt.body.data.id}/generate`, {});
  assert.equal(gen.status, 200, JSON.stringify(gen.body));
  assert.equal((await admin.post(`/api/admin/mock-tests/${mt.body.data.id}/publish`)).status, 200);

  const r = await student.post(`/api/mock-tests/${mt.body.data.id}/attempts`);
  const attemptId = r.body.data.attemptId;
  const refs = Object.keys(await answerKeyFor(app.db, attemptId));
  const saves = await Promise.all(refs.map((ref) => student.put(`/api/attempts/${attemptId}/responses/${ref}`, { answer: 'A', seq: 1 })));
  assert.equal(saves.filter((s) => s.status === 200).length, 2);
  assert.ok(saves.filter((s) => s.status !== 200).every((s) => s.body.error.code === 'SECTION_LIMIT'));
  await student.post(`/api/attempts/${attemptId}/submit`);
  // maxAttempts = 1
  const second = await student.post(`/api/mock-tests/${mt.body.data.id}/attempts`);
  assert.equal(second.status, 409);
});

test('descriptive answers are evaluated by a mentor and the score updates', async () => {
  const attemptId = await start('upsc-cse-mains', 'Answer-writing');
  const refs = Object.keys(await answerKeyFor(app.db, attemptId));
  await student.put(`/api/attempts/${attemptId}/responses/${refs[0]}`, { answer: 'The basic structure doctrine…', seq: 1 });
  await student.post(`/api/attempts/${attemptId}/submit`);
  let res = (await student.get(`/api/attempts/${attemptId}/result`)).body.data;
  assert.equal(res.result.pending, 1);
  assert.equal(res.result.unattempted, 1);

  assert.equal((await student.post(`/api/attempts/${attemptId}/evaluations/${refs[0]}`, { marks: 10 })).status, 403);
  const mentor = await app.login('mentor');
  const queue = (await mentor.get('/api/mentor/evaluations')).body.data;
  assert.ok(queue.some((q) => q.attemptId === attemptId));
  assert.equal((await mentor.post(`/api/attempts/${attemptId}/evaluations/${refs[0]}`, { marks: 11 })).status, 422);
  const ev = await mentor.post(`/api/attempts/${attemptId}/evaluations/${refs[0]}`, { marks: 6.5, feedback: 'Add a recent judgment.' });
  assert.equal(ev.status, 200, JSON.stringify(ev.body));
  res = (await student.get(`/api/attempts/${attemptId}/result`)).body.data;
  assert.equal(res.result.score, 6.5);
  assert.equal(res.result.pending, 0);
});

test('dashboard reflects attempts and practice', async () => {
  const qs = await student.get(`/api/practice/questions?examId=${examIds['ssc-cgl']}&limit=3`);
  assert.equal(qs.status, 200);
  const q = qs.body.data.items[0];
  assert.equal(q.answer, undefined);
  const ans = await student.post('/api/practice/answer', { questionId: q.id, answer: 'A' });
  assert.equal(ans.status, 200);
  assert.ok(ans.body.data.answer, 'the key is revealed after answering in practice');
  const d = await student.get(`/api/dashboard?examId=${examIds['ssc-cgl']}`);
  assert.equal(d.status, 200);
  assert.ok(d.body.data.stats.questionsAttempted >= 1);
  assert.ok(d.body.data.stats.streak >= 1);
  assert.ok(d.body.data.upcomingTests.length >= 1);
});
