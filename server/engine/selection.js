// Question selection for a mock test, driven entirely by a pattern version's section rules.
import { seededRandom, shuffle } from '../lib/ids.js';
import { DIFFICULTIES } from './pattern.js';

/** Split `count` across difficulty levels in proportion to the weights (largest remainder). */
export function allocate(count, mix) {
  const entries = DIFFICULTIES.map((d) => [d, mix?.[d] ?? 0]);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (!total) return null;
  const raw = entries.map(([d, w]) => [d, (count * w) / total]);
  const out = Object.fromEntries(raw.map(([d, v]) => [d, Math.floor(v)]));
  let left = count - Object.values(out).reduce((a, b) => a + b, 0);
  raw.sort((a, b) => (b[1] % 1) - (a[1] % 1));
  for (let i = 0; left > 0; i = (i + 1) % raw.length, left--) out[raw[i][0]]++;
  return out;
}

export function sectionFilter(section, type) {
  const sel = section.selection || {};
  const f = { status: 'approved', type, subjectId: { $in: sel.subjectIds || [] } };
  if (sel.topicIds?.length) f.topicId = { $in: sel.topicIds };
  if (sel.sourceKinds?.length) f['source.kind'] = { $in: sel.sourceKinds };
  if (sel.pyqYears) {
    f['source.year'] = {};
    if (sel.pyqYears.from) f['source.year'].$gte = sel.pyqYears.from;
    if (sel.pyqYears.to) f['source.year'].$lte = sel.pyqYears.to;
  }
  return f;
}

/**
 * pools: { [sectionKey]: { [type]: Question[] } } (already filtered by sectionFilter)
 * Returns { sections: [{ key, questionIds }], shortfalls: [] }
 */
export function selectQuestions(config, pools, { seed, excludeIds = new Set() } = {}) {
  const rand = seededRandom(seed ?? 'default');
  const used = new Set();
  const shortfalls = [];
  const sections = config.sections.map((section) => {
    const ids = [];
    for (const part of section.composition) {
      const pool = (pools[section.key]?.[part.type] || []).filter((q) => !used.has(q._id));
      const fresh = pool.filter((q) => !excludeIds.has(q._id));
      // Prefer questions not used in other papers; fall back to reused ones if needed.
      const ordered = [...shuffle(fresh, rand), ...shuffle(pool.filter((q) => excludeIds.has(q._id)), rand)];
      const plan = allocate(part.count, section.selection?.difficultyMix);
      const picked = [];
      if (plan) {
        for (const d of DIFFICULTIES) {
          for (const q of ordered) {
            if (picked.length >= part.count || (plan[d] ?? 0) <= picked.filter((p) => p.difficulty === d).length) break;
            if (q.difficulty === d && !picked.includes(q)) picked.push(q);
          }
        }
      }
      // Fill any gap (no mix, or not enough of a difficulty) from what is left.
      for (const q of ordered) {
        if (picked.length >= part.count) break;
        if (!picked.includes(q)) picked.push(q);
      }
      if (picked.length < part.count) {
        shortfalls.push({ section: section.key, type: part.type, needed: part.count, available: picked.length });
      }
      for (const q of picked) used.add(q._id);
      ids.push(...picked.map((q) => q._id));
    }
    return { key: section.key, questionIds: ids };
  });
  return { sections, shortfalls };
}
