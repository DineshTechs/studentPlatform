import { html, mount, $, $$, raw, toast, errorBox, modal, confirmDialog, formData, statusBadge, fmtDate, fmtDuration, num, TYPE_LABEL } from '../ui.js';
import { get, post, patch, put, del, qs } from '../api.js';
import { can, navigate, state } from '../app.js';
import { typeset, pickLang } from '../render.js';
import { questionReview } from './result.js';

export async function overview({ root }) {
  const o = await get('/api/admin/overview');
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Platform overview</h1><p>Content pipeline and usage at a glance.</p></div></div>
    <div class="grid g4">
      <div class="stat"><div class="k">Students</div><div class="v">${num(o.students, 0)}</div><div class="s">${o.staff} staff accounts</div></div>
      <div class="stat"><div class="k">Approved questions</div><div class="v">${num(o.approved, 0)}</div><div class="s">${o.questions} in the bank</div></div>
      <div class="stat"><div class="k">Awaiting review</div><div class="v">${num(o.inReview, 0)}</div><div class="s"><a href="#/admin/review">Open queue</a></div></div>
      <div class="stat"><div class="k">Attempts</div><div class="v">${num(o.submittedAttempts, 0)}</div><div class="s">${o.attempts - o.submittedAttempts} in progress · ${o.publishedTests} published tests</div></div>
    </div>
    <div class="quick mt">
      <a href="#/admin/exams">Exams &amp; patterns<small>Configure versions</small></a>
      <a href="#/admin/questions">Question bank<small>Write &amp; import</small></a>
      <a href="#/admin/tests">Mock tests<small>Build &amp; publish</small></a>
      <a href="#/admin/users">Users<small>Roles &amp; access</small></a>
      <a href="#/admin/announcements">Announcements<small>Dashboard notices</small></a>
      <a href="#/admin/audit">Audit log<small>Who changed what</small></a>
    </div>`);
}

// ------------------------------------------------------------------ mock tests
export async function testList({ root, query }) {
  const exams = await get('/api/admin/exams');
  const examId = query.get('examId') || '';
  const list = await get(`/api/admin/mock-tests${qs({ examId })}`);
  const examName = Object.fromEntries(exams.map((e) => [e.id, e.name]));
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Mock tests</h1><p>Build a paper from a published pattern version, review it, then publish. Published papers are frozen snapshots.</p></div>
      <button class="btn primary" id="new">New mock test</button></div>
    <div class="card"><label class="field" style="max-width:320px"><span>Examination</span><select class="input" id="exam-filter"><option value="">All</option>${exams.map((e) => html`<option value="${e.id}" ${e.id === examId ? 'selected' : ''}>${e.name}</option>`)}</select></label></div>
    <div class="card mt"><div class="table-wrap"><table class="table"><thead><tr><th>Title</th><th>Examination</th><th>Kind</th><th class="num">Questions</th><th>Status</th><th>Created</th></tr></thead><tbody>
      ${list.map((t) => html`<tr><td><a href="#/admin/tests/${t.id}"><b>${t.title}</b></a><div class="tiny muted">pattern v${t.patternVersion}</div></td><td>${examName[t.examId]}</td><td>${t.kind}</td><td class="num">${t.questionCount}</td><td>${statusBadge(t.status)}</td><td class="small">${fmtDate(t.createdAt, false)}</td></tr>`)}
    </tbody></table></div>${list.length ? '' : html`<p class="empty">No mock tests yet.</p>`}</div>`);
  $('#exam-filter', root).addEventListener('change', (e) => navigate(`#/admin/tests${qs({ examId: e.target.value })}`));
  $('#new', root).addEventListener('click', async () => {
    const body = document.createElement('form');
    const drawForm = async (exId) => {
      const patterns = exId ? (await get(`/api/admin/exams/${exId}/patterns`)).filter((p) => p.status === 'published') : [];
      mount(body, html`<div id="err"></div><div class="form-grid">
        <label class="field"><span>Examination</span><select class="input" name="examId"><option value="">Choose…</option>${exams.map((e) => html`<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${e.name}</option>`)}</select></label>
        <label class="field"><span>Pattern version</span><select class="input" name="patternId" ${patterns.length ? '' : 'disabled'}>${patterns.map((p) => html`<option value="${p.id}">v${p.version} — ${p.label}</option>`)}</select></label>
        <label class="field"><span>Title</span><input class="input" name="title" required></label>
        <label class="field"><span>Kind</span><select class="input" name="kind"><option value="full">Full mock</option><option value="sectional">Sectional</option><option value="practice">Practice</option></select></label>
        <label class="field"><span>Opens (optional)</span><input class="input" type="datetime-local" name="availableFrom"></label>
        <label class="field"><span>Closes (optional)</span><input class="input" type="datetime-local" name="availableUntil"></label>
        <label class="field"><span>Max attempts per student</span><input class="input" type="number" min="1" name="maxAttempts" placeholder="Unlimited"></label></div>
        ${exId && !patterns.length ? html`<p class="note mt">This examination has no published pattern version yet.</p>` : ''}`);
      body.examId.addEventListener('change', (e) => drawForm(e.target.value));
    };
    await drawForm(examId);
    modal({ title: 'New mock test', body, actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => {
      const f = formData(body);
      const toIso = (v) => (v ? new Date(v).toISOString() : undefined);
      try {
        const t = await post('/api/admin/mock-tests', { ...f, availableFrom: toIso(f.availableFrom), availableUntil: toIso(f.availableUntil) });
        navigate(`#/admin/tests/${t.id}`);
      } catch (err) { mount($('#err', body), errorBox(err)); return false; }
    } }] });
  });
}

