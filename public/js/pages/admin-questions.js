import { html, mount, $, $$, raw, toast, errorBox, confirmDialog, statusBadge, fmtDate, TYPE_LABEL } from '../ui.js';
import { get, post, put, qs } from '../api.js';
import { can, navigate, state } from '../app.js';
import { richHtml, typeset, pickLang } from '../render.js';
import { questionReview } from './result.js';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const excerpt = (s, n = 110) => { const t = String(s || '').replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n) + '…' : t; };

export async function questionList({ root, query }) {
  const subjects = await get('/api/syllabus/nodes?type=subject');
  const subjectName = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
  const f = { status: query.get('status') || '', type: query.get('type') || '', subjectId: query.get('subjectId') || '', q: query.get('q') || '', mine: query.get('mine') || '', page: Number(query.get('page') || 1) };
  const data = await get(`/api/questions${qs({ ...f, limit: 25 })}`);
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const link = (over) => `#/admin/questions${qs({ ...f, ...over })}`;
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Question bank</h1><p>${data.total} questions match. Editors write, reviewers approve; only approved questions reach students.</p></div>
      ${can('question.import') ? html`<a class="btn" href="#/admin/questions/import">Bulk import</a>` : ''}
      ${can('question.create') ? html`<a class="btn primary" href="#/admin/questions/new">New question</a>` : ''}</div>
    <form class="card form-grid" id="filters">
      <label class="field"><span>Search text</span><input class="input" name="q" value="${f.q}" placeholder="Words in the question"></label>
      <label class="field"><span>Status</span><select class="input" name="status">${[['', 'Any'], ['draft', 'Draft'], ['in_review', 'In review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['archived', 'Archived']].map(([v, l]) => html`<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label class="field"><span>Type</span><select class="input" name="type"><option value="">Any</option>${Object.entries(TYPE_LABEL).map(([v, l]) => html`<option value="${v}" ${f.type === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label class="field"><span>Subject</span><select class="input" name="subjectId"><option value="">Any</option>${subjects.map((s) => html`<option value="${s.id}" ${f.subjectId === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
      ${can('question.create') ? html`<label class="check" style="align-self:end"><input type="checkbox" name="mine" ${f.mine ? 'checked' : ''}> Only mine</label>` : ''}
    </form>
    <div class="card mt"><div class="table-wrap"><table class="table"><thead><tr><th>Question</th><th>Subject</th><th>Type</th><th>Status</th><th class="num">Ver.</th><th class="num">Used</th><th>Updated</th></tr></thead><tbody>
      ${data.items.map((q) => html`<tr><td><a href="#/admin/questions/${q.id}">${excerpt(pickLang(q.content, 'en').stem)}</a>
          <div class="tiny muted">${q.difficulty}${q.source.kind === 'pyq' ? ` · PYQ ${q.source.year}${q.source.verified ? ' ✓' : ' (unverified)'}` : ''}${Object.keys(q.content).length > 1 ? ` · ${Object.keys(q.content).join('/')}` : ''}</div></td>
        <td class="small">${subjectName[q.subjectId] || '—'}</td><td class="small">${TYPE_LABEL[q.type]}</td><td>${statusBadge(q.status)}</td><td class="num">${q.version}</td>
        <td class="num small">${q.stats.attempts ? `${q.stats.attempts} · ${Math.round((q.stats.correct / q.stats.attempts) * 100)}%` : '—'}</td><td class="small nowrap">${fmtDate(q.updatedAt, false)}</td></tr>`)}
    </tbody></table></div>
    ${data.items.length ? '' : html`<p class="empty">No questions match.</p>`}
    <div class="row mt"><span class="small muted">Page ${f.page} of ${pages}</span><span class="right"></span>
      ${f.page > 1 ? html`<a class="btn sm" href="${link({ page: f.page - 1 })}">« Previous</a>` : ''}${f.page < pages ? html`<a class="btn sm" href="${link({ page: f.page + 1 })}">Next »</a>` : ''}</div></div>`);
  const form = $('#filters', root);
  let t;
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 400); });
  form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
  function go() {
    const v = { q: form.q.value, status: form.status.value, type: form.type.value, subjectId: form.subjectId.value, mine: form.mine?.checked ? 'true' : '', page: 1 };
    navigate(`#/admin/questions${qs(v)}`);
  }
}

// ------------------------------------------------------------------ editor
function blank() {
  return {
    type: 'mcq_single', difficulty: 'medium', subjectId: '', chapterId: '', topicId: '', source: { kind: 'original' }, tags: [],
    content: { en: { stem: '', passage: '', options: KEYS.slice(0, 4).map((k) => ({ key: k, text: '' })), explanation: '', solution: '' } },
    answer: { correct: 'A' },
  };
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] ??= /^\d+$/.test(parts[i + 1]) ? [] : {}; cur = cur[parts[i]]; }
  cur[parts.at(-1)] = value;
}

