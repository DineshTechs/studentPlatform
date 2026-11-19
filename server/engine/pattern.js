// Examination pattern engine. A pattern version is pure data stored in the database; nothing
// about JEE / NEET / UPSC / SSC lives in code. This module validates that data, resolves
// marking rules and summarises a pattern for preview.
import { round2 } from '../lib/ids.js';

export const QUESTION_TYPES = ['mcq_single', 'mcq_multi', 'numeric', 'descriptive'];
export const TYPE_LABELS = {
  mcq_single: 'Single correct (MCQ)',
  mcq_multi: 'Multiple correct',
  numeric: 'Numerical / integer answer',
  descriptive: 'Descriptive (manually evaluated)',
};
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function ruleErrors(rule, type, path) {
  const errs = [];
  const e = (m) => errs.push({ field: path, message: m });
  if (!rule || typeof rule !== 'object') { e('marking rule is missing'); return errs; }
  if (type === 'descriptive') {
    if (rule.correct !== undefined && (!isNum(rule.correct) || rule.correct <= 0)) e('correct (max marks) must be a positive number');
    return errs;
  }
  if (!isNum(rule.correct) || rule.correct <= 0) e('correct must be a positive number');
  if (!isNum(rule.incorrect) || rule.incorrect > 0) e('incorrect must be zero or negative');
  if (rule.unattempted !== undefined && !isNum(rule.unattempted)) e('unattempted must be a number');
  if (rule.partial !== undefined) {
    if (type !== 'mcq_multi') e('partial marking is only valid for mcq_multi');
    else if (!rule.partial || !isNum(rule.partial.perCorrectOption) || rule.partial.perCorrectOption <= 0) e('partial.perCorrectOption must be a positive number');
    else if (rule.partial.perCorrectOption >= rule.correct) e('partial.perCorrectOption must be less than full marks');
  }
  return errs;
}

export function resolveRule(config, section, part) {
  return part?.marking ?? section?.marking?.[part?.type] ?? config?.marking?.[part?.type] ?? null;
}

