import { html, mount, $, $$, toast, loading, errorBox } from './ui.js';
import { get, post, setUnauthenticatedHandler } from './api.js';

export const state = { user: null };

export function can(perm) {
  const p = state.user?.permissions || [];
  return p.includes('*') || p.includes(perm);
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) location.replace(hash); else location.hash = hash;
}

export async function refreshUser() {
  try { state.user = (await get('/api/me', { quiet401: true })).user; } catch { state.user = null; }
  return state.user;
}

function landingFor(user) {
  switch (user.role) {
    case 'admin': return '#/admin';
    case 'editor': return '#/admin/questions';
    case 'reviewer': return '#/admin/review';
    case 'mentor': return '#/mentor';
    default: return '#/dashboard';
  }
}

// [pattern, loader, { public, bare, perm, nav }]
const ROUTES = [
  ['/login', () => import('./pages/auth.js').then((m) => m.login), { public: true, bare: true }],
  ['/register', () => import('./pages/auth.js').then((m) => m.register), { public: true, bare: true }],
  ['/dashboard', () => import('./pages/dashboard.js').then((m) => m.default), { perm: 'practice' }],
  ['/exams', () => import('./pages/exams.js').then((m) => m.default), { perm: 'profile.self' }],
  ['/tests', () => import('./pages/tests.js').then((m) => m.list), { perm: 'test.take' }],
  ['/tests/:id', () => import('./pages/tests.js').then((m) => m.instructions), { perm: 'test.take' }],
  ['/attempt/:id', () => import('./pages/cbt.js').then((m) => m.default), { perm: 'test.take', bare: true }],
  ['/result/:id', () => import('./pages/result.js').then((m) => m.default), { perm: ['test.take', 'student.performance.read'] }],
  ['/attempts', () => import('./pages/tests.js').then((m) => m.history), { perm: 'test.take' }],
  ['/practice', () => import('./pages/practice.js').then((m) => m.default), { perm: 'practice' }],
  ['/syllabus', () => import('./pages/syllabus.js').then((m) => m.default), { perm: 'syllabus.read' }],
  ['/bookmarks', () => import('./pages/practice.js').then((m) => m.bookmarks), { perm: 'bookmark' }],
  ['/profile', () => import('./pages/exams.js').then((m) => m.profile), { perm: 'profile.self' }],
  ['/admin', () => import('./pages/admin.js').then((m) => m.overview), { perm: 'analytics.view' }],
  ['/admin/exams', () => import('./pages/admin-exams.js').then((m) => m.examList), { perm: ['exam.manage', 'syllabus.manage'] }],
  ['/admin/exams/:id', () => import('./pages/admin-exams.js').then((m) => m.examDetail), { perm: ['exam.manage', 'syllabus.manage'] }],
  ['/admin/patterns/:id', () => import('./pages/admin-exams.js').then((m) => m.patternEditor), { perm: 'exam.manage' }],
  ['/admin/questions', () => import('./pages/admin-questions.js').then((m) => m.questionList), { perm: ['question.read_all', 'question.create'] }],
  ['/admin/questions/import', () => import('./pages/admin-questions.js').then((m) => m.importPage), { perm: 'question.import' }],
  ['/admin/questions/:id', () => import('./pages/admin-questions.js').then((m) => m.questionEditor), { perm: ['question.read_all', 'question.create'] }],
  ['/admin/review', () => import('./pages/admin-questions.js').then((m) => m.reviewQueue), { perm: 'question.review' }],
  ['/admin/tests', () => import('./pages/admin.js').then((m) => m.testList), { perm: 'test.manage' }],
  ['/admin/tests/:id', () => import('./pages/admin.js').then((m) => m.testDetail), { perm: 'test.manage' }],
  ['/admin/users', () => import('./pages/admin.js').then((m) => m.users), { perm: 'user.manage' }],
  ['/admin/audit', () => import('./pages/admin.js').then((m) => m.auditLog), { perm: 'audit.view' }],
  ['/admin/announcements', () => import('./pages/admin.js').then((m) => m.announcements), { perm: 'notification.manage' }],
  ['/mentor', () => import('./pages/admin.js').then((m) => m.mentorQueue), { perm: 'evaluation.descriptive' }],
  ['/mentor/evaluate/:id', () => import('./pages/admin.js').then((m) => m.mentorEvaluate), { perm: 'evaluation.descriptive' }],
];

