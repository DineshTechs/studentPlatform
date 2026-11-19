import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreQuestion, responseProblem } from '../server/engine/scoring.js';
import { validatePatternConfig, summarizePattern } from '../server/engine/pattern.js';
import { allocate, selectQuestions } from '../server/engine/selection.js';
import { createMemoryDb } from '../server/db/memory.js';
import { similarity } from '../server/lib/text.js';
import { streakFrom } from '../server/modules/dashboard.js';

const JEE = { correct: 4, incorrect: -1 };
const ADV = { correct: 4, incorrect: -2, partial: { perCorrectOption: 1 } };

test('single-correct MCQ: correct, wrong, unattempted', () => {
  assert.deepEqual(scoreQuestion({ type: 'mcq_single', key: { correct: 'B' }, response: 'B', rule: JEE }), { outcome: 'correct', marks: 4 });
  assert.deepEqual(scoreQuestion({ type: 'mcq_single', key: { correct: 'B' }, response: 'A', rule: JEE }), { outcome: 'incorrect', marks: -1 });
  assert.deepEqual(scoreQuestion({ type: 'mcq_single', key: { correct: 'B' }, response: null, rule: JEE }), { outcome: 'unattempted', marks: 0 });
});

test('single-correct MCQ with several accepted keys (bonus / dropped questions)', () => {
  assert.equal(scoreQuestion({ type: 'mcq_single', key: { correct: ['A', 'C'] }, response: 'C', rule: JEE }).marks, 4);
});

test('multi-correct with JEE Advanced style partial marking', () => {
  const key = { correct: ['A', 'B', 'D'] };
  const s = (response) => scoreQuestion({ type: 'mcq_multi', key, response, rule: ADV });
  assert.deepEqual(s(['A', 'B', 'D']), { outcome: 'correct', marks: 4 });
  assert.deepEqual(s(['A', 'B']), { outcome: 'partial', marks: 2 });
  assert.deepEqual(s(['D']), { outcome: 'partial', marks: 1 });
  assert.deepEqual(s(['A', 'C']), { outcome: 'incorrect', marks: -2 });
  assert.deepEqual(s([]), { outcome: 'unattempted', marks: 0 });
});

test('multi-correct without partial marking treats a subset as wrong', () => {
  assert.deepEqual(scoreQuestion({ type: 'mcq_multi', key: { correct: ['A', 'B'] }, response: ['A'], rule: { correct: 2, incorrect: 0 } }), { outcome: 'incorrect', marks: 0 });
});

test('numeric answers: exact, tolerance, range', () => {
  assert.equal(scoreQuestion({ type: 'numeric', key: { value: 44.8, tolerance: 0.1 }, response: '44.75', rule: JEE }).outcome, 'correct');
  assert.equal(scoreQuestion({ type: 'numeric', key: { value: 2 }, response: '2.0', rule: JEE }).outcome, 'correct');
  assert.equal(scoreQuestion({ type: 'numeric', key: { value: 2 }, response: '2.01', rule: JEE }).outcome, 'incorrect');
  assert.equal(scoreQuestion({ type: 'numeric', key: { min: 1.5, max: 1.6 }, response: '1.55', rule: JEE }).outcome, 'correct');
});

test('UPSC fractional negative marking keeps two decimals', () => {
  assert.equal(scoreQuestion({ type: 'mcq_single', key: { correct: 'A' }, response: 'B', rule: { correct: 2, incorrect: -0.66 } }).marks, -0.66);
});

test('descriptive answers are pending until evaluated', () => {
  assert.deepEqual(scoreQuestion({ type: 'descriptive', key: { maxMarks: 10 }, response: 'text', rule: {} }), { outcome: 'pending', marks: null });
  assert.deepEqual(scoreQuestion({ type: 'descriptive', key: { maxMarks: 10 }, response: 'text', rule: {}, evaluation: { marks: 6.5 } }), { outcome: 'evaluated', marks: 6.5 });
});

test('response validation rejects malformed answers', () => {
  assert.ok(responseProblem('mcq_single', 'Z', ['A', 'B']));
  assert.ok(responseProblem('mcq_multi', ['A', 'A'], ['A', 'B']));
  assert.ok(responseProblem('numeric', '1e5', []));
  assert.equal(responseProblem('numeric', '-12.5', []), null);
  assert.equal(responseProblem('mcq_single', null, ['A']), null);
});

const basePattern = () => ({
  durationSec: 3600, languages: ['en'], navigation: { mode: 'free' },
  marking: { mcq_single: { correct: 4, incorrect: -1 }, numeric: { correct: 4, incorrect: 0 } },
  sections: [
    { key: 'a', name: 'A', selection: { subjectIds: ['s1'] }, composition: [{ type: 'mcq_single', count: 20 }, { type: 'numeric', count: 10 }], maxAttempted: 25 },
    { key: 'b', name: 'B', selection: { subjectIds: ['s2'] }, composition: [{ type: 'mcq_single', count: 5, marking: { correct: 1, incorrect: -0.25 } }] },
  ],
});

test('pattern summary honours per-block marking and attempt limits', () => {
  const p = basePattern();
  assert.deepEqual(validatePatternConfig(p), []);
  const s = summarizePattern(p);
  assert.equal(s.totalQuestions, 35);
  assert.equal(s.sections[0].maxMarks, 100); // 25 scored questions × 4
  assert.equal(s.sections[1].maxMarks, 5);
  assert.equal(s.totalMarks, 105);
});