/** Returns a list of { field, message }. Empty list means the pattern is valid. */
export function validatePatternConfig(config, { examLanguages } = {}) {
  const errors = [];
  const e = (field, message) => errors.push({ field, message });
  if (!config || typeof config !== 'object') return [{ field: 'config', message: 'must be an object' }];

  if (!Number.isInteger(config.durationSec) || config.durationSec < 60 || config.durationSec > 12 * 3600) e('durationSec', 'must be a whole number of seconds between 60 and 43200');
  if (!Array.isArray(config.languages) || !config.languages.length) e('languages', 'must list at least one language code');
  else if (examLanguages) for (const l of config.languages) if (!examLanguages.includes(l)) e('languages', `"${l}" is not enabled for this examination`);
  const mode = config.navigation?.mode;
  if (!['free', 'sequential'].includes(mode)) e('navigation.mode', 'must be "free" or "sequential"');
  if (config.calculator !== undefined && !['none', 'basic', 'scientific'].includes(config.calculator)) e('calculator', 'must be none, basic or scientific');
  if (config.result?.showSolutions !== undefined && !['after_submit', 'never'].includes(config.result.showSolutions)) e('result.showSolutions', 'must be after_submit or never');
  if (config.marking !== undefined && (typeof config.marking !== 'object' || Array.isArray(config.marking))) e('marking', 'must be an object keyed by question type');
  for (const [type, rule] of Object.entries(config.marking || {})) {
    if (!QUESTION_TYPES.includes(type)) e(`marking.${type}`, 'unknown question type');
    else errors.push(...ruleErrors(rule, type, `marking.${type}`));
  }

  if (!Array.isArray(config.sections) || !config.sections.length) {
    e('sections', 'must contain at least one section');
    return errors;
  }
  const keys = new Set();
  let timedSections = 0;
  let sectionTimeTotal = 0;
  config.sections.forEach((s, i) => {
    const p = `sections[${i}]`;
    if (!s || typeof s !== 'object') return e(p, 'must be an object');
    if (typeof s.key !== 'string' || !/^[a-z0-9_]{1,30}$/.test(s.key)) e(`${p}.key`, 'must be 1–30 lowercase letters, digits or underscores');
    else if (keys.has(s.key)) e(`${p}.key`, `duplicate section key "${s.key}"`);
    else keys.add(s.key);
    if (typeof s.name !== 'string' || !s.name.trim()) e(`${p}.name`, 'is required');
    if (s.durationSec !== undefined) {
      if (!Number.isInteger(s.durationSec) || s.durationSec < 60) e(`${p}.durationSec`, 'must be at least 60 seconds');
      else { timedSections++; sectionTimeTotal += s.durationSec; }
    }
    for (const [type, rule] of Object.entries(s.marking || {})) {
      if (!QUESTION_TYPES.includes(type)) e(`${p}.marking.${type}`, 'unknown question type');
      else errors.push(...ruleErrors(rule, type, `${p}.marking.${type}`));
    }
    if (!Array.isArray(s.composition) || !s.composition.length) e(`${p}.composition`, 'must list at least one { type, count } block');
    let count = 0;
    (s.composition || []).forEach((part, j) => {
      const pp = `${p}.composition[${j}]`;
      if (!QUESTION_TYPES.includes(part?.type)) return e(`${pp}.type`, `must be one of ${QUESTION_TYPES.join(', ')}`);
      if (!Number.isInteger(part.count) || part.count < 1 || part.count > 500) e(`${pp}.count`, 'must be a whole number between 1 and 500');
      else count += part.count;
      const rule = resolveRule(config, s, part);
      if (!rule && part.type !== 'descriptive') e(`${pp}`, `no marking rule for ${part.type} (set it on the block, the section or the pattern)`);
      else if (part.marking) errors.push(...ruleErrors(part.marking, part.type, `${pp}.marking`));
    });
    if (s.maxAttempted !== undefined && (!Number.isInteger(s.maxAttempted) || s.maxAttempted < 1 || s.maxAttempted > count)) {
      e(`${p}.maxAttempted`, `must be between 1 and the section's question count (${count})`);
    }
    const sel = s.selection;
    if (!sel || !Array.isArray(sel.subjectIds) || !sel.subjectIds.length) e(`${p}.selection.subjectIds`, 'must list at least one subject');
    if (sel?.difficultyMix) {
      const vals = Object.entries(sel.difficultyMix);
      if (vals.some(([k, v]) => !DIFFICULTIES.includes(k) || !isNum(v) || v < 0)) e(`${p}.selection.difficultyMix`, 'keys must be easy/medium/hard with non-negative weights');
      else if (vals.reduce((a, [, v]) => a + v, 0) <= 0) e(`${p}.selection.difficultyMix`, 'weights must add up to more than zero');
    }
  });
  if (timedSections) {
    if (mode !== 'sequential') e('navigation.mode', 'section-wise timing requires "sequential" navigation');
    if (timedSections !== config.sections.length) e('sections', 'either every section has durationSec or none does');
    else if (sectionTimeTotal !== config.durationSec) e('durationSec', `must equal the sum of section durations (${sectionTimeTotal})`);
  }
  return errors;
}

/** Human-friendly summary used by the admin preview and by the instructions screen. */
export function summarizePattern(config) {
  const sections = config.sections.map((s) => {
    const perQuestionMax = [];
    const blocks = s.composition.map((part) => {
      const rule = resolveRule(config, s, part) || {};
      for (let i = 0; i < part.count; i++) perQuestionMax.push(rule.correct ?? 0);
      return {
        type: part.type, label: TYPE_LABELS[part.type], count: part.count,
        correct: rule.correct ?? null, incorrect: rule.incorrect ?? 0, unattempted: rule.unattempted ?? 0,
        partialPerOption: rule.partial?.perCorrectOption ?? null,
      };
    });
    const questionCount = perQuestionMax.length;
    const scored = perQuestionMax.sort((a, b) => b - a).slice(0, s.maxAttempted ?? questionCount);
    return {
      key: s.key, name: s.name, durationSec: s.durationSec ?? null, questionCount,
      maxAttempted: s.maxAttempted ?? null, maxMarks: round2(scored.reduce((a, b) => a + b, 0)), blocks,
    };
  });
  return {
    durationSec: config.durationSec,
    navigation: config.navigation.mode,
    sectionTimed: sections.some((s) => s.durationSec),
    calculator: config.calculator || 'none',
    languages: config.languages,
    totalQuestions: sections.reduce((a, s) => a + s.questionCount, 0),
    totalMarks: round2(sections.reduce((a, s) => a + s.maxMarks, 0)),
    sections,
  };
}