export async function testDetail({ root, params }) {
  const t = await get(`/api/admin/mock-tests/${params.id}`);
  const byId = Object.fromEntries(t.questions.map((q) => [q.id, q]));
  const s = t.pattern.summary;
  mount(root, html`
    <div class="page-head"><div class="grow"><a class="small" href="#/admin/tests">← Mock tests</a><h1>${t.title} ${statusBadge(t.status)}</h1>
      <p>Pattern v${t.pattern.version} — ${t.pattern.label} · ${s.totalQuestions} questions · ${num(s.totalMarks)} marks · ${fmtDuration(s.durationSec)} · ${t.attemptCount} attempt(s)</p></div>
      <div class="row">${t.status === 'draft' ? html`<button class="btn" id="gen">${t.questions.length ? 'Regenerate paper' : 'Generate paper'}</button><button class="btn primary" id="pub" ${t.problems.length ? 'disabled' : ''}>Publish</button>` : ''}
        ${t.status === 'published' ? html`<button class="btn danger" id="arch">Archive</button>` : ''}</div></div>
    <div id="err">${t.problems.length && t.questions.length ? errorBox({ message: 'The paper does not match its pattern yet:', details: t.problems }) : ''}</div>
    ${!t.questions.length ? html`<div class="info">Generate the paper to pick approved questions according to the pattern's section rules (subjects, types, difficulty mix). Questions used by this examination's other papers are avoided where possible.</div>` : ''}
    ${t.sections.map((sec) => {
      const meta = s.sections.find((x) => x.key === sec.key);
      return html`<div class="card mt"><div class="card-head"><h3>${meta?.name || sec.key}</h3><span class="small muted">${sec.questionIds.length} / ${meta?.questionCount} questions</span></div>
        <ol class="small" style="padding-left:20px">${sec.questionIds.map((id) => {
          const q = byId[id];
          return html`<li style="margin-bottom:6px"><a href="#/admin/questions/${id}">${q ? pickLang(q.content, 'en').stem.slice(0, 140) : id}</a> <span class="tiny muted">${q ? `${TYPE_LABEL[q.type]} · ${q.difficulty}` : ''}</span></li>`;
        })}</ol></div>`;
    })}`);
  $('#gen', root)?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await post(`/api/admin/mock-tests/${t.id}/generate`, { seed: `${t.id}-${Date.now()}` }); toast('Paper generated.', 'ok'); testDetail({ root, params }); }
    catch (err) { mount($('#err', root), errorBox(err)); e.target.disabled = false; }
  });
  $('#pub', root)?.addEventListener('click', async () => {
    if (!(await confirmDialog('Publish this test?', 'Students will be able to take it. The paper is frozen once published.', { confirm: 'Publish' }))) return;
    try { await post(`/api/admin/mock-tests/${t.id}/publish`); toast('Published.', 'ok'); testDetail({ root, params }); }
    catch (err) { mount($('#err', root), errorBox(err)); }
  });
  $('#arch', root)?.addEventListener('click', async () => {
    if (!(await confirmDialog('Archive this test?', 'Students will no longer see it. Past attempts and results are kept.', { confirm: 'Archive', kind: 'danger' }))) return;
    try { await post(`/api/admin/mock-tests/${t.id}/archive`); testDetail({ root, params }); } catch (err) { toast(err.message, 'bad'); }
  });
}