const NAV = [
  ['Prepare', [
    ['#/dashboard', 'Dashboard', 'practice'], ['#/tests', 'Mock tests', 'test.take'], ['#/practice', 'Practice', 'practice'],
    ['#/syllabus', 'Syllabus', 'syllabus.read', 'student'], ['#/bookmarks', 'Bookmarks', 'bookmark'], ['#/attempts', 'My attempts', 'test.take'],
  ]],
  ['Content', [
    ['#/admin/questions', 'Question bank', 'question.read_all'], ['#/admin/review', 'Review queue', 'question.review'],
    ['#/admin/exams', 'Exams & syllabus', 'syllabus.manage'], ['#/admin/tests', 'Mock tests', 'test.manage'],
  ]],
  ['Mentoring', [['#/mentor', 'Evaluations', 'evaluation.descriptive']]],
  ['Administration', [
    ['#/admin', 'Overview', 'analytics.view'], ['#/admin/users', 'Users', 'user.manage'],
    ['#/admin/announcements', 'Announcements', 'notification.manage'], ['#/admin/audit', 'Audit log', 'audit.view'],
  ]],
  ['Account', [['#/exams', 'Target exams', 'profile.self', 'student'], ['#/profile', 'Profile', 'profile.self']]],
];

function matchRoute(path) {
  for (const [pattern, loader, opts] of ROUTES) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = re.exec(path);
    if (m) return { loader, opts, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function renderShell(current) {
  const app = $('#app');
  const groups = NAV.map(([label, items]) => [label, items.filter(([, , perm, onlyRole]) => can(perm) && (!onlyRole || state.user.role === onlyRole || state.user.role === 'admin'))])
    .filter(([, items]) => items.length);
  mount(app, html`<div class="shell">
    <aside class="side" id="side">
      <div class="brand"><span class="brand-mark">P</span>Pariksha</div>
      <nav class="nav" aria-label="Main">
        ${groups.map(([label, items]) => html`<div class="nav-group">${label}</div>${items.map(([href, text]) => html`<a href="${href}" class="${current === href || (current.startsWith(href + '/') && href !== '#/admin') ? 'active' : ''}">${text}</a>`)}`)}
      </nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn sm menu-btn" id="menu-btn" aria-label="Open menu">☰</button>
        <div class="grow"></div>
        <span class="small muted">${state.user.name} · <span class="badge brand">${state.user.role}</span></span>
        <button class="btn sm" id="logout">Log out</button>
      </header>
      <main class="page" id="page"></main>
    </div>
  </div>`);
  $('#logout').addEventListener('click', async () => {
    await post('/api/auth/logout').catch(() => {});
    state.user = null;
    navigate('#/login');
  });
  $('#menu-btn').addEventListener('click', () => $('#side').classList.toggle('open'));
  $$('#side a').forEach((a) => a.addEventListener('click', () => $('#side').classList.remove('open')));
  return $('#page');
}

let cleanup = null;
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  const hash = location.hash || '#/';
  const [pathPart, queryPart] = hash.slice(1).split('?');
  const path = pathPart || '/';

  if (!state.user && state.user !== false) await refreshUser();
  if (path === '/' || path === '') return navigate(state.user ? landingFor(state.user) : '#/login', { replace: true });

  const route = matchRoute(path);
  if (!route) {
    const page = state.user ? renderShell(hash) : $('#app');
    mount(page, html`<div class="empty"><h2>Page not found</h2><a href="#/">Go home</a></div>`);
    return;
  }
  if (!route.opts.public && !state.user) return navigate(`#/login?next=${encodeURIComponent(hash)}`, { replace: true });
  if (route.opts.public && state.user) return navigate(landingFor(state.user), { replace: true });
  if (route.opts.perm) {
    const perms = Array.isArray(route.opts.perm) ? route.opts.perm : [route.opts.perm];
    if (!perms.some(can)) {
      const page = renderShell(hash);
      mount(page, html`<div class="empty"><h2>Not available</h2><p>Your role does not have access to this page.</p><a href="${landingFor(state.user)}">Go to your home page</a></div>`);
      return;
    }
  }

  const root = route.opts.bare ? $('#app') : renderShell('#' + path);
  mount(root, loading());
  try {
    const page = await route.loader();
    if (token !== renderToken) return;
    const ctx = { root, params: route.params, query: new URLSearchParams(queryPart || ''), user: state.user, navigate, refreshUser, can };
    cleanup = await page(ctx);
    document.title = `${document.querySelector('h1')?.textContent?.trim() || 'Pariksha'} · Pariksha`;
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    mount(root, html`<div class="page">${errorBox(err)}<p class="mt"><button class="btn" id="reload-page">Reload</button></p></div>`);
    $('#reload-page')?.addEventListener('click', () => location.reload());
  }
}

setUnauthenticatedHandler(() => {
  if (state.user) toast('Your session has ended. Please log in again.', 'bad');
  state.user = null;
  if (!location.hash.startsWith('#/login')) navigate(`#/login?next=${encodeURIComponent(location.hash)}`);
});

export function setUser(user) { state.user = user; }
export { landingFor };

window.addEventListener('hashchange', render);
render();
