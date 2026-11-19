// Safe templating: every interpolated value is HTML-escaped unless wrapped in raw().
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? fmt(vals[i]) : ''); });
  return new Raw(out);
}
export function mount(el, content) {
  el.innerHTML = content instanceof Raw ? content.s : esc(content);
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}

// ------------------------------------------------------------------ feedback
export function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3500);
}

export function modal({ title, body, actions = [], onClose, dismissible = true }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  mount(back, html`<div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h2>${title}</h2>${dismissible ? html`<button class="btn ghost sm" data-close aria-label="Close">✕</button>` : ''}</div>
    <div class="modal-body"></div>
    <div class="modal-foot"></div></div>`);
  const bodyEl = $('.modal-body', back);
  if (body instanceof Node) bodyEl.append(body); else mount(bodyEl, body);
  const foot = $('.modal-foot', back);
  if (!actions.length) foot.remove();
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.kind || ''}`;
    b.textContent = a.label;
    b.addEventListener('click', async () => {
      if (a.onClick) {
        b.disabled = true;
        try { const keep = await a.onClick(back); if (keep !== false) close(); } finally { b.disabled = false; }
      } else close();
    });
    foot.append(b);
  }
  if (dismissible) {
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
  }
  document.body.append(back);
  (foot.querySelector('.primary, .ok') || back.querySelector('button'))?.focus();
  return { el: back, close };
}

export function confirmDialog(title, message, { confirm = 'Confirm', kind = 'primary' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body: html`<p>${message}</p>`,
      actions: [{ label: 'Cancel' }, { label: confirm, kind, onClick: () => { done = true; resolve(true); } }],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function errorBox(err) {
  if (!err) return '';
  const details = err.details?.length ? html`<ul>${err.details.map((d) => html`<li><b>${d.field}</b>: ${d.message}</li>`)}</ul>` : '';
  return html`<div class="errors" role="alert">${err.message}${details}</div>`;
}

export const loading = (text = 'Loading…') => html`<div class="loading"><span class="spinner"></span>${text}</div>`;

// ------------------------------------------------------------------ formatting
export function fmtDuration(sec) {
  if (sec === null || sec === undefined) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
export function fmtDate(d, withTime = true) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}
export const num = (n, d = 2) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const pct = (n) => (n === null || n === undefined ? '—' : `${num(n, 1)}%`);
export function signed(n) { return n > 0 ? `+${num(n)}` : num(n); }

export const STATUS_BADGE = {
  draft: '', in_review: 'review', approved: 'ok', rejected: 'bad', archived: '', published: 'ok', retired: 'warn',
  in_progress: 'brand', submitted: 'ok', submitting: 'warn', active: 'ok', suspended: 'bad',
};
export const statusBadge = (s) => html`<span class="badge ${STATUS_BADGE[s] || ''}">${String(s).replace('_', ' ')}</span>`;
export const TYPE_LABEL = { mcq_single: 'Single correct', mcq_multi: 'Multiple correct', numeric: 'Numerical', descriptive: 'Descriptive' };

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? undefined : Number(el.value);
    else out[el.name] = el.value.trim() === '' ? undefined : el.value;
  }
  return out;
}
