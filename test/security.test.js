import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './support/harness.js';

let app;
let student, editor, reviewer, admin;

before(async () => {
  app = await startServer();
  [student, editor, reviewer, admin] = await Promise.all(['student', 'editor', 'reviewer', 'admin'].map((r) => app.login(r)));
});
after(() => app.stop());

async function topicPath() {
  const subjects = (await editor.get(`/api/syllabus/nodes?examId=${app.seeded.examIds['ssc-cgl']}`)).body.data;
  const subject = subjects.find((s) => s.name === 'General Studies');
  const chapter = (await editor.get(`/api/syllabus/nodes?parentId=${subject.id}`)).body.data[0];
  const topic = (await editor.get(`/api/syllabus/nodes?parentId=${chapter.id}`)).body.data[0];
  return { subjectId: subject.id, chapterId: chapter.id, topicId: topic.id };
}

const sampleQuestion = (path, stem = 'Which Schedule of the Constitution lists the languages of India?') => ({
  type: 'mcq_single', difficulty: 'medium', ...path, source: { kind: 'original' },
  content: { en: { stem, options: [{ key: 'A', text: 'Seventh' }, { key: 'B', text: 'Eighth' }, { key: 'C', text: 'Ninth' }, { key: 'D', text: 'Tenth' }], explanation: 'The Eighth Schedule.' } },
  answer: { correct: 'B' },
});

test('unauthenticated and cross-site requests are rejected', async () => {
  const anon = app.client();
  assert.equal((await anon.get('/api/me')).status, 401);
  assert.equal((await anon.get('/api/exams')).status, 200); // public catalogue
  const noCsrf = await student.post('/api/me/password', { currentPassword: 'x', newPassword: 'y' }, { csrf: false });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.body.error.code, 'CSRF');
});

test('login does not reveal which emails exist and failures are rate limited', async () => {
  const c = app.client();
  const a = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' });
  const b = await c.post('/api/auth/login', { email: 'student@examprep.local', password: 'wrongpass1' });
  assert.equal(a.status, 401);
  assert.equal(a.body.error.message, b.body.error.message);
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) limited = (await c.post('/api/auth/login', { email: 'x@example.com', password: 'nope12345' })).status === 429;
  assert.ok(limited);
});

test('permissions are enforced by the server for every role', async () => {
  const path = await topicPath();
  assert.equal((await student.post('/api/questions', sampleQuestion(path))).status, 403);
  assert.equal((await student.get('/api/questions')).status, 403);
  assert.equal((await student.get('/api/admin/users')).status, 403);
  assert.equal((await editor.get('/api/admin/users')).status, 403);
  assert.equal((await editor.post(`/api/admin/exams/${app.seeded.examIds['jee-main']}/patterns`, { stageKey: 'paper1', label: 'x', config: {} })).status, 403);
  assert.equal((await reviewer.post('/api/questions', sampleQuestion(path))).status, 403);
  assert.equal((await editor.get('/api/review/queue')).status, 403);
  assert.equal((await student.get('/api/admin/mock-tests')).status, 403);
});

