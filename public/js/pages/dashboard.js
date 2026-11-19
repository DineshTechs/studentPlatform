import { html, mount, $, num, pct, fmtDate, toast } from '../ui.js';
import { get, patch, qs } from '../api.js';
import { refreshUser } from '../app.js';

export default async function dashboard({ root, user, navigate }) {
  if (!user.targetExamIds?.length && user.role === 'student') return navigate('#/exams?welcome=1', { replace: true });
  const d = await get(`/api/dashboard${qs({ examId: user.activeExamId })}`);
  const s = d.stats;
  const todayPct = Math.min(100, Math.round((s.today.done / s.today.target) * 100));
  const meter = (v, cls = '') => html`<div class="meter ${cls}"><i style="width:${Math.max(0, Math.min(100, v || 0))}%"></i></div>`;

  mount(root, html`
    <div class="hero">
      <div class="grow">
        <h1>Namaste, ${d.user.name.split(' ')[0]}</h1>
        <p>${s.streak ? `You're on a ${s.streak}-day study streak. Keep it going.` : 'Answer a few questions today to start a streak.'}</p>
      </div>
      ${d.targets.length ? html`<label class="small">Preparing for<br>
        <select id="exam-switch">${d.targets.map((t) => html`<option value="${t.id}" ${t.id === d.activeExamId ? 'selected' : ''}>${t.name}</option>`)}</select></label>` : ''}
    </div>

    <div class="grid g4 mt">
      <div class="stat"><div class="k">Syllabus covered</div><div class="v">${pct(s.preparation)}</div><div class="s">${s.topicsCovered} of ${s.topicsTotal} topics practised</div>${meter(s.preparation)}</div>
      <div class="stat"><div class="k">Today's target</div><div class="v">${s.today.done}<span class="muted" style="font-size:1rem"> / ${s.today.target}</span></div><div class="s">questions</div>${meter(todayPct, todayPct >= 100 ? 'ok' : 'warn')}</div>
      <div class="stat"><div class="k">Accuracy</div><div class="v">${pct(s.accuracy)}</div><div class="s">${num(s.questionsAttempted, 0)} questions attempted</div>${meter(s.accuracy, s.accuracy >= 70 ? 'ok' : s.accuracy >= 50 ? 'warn' : 'bad')}</div>
      <div class="stat"><div class="k">Mock average</div><div class="v">${pct(s.avgMockPercentage)}</div><div class="s">${s.mocksTaken} mock test${s.mocksTaken === 1 ? '' : 's'} taken</div>${meter(s.avgMockPercentage)}</div>
    </div>

    <h3 class="mt">Quick start</h3>
    <div class="quick">
      <a href="#/tests">Start a mock test<small>Full exam interface</small></a>
      <a href="#/practice">Practise questions<small>By subject or topic</small></a>
      <a href="#/practice?mode=incorrect">Revise mistakes<small>Questions you got wrong</small></a>
      <a href="#/syllabus">Complete syllabus<small>Track coverage</small></a>
      <a href="#/bookmarks">Bookmarks<small>Saved questions</small></a>
      <a href="#/attempts">Past attempts<small>Results &amp; solutions</small></a>
    </div>

    <div class="grid g2 mt">
      <div class="card">
        <div class="card-head"><h3>Mock test performance</h3><a class="small" href="#/attempts">All attempts</a></div>
        ${d.mockTrend.length ? html`<div class="bars" aria-label="Recent mock test percentages">${d.mockTrend.map((m) => html`<div class="bar" title="${fmtDate(m.at)}"><i style="height:${Math.max(0, m.percentage)}%"></i><span>${Math.round(m.percentage)}%</span></div>`)}</div>`
          : html`<p class="empty">No mock tests yet. Your scores will appear here.</p>`}
        ${d.recentAttempts.length ? html`<ul class="list mt">${d.recentAttempts.map((a) => html`<li>
          <div class="grow" style="flex:1"><b>${a.title}</b><div class="tiny muted">${fmtDate(a.startedAt)}</div></div>
          ${a.status === 'submitted' ? html`<span class="badge brand">${num(a.score)} / ${num(a.maxScore)}</span><a class="btn sm" href="#/result/${a.id}">Analysis</a>`
            : html`<a class="btn sm primary" href="#/attempt/${a.id}">Resume</a>`}</li>`)}</ul>` : ''}
      </div>
      <div class="card">
        <div class="card-head"><h3>Upcoming &amp; open tests</h3><a class="small" href="#/tests">See all</a></div>
        ${d.upcomingTests.length ? html`<ul class="list">${d.upcomingTests.map((t) => html`<li>
          <div style="flex:1"><b>${t.title}</b><div class="tiny muted">${t.availableUntil ? `Open until ${fmtDate(t.availableUntil)}` : 'Always open'} · ${t.kind}</div></div>
          ${t.taken ? html`<span class="badge ok">Taken</span>` : ''}<a class="btn sm" href="#/tests/${t.id}">${t.taken ? 'Retake' : 'Start'}</a></li>`)}</ul>`
          : html`<p class="empty">No tests published for this exam yet.</p>`}
      </div>
    </div>

    <div class="grid g3 mt">
      <div class="card">
        <h3>Subjects</h3>
        ${d.subjects.length ? html`<ul class="list">${d.subjects.map((sub) => html`<li><span style="flex:1">${sub.name}</span>
          <span class="small muted">${sub.attempted ? `${pct(sub.accuracy)} · ${sub.attempted} Qs` : 'Not started'}</span></li>`)}</ul>` : html`<p class="muted">No syllabus mapped yet.</p>`}
        ${d.strong.length ? html`<p class="small mt"><b>Strong:</b> ${d.strong.map((x) => x.name).join(', ')}</p>` : ''}
        ${d.weak.length ? html`<p class="small"><b>Needs work:</b> ${d.weak.map((x) => x.name).join(', ')}</p>` : ''}
      </div>
      <div class="card">
        <h3>Recommended practice</h3>
        ${d.recommendations.length ? html`<ul class="list">${d.recommendations.map((r) => html`<li>
          <div style="flex:1"><b>${r.topic}</b><div class="tiny muted">${r.subject} · ${r.reason}</div></div>
          <a class="btn sm" href="#/practice?topicId=${r.topicId}">${r.kind === 'revise' ? 'Revise' : 'Start'}</a></li>`)}</ul>`
          : html`<p class="muted">Practise a few questions to get personalised recommendations.</p>`}
      </div>
      <div class="card">
        <h3>Announcements</h3>
        ${d.announcements.length ? html`<ul class="list">${d.announcements.map((a) => html`<li style="display:block"><b>${a.title}</b><div class="small">${a.body}</div><div class="tiny muted">${fmtDate(a.publishedAt, false)}</div></li>`)}</ul>`
          : html`<p class="muted">Nothing new.</p>`}
      </div>
    </div>`);

  $('#exam-switch', root)?.addEventListener('change', async (e) => {
    try {
      await patch('/api/me', { activeExamId: e.target.value });
      await refreshUser();
      dashboard({ root, user: (await import('../app.js')).state.user, navigate });
    } catch (err) { toast(err.message, 'bad'); }
  });
}
