// Tiny declarative validator. Collects every error instead of failing on the first one.
import { unprocessable } from './http.js';

export function check(value, rules, path = '') {
  const errors = [];
  walk(value, rules, path, errors);
  return errors;
}

export function assertValid(value, rules, message = 'Some fields are invalid.') {
  const errors = check(value, rules);
  if (errors.length) throw unprocessable(message, errors);
  return value;
}

function walk(v, r, path, errors) {
  const label = path || 'value';
  const push = (msg) => errors.push({ field: label, message: msg });
  if (v === undefined || v === null) {
    if (r.required) push('is required');
    return;
  }
  switch (r.type) {
    case 'string':
      if (typeof v !== 'string') return push('must be text');
      if (r.min !== undefined && v.trim().length < r.min) push(`must be at least ${r.min} characters`);
      if (r.max !== undefined && v.length > r.max) push(`must be at most ${r.max} characters`);
      if (r.pattern && !r.pattern.test(v)) push(r.patternMessage || 'has an invalid format');
      if (r.enum && !r.enum.includes(v)) push(`must be one of: ${r.enum.join(', ')}`);
      break;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return push('must be a number');
      if (r.integer && !Number.isInteger(v)) push('must be a whole number');
      if (r.min !== undefined && v < r.min) push(`must be ≥ ${r.min}`);
      if (r.max !== undefined && v > r.max) push(`must be ≤ ${r.max}`);
      break;
    case 'boolean':
      if (typeof v !== 'boolean') push('must be true or false');
      break;
    case 'array':
      if (!Array.isArray(v)) return push('must be a list');
      if (r.min !== undefined && v.length < r.min) push(`must have at least ${r.min} item(s)`);
      if (r.max !== undefined && v.length > r.max) push(`must have at most ${r.max} item(s)`);
      if (r.items) v.forEach((item, i) => walk(item, r.items, `${label}[${i}]`, errors));
      break;
    case 'object':
      if (typeof v !== 'object' || Array.isArray(v)) return push('must be an object');
      if (r.fields) for (const [k, sub] of Object.entries(r.fields)) walk(v[k], sub, path ? `${path}.${k}` : k, errors);
      if (r.values) for (const [k, item] of Object.entries(v)) walk(item, r.values, path ? `${path}.${k}` : k, errors);
      break;
    case 'any':
      break;
    default:
      throw new Error(`Unknown rule type ${r.type}`);
  }
  if (r.custom) {
    const msg = r.custom(v);
    if (msg) push(msg);
  }
}

export const str = (opts = {}) => ({ type: 'string', ...opts });
export const num = (opts = {}) => ({ type: 'number', ...opts });
export const bool = (opts = {}) => ({ type: 'boolean', ...opts });
export const arr = (items, opts = {}) => ({ type: 'array', items, ...opts });
export const obj = (fields, opts = {}) => ({ type: 'object', fields, ...opts });

export function pick(src, keys) {
  const out = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function intParam(v, def, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
