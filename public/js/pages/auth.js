import { html, mount, $, $$, errorBox, formData } from '../ui.js';
import { post, get } from '../api.js';
import { setUser, landingFor } from '../app.js';

const DEMO = [
  ['Student', 'student@examprep.local', 'Student@12345'],
  ['Admin', 'admin@examprep.local', 'Admin@12345'],
  ['Editor', 'editor@examprep.local', 'Editor@12345'],
  ['Reviewer', 'reviewer@examprep.local', 'Reviewer@12345'],
  ['Mentor', 'mentor@examprep.local', 'Mentor@12345'],
];

function frame(root, form) {
  mount(root, html`<div class="auth">
    <section class="auth-art">
      <div class="brand"><span class="brand-mark">P</span>Pariksha</div>
      <div>
        <h1>Practise the way the real exam feels.</h1>
        <p>Computer-based mock tests that follow each examination's official pattern, a reviewed question bank, and progress tracking across the whole syllabus.</p>
        <ul>
          <li>JEE, NEET, UPSC, SSC, banking, railways and defence</li>
          <li>Exam-hall interface: palette, review marks, section timers</li>
          <li>Your answers are saved continuously, even if the connection drops</li>
        </ul>
      </div>
      <p class="small">Patterns are configured per examination and per year.</p>
    </section>
    <section class="auth-form"><div class="card">${form}</div></section>
  </div>`);
}

export function login({ root, query, navigate }) {
  frame(root, html`
    <h2>Log in</h2>
    <p class="muted small">New here? <a href="#/register">Create an account</a></p>
    <form id="f" class="stack" novalidate>
      <div id="err"></div>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary lg" style="width:100%">Log in</button>
    </form>
    <div class="demo-accounts muted" id="demo"></div>`);
  const f = $('#f', root);
  get('/api/health').then((h) => {
    if (!h?.demo) return;
    mount($('#demo', root), html`<div>Demo accounts (seeded data):</div>
      ${DEMO.map(([r, e, p]) => html`<div><button type="button" data-email="${e}" data-pw="${p}">${r}</button> · ${e}</div>`)}`);
    $$('[data-email]', root).forEach((b) => b.addEventListener('click', () => {
      f.email.value = b.dataset.email; f.password.value = b.dataset.pw; f.requestSubmit();
    }));
  }).catch(() => {});
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button.primary');
    btn.disabled = true;
    try {
      const { user } = await post('/api/auth/login', formData(f));
      setUser(user);
      const next = query.get('next');
      navigate(next && next.startsWith('#/') && !next.startsWith('#/login') ? next : landingFor(user));
    } catch (err) {
      mount($('#err', root), errorBox(err));
    } finally { btn.disabled = false; }
  });
}

export function register({ root, navigate }) {
  frame(root, html`
    <h2>Create your account</h2>
    <p class="muted small">Already registered? <a href="#/login">Log in</a></p>
    <form id="f" class="stack" novalidate>
      <div id="err"></div>
      <label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name" required></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="new-password" required>
        <div class="tiny muted">At least 8 characters with letters and numbers.</div></label>
      <button class="btn primary lg" style="width:100%">Create account</button>
    </form>`);
  const f = $('#f', root);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button.primary');
    btn.disabled = true;
    try {
      const { user } = await post('/api/auth/register', formData(f));
      setUser(user);
      navigate('#/exams?welcome=1');
    } catch (err) {
      mount($('#err', root), errorBox(err));
    } finally { btn.disabled = false; }
  });
}
