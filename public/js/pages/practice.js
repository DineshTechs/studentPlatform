import { html, mount, $, $$, raw, toast, errorBox, TYPE_LABEL, fmtDate } from '../ui.js';
import { get, post, put, del, qs } from '../api.js';
import { richHtml, typeset, pickLang } from '../render.js';

const NUMERIC_RE = /^-?\d{0,12}(\.\d{0,8})?$/;

export default async function practice({ root, user, query }) {
  if (!user.activeExamId) {
    mount(root, html`<div class="empty"><h2>Choose a target examination first</h2><a href="#/exams">Pick examinations</a></div>`);
    return;
  }
  const [exam, tree, bms] = await Promise.all([get(`/api/exams/${user.activeExamId}`), get(`/api/exams/${user.activeExamId}/syllabus`), get('/api/bookmarks')]);
  const bookmarked = new Set(bms.map((b) => b.id));
  const f = {
    subjectId: query.get('subjectId') || '', chapterId: query.get('chapterId') || '', topicId: query.get('topicId') || '',
    difficulty: query.get('difficulty') || '', mode: query.get('mode') || 'all', source: query.get('source') || '',
  };
  // A topic link may arrive without its parents: fill them in.
  if (f.topicId && !f.subjectId) for (const s of tree) for (const c of s.children) if (c.children.some((t) => t.id === f.topicId)) { f.subjectId = s.id; f.chapterId = c.id; }
  let items = [];
  let idx = 0;
  let total = 0;
  let offset = 0;
  let answer = null;
  let checked = null;
  let shownAt = Date.now();
  const lang = user.preferences?.language || 'en';

  const subject = () => tree.find((s) => s.id === f.subjectId);
  const chapter = () => subject()?.children.find((c) => c.id === f.chapterId);

  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Practice</h1><p>${exam.name} · answers are checked instantly with explanations.</p></div></div>
    <div class="card"><div class="form-grid" id="filters"></div></div>
    <div id="q" class="mt"></div>`);

  const drawFilters = () => mount($('#filters', root), html`
    <label class="field"><span>Subject</span><select class="input" name="subjectId"><option value="">All subjects</option>${tree.map((s) => html`<option value="${s.id}" ${s.id === f.subjectId ? 'selected' : ''}>${s.name}</option>`)}</select></label>
    <label class="field"><span>Chapter</span><select class="input" name="chapterId" ${subject() ? '' : 'disabled'}><option value="">All chapters</option>${(subject()?.children || []).map((c) => html`<option value="${c.id}" ${c.id === f.chapterId ? 'selected' : ''}>${c.name}</option>`)}</select></label>
    <label class="field"><span>Topic</span><select class="input" name="topicId" ${chapter() ? '' : 'disabled'}><option value="">All topics</option>${(chapter()?.children || []).map((t) => html`<option value="${t.id}" ${t.id === f.topicId ? 'selected' : ''}>${t.name}</option>`)}</select></label>
    <label class="field"><span>Difficulty</span><select class="input" name="difficulty">${[['', 'Any'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(([v, l]) => html`<option value="${v}" ${v === f.difficulty ? 'selected' : ''}>${l}</option>`)}</select></label>
    <label class="field"><span>Show</span><select class="input" name="mode">${[['all', 'All questions'], ['new', 'Not attempted yet'], ['incorrect', 'My mistakes'], ['bookmarked', 'Bookmarked']].map(([v, l]) => html`<option value="${v}" ${v === f.mode ? 'selected' : ''}>${l}</option>`)}</select></label>
    <label class="field"><span>Source</span><select class="input" name="source"><option value="">All</option><option value="pyq" ${f.source === 'pyq' ? 'selected' : ''}>Verified previous-year only</option></select></label>`);

  async function fetchBatch(reset = true) {
    if (reset) { offset = 0; idx = 0; }
    mount($('#q', root), html`<div class="loading"><span class="spinner"></span>Loading questions…</div>`);
    try {
      const r = await get(`/api/practice/questions${qs({ examId: user.activeExamId, ...f, offset, limit: 10 })}`);
      items = r.items; total = r.total;
      drawQuestion();
    } catch (err) { mount($('#q', root), errorBox(err)); }
  }

  function drawQuestion() {
    const q = items[idx];
    const pane = $('#q', root);
    if (!q) {
      mount(pane, html`<div class="card empty">${total ? html`You've reached the end of this set. <button class="btn" id="restart">Start again</button>` : f.mode === 'incorrect' ? 'No mistakes to revise here — well done.' : 'No questions match these filters yet.'}</div>`);
      $('#restart', pane)?.addEventListener('click', () => fetchBatch());
      return;
    }
    answer = null; checked = null; shownAt = Date.now();
    render();
  }

  function render() {
    const q = items[idx];
    const pane = $('#q', root);
    const c = pickLang(q.content, lang);
    const key = checked?.answer?.correct;
    const keys = new Set(Array.isArray(key) ? key : key ? [key] : []);
    const chosen = new Set(Array.isArray(answer) ? answer : answer ? [answer] : []);
    const pos = offset + idx + 1;
    mount(pane, html`<div class="card">
      <div class="card-head"><h3>Question ${pos} <span class="small muted">of ${total}</span></h3>
        <span class="badge">${TYPE_LABEL[q.type]}</span><span class="badge">${q.difficulty}</span>
        ${q.source.kind === 'pyq' ? html`<span class="badge brand">PYQ ${q.source.year}</span>` : ''}
        ${q.lastOutcome ? html`<span class="badge ${q.lastOutcome === 'correct' ? 'ok' : 'bad'}">last time: ${q.lastOutcome}</span>` : ''}
        <button class="btn sm ghost" id="bm">${bookmarked.has(q.id) ? '★ Saved' : '☆ Save'}</button></div>
      ${c.passage ? html`<div class="passage rich">${raw(richHtml(c.passage))}</div>` : ''}
      <div class="rich">${raw(richHtml(c.stem))}</div>
      ${(q.media || []).map((m) => html`<p><img src="${m.url}" alt="${m.alt || ''}"></p>`)}
      ${c.options ? html`<div class="opts">${c.options.map((o) => html`<label class="opt ${checked ? (keys.has(o.key) ? 'is-right' : chosen.has(o.key) ? 'is-wrong' : '') : chosen.has(o.key) ? 'sel' : ''}" data-opt="${o.key}">
          <span class="key">${o.key}</span><span class="txt rich">${raw(richHtml(o.text))}</span></label>`)}</div>`
        : html`<label class="field mt"><span>Your answer</span><input class="input numeric-input" id="num" inputmode="decimal" value="${answer ?? ''}" ${checked ? 'disabled' : ''}></label>`}
      ${checked ? html`<div class="explain"><b class="${checked.outcome === 'correct' ? '' : ''}">${checked.outcome === 'correct' ? '✓ Correct' : checked.outcome === 'partial' ? '◐ Partially correct' : '✗ Incorrect'}</b>
          ${q.type === 'numeric' ? html` — correct answer: ${checked.answer.value ?? `${checked.answer.min}–${checked.answer.max}`}` : ''}
          ${checked.stats?.attempts ? html`<span class="tiny muted"> · ${Math.round((checked.stats.correct / checked.stats.attempts) * 100)}% of students got this right</span>` : ''}
          <div class="rich small mt">${raw(richHtml(pickLang(checked.content, lang).explanation || ''))}</div>
          ${pickLang(checked.content, lang).solution ? html`<div class="rich small mt">${raw(richHtml(pickLang(checked.content, lang).solution))}</div>` : ''}</div>` : ''}
      <div class="row mt">
        ${checked ? html`<button class="btn primary" id="next">Next question »</button>` : html`<button class="btn primary" id="check">Check answer</button><button class="btn" id="skip">Skip</button>`}
        ${q.type === 'mcq_multi' && !checked ? html`<span class="tiny muted">Select all correct options.</span>` : ''}
      </div></div>`);
    typeset(pane);
    if (!checked) {
      $$('.opt', pane).forEach((el) => el.addEventListener('click', () => {
        const k = el.dataset.opt;
        if (q.type === 'mcq_multi') { const s = new Set(answer || []); s.has(k) ? s.delete(k) : s.add(k); answer = [...s].sort(); }
        else answer = k;
        render();
      }));
      const num = $('#num', pane);
      num?.addEventListener('input', () => { if (!NUMERIC_RE.test(num.value)) num.value = answer ?? ''; answer = num.value; });
      $('#check', pane).addEventListener('click', check);
      $('#skip', pane).addEventListener('click', advance);
    } else $('#next', pane).addEventListener('click', advance);
    $('#bm', pane).addEventListener('click', toggleBookmark);
  }

  async function check() {
    const q = items[idx];
    if (answer === null || answer === '' || (Array.isArray(answer) && !answer.length)) return toast('Choose or enter an answer first.');
    try {
      checked = await post('/api/practice/answer', { questionId: q.id, answer, timeSpentMs: Date.now() - shownAt });
      render();
    } catch (err) { toast(err.message, 'bad'); }
  }

  async function advance() {
    idx++;
    if (idx >= items.length && offset + items.length < total && f.mode !== 'incorrect') { offset += items.length; await fetchBatch(false); idx = 0; return; }
    drawQuestion();
  }

  async function toggleBookmark() {
    const q = items[idx];
    try {
      if (bookmarked.has(q.id)) { await del(`/api/bookmarks/${q.id}`); bookmarked.delete(q.id); }
      else { await put(`/api/bookmarks/${q.id}`, {}); bookmarked.add(q.id); }
      render();
    } catch (err) { toast(err.message, 'bad'); }
  }

  drawFilters();
  $('#filters', root).addEventListener('change', (e) => {
    const name = e.target.name;
    f[name] = e.target.value;
    if (name === 'subjectId') { f.chapterId = ''; f.topicId = ''; }
    if (name === 'chapterId') f.topicId = '';
    drawFilters();
    fetchBatch();
  });
  fetchBatch();
}

export async function bookmarks({ root }) {
  const items = await get('/api/bookmarks');
  const draw = () => mount(root, html`
    <div class="page-head"><div class="grow"><h1>Bookmarks</h1><p>Questions you saved for revision.</p></div>
      ${items.length ? html`<a class="btn primary" href="#/practice?mode=bookmarked">Practise these</a>` : ''}</div>
    ${items.length ? html`<div class="stack">${items.map((q) => html`<div class="card"><div class="card-head"><span class="badge">${TYPE_LABEL[q.type]}</span><span class="tiny muted">saved ${fmtDate(q.bookmarkedAt, false)}</span><button class="btn sm danger right" data-rm="${q.id}">Remove</button></div>
      <div class="rich">${raw(richHtml(pickLang(q.content, 'en').stem))}</div></div>`)}</div>`
      : html`<div class="card empty">No bookmarks yet. Use ☆ Save in practice or on a result page.</div>`}`);
  draw();
  typeset(root);
  root.addEventListener('click', async (e) => {
    const id = e.target.dataset?.rm;
    if (!id) return;
    try { await del(`/api/bookmarks/${id}`); items.splice(items.findIndex((x) => x.id === id), 1); draw(); typeset(root); }
    catch (err) { toast(err.message, 'bad'); }
  });
}
