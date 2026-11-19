// Spins up the real HTTP app on a random port. Uses the in-memory database by default;
// set TEST_MONGODB_URI to run the very same tests against a real MongoDB (a throwaway
// database is created and dropped).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createApp } from '../../server/app.js';
import { readConfig } from '../../server/config.js';
import { connectDatabase } from '../../server/db/index.js';
import { seedDatabase, DEMO_USERS } from '../../server/seed/seed.js';

export function fakeClock(start = '2026-11-01T04:30:00Z') {
  let t = new Date(start).valueOf();
  return { now: () => new Date(t), advance(ms) { t += ms; }, set(d) { t = new Date(d).valueOf(); } };
}

export async function startServer({ clock = fakeClock() } = {}) {
  const realUri = process.env.TEST_MONGODB_URI;
  const config = {
    ...readConfig({}),
    dbDriver: realUri ? 'mongodb' : 'memory',
    mongoUri: realUri,
    mongoDbName: `exam_prep_test_${randomBytes(4).toString('hex')}`,
    secureCookies: false,
  };
  const db = await connectDatabase(config);
  const seeded = await seedDatabase(db, { log: () => {}, now: clock.now() });
  const logger = { error: () => {}, log: () => {} };
  const server = createServer(createApp({ db, config, clock, logger }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, db, clock, config, seeded,
    client: () => new Client(base),
    async login(role) {
      const c = new Client(base);
      const u = DEMO_USERS.find((x) => x.role === role);
      const r = await c.post('/api/auth/login', { email: u.email, password: u.password });
      if (r.status !== 200) throw new Error(`login ${role} failed: ${JSON.stringify(r.body)}`);
      c.user = r.body.data.user;
      return c;
    },
    async stop() {
      await new Promise((r) => server.close(r));
      if (realUri) await db.dropDatabase();
      await db.close();
    },
  };
}

export class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, path, body, { headers = {}, csrf = true } = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-Requested-With': 'fetch' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b = {}, o) { return this.req('POST', p, b, o); }
  put(p, b = {}, o) { return this.req('PUT', p, b, o); }
  patch(p, b = {}, o) { return this.req('PATCH', p, b, o); }
  del(p, o) { return this.req('DELETE', p, undefined, o); }
}

/** Looks up the correct answer for an attempt question directly in the database (tests only). */
export async function answerKeyFor(db, attemptId) {
  const a = await db.collection('attempts').findOne({ _id: attemptId });
  const paper = await db.collection('papers').findOne({ _id: a.paperId });
  const out = {};
  for (const s of paper.sections) for (const q of s.questions) out[q.ref] = { type: q.type, answer: q.answer, marking: q.marking, section: s.key, options: (Object.values(q.content)[0].options || []).map((o) => o.key) };
  return out;
}

export function correctResponse(k) {
  if (k.type === 'mcq_single') return k.answer.correct;
  if (k.type === 'mcq_multi') return k.answer.correct;
  if (k.type === 'numeric') return String(k.answer.value);
  return 'An answer.';
}
export function wrongResponse(k) {
  if (k.type === 'mcq_single') return k.options.find((o) => o !== k.answer.correct);
  if (k.type === 'mcq_multi') return k.options.filter((o) => !k.answer.correct.includes(o)).slice(0, 1);
  if (k.type === 'numeric') return String(k.answer.value + 1000);
  return 'x';
}
