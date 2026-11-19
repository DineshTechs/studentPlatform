import { html, mount, $, $$, toast, errorBox, modal, confirmDialog, formData, statusBadge, fmtDate, fmtDuration, num } from '../ui.js';
import { get, post, patch, put, del } from '../api.js';
import { can, navigate } from '../app.js';

const LANG_NAMES = { en: 'English', hi: 'Hindi', bn: 'Bengali', te: 'Telugu', mr: 'Marathi', ta: 'Tamil', ur: 'Urdu', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', or: 'Odia', pa: 'Punjabi', as: 'Assamese' };

export async function examList({ root }) {
  const [cats, exams] = await Promise.all([get('/api/categories'), get('/api/admin/exams')]);
  const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Examinations</h1><p>Every examination has its own syllabus and versioned patterns. Adding one needs no code changes.</p></div>
      ${can('exam.manage') ? html`<button class="btn primary" id="new">New examination</button>` : ''}</div>
    <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Examination</th><th>Category</th><th>Stages</th><th>Languages</th><th>Status</th></tr></thead><tbody>
      ${exams.map((e) => html`<tr><td><a href="#/admin/exams/${e.id}"><b>${e.name}</b></a><div class="tiny muted">${e.slug}</div></td><td>${catName[e.categoryId]}</td>
        <td class="small">${e.stages.map((s) => s.name).join(', ')}</td><td class="small">${e.languages.length} (${e.languages.slice(0, 3).join(', ')}${e.languages.length > 3 ? '…' : ''})</td><td>${statusBadge(e.isActive ? 'active' : 'archived')}</td></tr>`)}
    </tbody></table></div></div>`);
  $('#new', root)?.addEventListener('click', () => {
    const body = document.createElement('form');
    mount(body, html`<div id="err"></div><div class="form-grid">
      <label class="field"><span>Name</span><input class="input" name="name" required></label>
      <label class="field"><span>Category</span><select class="input" name="categoryId">${cats.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
      <label class="field"><span>Conducting body</span><input class="input" name="conductingBody"></label>
      <label class="field"><span>Official website (https://…)</span><input class="input" name="officialWebsite"></label></div>
      <label class="field mt"><span>Stages (one per line, e.g. "prelims: Preliminary examination")</span><textarea class="input" name="stages">main: Main examination</textarea></label>
      <label class="field mt"><span>Languages</span><div class="row">${Object.entries(LANG_NAMES).map(([k, v]) => html`<label class="check small"><input type="checkbox" name="lang_${k}" ${k === 'en' || k === 'hi' ? 'checked' : ''}>${v}</label>`)}</div></label>`);
    modal({ title: 'New examination', body, actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => {
      const f = formData(body);
      const stages = (f.stages || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [key, ...rest] = l.split(':'); return { key: key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'), name: (rest.join(':') || key).trim() }; });
      const languages = Object.keys(LANG_NAMES).filter((k) => f[`lang_${k}`]);
      try {
        const r = await post('/api/admin/exams', { name: f.name, categoryId: f.categoryId, stages, languages, info: { conductingBody: f.conductingBody, officialWebsite: f.officialWebsite } });
        toast('Examination created.', 'ok');
        navigate(`#/admin/exams/${r.id}`);
      } catch (err) { mount($('#err', body), errorBox(err)); return false; }
    } }] });
  });
}

const PATTERN_TEMPLATE = (subjectIds) => ({
  durationSec: 3600,
  languages: ['en'],
  instructions: 'Write the candidate instructions here.',
  navigation: { mode: 'free' },
  calculator: 'none',
  review: { allowMarkForReview: true, evaluateAnsweredMarked: true },
  result: { showSolutions: 'after_submit', showRank: true },
  marking: { mcq_single: { correct: 4, incorrect: -1 } },
  sections: [{ key: 'section_1', name: 'Section 1', selection: { subjectIds: subjectIds.slice(0, 1) }, composition: [{ type: 'mcq_single', count: 25 }] }],
});

