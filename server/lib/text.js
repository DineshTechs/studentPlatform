import { sha256 } from './ids.js';

// Normalisation used for duplicate detection: case, punctuation, whitespace and LaTeX
// spacing differences should not hide a duplicate.
export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\\[,;:! ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function contentHash(stem, optionTexts = []) {
  return sha256(normalizeText(stem) + '|' + optionTexts.map(normalizeText).sort().join('|'));
}

function trigrams(s) {
  const t = ` ${normalizeText(s)} `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

/** Jaccard similarity of character trigrams, 0..1 */
export function similarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