test('pattern validation catches structural mistakes', () => {
  const p = basePattern();
  p.sections[1].key = 'a';
  p.sections[0].maxAttempted = 99;
  p.sections[0].composition.push({ type: 'mcq_multi', count: 2 }); // no rule for mcq_multi
  p.sections[0].durationSec = 600; // timed section in free navigation, and not every section timed
  const fields = validatePatternConfig(p).map((e) => e.field);
  assert.ok(fields.includes('sections[1].key'));
  assert.ok(fields.includes('sections[0].maxAttempted'));
  assert.ok(fields.some((f) => f.startsWith('sections[0].composition[2]')));
  assert.ok(fields.includes('navigation.mode'));
});

test('sectional timing must add up to the total duration', () => {
  const p = basePattern();
  p.navigation.mode = 'sequential';
  p.sections[0].durationSec = 1200; p.sections[1].durationSec = 1200;
  assert.ok(validatePatternConfig(p).some((e) => e.field === 'durationSec'));
  p.durationSec = 2400;
  assert.deepEqual(validatePatternConfig(p), []);
});

test('difficulty allocation uses largest remainder', () => {
  assert.deepEqual(allocate(10, { easy: 0.3, medium: 0.5, hard: 0.2 }), { easy: 3, medium: 5, hard: 2 });
  const a = allocate(7, { easy: 1, medium: 1, hard: 1 });
  assert.equal(a.easy + a.medium + a.hard, 7);
});

test('selection is deterministic per seed, avoids reuse and reports shortfalls', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ _id: `q${i}`, difficulty: ['easy', 'medium', 'hard'][i % 3], type: 'mcq_single' }));
  const config = { sections: [{ key: 's', selection: { difficultyMix: { easy: 1, medium: 1, hard: 1 } }, composition: [{ type: 'mcq_single', count: 9 }] }] };
  const r1 = selectQuestions(config, { s: { mcq_single: pool } }, { seed: 'x' });
  const r2 = selectQuestions(config, { s: { mcq_single: pool } }, { seed: 'x' });
  assert.deepEqual(r1.sections, r2.sections);
  assert.equal(new Set(r1.sections[0].questionIds).size, 9);
  const exclude = new Set(r1.sections[0].questionIds);
  const r3 = selectQuestions(config, { s: { mcq_single: pool } }, { seed: 'y', excludeIds: exclude });
  assert.ok(r3.sections[0].questionIds.every((id) => !exclude.has(id)));
  const short = selectQuestions({ sections: [{ key: 's', selection: {}, composition: [{ type: 'mcq_single', count: 50 }] }] }, { s: { mcq_single: pool } }, { seed: 'z' });
  assert.deepEqual(short.shortfalls, [{ section: 's', type: 'mcq_single', needed: 50, available: 30 }]);
});

test('near-duplicate similarity ignores case and punctuation', () => {
  assert.ok(similarity('What is 15% of 640?', 'what is 15 % of 640') > 0.9);
  assert.ok(similarity('What is 15% of 640?', 'Find the capital of France') < 0.3);
});

test('study streak counts consecutive days and survives an empty today', () => {
  const today = new Date('2026-11-19T10:00:00+05:30');
  assert.equal(streakFrom(['2026-11-19', '2026-11-18', '2026-11-17', '2026-11-15'], today, 'Asia/Kolkata'), 3);
  assert.equal(streakFrom(['2026-11-18', '2026-11-17'], today, 'Asia/Kolkata'), 2);
  assert.equal(streakFrom(['2026-11-16'], today, 'Asia/Kolkata'), 0);
});

test('memory database honours unique indexes, operators and conditional updates', async () => {
  const db = createMemoryDb();
  const c = db.collection('t');
  await c.createIndex({ email: 1 }, { unique: true });
  await c.insertOne({ _id: '1', email: 'a', tags: ['x', 'y'], n: 1, nested: { v: 2 } });
  await assert.rejects(c.insertOne({ _id: '2', email: 'a' }), (e) => e.code === 11000);
  assert.equal((await c.findOne({ tags: 'x' }))._id, '1');
  assert.equal(await c.countDocuments({ 'nested.v': { $gte: 2 }, n: { $in: [1, 3] } }), 1);
  assert.equal(await c.countDocuments({ missing: null }), 1);
  const upd = await c.findOneAndUpdate({ _id: '1', n: 1 }, { $inc: { n: 1 }, $push: { tags: { $each: ['z'], $slice: -2 } } }, { returnDocument: 'after' });
  assert.equal(upd.n, 2);
  assert.deepEqual(upd.tags, ['y', 'z']);
  assert.equal(await c.findOneAndUpdate({ _id: '1', n: 1 }, { $set: { n: 9 } }), null); // stale condition
  await c.updateOne({ _id: 'k' }, { $setOnInsert: { a: 1 }, $inc: { hits: 1 } }, { upsert: true });
  await c.updateOne({ _id: 'k' }, { $setOnInsert: { a: 2 }, $inc: { hits: 1 } }, { upsert: true });
  assert.deepEqual(await c.findOne({ _id: 'k' }), { _id: 'k', a: 1, hits: 2 });
});
