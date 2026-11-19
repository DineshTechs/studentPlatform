// Thin JSON client. Throws ApiError with server-provided code/message/details.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}

let onUnauthenticated = () => {};
export function setUnauthenticatedHandler(fn) { onUnauthenticated = fn; }

export async function api(method, path, body, { timeoutMs = 15000, quiet401 = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'X-Requested-With': 'fetch', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK', navigator.onLine ? 'Could not reach the server. Please try again.' : 'You appear to be offline.');
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = json?.error || {};
    if (res.status === 401 && !quiet401) onUnauthenticated();
    throw new ApiError(res.status, err.code || 'HTTP_' + res.status, err.message || `Request failed (${res.status}).`, err.details);
  }
  return json?.data;
}

export const get = (p, o) => api('GET', p, undefined, o);
export const post = (p, b = {}, o) => api('POST', p, b, o);
export const put = (p, b = {}, o) => api('PUT', p, b, o);
export const patch = (p, b = {}, o) => api('PATCH', p, b, o);
export const del = (p, o) => api('DELETE', p, undefined, o);

export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}