export async function questionEditor({ root, params }) {
  const isNew = params.id === 'new';
  let data = isNew ? { question: blank(), reviews: [] } : await get(`/api/questions/${params.id}`);
  let q = structuredClone(data.question);
  q.source ||= { kind: 'original' };
  const [subjects, exams] = await Promise.all([get('/api/syllabus/nodes?type=subject'), get('/api/exams')]);
  let chapters = q.subjectId ? await get(`/api/syllabus/nodes?parentId=${q.subjectId}`) : [];
  let topics = q.chapterId ? await get(`/api/syllabus/nodes?parentId=${q.chapterId}`) : [];
  let lang = 'en';
  let err = null;
  let dups = null;
  const me = state.user;
  const canEdit = () => isNew ? can('question.create')
    : can('question.edit_any') ? q.status !== 'archived'
      : can('question.edit_own') && q.createdBy === me.id && ['draft', 'rejected'].includes(q.status);

  const draw = () => {
    const c = q.content[lang] || { stem: '', options: (q.content.en.options || []).map((o) => ({ key: o.key, text: '' })) };
    const usesOptions = q.type === 'mcq_single' || q.type === 'mcq_multi';
    const keys = (q.content.en.options || []).map((o) => o.key);
    mount(root, html`
      <div class="page-head"><div class="grow"><a class="small" href="#/admin/questions">← Question bank</a>
        <h1>${isNew ? 'New question' : html`Question <span class="small muted">${q.id}</span>`} ${isNew ? '' : statusBadge(q.status)} ${isNew ? '' : html`<span class="badge">v${q.version}</span>`}</h1>
        ${q.reviewNotes && q.status === 'rejected' ? html`<p class="note">Reviewer: ${q.reviewNotes}</p>` : ''}</div>
        <div class="row">${canEdit() ? html`<button class="btn" id="save">${isNew ? 'Save draft' : 'Save changes'}</button>` : ''}
          ${!isNew && ['draft', 'rejected'].includes(q.status) && (q.createdBy === me.id || can('question.edit_any')) ? html`<button class="btn primary" id="submit">Submit for review</button>` : ''}
          ${isNew ? html`<button class="btn primary" id="save-submit">Save &amp; submit for review</button>` : ''}
          ${!isNew && can('question.edit_any') && q.status !== 'archived' ? html`<button class="btn danger" id="archive">Archive</button>` : ''}</div></div>
      ${!canEdit() && !isNew ? html`<p class="note">${q.status === 'approved' ? 'Approved questions can only be revised by an admin; the revision goes back to review.' : 'You can view this question but not edit it.'}</p>` : ''}
      <div id="err">${err ? errorBox(err) : ''}</div>
      ${dups && (dups.exact?.length || dups.near?.length) ? html`<div class="note">Possible duplicates: ${[...(dups.exact || []).map((id) => ({ id, similarity: 1 })), ...(dups.near || [])].map((d) => html`<a href="#/admin/questions/${d.id}">${d.id}</a> (${Math.round(d.similarity * 100)}%) `)}</div>` : ''}
      <div class="grid g2 mt">
        <fieldset class="card stack" id="form" ${canEdit() ? '' : 'disabled'} style="border:1px solid var(--line)">
          <div class="form-grid">
            <label class="field"><span>Type</span><select class="input" data-struct="type">${Object.entries(TYPE_LABEL).map(([v, l]) => html`<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`)}</select></label>
            <label class="field"><span>Difficulty</span><select class="input" data-path="difficulty">${['easy', 'medium', 'hard'].map((d) => html`<option ${q.difficulty === d ? 'selected' : ''}>${d}</option>`)}</select></label>
            <label class="field"><span>Subject</span><select class="input" data-struct="subjectId"><option value="">Choose…</option>${subjects.map((s) => html`<option value="${s.id}" ${q.subjectId === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
            <label class="field"><span>Chapter</span><select class="input" data-struct="chapterId" ${chapters.length ? '' : 'disabled'}><option value="">Choose…</option>${chapters.map((s) => html`<option value="${s.id}" ${q.chapterId === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
            <label class="field"><span>Topic</span><select class="input" data-path="topicId" ${topics.length ? '' : 'disabled'}><option value="">Choose…</option>${topics.map((s) => html`<option value="${s.id}" ${q.topicId === s.id ? 'selected' : ''}>${s.name}</option>`)}</select></label>
            <label class="field"><span>Source</span><select class="input" data-struct="source.kind">${[['original', 'Original'], ['pyq', 'Previous-year question'], ['imported', 'Imported']].map(([v, l]) => html`<option value="${v}" ${q.source.kind === v ? 'selected' : ''}>${l}</option>`)}</select></label>
            ${q.source.kind === 'pyq' ? html`
              <label class="field"><span>PYQ examination</span><select class="input" data-path="source.examId"><option value="">Choose…</option>${exams.map((e) => html`<option value="${e.id}" ${q.source.examId === e.id ? 'selected' : ''}>${e.name}</option>`)}</select></label>
              <label class="field"><span>Year</span><input class="input" type="number" data-path="source.year" data-num value="${q.source.year ?? ''}"></label>
              <label class="field"><span>Paper / shift</span><input class="input" data-path="source.paper" value="${q.source.paper ?? ''}"></label>` : ''}
          </div>
          <div class="tabs" style="margin:6px 0 0">${Object.keys(q.content).map((l) => html`<button type="button" data-lang="${l}" class="${l === lang ? 'active' : ''}">${l === 'en' ? 'English' : l === 'hi' ? 'हिन्दी' : l}</button>`)}
            ${q.content.hi ? html`<button type="button" data-rmlang="hi" title="Remove Hindi version">✕ Hindi</button>` : html`<button type="button" data-addlang="hi">+ Hindi version</button>`}</div>
          <label class="field"><span>Passage / context (optional)</span><textarea class="input" data-path="content.${lang}.passage" rows="2">${c.passage || ''}</textarea></label>
          <label class="field"><span>Question text</span><textarea class="input" data-path="content.${lang}.stem" rows="4">${c.stem || ''}</textarea>
            <div class="tiny muted">Supports **bold**, line breaks, "- " lists, | pipe | tables | and maths in $…$ (LaTeX).</div></label>
          ${usesOptions ? html`<div><div class="row"><b class="small">Options</b><span class="right"></span>
              ${lang === 'en' && keys.length < 6 ? html`<button type="button" class="btn sm" id="add-opt">+ Option</button>` : ''}${lang === 'en' && keys.length > 2 ? html`<button type="button" class="btn sm" id="rm-opt">− Option</button>` : ''}</div>
            ${keys.map((k, i) => html`<label class="row mt" style="flex-wrap:nowrap"><span class="badge">${k}</span><input class="input" data-path="content.${lang}.options.${i}.text" value="${c.options?.[i]?.text || ''}"></label>`)}</div>` : ''}
          <div class="card" style="background:#fafbfd"><b class="small">Answer key</b>
            ${q.type === 'mcq_single' ? html`<div class="row mt">${keys.map((k) => html`<label class="check"><input type="radio" name="ans" data-answer="${k}" ${q.answer?.correct === k ? 'checked' : ''}> ${k}</label>`)}</div>` : ''}
            ${q.type === 'mcq_multi' ? html`<div class="row mt">${keys.map((k) => html`<label class="check"><input type="checkbox" data-answer-multi="${k}" ${(q.answer?.correct || []).includes(k) ? 'checked' : ''}> ${k}</label>`)}</div>` : ''}
            ${q.type === 'numeric' ? html`<div class="form-grid mt">
              <label class="field"><span>Exact value</span><input class="input" type="number" step="any" data-path="answer.value" data-num value="${q.answer?.value ?? ''}"></label>
              <label class="field"><span>Tolerance (±)</span><input class="input" type="number" step="any" data-path="answer.tolerance" data-num value="${q.answer?.tolerance ?? ''}"></label>
              <label class="field"><span>…or range min</span><input class="input" type="number" step="any" data-path="answer.min" data-num value="${q.answer?.min ?? ''}"></label>
              <label class="field"><span>range max</span><input class="input" type="number" step="any" data-path="answer.max" data-num value="${q.answer?.max ?? ''}"></label></div>` : ''}
            ${q.type === 'descriptive' ? html`<div class="form-grid mt">
              <label class="field"><span>Maximum marks</span><input class="input" type="number" step="any" data-path="answer.maxMarks" data-num value="${q.answer?.maxMarks ?? ''}"></label>
              <label class="field"><span>Word limit</span><input class="input" type="number" data-path="answer.wordLimit" data-num value="${q.answer?.wordLimit ?? ''}"></label></div>
              <label class="field mt"><span>Model answer / evaluation pointers</span><textarea class="input" data-path="answer.modelAnswer">${q.answer?.modelAnswer || ''}</textarea></label>` : ''}
          </div>
          <label class="field"><span>Explanation</span><textarea class="input" data-path="content.${lang}.explanation" rows="3">${c.explanation || ''}</textarea></label>
          <label class="field"><span>Detailed solution (optional)</span><textarea class="input" data-path="content.${lang}.solution" rows="3">${c.solution || ''}</textarea></label>
          <label class="field"><span>Tags (comma separated)</span><input class="input" id="tags" value="${(q.tags || []).join(', ')}"></label>
        </fieldset>
        <div style="position:sticky;top:80px;align-self:start">
          <div class="card"><div class="card-head"><h3>Student preview</h3><span class="badge">${lang}</span></div><div id="preview"></div></div>
          ${data.reviews?.length ? html`<div class="card"><h3>Review history</h3><ul class="list">${data.reviews.map((r) => html`<li style="display:block"><span class="badge ${r.decision === 'approve' ? 'ok' : 'bad'}">${r.decision}</span> <span class="tiny muted">v${r.version} · ${fmtDate(r.at)}</span>${r.notes ? html`<div class="small">${r.notes}</div>` : ''}</li>`)}</ul></div>` : ''}
        </div>
      </div>`);
    preview();
    bind();
  };

  const preview = () => {
    const el = $('#preview', root);
    if (!el) return;
    mount(el, questionReview({ ...q, response: null, content: { [lang]: q.content[lang] || q.content.en } }, { lang, showAnswer: true }));
    typeset(el);
  };

  const bind = () => {
    const form = $('#form', root);
    form.addEventListener('input', (e) => {
      const p = e.target.dataset.path;
      if (p) {
        const v = e.target.value;
        setPath(q, p, e.target.dataset.num !== undefined ? (v === '' ? undefined : Number(v)) : v);
        if (p.startsWith('answer.') && q.type === 'numeric') {
          if (['min', 'max'].some((k) => p.endsWith(k))) { delete q.answer.value; delete q.answer.tolerance; }
        }
        preview();
      }
      if (e.target.id === 'tags') q.tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
    });
    form.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.dataset.answer) { q.answer = { correct: t.dataset.answer }; preview(); }
      if (t.dataset.answerMulti) {
        const set = new Set(q.answer?.correct || []);
        t.checked ? set.add(t.dataset.answerMulti) : set.delete(t.dataset.answerMulti);
        q.answer = { correct: [...set].sort() }; preview();
      }
      const s = t.dataset.struct;
      if (!s) return;
      if (s === 'type') {
        q.type = t.value;
        q.answer = { mcq_single: { correct: 'A' }, mcq_multi: { correct: [] }, numeric: { value: undefined, tolerance: 0 }, descriptive: { maxMarks: 10, wordLimit: 150 } }[q.type];
        for (const l of Object.keys(q.content)) {
          if (q.type === 'mcq_single' || q.type === 'mcq_multi') q.content[l].options ||= KEYS.slice(0, 4).map((k) => ({ key: k, text: '' }));
          else delete q.content[l].options;
        }
      } else if (s === 'subjectId') {
        q.subjectId = t.value; q.chapterId = ''; q.topicId = '';
        chapters = t.value ? await get(`/api/syllabus/nodes?parentId=${t.value}`) : []; topics = [];
      } else if (s === 'chapterId') {
        q.chapterId = t.value; q.topicId = '';
        topics = t.value ? await get(`/api/syllabus/nodes?parentId=${t.value}`) : [];
      } else if (s === 'source.kind') {
        q.source = { kind: t.value };
      }
      draw();
    });
    form.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.lang) { lang = t.dataset.lang; draw(); }
      if (t.dataset.addlang) {
        q.content[t.dataset.addlang] = { stem: '', options: q.content.en.options?.map((o) => ({ key: o.key, text: '' })), explanation: '' };
        if (!q.content.en.options) delete q.content[t.dataset.addlang].options;
        lang = t.dataset.addlang; draw();
      }
      if (t.dataset.rmlang) { delete q.content[t.dataset.rmlang]; lang = 'en'; draw(); }
      if (t.id === 'add-opt') { for (const l of Object.keys(q.content)) q.content[l].options.push({ key: KEYS[q.content[l].options.length], text: '' }); draw(); }
      if (t.id === 'rm-opt') {
        for (const l of Object.keys(q.content)) q.content[l].options.pop();
        const keys = q.content.en.options.map((o) => o.key);
        if (q.type === 'mcq_single' && !keys.includes(q.answer.correct)) q.answer.correct = 'A';
        if (q.type === 'mcq_multi') q.answer.correct = q.answer.correct.filter((k) => keys.includes(k));
        draw();
      }
    });
    $('#save', root)?.addEventListener('click', () => save(false));
    $('#save-submit', root)?.addEventListener('click', () => save(true));
    $('#submit', root)?.addEventListener('click', async () => {
      try { await save(false, true); const r = await post(`/api/questions/${q.id}/submit`); q = r.question; data.question = q; toast('Submitted for review.', 'ok'); draw(); }
      catch (e2) { err = e2; draw(); }
    });
    $('#archive', root)?.addEventListener('click', async () => {
      if (!(await confirmDialog('Archive this question?', 'It will no longer be used in new tests. Existing papers keep their copy.', { confirm: 'Archive', kind: 'danger' }))) return;
      try { const r = await post(`/api/questions/${q.id}/archive`); q = r.question; draw(); } catch (e2) { toast(e2.message, 'bad'); }
    });
  };

  const payload = () => {
    const out = structuredClone(q);
    for (const c of Object.values(out.content)) for (const k of ['passage', 'solution', 'explanation']) if (!c[k]) delete c[k];
    if (out.type === 'numeric') for (const k of Object.keys(out.answer)) if (out.answer[k] === undefined || Number.isNaN(out.answer[k])) delete out.answer[k];
    if (!out.subtopicId) delete out.subtopicId;
    return out;
  };

  async function save(submit, quiet = false) {
    if (!canEdit()) return;
    err = null;
    try {
      if (isNew) {
        const r = await post('/api/questions', { ...payload(), submitForReview: submit });
        toast(submit ? 'Saved and submitted for review.' : 'Draft saved.', 'ok');
        if (r.nearDuplicates?.length) toast(`Saved, but ${r.nearDuplicates.length} similar question(s) exist. Check before submitting.`);
        navigate(`#/admin/questions/${r.question.id}`, { replace: true });
        return;
      }
      const r = await put(`/api/questions/${q.id}`, payload());
      q = r.question; data.question = q;
      dups = await get(`/api/questions/${q.id}/duplicates`).catch(() => null);
      if (!quiet) { toast('Saved.', 'ok'); draw(); }
    } catch (e) {
      err = e;
      if (e.details?.duplicateOf) dups = { exact: e.details.duplicateOf };
      draw();
      if (quiet) throw e;
    }
  }

  if (!isNew) dups = await get(`/api/questions/${q.id}/duplicates`).catch(() => null);
  draw();
}

