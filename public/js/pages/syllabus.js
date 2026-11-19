import { html, mount, pct } from '../ui.js';
import { get } from '../api.js';

export default async function syllabus({ root, user }) {
  if (!user.activeExamId) {
    mount(root, html`<div class="empty"><h2>Choose a target examination first</h2><a href="#/exams">Pick examinations</a></div>`);
    return;
  }
  const [exam, tree] = await Promise.all([get(`/api/exams/${user.activeExamId}`), get(`/api/exams/${user.activeExamId}/syllabus`)]);
  const topics = (n) => (n.type === 'topic' ? [n] : n.children.flatMap(topics));
  const summary = (n) => {
    const ts = topics(n);
    const done = ts.filter((t) => t.progress?.attempted).length;
    return { done, total: ts.length };
  };
  const node = (n) => {
    if (n.type === 'topic' || !n.children.length) {
      const p = n.progress;
      const acc = p?.attempted ? (p.correct / p.attempted) * 100 : null;
      return html`<li><div class="node"><span style="flex:1">${n.name}</span>
        <span class="tiny muted">${n.questionCount} Qs</span>
        ${p?.attempted ? html`<span class="badge ${acc >= 70 ? 'ok' : acc >= 40 ? 'warn' : 'bad'}">${pct(acc)} · ${p.attempted} done</span>` : html`<span class="badge">not started</span>`}
        ${n.questionCount ? html`<a class="btn sm" href="#/practice?topicId=${n.id}">Practise</a>` : ''}</div></li>`;
    }
    const s = summary(n);
    return html`<li><details ${n.type === 'subject' ? 'open' : ''}><summary><div class="node"><b style="flex:1">${n.name}</b>
      ${n.weightage ? html`<span class="tiny muted">weightage ${n.weightage}%</span>` : ''}<span class="tiny muted">${s.done}/${s.total} topics</span></div></summary>
      <ul>${n.children.map(node)}</ul></details></li>`;
  };
  const all = tree.flatMap(topics);
  const done = all.filter((t) => t.progress?.attempted).length;
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Syllabus — ${exam.name}</h1><p>${done} of ${all.length} topics practised. Topics turn green as your accuracy improves.</p></div></div>
    <div class="meter"><i style="width:${all.length ? (done / all.length) * 100 : 0}%"></i></div>
    <div class="card mt">${tree.length ? html`<ul class="tree">${tree.map(node)}</ul>` : html`<p class="empty">The syllabus for this examination has not been added yet.</p>`}</div>
    ${exam.info?.officialWebsite ? html`<p class="small muted mt">Always confirm the latest syllabus on the official website: <a href="${exam.info.officialWebsite}" target="_blank" rel="noopener noreferrer">${exam.info.officialWebsite}</a></p>` : ''}`);
}
