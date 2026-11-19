import { html, mount, $, toast, errorBox, fmtDuration, fmtDate, num, statusBadge, raw } from '../ui.js';
import { get, post, qs } from '../api.js';
import { richHtml, typeset } from '../render.js';

export async function list({ root, user }) {
  if (!user.activeExamId) {
    mount(root, html`<div class="empty"><h2>No target examination</h2><p><a href="#/exams">Choose your examinations</a> to see their mock tests.</p></div>`);
    return;
  }
  const [exam, data] = await Promise.all([get(`/api/exams/${user.activeExamId}`), get(`/api/mock-tests${qs({ examId: user.activeExamId })}`)]);
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Mock tests</h1><p>${exam.name}. Switch examination from the dashboard.</p></div></div>
    ${data.items.length ? html`<div class="test-cards">${data.items.map((t) => {
      const left = t.maxAttempts ? t.maxAttempts - t.attemptsUsed : null;
      return html`<article class="test-card">
        <div class="row"><span class="badge brand">${t.kind}</span>${t.isOpen ? '' : html`<span class="badge warn">${new Date(t.availableFrom) > new Date() ? 'Opens ' + fmtDate(t.availableFrom) : 'Closed'}</span>`}</div>
        <h3 style="margin:0">${t.title}</h3>
        ${t.summary ? html`<div class="facts"><span><b>${t.summary.totalQuestions}</b> questions</span><span><b>${num(t.summary.totalMarks)}</b> marks</span><span><b>${fmtDuration(t.summary.durationSec)}</b></span></div>` : ''}
        <div class="small muted">${t.attemptsUsed ? `Attempted ${t.attemptsUsed}×${t.bestScore !== null ? ` · best ${num(t.bestScore)}` : ''}` : 'Not attempted yet'}${left !== null ? ` · ${left} attempt${left === 1 ? '' : 's'} left` : ''}</div>
        <div class="actions">
          ${t.inProgressAttemptId ? html`<a class="btn primary" href="#/attempt/${t.inProgressAttemptId}">Resume test</a>`
            : t.isOpen && (left === null || left > 0) ? html`<a class="btn primary" href="#/tests/${t.id}">${t.attemptsUsed ? 'Attempt again' : 'Start test'}</a>` : ''}
          ${t.lastAttemptId ? html`<a class="btn" href="#/result/${t.lastAttemptId}">Last result</a>` : ''}
        </div></article>`;
    })}</div>` : html`<div class="card empty">No mock tests have been published for ${exam.name} yet.</div>`}`);
}

export async function instructions({ root, params, user, navigate }) {
  const t = await get(`/api/mock-tests/${params.id}`);
  const s = t.summary;
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>${t.title}</h1><p>${t.examName} · pattern version ${t.patternVersion}</p></div></div>
    <div class="grid g2">
      <div class="card">
        <h3>General instructions</h3>
        <ol class="small" style="padding-left:18px">
          <li>The clock is kept by the server. The countdown timer shows the time remaining; when it reaches zero the test is submitted automatically.</li>
          <li>The question palette on the right shows the status of each question:
            <div class="legend" style="border:0;padding:8px 0 0">
              <div><span class="pal not_visited">1</span>Not visited</div><div><span class="pal not_answered">2</span>Not answered</div>
              <div><span class="pal answered">3</span>Answered</div><div><span class="pal marked">4</span>Marked for review</div>
              <div><span class="pal answered_marked">5</span>Answered &amp; marked</div></div></li>
          <li>Questions that are answered and marked for review ${raw('<b>are evaluated</b>')} unless stated otherwise.</li>
          <li>Selecting an option does not save it. Click <b>Save &amp; Next</b> (or <b>Save &amp; Mark for Review</b>) to save your answer.</li>
          <li>Your answers are saved to the server as you go. If your connection drops, keep answering — they are stored on this device and sent when you're back online. Do not clear your browser data during the test.</li>
          ${s.sectionTimed ? html`<li><b>This test has section-wise timing.</b> Each section is locked once its time ends and you cannot return to it.</li>` : s.navigation === 'sequential' ? html`<li>Sections are attempted in order. Once you move on you cannot go back.</li>` : html`<li>You may switch between sections at any time.</li>`}
          <li>The test runs in full-screen mode. Leaving full screen or switching tabs is recorded.</li>
        </ol>
      </div>
      <div class="card">
        <h3>Paper pattern</h3>
        <div class="facts row small"><span class="badge brand">${s.totalQuestions} questions</span><span class="badge brand">${num(s.totalMarks)} marks</span><span class="badge brand">${fmtDuration(s.durationSec)}</span>${s.calculator !== 'none' ? html`<span class="badge">On-screen calculator</span>` : ''}</div>
        <div class="table-wrap mt"><table class="table"><thead><tr><th>Section</th><th class="num">Questions</th><th>Marking</th><th class="num">Marks</th>${s.sectionTimed ? html`<th class="num">Time</th>` : ''}</tr></thead>
          <tbody>${s.sections.map((sec) => html`<tr><td>${sec.name}${sec.maxAttempted ? html`<div class="tiny muted">Answer any ${sec.maxAttempted} of ${sec.questionCount}</div>` : ''}</td>
            <td class="num">${sec.questionCount}</td>
            <td class="small">${sec.blocks.map((b) => html`<div>${b.count} × ${b.label}: ${b.correct !== null ? `+${b.correct}` : 'evaluated'}${b.incorrect ? ` / ${b.incorrect}` : ''}${b.partialPerOption ? ` (partial +${b.partialPerOption} per option)` : ''}</div>`)}</td>
            <td class="num">${num(sec.maxMarks)}</td>${s.sectionTimed ? html`<td class="num">${fmtDuration(sec.durationSec)}</td>` : ''}</tr>`)}</tbody></table></div>
        ${t.instructions ? html`<h4 class="mt">Examination-specific instructions</h4><div class="rich small" id="exam-instr">${raw(richHtml(t.instructions))}</div>` : ''}
      </div>
    </div>
    <div class="card mt">
      <div id="err"></div>
      <label class="check"><input type="checkbox" id="agree"> <span>I have read and understood the instructions. All computer hardware allotted to me is in proper working condition, and I will not use any unfair means.</span></label>
      <div class="row mt"><a class="btn" href="#/tests">Back</a><button class="btn primary lg" id="start" disabled>I am ready to begin</button>
        <span class="small muted">${user.name}</span></div>
    </div>`);
  typeset($('#exam-instr', root));
  $('#agree', root).addEventListener('change', (e) => { $('#start', root).disabled = !e.target.checked; });
  $('#start', root).addEventListener('click', async (e) => {
    e.target.disabled = true;
    // Full screen must be requested from the click itself.
    try { await document.documentElement.requestFullscreen?.(); } catch { /* not supported or refused */ }
    try {
      const r = await post(`/api/mock-tests/${t.id}/attempts`);
      if (r.resumed) toast('Resuming your unfinished attempt.');
      navigate(`#/attempt/${r.attemptId}`);
    } catch (err) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      mount($('#err', root), errorBox(err));
      e.target.disabled = false;
    }
  });
}