test('question workflow: editor drafts → submits → reviewer approves; no self-approval', async () => {
  const path = await topicPath();
  const created = await editor.post('/api/questions', sampleQuestion(path));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const q = created.body.data.question;
  assert.equal(q.status, 'draft');

  // Reviewers cannot approve drafts that were never submitted.
  assert.equal((await reviewer.post(`/api/questions/${q.id}/review`, { decision: 'approve', version: q.version })).status, 409);
  assert.equal((await editor.post(`/api/questions/${q.id}/submit`)).status, 200);
  assert.equal((await editor.post(`/api/questions/${q.id}/review`, { decision: 'approve', version: 1 })).status, 403);

  const rejected = await reviewer.post(`/api/questions/${q.id}/review`, { decision: 'reject', version: 1 });
  assert.equal(rejected.status, 422, 'rejection needs notes');
  const rej = await reviewer.post(`/api/questions/${q.id}/review`, { decision: 'reject', version: 1, notes: 'Add the Article number.' });
  assert.equal(rej.body.data.question.status, 'rejected');

  const edited = await editor.put(`/api/questions/${q.id}`, { content: { en: { ...sampleQuestion(path).content.en, explanation: 'Article 344 and 351; the Eighth Schedule lists 22 languages.' } } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.data.question.status, 'draft');
  assert.equal(edited.body.data.question.version, 2);
  await editor.post(`/api/questions/${q.id}/submit`);
  // Stale version is refused.
  assert.equal((await reviewer.post(`/api/questions/${q.id}/review`, { decision: 'approve', version: 1 })).status, 409);
  const ok = await reviewer.post(`/api/questions/${q.id}/review`, { decision: 'approve', version: 2 });
  assert.equal(ok.body.data.question.status, 'approved');

  // Editors cannot change approved questions; an admin's edit sends it back to review.
  assert.equal((await editor.put(`/api/questions/${q.id}`, { difficulty: 'hard' })).status, 409);
  const adminEdit = await admin.put(`/api/questions/${q.id}`, { difficulty: 'hard' });
  assert.equal(adminEdit.body.data.question.status, 'in_review');
  // ...and the admin who edited it cannot approve it.
  assert.equal((await admin.post(`/api/questions/${q.id}/review`, { decision: 'approve', version: 3 })).status, 403);

  // Another editor's question cannot be edited.
  const other = await admin.post('/api/questions', sampleQuestion(path, 'Which Article deals with the Finance Commission of India?'));
  assert.equal((await editor.put(`/api/questions/${other.body.data.question.id}`, { difficulty: 'easy' })).status, 403);
});

test('duplicate and invalid questions are caught', async () => {
  const path = await topicPath();
  const stem = 'Which Schedule of the Constitution contains provisions on anti-defection?';
  const first = await editor.post('/api/questions', sampleQuestion(path, stem));
  assert.equal(first.status, 201);
  const dup = await editor.post('/api/questions', sampleQuestion(path, stem.toUpperCase() + '  '));
  assert.equal(dup.status, 409);
  const bad = sampleQuestion(path, 'Broken question');
  bad.answer.correct = 'E';
  bad.topicId = path.subjectId;
  const r = await editor.post('/api/questions', bad);
  assert.equal(r.status, 422);
  const fields = r.body.error.details.map((d) => d.field);
  assert.ok(fields.includes('answer.correct'));
  assert.ok(fields.includes('topicId'));
  const pyq = { ...sampleQuestion(path, 'A PYQ without a year'), source: { kind: 'pyq' } };
  const p = await editor.post('/api/questions', pyq);
  assert.ok(p.body.error.details.some((d) => d.field === 'source.year'));
});

test('bulk import reports per-row results', async () => {
  const path = await topicPath();
  const r = await editor.post('/api/questions/import', { questions: [
    sampleQuestion(path, 'Imported question about the Ninth Schedule and land reforms?'),
    { type: 'mcq_single' },
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.created, 1);
  assert.equal(r.body.data.failed, 1);
  assert.equal(r.body.data.results[1].ok, false);
});

test('admin actions are audited and admins cannot lock themselves out', async () => {
  const users = (await admin.get('/api/admin/users?role=student')).body.data.items;
  const target = users[0];
  const s = await admin.patch(`/api/admin/users/${target.id}`, { status: 'suspended' });
  assert.equal(s.body.data.status, 'suspended');
  // The suspended student's session stops working immediately.
  assert.equal((await student.get('/api/me')).status, 401);
  await admin.patch(`/api/admin/users/${target.id}`, { status: 'active' });
  assert.equal((await admin.patch(`/api/admin/users/${admin.user.id}`, { role: 'student' })).status, 403);
  const log = (await admin.get('/api/admin/audit?action=user.update')).body.data.items;
  assert.ok(log.length >= 2);
  assert.ok(log[0].actor.includes('admin@examprep.local'));
});
