import { html, mount, $, $$, raw, toast, num, pct, fmtDate, clock, TYPE_LABEL } from '../ui.js';
import { get, put, del } from '../api.js';
import { richHtml, typeset, pickLang } from '../render.js';

const OUTCOME = { correct: ['Correct', 'ok'], incorrect: ['Incorrect', 'bad'], partial: ['Partially correct', 'warn'], unattempted: ['Not answered', ''], pending: ['Awaiting evaluation', 'review'], evaluated: ['Evaluated', 'brand'] };

export function fmtAnswer(type, a) {
  if (a === null || a === undefined || (Array.isArray(a) && !a.length)) return '—';
  if (Array.isArray(a)) return a.join(', ');
  if (typeof a === 'object') {
    if (type === 'numeric') return a.min !== undefined ? `${a.min} to ${a.max}` : `${a.value}${a.tolerance ? ` (±${a.tolerance})` : ''}`;
    if ('correct' in a) return Array.isArray(a.correct) ? a.correct.join(', ') : a.correct;
    return '';
  }
  return String(a);
}

export function questionReview(q, { lang = 'en', showAnswer = true } = {}) {
  const c = pickLang(q.content, lang);
  const key = q.answer?.correct;
  const keys = new Set(Array.isArray(key) ? key : key ? [key] : []);
  const chosen = new Set(Array.isArray(q.response) ? q.response : q.response ? [q.response] : []);
  return html`
    ${c.passage ? html`<div class="passage rich">${raw(richHtml(c.passage))}</div>` : ''}
    <div class="rich">${raw(richHtml(c.stem || ''))}</div>
    ${(q.media || []).map((m) => html`<p><img src="${m.url}" alt="${m.alt || ''}"></p>`)}
    ${c.options ? html`<div class="opts">${c.options.map((o) => html`<div class="opt ${showAnswer && keys.has(o.key) ? 'is-right' : chosen.has(o.key) ? 'is-wrong' : ''} ${chosen.has(o.key) ? 'sel' : ''}">
      <span class="key">${o.key}</span><span class="txt rich">${raw(richHtml(o.text))}${chosen.has(o.key) ? html` <span class="badge">your answer</span>` : ''}${showAnswer && keys.has(o.key) ? html` <span class="badge ok">correct</span>` : ''}</span></div>`)}</div>`
      : html`<p class="mt"><b>Your answer:</b> ${q.type === 'descriptive' ? '' : fmtAnswer(q.type, q.response)}</p>
        ${q.type === 'descriptive' && q.response ? html`<div class="explain" style="white-space:pre-wrap">${q.response}</div>` : ''}
        ${showAnswer && q.type === 'numeric' ? html`<p><b>Correct answer:</b> ${fmtAnswer('numeric', q.answer)}</p>` : ''}`}
    ${q.evaluation ? html`<div class="explain"><b>Mentor evaluation: ${num(q.evaluation.marks)} / ${num(q.maxMarks)}</b>${q.evaluation.feedback ? html`<div class="small" style="white-space:pre-wrap">${q.evaluation.feedback}</div>` : ''}</div>` : ''}
    ${showAnswer && (c.explanation || c.solution) ? html`<div class="explain"><b>${q.type === 'descriptive' ? 'Model answer pointers' : 'Explanation'}</b><div class="rich small">${raw(richHtml(c.explanation || ''))}</div>${c.solution ? html`<div class="rich small mt">${raw(richHtml(c.solution))}</div>` : ''}</div>` : ''}`;
}

