// Computer-based test interface.
// Answers go into a persistent on-device outbox first (localStorage) and are then sent to the
// server with per-question sequence numbers. That makes saves survive refreshes, crashes and
// network drops, and lets the server discard stale retries. The countdown is display only:
// it is derived from the server's clock and the server enforces every deadline.
import { html, mount, $, $$, raw, toast, modal, clock, num, esc, TYPE_LABEL } from '../ui.js';
import { get, post, put } from '../api.js';
import { richHtml, typeset, pickLang } from '../render.js';

const NUMERIC_RE = /^-?\d{0,12}(\.\d{0,8})?$/;
const isEmpty = (a) => a === null || a === undefined || a === '' || (Array.isArray(a) && !a.length);

class Outbox {
  constructor(id) { this.key = `pariksha:cbt:${id}`; this.load(); }
  load() {
    try { Object.assign(this, { items: {}, seqs: {}, time: {}, last: null }, JSON.parse(localStorage.getItem(this.key) || '{}')); }
    catch { this.items = {}; this.seqs = {}; this.time = {}; this.last = null; }
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify({ items: this.items, seqs: this.seqs, time: this.time, last: this.last })); } catch { /* storage full or blocked */ } }
  clear() { try { localStorage.removeItem(this.key); } catch { /* ignore */ } }
  get size() { return Object.keys(this.items).length; }
}