export async function examDetail({ root, params, query }) {
  const tab = query.get('tab') || 'patterns';
  const exams = await get('/api/admin/exams');
  const exam = exams.find((e) => e.id === params.id);
  if (!exam) throw new Error('Examination not found.');
  mount(root, html`
    <div class="page-head"><div class="grow"><a class="small" href="#/admin/exams">← Examinations</a><h1>${exam.name}</h1>
      <p>${exam.info?.conductingBody || ''} ${exam.info?.officialWebsite ? html`· <a href="${exam.info.officialWebsite}" target="_blank" rel="noopener noreferrer">official site</a>` : ''}</p></div></div>
    <div class="tabs">${can('exam.manage') ? html`<a href="#/admin/exams/${exam.id}?tab=patterns" class="${tab === 'patterns' ? 'active' : ''}">Pattern versions</a>` : ''}
      <a href="#/admin/exams/${exam.id}?tab=syllabus" class="${tab === 'syllabus' ? 'active' : ''}">Syllabus</a></div>
    <div id="tab"></div>`);
  if (tab === 'syllabus' || !can('exam.manage')) return syllabusEditor($('#tab', root), exam);
  return patternsTab($('#tab', root), exam);
}

async function patternsTab(el, exam) {
  const list = await get(`/api/admin/exams/${exam.id}/patterns`);
  mount(el, html`
    <div class="info">A published version is frozen. Mock tests and attempts record the version they used, so changing next year's pattern never alters past results. To change a pattern, create a new version.</div>
    ${exam.stages.map((st) => {
      const versions = list.filter((p) => p.stageKey === st.key);
      return html`<div class="card mt"><div class="card-head"><h3>${st.name} <span class="tiny muted">(${st.key})</span></h3><button class="btn sm" data-new="${st.key}">New version</button></div>
        ${versions.length ? html`<table class="table"><thead><tr><th>Version</th><th>Label</th><th>Status</th><th class="num">Questions</th><th class="num">Marks</th><th class="num">Duration</th><th>Published</th></tr></thead><tbody>
          ${versions.map((p) => html`<tr><td><a href="#/admin/patterns/${p.id}"><b>v${p.version}</b></a></td><td>${p.label}</td><td>${statusBadge(p.status)}</td>
            <td class="num">${p.summary?.totalQuestions ?? '—'}</td><td class="num">${p.summary ? num(p.summary.totalMarks) : '—'}</td><td class="num">${p.summary ? fmtDuration(p.summary.durationSec) : '—'}</td><td class="small">${fmtDate(p.publishedAt, false)}</td></tr>`)}</tbody></table>`
          : html`<p class="muted small">No pattern versions yet.</p>`}</div>`;
    })}`);
  el.addEventListener('click', async (e) => {
    const stage = e.target.dataset?.new;
    if (!stage) return;
    const versions = list.filter((p) => p.stageKey === stage);
    const subjects = await get(`/api/syllabus/nodes?examId=${exam.id}`);
    const body = document.createElement('form');
    mount(body, html`<div id="err"></div>
      <label class="field"><span>Label</span><input class="input" name="label" value="${exam.name} — ${new Date().getFullYear()} pattern" required></label>
      <label class="field mt"><span>Start from</span><select class="input" name="base"><option value="">Blank template</option>${versions.map((p) => html`<option value="${p.id}">Copy of v${p.version} — ${p.label}</option>`)}</select></label>`);
    modal({ title: 'New pattern version', body, actions: [{ label: 'Cancel' }, { label: 'Create draft', kind: 'primary', onClick: async () => {
      const f = formData(body);
      try {
        const p = await post(`/api/admin/exams/${exam.id}/patterns`, { stageKey: stage, label: f.label, ...(f.base ? { basedOnPatternId: f.base } : { config: PATTERN_TEMPLATE(subjects.map((s) => s.id)) }) });
        navigate(`#/admin/patterns/${p.id}`);
      } catch (err) { mount($('#err', body), errorBox(err)); return false; }
    } }] });
  });
}