export default async function result({ root, params }) {
  const r = await get(`/api/attempts/${params.id}/result`);
  const res = r.result;
  let filter = 'all';
  const lang = 'en';
  const all = r.sections.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.name })));

  const draw = () => {
    const shown = all.filter((q) => filter === 'all' || (filter === 'marked' ? q.marked : q.outcome === filter));
    mount($('#qs', root), shown.length ? html`${shown.map((q) => {
      const [label, cls] = OUTCOME[q.outcome] || ['', ''];
      return html`<article class="card outcome-${q.outcome}">
        <div class="card-head"><h3>Q${q.number} <span class="small muted">· ${q.section}${q.subject && q.subject !== q.section ? ` · ${q.subject}` : ''}</span></h3>
          <span class="badge ${cls}">${label}</span><span class="badge">${q.marks === null ? '—' : (q.marks > 0 ? '+' : '') + num(q.marks)} / ${num(q.maxMarks)}</span>
          <span class="tiny muted nowrap" title="Time spent">⏱ ${clock(q.timeSpentMs).replace(/^00:/, '')}</span>
          ${q.type !== 'descriptive' ? html`<button class="btn sm ghost" data-bm="${q.questionId}" aria-pressed="${q.bookmarked}">${q.bookmarked ? '★ Saved' : '☆ Save'}</button>` : ''}</div>
        <div class="tiny muted" style="margin-top:-8px;margin-bottom:8px">${TYPE_LABEL[q.type]}${q.marked ? ' · marked for review' : ''}</div>
        ${questionReview(q, { lang, showAnswer: r.showSolutions })}</article>`;
    })}` : html`<p class="empty">No questions in this filter.</p>`);
    typeset($('#qs', root));
    $$('.tabs button', root).forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
  };

  const counts = { all: all.length, correct: res.correct, incorrect: res.incorrect, partial: res.partial, unattempted: res.unattempted, marked: all.filter((q) => q.marked).length, pending: res.pending };
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>${r.title}</h1>
      <p>Submitted ${fmtDate(r.submittedAt)}${r.submitReason === 'timeout' ? ' · time ran out' : ''} · pattern v${r.patternVersion}</p></div>
      <button class="btn no-print" id="print">Print / save PDF</button><a class="btn no-print" href="#/tests">Back to tests</a></div>
    ${res.pending ? html`<div class="info">${res.pending} descriptive answer(s) are waiting for a mentor's evaluation. Your score will update once they are marked.</div>` : ''}
    <div class="grid g4 mt">
      <div class="stat"><div class="k">Score</div><div class="v">${num(res.score)}<span class="muted" style="font-size:1rem"> / ${num(res.maxScore)}</span></div><div class="s">${pct(res.percentage)}</div></div>
      <div class="stat"><div class="k">Rank</div><div class="v">${r.rank.rank}<span class="muted" style="font-size:1rem"> / ${r.rank.total}</span></div><div class="s">${r.rank.percentile !== null ? `${num(r.rank.percentile)} percentile` : ''}</div></div>
      <div class="stat"><div class="k">Accuracy</div><div class="v">${pct(res.accuracy)}</div><div class="s">${res.correct} correct · ${res.incorrect} wrong${res.partial ? ` · ${res.partial} partial` : ''}</div></div>
      <div class="stat"><div class="k">Time used</div><div class="v">${clock(new Date(r.endedAt || r.submittedAt) - new Date(r.startedAt)).replace(/^00:/, '')}</div><div class="s">${res.unattempted} not answered</div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h3>Section-wise</h3><div class="table-wrap"><table class="table"><thead><tr><th>Section</th><th class="num">Score</th><th class="num">Correct</th><th class="num">Wrong</th><th class="num">Skipped</th><th class="num">Time</th></tr></thead>
        <tbody>${res.sections.map((s) => html`<tr><td>${s.name}</td><td class="num">${num(s.score)} / ${num(s.maxScore)}</td><td class="num">${s.correct}</td><td class="num">${s.incorrect}</td><td class="num">${s.unattempted}</td><td class="num">${clock(s.timeSpentMs).replace(/^00:/, '')}</td></tr>`)}</tbody></table></div></div>
      <div class="card"><h3>Subject-wise</h3>${res.bySubject.map((s) => {
        const p = s.maxScore ? Math.max(0, (s.score / s.maxScore) * 100) : 0;
        return html`<div class="mt"><div class="row small"><b>${s.name}</b><span class="right">${num(s.score)} / ${num(s.maxScore)} · ${s.correct}/${s.attempted} correct</span></div>
          <div class="meter ${p >= 70 ? 'ok' : p >= 40 ? 'warn' : 'bad'}"><i style="width:${p}%"></i></div></div>`;
      })}
      <p class="tiny muted mt">Submission receipt: attempt <code>${r.receipt.attemptId}</code> recorded at ${fmtDate(r.receipt.submittedAt)}.</p></div>
    </div>
    <h2 class="mt">Question-wise analysis</h2>
    ${r.showSolutions ? '' : html`<p class="note">Solutions for this test are not released.</p>`}
    <div class="tabs no-print">${Object.entries({ all: 'All', correct: 'Correct', incorrect: 'Incorrect', partial: 'Partial', unattempted: 'Not answered', marked: 'Marked', pending: 'Pending' })
      .filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => html`<button data-f="${k}">${l} (${counts[k]})</button>`)}</div>
    <div id="qs"></div>`);
  draw();
  $('.tabs', root)?.addEventListener('click', (e) => { const f = e.target.dataset.f; if (f) { filter = f; draw(); } });
  $('#print', root).addEventListener('click', () => window.print());
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bm]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') === 'true';
    try {
      if (on) await del(`/api/bookmarks/${b.dataset.bm}`); else await put(`/api/bookmarks/${b.dataset.bm}`, {});
      all.filter((q) => q.questionId === b.dataset.bm).forEach((q) => { q.bookmarked = !on; });
      b.setAttribute('aria-pressed', String(!on)); b.textContent = on ? '☆ Save' : '★ Saved';
      toast(on ? 'Removed from bookmarks.' : 'Saved to bookmarks.');
    } catch (err) { toast(err.message, 'bad'); }
  });
}