export async function history({ root }) {
  const items = await get('/api/attempts');
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>My attempts</h1><p>Every attempt keeps the pattern version it was taken under.</p></div></div>
    <div class="card">${items.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Test</th><th>Started</th><th>Status</th><th class="num">Score</th><th class="num">Accuracy</th><th></th></tr></thead><tbody>
      ${items.map((a) => html`<tr><td><b>${a.title}</b><div class="tiny muted">Attempt ${a.id} · pattern v${a.patternVersion}</div></td><td class="nowrap">${fmtDate(a.startedAt)}</td>
        <td>${statusBadge(a.status)}${a.submitReason === 'timeout' ? html` <span class="badge warn">time up</span>` : ''}${a.pending ? html` <span class="badge review">evaluation pending</span>` : ''}</td>
        <td class="num">${a.score !== null ? `${num(a.score)} / ${num(a.maxScore)}` : '—'}</td><td class="num">${a.accuracy !== null ? `${num(a.accuracy, 1)}%` : '—'}</td>
        <td>${a.status === 'in_progress' ? html`<a class="btn sm primary" href="#/attempt/${a.id}">Resume</a>` : a.status === 'submitted' ? html`<a class="btn sm" href="#/result/${a.id}">Analysis</a>` : ''}</td></tr>`)}
    </tbody></table></div>` : html`<p class="empty">You have not attempted any tests yet. <a href="#/tests">Browse mock tests</a></p>`}</div>`);
}