async function syllabusEditor(el, exam) {
  const draw = async () => {
    const subjects = await get(`/api/syllabus/nodes?examId=${exam.id}`);
    const children = async (id) => get(`/api/syllabus/nodes?parentId=${id}`);
    const levels = { subject: 'chapter', chapter: 'topic', topic: 'subtopic' };
    const render = async (n) => {
      const kids = n.type === 'subtopic' ? [] : await children(n.id);
      return html`<li><div class="node"><span class="badge">${n.type}</span><b style="flex:1">${n.name}</b>
        ${levels[n.type] ? html`<button class="btn sm ghost" data-add="${levels[n.type]}" data-parent="${n.id}">+ ${levels[n.type]}</button>` : ''}
        <button class="btn sm ghost" data-rename="${n.id}" data-name="${n.name}">Rename</button>
        <button class="btn sm ghost" data-del="${n.id}">Delete</button></div>
        ${kids.length ? html`<ul>${await Promise.all(kids.map(render))}</ul>` : ''}</li>`;
    };
    mount(el, html`<div class="card"><div class="card-head"><h3>Syllabus tree</h3><button class="btn sm primary" data-add="subject">+ Subject</button></div>
      <p class="small muted">Subjects can be shared by several examinations (for example Physics for JEE and NEET). Questions are tagged to subject → chapter → topic.</p>
      ${subjects.length ? html`<ul class="tree">${await Promise.all(subjects.map(render))}</ul>` : html`<p class="empty">No subjects yet.</p>`}</div>`);
  };
  await draw();
  el.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.dataset.add) {
        const name = await promptText(`New ${t.dataset.add}`, 'Name');
        if (!name) return;
        await post('/api/admin/syllabus', { type: t.dataset.add, name, parentId: t.dataset.parent, ...(t.dataset.add === 'subject' ? { examIds: [exam.id] } : {}) });
        await draw();
      } else if (t.dataset.rename) {
        const name = await promptText('Rename', 'Name', t.dataset.name);
        if (!name) return;
        await patch(`/api/admin/syllabus/${t.dataset.rename}`, { name });
        await draw();
      } else if (t.dataset.del) {
        if (!(await confirmDialog('Delete this item?', 'Only empty items without tagged questions can be deleted.', { confirm: 'Delete', kind: 'danger' }))) return;
        await del(`/api/admin/syllabus/${t.dataset.del}`);
        await draw();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
}

function promptText(title, label, value = '') {
  return new Promise((resolve) => {
    let done = false;
    const body = document.createElement('form');
    mount(body, html`<label class="field"><span>${label}</span><input class="input" name="v" value="${value}" required></label>`);
    body.addEventListener('submit', (e) => e.preventDefault());
    modal({ title, body, actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: () => { done = true; resolve(body.v.value.trim()); } }], onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => body.v.focus(), 50);
  });
}