// ------------------------------------------------------------------ import
export async function importPage({ root }) {
  const subjects = await get('/api/syllabus/nodes?type=subject');
  const example = [{
    type: 'mcq_single', difficulty: 'easy', subjectId: subjects[0]?.id || 'SUBJECT_ID', chapterId: 'CHAPTER_ID', topicId: 'TOPIC_ID',
    source: { kind: 'original' },
    content: { en: { stem: 'Question text', options: [{ key: 'A', text: '…' }, { key: 'B', text: '…' }, { key: 'C', text: '…' }, { key: 'D', text: '…' }], explanation: 'Why B is right.' } },
    answer: { correct: 'B' },
  }];
  mount(root, html`
    <div class="page-head"><div class="grow"><a class="small" href="#/admin/questions">← Question bank</a><h1>Bulk import</h1>
      <p>Paste a JSON array of up to 500 questions. Every row is validated and checked for duplicates; valid rows are created as drafts.</p></div></div>
    <div class="grid g2">
      <div class="card"><textarea class="input code" id="json" spellcheck="false">${JSON.stringify(example, null, 2)}</textarea>
        <div class="row mt"><label class="check small"><input type="checkbox" id="submit"> Submit created questions for review</label><span class="right"></span>
          <label class="btn">Load file<input type="file" id="file" accept=".json,application/json" hidden></label><button class="btn primary" id="go">Import</button></div></div>
      <div class="card"><h3>Results</h3><div id="out" class="small muted">Results for each row will appear here.</div>
        <details class="mt small"><summary>Syllabus ids</summary>${subjects.map((s) => html`<div><code>${s.id}</code> ${s.name}</div>`)}
          <p class="tiny muted">Chapter and topic ids are listed under Exams &amp; syllabus, or use the question editor.</p></details></div>
    </div>`);
  $('#file', root).addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) $('#json', root).value = await file.text(); });
  $('#go', root).addEventListener('click', async (e) => {
    let list;
    try { list = JSON.parse($('#json', root).value); } catch (x) { return mount($('#out', root), errorBox({ message: `JSON syntax error: ${x.message}` })); }
    if (!Array.isArray(list)) list = list.questions;
    e.target.disabled = true;
    try {
      const r = await post('/api/questions/import', { questions: list, submitForReview: $('#submit', root).checked }, { timeoutMs: 120000 });
      mount($('#out', root), html`<p><b>${r.created}</b> created, <b>${r.failed}</b> failed.</p>
        <table class="table"><tbody>${r.results.map((x) => html`<tr><td>#${x.index + 1}</td><td>${x.ok ? html`<span class="badge ok">created</span> <a href="#/admin/questions/${x.id}">${x.id}</a>${x.nearDuplicates?.length ? html` <span class="badge warn">${x.nearDuplicates.length} similar</span>` : ''}`
          : html`<span class="badge bad">failed</span> ${x.duplicateOf ? 'duplicate of ' + x.duplicateOf.join(', ') : ''}<ul>${(x.errors || []).map((er) => html`<li><b>${er.field}</b>: ${er.message}</li>`)}</ul>`}</td></tr>`)}</tbody></table>`);
    } catch (x) { mount($('#out', root), errorBox(x)); } finally { e.target.disabled = false; }
  });
}