// ------------------------------------------------------------------ users
export async function users({ root, query }) {
  const f = { q: query.get('q') || '', role: query.get('role') || '', page: Number(query.get('page') || 1) };
  const data = await get(`/api/admin/users${qs(f)}`);
  const roles = ['student', 'editor', 'reviewer', 'mentor', 'admin'];
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Users</h1><p>${data.total} account(s). Role changes and suspensions sign the user out immediately.</p></div><button class="btn primary" id="new">Add staff member</button></div>
    <form class="card form-grid" id="filters"><label class="field"><span>Search</span><input class="input" name="q" value="${f.q}" placeholder="Name or email"></label>
      <label class="field"><span>Role</span><select class="input" name="role"><option value="">Any</option>${roles.map((r) => html`<option ${f.role === r ? 'selected' : ''}>${r}</option>`)}</select></label></form>
    <div class="card mt"><div class="table-wrap"><table class="table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Last login</th></tr></thead><tbody>
      ${data.items.map((u) => html`<tr data-id="${u.id}"><td><b>${u.name}</b><div class="tiny muted">${u.email}</div></td>
        <td><select class="input" data-role ${u.id === state.user.id ? 'disabled' : ''}>${roles.map((r) => html`<option ${u.role === r ? 'selected' : ''}>${r}</option>`)}</select></td>
        <td><select class="input" data-status ${u.id === state.user.id ? 'disabled' : ''}><option ${u.status === 'active' ? 'selected' : ''}>active</option><option ${u.status === 'suspended' ? 'selected' : ''}>suspended</option></select></td>
        <td class="small">${fmtDate(u.createdAt, false)}</td><td class="small">${fmtDate(u.lastLoginAt)}</td></tr>`)}
    </tbody></table></div></div>`);
  const form = $('#filters', root);
  let timer;
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => navigate(`#/admin/users${qs({ q: form.q.value, role: form.role.value })}`), 400); });
  form.addEventListener('submit', (e) => e.preventDefault());
  root.addEventListener('change', async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const body = e.target.dataset.role !== undefined ? { role: e.target.value } : e.target.dataset.status !== undefined ? { status: e.target.value } : null;
    if (!body) return;
    try { await patch(`/api/admin/users/${row.dataset.id}`, body); toast('User updated.', 'ok'); } catch (err) { toast(err.message, 'bad'); }
  });
  $('#new', root).addEventListener('click', () => {
    const body = document.createElement('form');
    mount(body, html`<div id="err"></div><div class="form-grid">
      <label class="field"><span>Name</span><input class="input" name="name" required></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" required></label>
      <label class="field"><span>Role</span><select class="input" name="role">${['editor', 'reviewer', 'mentor', 'admin', 'student'].map((r) => html`<option>${r}</option>`)}</select></label>
      <label class="field"><span>Temporary password</span><input class="input" name="password" required></label></div>`);
    modal({ title: 'Add staff member', body, actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => {
      try { await post('/api/admin/users', formData(body)); toast('Account created.', 'ok'); users({ root, query }); }
      catch (err) { mount($('#err', body), errorBox(err)); return false; }
    } }] });
  });
}

export async function auditLog({ root, query }) {
  const page = Number(query.get('page') || 1);
  const data = await get(`/api/admin/audit${qs({ page, action: query.get('action') })}`);
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Audit log</h1><p>Administrative and content-workflow actions, newest first.</p></div></div>
    <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
      ${data.items.map((i) => html`<tr><td class="small nowrap">${fmtDate(i.at)}</td><td class="small">${i.actor || '—'}<div class="tiny muted">${i.actorRole || ''} · ${i.ip || ''}</div></td>
        <td><code>${i.action}</code></td><td class="small">${i.entity} <code>${i.entityId || ''}</code></td><td class="tiny"><code>${JSON.stringify(i.data)}</code></td></tr>`)}
    </tbody></table></div>
    <div class="row mt">${page > 1 ? html`<a class="btn sm" href="#/admin/audit?page=${page - 1}">« Newer</a>` : ''}${data.items.length === data.limit ? html`<a class="btn sm right" href="#/admin/audit?page=${page + 1}">Older »</a>` : ''}</div></div>`);
}

export async function announcements({ root }) {
  const [list, exams] = await Promise.all([get('/api/admin/announcements'), get('/api/admin/exams')]);
  const examName = Object.fromEntries(exams.map((e) => [e.id, e.name]));
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Announcements</h1><p>Shown on student dashboards.</p></div></div>
    <div class="grid g2">
      <form class="card stack" id="f"><h3>New announcement</h3><div id="err"></div>
        <label class="field"><span>Title</span><input class="input" name="title" required></label>
        <label class="field"><span>Message</span><textarea class="input" name="body" required></textarea></label>
        <label class="field"><span>Audience</span><select class="input" name="examId"><option value="">All students</option>${exams.map((e) => html`<option value="${e.id}">${e.name} aspirants</option>`)}</select></label>
        <div><button class="btn primary">Publish</button></div></form>
      <div class="card"><h3>Published</h3>${list.length ? html`<ul class="list">${list.map((a) => html`<li style="align-items:flex-start"><div style="flex:1"><b>${a.title}</b><div class="small">${a.body}</div>
        <div class="tiny muted">${fmtDate(a.publishedAt)} · ${a.examIds.length ? a.examIds.map((id) => examName[id]).join(', ') : 'everyone'}</div></div><button class="btn sm danger" data-del="${a.id}">Delete</button></li>`)}</ul>` : html`<p class="muted">None yet.</p>`}</div>
    </div>`);
  $('#f', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try { await post('/api/admin/announcements', { title: f.title, body: f.body, examIds: f.examId ? [f.examId] : [] }); toast('Published.', 'ok'); announcements({ root }); }
    catch (err) { mount($('#err', root), errorBox(err)); }
  });
  root.addEventListener('click', async (e) => {
    const id = e.target.dataset?.del;
    if (!id || !(await confirmDialog('Delete announcement?', 'Students will no longer see it.', { confirm: 'Delete', kind: 'danger' }))) return;
    try { await del(`/api/admin/announcements/${id}`); announcements({ root }); } catch (err) { toast(err.message, 'bad'); }
  });
}