export default async function cbt({ root, params, navigate }) {
  const attemptId = params.id;
  const box = new Outbox(attemptId);
  let view;
  let offset = 0; // serverNow − Date.now()
  let cur = { si: 0, qi: 0 };
  let draft = null;
  let lang = 'en';
  let flushing = false;
  let retryTimer = null;
  let backoff = 1000;
  let ending = false; // submitting or moving section
  let shownAt = Date.now();
  const timers = [];
  const listeners = [];
  const listen = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); listeners.push([target, ev, fn, opts]); };

  const now = () => Date.now() + offset;
  const refs = () => view.sections.flatMap((s) => s.questions.map((q) => q.ref));
  const qAt = (si, qi) => view.sections[si]?.questions[qi];
  const current = () => qAt(cur.si, cur.qi);
  const locate = (ref) => { for (const [si, s] of view.sections.entries()) { const qi = s.questions.findIndex((q) => q.ref === ref); if (qi >= 0) return { si, qi }; } return null; };
  const sectionOpen = (si) => view.sections[si].state === 'open';

  function effective(ref) {
    const s = view.responses[ref];
    const o = box.items[ref];
    if (!o) return s || null;
    return { answer: 'answer' in o ? o.answer : (s?.answer ?? null), marked: o.marked ?? s?.marked ?? false };
  }
  function status(ref) {
    const r = effective(ref);
    if (!r) return 'not_visited';
    const answered = !isEmpty(r.answer);
    if (answered && r.marked) return 'answered_marked';
    if (answered) return 'answered';
    if (r.marked) return 'marked';
    return 'not_answered';
  }

  async function load() {
    const v = await get(`/api/attempts/${attemptId}`);
    if (v.status !== 'in_progress') { finish(v.status); return false; }
    view = v;
    offset = new Date(v.serverNow).valueOf() - Date.now();
    lang = v.languages.includes(v.language) ? v.language : v.languages[0];
    for (const [ref, r] of Object.entries(v.responses)) {
      box.seqs[ref] = Math.max(box.seqs[ref] || 0, r.seq || 0);
      box.time[ref] = Math.max(box.time[ref] || 0, r.timeSpentMs || 0);
    }
    box.save();
    // Pick up where the candidate was, inside the section that is open now.
    const last = box.last && locate(box.last);
    if (last && sectionOpen(last.si)) cur = last;
    else if (!sectionOpen(cur.si) || !current()) cur = { si: view.sections.findIndex((s) => s.state === 'open'), qi: 0 };
    return true;
  }

  function finish() {
    box.clear();
    cleanupAll();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate(`#/result/${attemptId}`, { replace: true });
  }

  // ------------------------------------------------------------------ saving
  function enqueue(ref, payload) {
    const seq = Math.max(box.seqs[ref] || 0, view.responses[ref]?.seq || 0) + 1;
    box.seqs[ref] = seq;
    box.items[ref] = { ...(box.items[ref] || {}), ...payload, seq, timeSpentMs: Math.round(box.time[ref] || 0) };
    box.save();
    renderPalette();
    flush();
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    clearTimeout(retryTimer);
    renderNet();
    try {
      for (const ref of Object.keys(box.items)) {
        const item = box.items[ref];
        if (!item) continue;
        try {
          const r = await put(`/api/attempts/${attemptId}/responses/${ref}`, item, { timeoutMs: 10000 });
          if (r.serverNow) offset = new Date(r.serverNow).valueOf() - Date.now();
          const prev = view.responses[ref] || {};
          if (!r.stale) view.responses[ref] = { answer: 'answer' in item ? item.answer : (prev.answer ?? null), marked: item.marked ?? prev.marked ?? false, seq: item.seq, visited: true };
          if (box.items[ref]?.seq === item.seq) delete box.items[ref];
          box.save();
          backoff = 1000;
        } catch (err) {
          if (err.code === 'ATTEMPT_CLOSED') { finish(); return; }
          if (['SECTION_LOCKED', 'SECTION_CHANGED', 'SECTION_LIMIT', 'VALIDATION_FAILED', 'NOT_FOUND'].includes(err.code) || err.status === 422) {
            delete box.items[ref];
            box.save();
            toast(err.message, 'bad');
            await reload();
            continue;
          }
          // Network trouble, rate limiting or a server hiccup: keep the item and retry later.
          retryTimer = setTimeout(flush, backoff);
          backoff = Math.min(backoff * 2, 15000);
          break;
        }
      }
    } finally {
      flushing = false;
      renderNet();
      renderPalette();
    }
  }

  async function flushAndWait(maxMs = 8000) {
    const until = Date.now() + maxMs;
    while (box.size && Date.now() < until) {
      await flush();
      if (box.size) await new Promise((r) => setTimeout(r, 500));
    }
    return box.size === 0;
  }

  async function reload() {
    const ok = await load().catch(() => true);
    if (ok) { renderAll(); }
  }

  // ------------------------------------------------------------------ navigation
  function trackTime() {
    const q = current();
    if (q && document.visibilityState === 'visible') box.time[q.ref] = (box.time[q.ref] || 0) + (Date.now() - shownAt);
    shownAt = Date.now();
  }

  function goTo(si, qi) {
    if (!sectionOpen(si)) return toast(view.sections[si].state === 'closed' ? 'That section is closed.' : 'That section has not started yet.');
    trackTime();
    cur = { si, qi };
    const q = current();
    box.last = q.ref; box.save();
    draft = structuredClone(effective(q.ref)?.answer ?? null);
    if (!effective(q.ref)) enqueue(q.ref, { marked: false }); // record the visit
    renderSections();
    renderQuestion();
    renderPalette();
  }

  function next() {
    const sec = view.sections[cur.si];
    if (cur.qi + 1 < sec.questions.length) return goTo(cur.si, cur.qi + 1);
    const nextOpen = view.sections.findIndex((s, i) => i > cur.si && s.state === 'open');
    if (nextOpen >= 0) return goTo(nextOpen, 0);
    toast(view.navigation === 'sequential' ? 'This is the last question of the section.' : 'This is the last question. Review your answers or submit.');
    renderQuestion();
  }
  function prev() {
    if (cur.qi > 0) return goTo(cur.si, cur.qi - 1);
    const prevOpen = [...view.sections.keys()].reverse().find((i) => i < cur.si && view.sections[i].state === 'open');
    if (prevOpen !== undefined) goTo(prevOpen, view.sections[prevOpen].questions.length - 1);
  }

  function draftProblem(q) {
    if (q.type === 'numeric' && !isEmpty(draft) && (!NUMERIC_RE.test(draft) || draft === '-' || draft === '.' || draft.endsWith('.'))) return 'Enter a complete number.';
    const sec = view.sections[cur.si];
    if (sec.maxAttempted && !isEmpty(draft) && isEmpty(effective(q.ref)?.answer)) {
      const answered = sec.questions.filter((x) => x.ref !== q.ref && !isEmpty(effective(x.ref)?.answer)).length;
      if (answered >= sec.maxAttempted) return `You can answer at most ${sec.maxAttempted} questions in ${sec.name}. Clear another response first.`;
    }
    return null;
  }

  function act(kind) {
    const q = current();
    if (!q || ending) return;
    if (kind === 'save' || kind === 'save_mark') {
      const p = draftProblem(q);
      if (p) return toast(p, 'bad');
      if (kind === 'save' && isEmpty(draft) && isEmpty(effective(q.ref)?.answer)) { enqueue(q.ref, { marked: false }); return next(); }
      enqueue(q.ref, { answer: isEmpty(draft) ? null : draft, marked: kind === 'save_mark' });
      return next();
    }
    if (kind === 'mark') { enqueue(q.ref, { marked: true }); return next(); }
    if (kind === 'clear') { draft = null; enqueue(q.ref, { answer: null }); return renderQuestion(); }
  }

  // ------------------------------------------------------------------ rendering
  function renderFrame() {
    mount(root, html`<div class="cbt" id="cbt">
      <header class="cbt-top">
        <div><div class="title">${view.examName}</div><div class="sub">${view.title}</div></div>
        <div style="flex:1"></div>
        <span class="clock-mini" id="clock-mini" aria-hidden="true"></span>
        ${view.calculator !== 'none' ? html`<button class="btn sm" id="calc-btn">Calculator</button>` : ''}
        ${view.languages.length > 1 ? html`<label class="small">View in <select id="lang">${view.languages.map((l) => html`<option value="${l}">${l === 'hi' ? 'हिन्दी' : l === 'en' ? 'English' : l}</option>`)}</select></label>` : ''}
        <span class="net" id="net"></span>
        <button class="btn sm" id="fs-btn" title="Full screen">⛶</button>
      </header>
      <div id="fs-banner"></div>
      <div class="cbt-sections" id="sections"></div>
      <div class="cbt-body">
        <section class="cbt-q" id="qpane" aria-live="polite"></section>
        <aside class="cbt-side">
          <div class="cbt-timer"><div class="small muted" id="t-label">Time left</div><div class="clock" id="clock">--:--:--</div><div class="sec" id="sec-clock"></div></div>
          <div class="cbt-cand"><div class="avatar">${view.candidateName.slice(0, 1).toUpperCase()}</div><div><b>${view.candidateName}</b><div class="tiny muted">Attempt ${attemptId}</div></div></div>
          <div class="legend" id="legend"></div>
          <div class="palette-wrap" id="palette"></div>
          <div class="cbt-actions"><button class="btn primary" id="submit-btn" style="width:100%">Submit test</button></div>
        </aside>
      </div>
      <footer class="cbt-actions">
        <button class="btn save" data-act="save">Save &amp; Next</button>
        ${view.allowMarkForReview ? html`<button class="btn mark" data-act="save_mark">Save &amp; Mark for Review</button>
        <button class="btn markn" data-act="mark">Mark for Review &amp; Next</button>` : ''}
        <button class="btn" data-act="clear">Clear Response</button>
        <span style="flex:1"></span>
        <button class="btn" data-nav="prev">« Back</button>
        <button class="btn" data-nav="next">Next »</button>
        <span id="next-sec"></span>
      </footer>
    </div>`);
    const langSel = $('#lang', root);
    if (langSel) {
      langSel.value = lang;
      langSel.addEventListener('change', () => { lang = langSel.value; post(`/api/attempts/${attemptId}/language`, { language: lang }).catch(() => {}); renderQuestion(); });
    }
    root.addEventListener('click', onClick);
    $('#fs-btn', root).addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));
    $('#submit-btn', root).addEventListener('click', openSubmit);
    $('#calc-btn', root)?.addEventListener('click', toggleCalc);
    const qpane = $('#qpane', root);
    qpane.addEventListener('contextmenu', (e) => e.preventDefault());
    qpane.addEventListener('copy', (e) => { e.preventDefault(); logEvent('copy_attempt'); });
  }

  function onClick(e) {
    const a = e.target.closest('[data-act]'); if (a) return act(a.dataset.act);
    const n = e.target.closest('[data-nav]'); if (n) return n.dataset.nav === 'next' ? next() : prev();
    const p = e.target.closest('[data-goto]'); if (p) { const [si, qi] = p.dataset.goto.split(':').map(Number); return goTo(si, qi); }
    const s = e.target.closest('[data-section]'); if (s) return goTo(Number(s.dataset.section), 0);
    const k = e.target.closest('[data-key]'); if (k) return keypad(k.dataset.key);
    if (e.target.closest('#next-section')) return nextSection();
  }

  function renderSections() {
    mount($('#sections', root), html`${view.sections.map((s, i) => html`<button data-section="${i}" class="${i === cur.si ? 'active' : ''}" ${s.state !== 'open' ? 'disabled' : ''} title="${s.state === 'closed' ? 'Closed' : s.state === 'locked' ? 'Not started yet' : ''}">${s.name}${s.state === 'closed' ? ' ✓' : s.state === 'locked' ? ' 🔒' : ''}</button>`)}`);
    const showNext = view.navigation === 'sequential' && view.allowEarlySectionExit && view.currentSection < view.sections.length - 1;
    mount($('#next-sec', root), showNext ? html`<button class="btn primary" id="next-section">Next section »</button>` : '');
  }

  function renderQuestion() {
    const q = current();
    const pane = $('#qpane', root);
    if (!q) return mount(pane, html`<p class="empty">No question selected.</p>`);
    const c = pickLang(q.content, lang);
    const sec = view.sections[cur.si];
    const marks = q.type === 'descriptive' ? html`<span class="marks-chip">Max <span class="p">${num(q.marks.maxMarks)}</span> marks</span>`
      : html`<span class="marks-chip">Marks <span class="p">+${num(q.marks.correct)}</span>${q.marks.incorrect ? html` / <span class="n">${num(q.marks.incorrect)}</span>` : ''}${q.marks.partial ? ` · partial +${num(q.marks.partial)}/option` : ''}</span>`;
    let answerUi;
    if (q.type === 'mcq_single' || q.type === 'mcq_multi') {
      const multi = q.type === 'mcq_multi';
      const chosen = multi ? new Set(draft || []) : new Set(draft ? [draft] : []);
      answerUi = html`<div class="opts" role="${multi ? 'group' : 'radiogroup'}">${(c.options || []).map((o) => html`
        <label class="opt ${chosen.has(o.key) ? 'sel' : ''}" data-opt="${o.key}">
          <input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${o.key}" ${chosen.has(o.key) ? 'checked' : ''}>
          <span class="key">${o.key}</span><span class="txt rich">${raw(richHtml(o.text))}</span></label>`)}</div>
        ${multi ? html`<p class="tiny muted mt">One or more options may be correct.</p>` : ''}`;
    } else if (q.type === 'numeric') {
      answerUi = html`<div class="mt"><label class="field"><span>Your answer</span>
        <input class="input numeric-input" id="numeric" inputmode="decimal" autocomplete="off" value="${draft ?? ''}" aria-label="Numerical answer"></label>
        <div class="keypad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '-'].map((k) => html`<button type="button" data-key="${k}">${k}</button>`)}
          <button type="button" data-key="back">⌫</button><button type="button" data-key="clear" style="grid-column:span 2">Clear all</button></div></div>`;
    } else {
      const words = (draft || '').trim().split(/\s+/).filter(Boolean).length;
      answerUi = html`<div class="mt"><textarea class="input" id="essay" rows="12" style="user-select:text" placeholder="Write your answer here…">${draft || ''}</textarea>
        <div class="word-count ${q.wordLimit && words > q.wordLimit ? 'over' : ''}" id="wc">${words} words${q.wordLimit ? ` · limit ${q.wordLimit}` : ''}</div>
        <p class="tiny muted">Descriptive answers are saved automatically while you type.</p></div>`;
    }
    const limit = sec.maxAttempted ? html`<span class="badge warn">Answer any ${sec.maxAttempted} of ${sec.questions.length}</span>` : '';
    mount(pane, html`
      <div class="cbt-q-head"><span class="qno">Question ${q.number}</span><span class="badge">${TYPE_LABEL[q.type]}</span>${marks}${limit}</div>
      ${c.passage ? html`<div class="passage rich">${raw(richHtml(c.passage))}</div>` : ''}
      <div class="rich" style="font-size:1.02rem">${raw(richHtml(c.stem || ''))}</div>
      ${(q.media || []).map((m) => html`<p><img src="${m.url}" alt="${m.alt || 'Question figure'}" loading="lazy"></p>`)}
      ${answerUi}`);
    typeset(pane);
    $$('.opt', pane).forEach((el) => el.addEventListener('click', (e) => {
      e.preventDefault();
      const key = el.dataset.opt;
      if (q.type === 'mcq_multi') {
        const set = new Set(draft || []);
        set.has(key) ? set.delete(key) : set.add(key);
        draft = [...set].sort();
      } else draft = key;
      $$('.opt', pane).forEach((o) => o.classList.toggle('sel', q.type === 'mcq_multi' ? (draft || []).includes(o.dataset.opt) : o.dataset.opt === draft));
    }));
    const numInput = $('#numeric', pane);
    numInput?.addEventListener('input', () => {
      if (!NUMERIC_RE.test(numInput.value)) numInput.value = draft ?? '';
      draft = numInput.value;
    });
    const essay = $('#essay', pane);
    if (essay) {
      let t;
      essay.addEventListener('input', () => {
        draft = essay.value;
        const words = essay.value.trim().split(/\s+/).filter(Boolean).length;
        const wc = $('#wc', pane);
        wc.textContent = `${words} words${q.wordLimit ? ` · limit ${q.wordLimit}` : ''}`;
        wc.classList.toggle('over', !!q.wordLimit && words > q.wordLimit);
        clearTimeout(t);
        t = setTimeout(() => enqueue(q.ref, { answer: isEmpty(draft) ? null : draft }), 2500);
      });
    }
  }

  function keypad(k) {
    const input = $('#numeric', root);
    if (!input) return;
    let v = input.value;
    if (k === 'back') v = v.slice(0, -1);
    else if (k === 'clear') v = '';
    else if (k === '-') v = v.startsWith('-') ? v.slice(1) : '-' + v;
    else v += k;
    if (!NUMERIC_RE.test(v)) return;
    input.value = v; draft = v;
  }

  function renderPalette() {
    if (!view || !$('#palette', root)) return;
    const counts = { not_visited: 0, not_answered: 0, answered: 0, marked: 0, answered_marked: 0 };
    const sec = view.sections[cur.si];
    for (const q of sec.questions) counts[status(q.ref)]++;
    mount($('#legend', root), html`
      <div><span class="pal answered">${counts.answered}</span>Answered</div>
      <div><span class="pal not_answered">${counts.not_answered}</span>Not answered</div>
      <div><span class="pal not_visited">${counts.not_visited}</span>Not visited</div>
      <div><span class="pal marked">${counts.marked}</span>Marked for review</div>
      <div style="grid-column:span 2"><span class="pal answered_marked">${counts.answered_marked}</span>Answered &amp; marked (will be evaluated)</div>`);
    mount($('#palette', root), html`<h4>${sec.name}</h4><div class="palette">${sec.questions.map((q, qi) => html`
      <button class="pal ${status(q.ref)} ${qi === cur.qi ? 'current' : ''}" data-goto="${cur.si}:${qi}" aria-label="Question ${q.number}: ${status(q.ref).replace('_', ' ')}">${q.number}</button>`)}</div>`);
  }

  function renderNet() {
    const el = $('#net', root);
    if (!el) return;
    if (!navigator.onLine) { el.className = 'net off'; el.textContent = `Offline · ${box.size} unsent`; }
    else if (box.size) { el.className = 'net sync'; el.textContent = `Saving ${box.size}…`; }
    else { el.className = 'net'; el.textContent = 'All answers saved'; }
  }

  function renderFsBanner() {
    const el = $('#fs-banner', root);
    if (!el) return;
    if (document.fullscreenElement || !document.fullscreenEnabled) return mount(el, '');
    mount(el, html`<div class="fs-banner">You are not in full-screen mode. Leaving full screen is recorded. <button class="btn sm" id="fs-return">Return to full screen</button></div>`);
    $('#fs-return', el).addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));
  }

  function renderAll() {
    if (!$('#cbt', root)) renderFrame();
    if (!current() || !sectionOpen(cur.si)) cur = { si: view.sections.findIndex((s) => s.state === 'open'), qi: 0 };
    draft = structuredClone(effective(current().ref)?.answer ?? null);
    renderSections();
    renderQuestion();
    renderPalette();
    renderNet();
    renderFsBanner();
    tick();
  }

  // ------------------------------------------------------------------ time
  function tick() {
    if (!view || ending) return;
    const t = now();
    const remaining = new Date(view.expiresAt).valueOf() - t;
    const c = $('#clock', root);
    if (!c) return;
    const sec = view.sections[view.currentSection];
    if (view.sectionTimed && sec?.expiresAt) {
      const secLeft = new Date(sec.expiresAt).valueOf() - t;
      $('#t-label', root).textContent = `${sec.name} — section time left`;
      c.textContent = clock(secLeft);
      c.classList.toggle('low', secLeft < 60_000);
      $('#sec-clock', root).textContent = `Whole test: ${clock(remaining)}`;
      if (secLeft <= -3500 && view.currentSection < view.sections.length - 1) return sectionTimeUp();
    } else {
      c.textContent = clock(remaining);
      c.classList.toggle('low', remaining < 5 * 60_000);
    }
    const mini = $('#clock-mini', root);
    if (mini) { mini.textContent = c.textContent; mini.classList.toggle('low', c.classList.contains('low')); }
    if (remaining <= 0) return timeUp();
  }

  async function sectionTimeUp() {
    ending = true;
    const m = modal({ title: 'Section time is over', body: html`<p>Saving your answers and moving to the next section…</p>`, dismissible: false });
    await flushAndWait(4000);
    await load().catch(() => {});
    m.close();
    ending = false;
    if (view) { cur = { si: view.currentSection, qi: 0 }; renderAll(); }
  }

  async function timeUp() {
    ending = true;
    modal({ title: 'Time is up', body: html`<p>Your test is being submitted. Please wait…</p>`, dismissible: false });
    await flushAndWait(3000);
    await submitNow();
  }

  async function nextSection() {
    const ok = await new Promise((resolve) => modal({
      title: 'Move to the next section?', body: html`<p>You will not be able to return to <b>${view.sections[view.currentSection].name}</b>.</p>`,
      actions: [{ label: 'Stay' }, { label: 'Move on', kind: 'primary', onClick: () => resolve(true) }], onClose: () => resolve(false),
    }));
    if (!ok) return;
    await flushAndWait();
    try { await post(`/api/attempts/${attemptId}/sections/next`, { fromSection: view.currentSection }); }
    catch (err) { toast(err.message, 'bad'); }
    await load();
    cur = { si: view.currentSection, qi: 0 };
    renderAll();
  }

  // ------------------------------------------------------------------ submit
  function openSubmit() {
    trackTime();
    const rows = view.sections.map((s) => {
      const c = { answered: 0, not_answered: 0, not_visited: 0, marked: 0, answered_marked: 0 };
      s.questions.forEach((q) => c[status(q.ref)]++);
      return { name: s.name, total: s.questions.length, ...c };
    });
    const body = html`
      ${rows.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Section</th><th class="num">Questions</th><th class="num">Answered</th><th class="num">Not answered</th><th class="num">Marked</th><th class="num">Answered &amp; marked</th><th class="num">Not visited</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td>${r.name}</td><td class="num">${r.total}</td><td class="num">${r.answered}</td><td class="num">${r.not_answered}</td><td class="num">${r.marked}</td><td class="num">${r.answered_marked}</td><td class="num">${r.not_visited}</td></tr>`)}</tbody></table></div>` : ''}
      ${box.size ? html`<p class="note mt">${box.size} answer(s) are still being saved. They will be sent before submitting.</p>` : ''}
      <p class="mt">Are you sure you want to submit? You cannot change your answers afterwards.</p>`;
    modal({ title: 'Submit test', body, actions: [{ label: 'Keep working' }, { label: 'Submit test', kind: 'primary', onClick: async () => { await submitFlow(); return true; } }] });
  }

  async function submitFlow() {
    ending = true;
    const m = modal({ title: 'Submitting', body: html`<p><span class="spinner"></span> Saving your answers and submitting…</p>`, dismissible: false });
    const synced = await flushAndWait(10000);
    if (!synced) {
      m.close();
      ending = false;
      toast(navigator.onLine ? 'Some answers could not be saved yet. Please try submitting again.' : 'You are offline. Reconnect to submit — your answers are kept on this device.', 'bad');
      return;
    }
    m.close();
    await submitNow();
  }

  async function submitNow() {
    for (let i = 0; i < 8; i++) {
      try {
        await post(`/api/attempts/${attemptId}/submit`);
        return finish();
      } catch (err) {
        if (err.code === 'ATTEMPT_CLOSED') return finish();
        await new Promise((r) => setTimeout(r, err.code === 'SUBMIT_IN_PROGRESS' ? 1000 : Math.min(1000 * 2 ** i, 8000)));
      }
    }
    toast('Could not reach the server to submit. Your answers are safe; we will keep trying.', 'bad');
    timers.push(setTimeout(submitNow, 10000));
  }

  // ------------------------------------------------------------------ calculator
  function toggleCalc() {
    const existing = $('#calc', root);
    if (existing) return existing.remove();
    const el = document.createElement('div');
    el.className = 'calc'; el.id = 'calc';
    let expr = '';
    mount(el, html`<div class="row"><b class="small">Calculator</b><button class="btn ghost sm right" data-cx>✕</button></div>
      <div class="disp" id="cdisp">0</div><div class="keys">${['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '(', ')', 'C', '⌫', '=', '+'].map((k) => html`<button data-ck="${k}">${k}</button>`)}</div>`);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cx]')) return el.remove();
      const k = e.target.dataset.ck;
      if (!k) return;
      if (k === 'C') expr = '';
      else if (k === '⌫') expr = expr.slice(0, -1);
      else if (k === '=') { const v = evaluate(expr); expr = v === null ? '' : String(v); $('#cdisp', el).textContent = v === null ? 'Error' : expr; return; }
      else expr += k;
      $('#cdisp', el).textContent = expr || '0';
    });
    $('#cbt', root).append(el);
  }

  // ------------------------------------------------------------------ monitoring
  function logEvent(type) { post(`/api/attempts/${attemptId}/events`, { type }).catch(() => {}); }

  function cleanupAll() {
    timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    clearTimeout(retryTimer);
    for (const [t, ev, fn, opts] of listeners) t.removeEventListener(ev, fn, opts);
    listeners.length = 0;
  }

  // ------------------------------------------------------------------ boot
  if (!(await load())) return;
  renderFrame();
  goTo(cur.si, cur.qi);
  renderAll();
  flush();
  timers.push(setInterval(tick, 250));
  timers.push(setInterval(() => { trackTime(); box.save(); }, 5000));
  timers.push(setInterval(() => { if (box.size && !flushing) flush(); }, 20000));
  listen(window, 'online', () => { renderNet(); flush(); });
  listen(window, 'offline', () => { renderNet(); logEvent('offline'); });
  listen(document, 'fullscreenchange', () => { renderFsBanner(); if (!document.fullscreenElement) logEvent('fullscreen_exit'); });
  listen(document, 'visibilitychange', () => { trackTime(); if (document.visibilityState === 'hidden') { logEvent('tab_hidden'); box.save(); } });
  listen(window, 'beforeunload', (e) => { trackTime(); box.save(); if (box.size) { e.preventDefault(); e.returnValue = ''; } });

  return () => { trackTime(); box.save(); cleanupAll(); };
}

// Safe arithmetic evaluator for the on-screen calculator (no eval).
function evaluate(src) {
  const tokens = src.match(/\d+(\.\d+)?|[-+*/()]/g);
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null;
  let i = 0;
  const peek = () => tokens[i];
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const op = tokens[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = factor(); while (peek() === '*' || peek() === '/') { const op = tokens[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; };
  const factor = () => {
    const t = tokens[i++];
    if (t === '-') return -factor();
    if (t === '(') { const v = expr(); if (tokens[i++] !== ')') throw new Error(); return v; }
    const n = Number(t); if (!Number.isFinite(n)) throw new Error(); return n;
  };
  try { const v = expr(); if (i !== tokens.length || !Number.isFinite(v)) return null; return Math.round(v * 1e10) / 1e10; } catch { return null; }
}