export async function patternEditor({ root, params }) {
  let p = await get(`/api/admin/patterns/${params.id}`);
  const exams = await get('/api/admin/exams');
  const exam = exams.find((e) => e.id === p.examId);
  const subjects = await get(`/api/syllabus/nodes?examId=${p.examId}`);
  const subjectName = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
  const editable = p.status === 'draft';

  mount(root, html`
    <div class="page-head"><div class="grow"><a class="small" href="#/admin/exams/${p.examId}">← ${exam?.name}</a>
      <h1>${p.label} <span class="small">v${p.version}</span> ${statusBadge(p.status)}</h1>
      <p>Stage <code>${p.stageKey}</code>${p.publishedAt ? ` · published ${fmtDate(p.publishedAt)}` : ''}</p></div>
      <div class="row">
        ${editable ? html`<button class="btn" id="validate">Validate &amp; preview</button><button class="btn" id="save">Save draft</button><button class="btn primary" id="publish">Publish</button>`
          : html`<button class="btn" id="copy">Create new version from this</button>${p.status === 'published' ? html`<button class="btn danger" id="retire">Retire</button>` : ''}`}
      </div></div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Configuration (JSON)</h3></div>
        <textarea class="input code" id="json" spellcheck="false" ${editable ? '' : 'readonly'}>${JSON.stringify(p.config, null, 2)}</textarea>
        <details class="mt small"><summary>Reference</summary><div class="small">
          <p><b>navigation.mode</b>: <code>free</code> (switch sections any time) or <code>sequential</code> (sections in order, locked once left). <b>navigation.allowEarlySectionExit</b>: whether candidates may leave a timed section early.</p>
          <p><b>sections[].durationSec</b>: give every section a duration for section-wise timing; they must add up to <b>durationSec</b>.</p>
          <p><b>marking</b>: rules per question type: <code>mcq_single</code>, <code>mcq_multi</code>, <code>numeric</code>, <code>descriptive</code>. A rule is <code>{"correct": 4, "incorrect": -1}</code>; <code>mcq_multi</code> may add <code>"partial": {"perCorrectOption": 1}</code>. Override per section (<code>sections[].marking</code>) or per block (<code>composition[].marking</code>).</p>
          <p><b>sections[].maxAttempted</b>: "answer any N" limit. <b>selection</b>: <code>subjectIds</code>, optional <code>topicIds</code>, <code>difficultyMix</code> {easy, medium, hard}, <code>sourceKinds</code> ["pyq","original"], <code>pyqYears</code> {from, to}.</p>
          <p>Subjects for this examination: ${subjects.map((s) => html`<code>${s.id}</code> ${s.name}; `)}</p></div></details>
      </div>
      <div><div id="msg"></div><div id="preview"></div></div>
    </div>`);

  const parse = () => {
    try { return JSON.parse($('#json', root).value); } catch (e) { mount($('#msg', root), errorBox({ message: `JSON syntax error: ${e.message}` })); return null; }
  };
  const showPreview = (summary) => mount($('#preview', root), summary ? html`<div class="card">
      <h3>Preview</h3>
      <div class="row small"><span class="badge brand">${summary.totalQuestions} questions</span><span class="badge brand">${num(summary.totalMarks)} marks</span><span class="badge brand">${fmtDuration(summary.durationSec)}</span>
        <span class="badge">${summary.navigation}${summary.sectionTimed ? ', section-timed' : ''}</span><span class="badge">calculator: ${summary.calculator}</span><span class="badge">${summary.languages.join(', ')}</span></div>
      <table class="table mt"><thead><tr><th>Section</th><th>Blocks</th><th class="num">Marks</th><th class="num">Time</th></tr></thead><tbody>
        ${summary.sections.map((s) => html`<tr><td><b>${s.name}</b><div class="tiny muted">${s.questionCount} Qs${s.maxAttempted ? `, answer any ${s.maxAttempted}` : ''}</div></td>
          <td class="small">${s.blocks.map((b) => html`<div>${b.count} × ${b.label} (${b.correct !== null ? `+${b.correct}` : 'evaluated'}${b.incorrect ? ` / ${b.incorrect}` : ''}${b.partialPerOption ? `, partial +${b.partialPerOption}` : ''})</div>`)}</td>
          <td class="num">${num(s.maxMarks)}</td><td class="num">${s.durationSec ? fmtDuration(s.durationSec) : '—'}</td></tr>`)}</tbody></table>
      <p class="tiny muted">Question sources: ${p.config.sections?.map((s) => `${s.name} ← ${(s.selection?.subjectIds || []).map((id) => subjectName[id] || id).join(', ')}`).join(' · ')}</p></div>` : '');

  const validate = async () => {
    const config = parse();
    if (!config) return null;
    const r = await post('/api/admin/patterns/validate', { examId: p.examId, config });
    mount($('#msg', root), r.valid ? html`<div class="info">✓ Pattern is valid.</div>` : errorBox({ message: 'The pattern has problems:', details: r.errors }));
    showPreview(r.summary);
    return r.valid ? config : null;
  };

  if (p.errors?.length) mount($('#msg', root), errorBox({ message: 'This draft has problems:', details: p.errors }));
  showPreview(p.summary);

  $('#validate', root)?.addEventListener('click', validate);
  $('#save', root)?.addEventListener('click', async () => {
    const config = parse();
    if (!config) return;
    try { p = { ...p, ...(await put(`/api/admin/patterns/${p.id}`, { config })) }; toast('Draft saved.', 'ok'); await validate(); }
    catch (err) { mount($('#msg', root), errorBox(err)); }
  });
  $('#publish', root)?.addEventListener('click', async () => {
    const config = await validate();
    if (!config) return;
    if (!(await confirmDialog('Publish this version?', 'Published versions cannot be edited. New mock tests can then use it.', { confirm: 'Publish' }))) return;
    try {
      await put(`/api/admin/patterns/${p.id}`, { config });
      await post(`/api/admin/patterns/${p.id}/publish`);
      toast('Pattern published.', 'ok');
      patternEditor({ root, params });
    } catch (err) { mount($('#msg', root), errorBox(err)); }
  });
  $('#retire', root)?.addEventListener('click', async () => {
    if (!(await confirmDialog('Retire this version?', 'Existing tests keep working, but new tests cannot use it.', { confirm: 'Retire', kind: 'danger' }))) return;
    try { await post(`/api/admin/patterns/${p.id}/retire`); patternEditor({ root, params }); } catch (err) { toast(err.message, 'bad'); }
  });
  $('#copy', root)?.addEventListener('click', async () => {
    try {
      const n = await post(`/api/admin/exams/${p.examId}/patterns`, { stageKey: p.stageKey, label: `${p.label} (revised)`, basedOnPatternId: p.id });
      navigate(`#/admin/patterns/${n.id}`);
    } catch (err) { toast(err.message, 'bad'); }
  });
}