// ------------------------------------------------------------------ review
export async function reviewQueue({ root }) {
  const [data, subjects, exams] = await Promise.all([get('/api/review/queue'), get('/api/syllabus/nodes?type=subject'), get('/api/exams')]);
  const subjectName = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
  const examName = Object.fromEntries(exams.map((e) => [e.id, e.name]));
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Review queue</h1><p>${data.total} question(s) waiting. Verify the answer key and explanation; you cannot review your own questions.</p></div></div>
    ${data.items.length ? html`<div class="stack">${data.items.map((q) => html`<article class="card" data-q="${q.id}" data-version="${q.version}">
      <div class="card-head"><h3><a href="#/admin/questions/${q.id}">${q.id}</a> <span class="small muted">v${q.version} · ${subjectName[q.subjectId] || ''} · ${TYPE_LABEL[q.type]} · ${q.difficulty}</span></h3>
        ${q.source.kind === 'pyq' ? html`<span class="badge brand">PYQ ${examName[q.source.examId] || ''} ${q.source.year}</span>` : html`<span class="badge">${q.source.kind}</span>`}
        <button class="btn sm" data-dup>Check duplicates</button></div>
      <div class="dups"></div>
      <div class="grid g2">${Object.keys(q.content).map((l) => html`<div><span class="badge">${l}</span>${questionReview({ ...q, response: null, content: { [l]: q.content[l] } }, { lang: l })}</div>`)}</div>
      ${q.type === 'numeric' ? '' : ''}
      <hr class="hr">
      <div class="row" style="align-items:flex-end">
        <label class="field" style="flex:1"><span>Notes for the author (required when rejecting)</span><textarea class="input" rows="2" data-notes></textarea></label>
        ${q.source.kind === 'pyq' ? html`<label class="check small"><input type="checkbox" data-verify> I verified this against the official paper and answer key</label>` : ''}
        <button class="btn danger" data-decide="reject">Reject</button><button class="btn ok" data-decide="approve">Approve</button>
      </div></article>`)}</div>` : html`<div class="card empty">Nothing to review right now.</div>`}`);
  typeset(root);
  root.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-q]');
    if (!card) return;
    if (e.target.dataset.dup !== undefined) {
      const d = await get(`/api/questions/${card.dataset.q}/duplicates`);
      const all = [...d.exact.map((id) => ({ id, similarity: 1 })), ...d.near];
      mount($('.dups', card), all.length ? html`<p class="note">Possible duplicates: ${all.map((x) => html`<a href="#/admin/questions/${x.id}">${x.id}</a> (${Math.round(x.similarity * 100)}%) `)}</p>` : html`<p class="info">No duplicates found.</p>`);
      return;
    }
    const decision = e.target.dataset.decide;
    if (!decision) return;
    e.target.disabled = true;
    try {
      await post(`/api/questions/${card.dataset.q}/review`, { decision, version: Number(card.dataset.version), notes: $('[data-notes]', card).value || undefined, verifySource: $('[data-verify]', card)?.checked || false });
      toast(decision === 'approve' ? 'Approved.' : 'Rejected and returned to the author.', 'ok');
      card.remove();
    } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
  });
}
