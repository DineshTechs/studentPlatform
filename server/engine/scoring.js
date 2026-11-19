// Pure scoring engine. Given a question's answer key, the student's response and the marking
// rule from the pattern version, return the outcome and marks. No I/O, fully unit-tested.
import { round2 } from '../lib/ids.js';

const NUMERIC_RE = /^-?\d{1,12}(\.\d{1,8})?$/;

export function isEmptyResponse(type, response) {
  if (response === undefined || response === null) return true;
  if (type === 'mcq_multi') return !Array.isArray(response) || response.length === 0;
  if (typeof response === 'string') return response.trim() === '';
  return false;
}

/** Validates the shape of a response before it is stored. Returns an error message or null. */
export function responseProblem(type, response, optionKeys = []) {
  if (isEmptyResponse(type, response)) return null;
  switch (type) {
    case 'mcq_single':
      return typeof response === 'string' && optionKeys.includes(response) ? null : 'Choose one of the listed options.';
    case 'mcq_multi':
      if (!Array.isArray(response) || response.some((k) => typeof k !== 'string' || !optionKeys.includes(k))) return 'Choose from the listed options.';
      return new Set(response).size === response.length ? null : 'Each option can be selected once.';
    case 'numeric':
      return typeof response === 'string' && NUMERIC_RE.test(response.trim()) ? null : 'Enter a number (digits, optional minus sign and decimal point).';
    case 'descriptive':
      return typeof response === 'string' && response.length <= 20000 ? null : 'Answer must be text of at most 20,000 characters.';
    default:
      return 'Unknown question type.';
  }
}

export function normalizeResponse(type, response) {
  if (isEmptyResponse(type, response)) return null;
  if (type === 'mcq_multi') return [...response].sort();
  if (type === 'numeric') return response.trim();
  return response;
}

function numericCorrect(key, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  if (key.min !== undefined && key.max !== undefined) return n >= key.min - 1e-9 && n <= key.max + 1e-9;
  const tol = key.tolerance ?? 0;
  return Math.abs(n - key.value) <= tol + 1e-9;
}

/**
 * @returns {{ outcome: 'correct'|'incorrect'|'partial'|'unattempted'|'pending', marks: number|null }}
 */
export function scoreQuestion({ type, key, response, rule, evaluation }) {
  const unattemptedMarks = rule?.unattempted ?? 0;
  if (isEmptyResponse(type, response)) return { outcome: 'unattempted', marks: unattemptedMarks };

  switch (type) {
    case 'mcq_single': {
      const ok = Array.isArray(key.correct) ? key.correct.includes(response) : key.correct === response; // bonus/dropped questions can list several keys
      return ok ? { outcome: 'correct', marks: rule.correct } : { outcome: 'incorrect', marks: rule.incorrect };
    }
    case 'mcq_multi': {
      const correct = new Set(key.correct);
      const chosen = new Set(response);
      const wrongPicked = [...chosen].some((k) => !correct.has(k));
      if (wrongPicked) return { outcome: 'incorrect', marks: rule.incorrect };
      if (chosen.size === correct.size) return { outcome: 'correct', marks: rule.correct };
      // Strict subset of the correct options.
      if (rule.partial) return { outcome: 'partial', marks: round2(rule.partial.perCorrectOption * chosen.size) };
      return { outcome: 'incorrect', marks: rule.incorrect };
    }
    case 'numeric':
      return numericCorrect(key, response) ? { outcome: 'correct', marks: rule.correct } : { outcome: 'incorrect', marks: rule.incorrect };
    case 'descriptive': {
      if (!evaluation || typeof evaluation.marks !== 'number') return { outcome: 'pending', marks: null };
      return { outcome: 'evaluated', marks: evaluation.marks };
    }
    default:
      throw new Error(`Cannot score unknown question type ${type}`);
  }
}

export function maxMarksFor(type, rule, key) {
  if (type === 'descriptive') return key?.maxMarks ?? rule?.correct ?? 0;
  return rule?.correct ?? 0;
}
