// Renders question text: escapes everything, then applies a small, safe subset of markdown
// (bold, italics, lists, pipe tables, line breaks) and typesets $…$ maths with KaTeX.
import { esc } from './ui.js';

function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}

export function richHtml(text) {
  if (!text) return '';
  const lines = esc(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().slice(1, -1).split('|').map((c) => inline(c.trim())));
      const [head, ...body] = cells;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-•]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-•]\s+/, ''));
      i--;
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }
    out.push(inline(line) + (i < lines.length - 1 ? '<br>' : ''));
  }
  return out.join('');
}

let katexPromise = null;
function loadKatex() {
  if (katexPromise) return katexPromise;
  const base = '/vendor/katex/'; // bundled locally: no third-party CDN during an exam
  katexPromise = new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = base + 'katex.min.css';
    document.head.append(css);
    const s1 = document.createElement('script');
    s1.src = base + 'katex.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = base + 'contrib/auto-render.min.js';
      s2.onload = () => resolve(window.renderMathInElement);
      s2.onerror = () => resolve(null);
      document.head.append(s2);
    };
    s1.onerror = () => resolve(null); // if it fails to load, maths stays readable as $…$ source
    document.head.append(s1);
  });
  return katexPromise;
}

export async function typeset(root) {
  if (!root || !/\$/.test(root.textContent)) return;
  const render = await loadKatex();
  if (!render) return;
  try {
    render(root, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
      throwOnError: false,
    });
  } catch { /* leave source text */ }
}

export function pickLang(content, lang) {
  return content?.[lang] || content?.en || Object.values(content || {})[0] || {};
}