// ------------------------------------------------------------------ mentors
export async function mentorQueue({ root }) {
  const list = await get('/api/mentor/evaluations');
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Answers to evaluate</h1><p>Descriptive answers from submitted tests, oldest first.</p></div></div>
    <div class="card">${list.length ? html`<table class="table"><thead><tr><th>Student</th><th>Test</th><th>Submitted</th><th class="num">Pending</th><th></th></tr></thead><tbody>
      ${list.map((a) => html`<tr><td>${a.student}</td><td>${a.test}</td><td class="small">${fmtDate(a.submittedAt)}</td><td class="num">${a.pending}</td><td><a class="btn sm primary" href="#/mentor/evaluate/${a.attemptId}">Evaluate</a></td></tr>`)}
    </tbody></table>` : html`<p class="empty">All caught up — nothing to evaluate.</p>`}</div>`);
}

export async function mentorEvaluate({ root, params }) {
  const r = await get(`/api/attempts/${params.id}/result`);
  const qsList = r.sections.flatMap((s) => s.questions).filter((q) => q.type === 'descriptive');
  mount(root, html`
    <div class="page-head"><div class="grow"><a class="small" href="#/mentor">← Evaluation queue</a><h1>${r.title}</h1><p>Attempt ${r.id} · submitted ${fmtDate(r.submittedAt)}</p></div></div>
    ${qsList.map((q) => html`<div class="card" data-ref="${q.ref}" data-max="${q.maxMarks}">
      <div class="card-head"><h3>Q${q.number}</h3><span class="badge">max ${num(q.maxMarks)}</span>${q.evaluation ? html`<span class="badge ok">evaluated: ${num(q.evaluation.marks)}</span>` : html`<span class="badge review">pending</span>`}</div>
      ${questionReview({ ...q, evaluation: null }, { showAnswer: true })}
      ${q.response ? '' : html`<p class="muted">The student did not answer this question.</p>`}
      ${q.response ? html`<div class="row mt" style="align-items:flex-end">
        <label class="field" style="width:140px"><span>Marks</span><input class="input" type="number" step="0.5" min="0" max="${q.maxMarks}" data-marks value="${q.evaluation?.marks ?? ''}"></label>
        <label class="field" style="flex:1"><span>Feedback for the student</span><textarea class="input" rows="2" data-fb>${q.evaluation?.feedback || ''}</textarea></label>
        <button class="btn primary" data-save>Save evaluation</button></div>` : ''}</div>`)}`);
  typeset(root);
  root.addEventListener('click', async (e) => {
    if (e.target.dataset.save === undefined) return;
    const card = e.target.closest('[data-ref]');
    const marks = Number($('[data-marks]', card).value);
    if (!Number.isFinite(marks) || $('[data-marks]', card).value === '') return toast('Enter marks first.', 'bad');
    try {
      const out = await post(`/api/attempts/${params.id}/evaluations/${card.dataset.ref}`, { marks, feedback: $('[data-fb]', card).value });
      toast(`Saved. Score now ${num(out.result.score)}; ${out.result.pending} answer(s) still pending.`, 'ok');
    } catch (err) { toast(err.message, 'bad'); }
  });
}
