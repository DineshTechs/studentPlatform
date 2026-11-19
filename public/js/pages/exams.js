import { html, mount, $, $$, toast, errorBox, formData } from '../ui.js';
import { get, patch, post } from '../api.js';
import { refreshUser, state } from '../app.js';

export default async function targetExams({ root, user, query, navigate }) {
  const [cats, exams] = await Promise.all([get('/api/categories'), get('/api/exams')]);
  const selected = new Set(user.targetExamIds || []);
  const draw = () => mount(root, html`
    <div class="page-head"><div class="grow"><h1>Your target examinations</h1>
      <p>${query.get('welcome') ? 'Welcome! Choose the examinations you are preparing for. You can change these any time.' : 'Choose the examinations you are preparing for.'}</p></div>
      <button class="btn primary" id="save" ${selected.size ? '' : 'disabled'}>Save (${selected.size})</button></div>
    ${cats.map((c) => {
      const list = exams.filter((e) => e.categoryId === c.id);
      if (!list.length) return '';
      return html`<h3 class="mt">${c.name}</h3><div class="exam-cards">${list.map((e) => html`
        <label class="exam-card ${selected.has(e.id) ? 'on' : ''}"><input type="checkbox" data-id="${e.id}" ${selected.has(e.id) ? 'checked' : ''}>
          <div><b>${e.name}</b><div class="tiny muted">${e.stages.map((s) => s.name).join(' · ')}</div></div></label>`)}</div>`;
    })}`);
  draw();
  root.addEventListener('change', (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    if (e.target.checked) { if (selected.size >= 10) { e.target.checked = false; return toast('You can pick up to 10 examinations.'); } selected.add(id); }
    else selected.delete(id);
    e.target.closest('.exam-card').classList.toggle('on', e.target.checked);
    const btn = $('#save', root); btn.textContent = `Save (${selected.size})`; btn.disabled = !selected.size;
  });
  root.addEventListener('click', async (e) => {
    if (e.target.id !== 'save') return;
    e.target.disabled = true;
    try {
      await patch('/api/me', { targetExamIds: [...selected] });
      await refreshUser();
      toast('Target examinations saved.', 'ok');
      navigate('#/dashboard');
    } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
  });
}

export async function profile({ root }) {
  const u = state.user;
  mount(root, html`
    <div class="page-head"><div class="grow"><h1>Profile</h1><p>${u.email}</p></div></div>
    <div class="grid g2">
      <form class="card stack" id="pf"><h3>Details</h3><div id="pf-err"></div>
        <label class="field"><span>Name</span><input class="input" name="name" value="${u.name}" required></label>
        <label class="field"><span>Preferred question language</span><select class="input" name="language">
          <option value="en" ${u.preferences?.language === 'en' ? 'selected' : ''}>English</option>
          <option value="hi" ${u.preferences?.language === 'hi' ? 'selected' : ''}>हिन्दी (Hindi)</option></select></label>
        ${u.role === 'student' ? html`<p class="small"><a href="#/exams">Change target examinations →</a></p>` : ''}
        <div><button class="btn primary">Save</button></div>
      </form>
      <form class="card stack" id="pw"><h3>Change password</h3><div id="pw-err"></div>
        <label class="field"><span>Current password</span><input class="input" type="password" name="currentPassword" autocomplete="current-password" required></label>
        <label class="field"><span>New password</span><input class="input" type="password" name="newPassword" autocomplete="new-password" required></label>
        <p class="tiny muted">Changing your password signs you out on all other devices.</p>
        <div><button class="btn primary">Update password</button></div>
      </form>
    </div>`);
  $('#pf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try { await patch('/api/me', { name: f.name, preferences: { language: f.language } }); await refreshUser(); toast('Profile saved.', 'ok'); mount($('#pf-err', root), ''); }
    catch (err) { mount($('#pf-err', root), errorBox(err)); }
  });
  $('#pw', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/me/password', formData(e.target)); e.target.reset(); toast('Password updated.', 'ok'); mount($('#pw-err', root), ''); }
    catch (err) { mount($('#pw-err', root), errorBox(err)); }
  });
}
