import { assertValid, str, arr, obj, bool, num } from '../lib/validate.js';
import { newId, slugify } from '../lib/ids.js';
import { notFound, conflict, unprocessable } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { validatePatternConfig, summarizePattern } from '../engine/pattern.js';

const LANGS = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as'];

const examRules = (partial) => obj({
  name: str({ required: !partial, min: 2, max: 120 }),
  slug: str({ max: 80, pattern: /^[a-z0-9-]+$/, patternMessage: 'use lowercase letters, digits and hyphens' }),
  categoryId: str({ required: !partial, max: 40 }),
  description: str({ max: 4000 }),
  languages: arr(str({ enum: LANGS }), { min: 1, max: 13 }),
  stages: arr(obj({ key: str({ required: true, pattern: /^[a-z0-9_]{1,30}$/ }), name: str({ required: true, max: 80 }) }), { min: 1, max: 10 }),
  info: obj({
    conductingBody: str({ max: 200 }), eligibility: str({ max: 4000 }), frequency: str({ max: 200 }),
    officialWebsite: str({ max: 300, pattern: /^https:\/\//, patternMessage: 'must start with https://' }), notes: str({ max: 4000 }),
  }),
  isActive: bool(),
});

export function publicPattern(p, { withConfig = true } = {}) {
  return {
    id: p._id, examId: p.examId, stageKey: p.stageKey, version: p.version, label: p.label, status: p.status,
    effectiveFrom: p.effectiveFrom, createdAt: p.createdAt, publishedAt: p.publishedAt ?? null,
    ...(withConfig ? { config: p.config } : {}), summary: safeSummary(p.config),
  };
}
function safeSummary(config) {
  try { return validatePatternConfig(config).length ? null : summarizePattern(config); } catch { return null; }
}

export default function register(router, { db }) {
  const exams = db.collection('exams');
  const patterns = db.collection('patterns');

  // ---------- public catalog ----------
  router.get('/api/categories', { auth: false }, async () => {
    const cats = await db.collection('categories').find({}).sort({ order: 1, name: 1 }).toArray();
    return cats.map((c) => ({ id: c._id, name: c.name, slug: c.slug }));
  });

  router.get('/api/exams', { auth: false }, async (ctx) => {
    const filter = { isActive: true };
    if (ctx.query.get('categoryId')) filter.categoryId = ctx.query.get('categoryId');
    const list = await exams.find(filter).sort({ order: 1, name: 1 }).toArray();
    return list.map((e) => ({ id: e._id, name: e.name, slug: e.slug, categoryId: e.categoryId, description: e.description, languages: e.languages, stages: e.stages }));
  });

  router.get('/api/exams/:id', { auth: false }, async (ctx) => {
    const exam = await exams.findOne({ _id: ctx.params.id, isActive: true });
    if (!exam) throw notFound('Examination');
    const pubs = await patterns.find({ examId: exam._id, status: 'published' }).sort({ stageKey: 1, version: -1 }).toArray();
    return {
      id: exam._id, name: exam.name, slug: exam.slug, categoryId: exam.categoryId, description: exam.description,
      languages: exam.languages, stages: exam.stages, info: exam.info || {},
      patterns: pubs.map((p) => publicPattern(p, { withConfig: false })),
    };
  });

  // ---------- admin: categories & exams ----------
  router.post('/api/admin/categories', { perm: 'exam.manage', status: 201 }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ name: str({ required: true, min: 2, max: 80 }), order: num({ integer: true }) }));
    const doc = { _id: newId('cat'), name: b.name.trim(), slug: slugify(b.name), order: b.order ?? 100, createdAt: ctx.now };
    await db.collection('categories').insertOne(doc);
    await audit(ctx, 'category.create', 'category', doc._id, { name: doc.name });
    return { id: doc._id, name: doc.name, slug: doc.slug };
  });

  router.get('/api/admin/exams', { perm: ['exam.manage', 'syllabus.manage', 'question.read_all'] }, async () => {
    const list = await exams.find({}).sort({ order: 1, name: 1 }).toArray();
    return list.map((e) => ({ id: e._id, name: e.name, slug: e.slug, categoryId: e.categoryId, isActive: e.isActive, languages: e.languages, stages: e.stages, info: e.info || {}, description: e.description }));
  });

  router.post('/api/admin/exams', { perm: 'exam.manage', status: 201 }, async (ctx) => {
    const b = assertValid(ctx.body, examRules(false));
    if (!(await db.collection('categories').findOne({ _id: b.categoryId }))) throw unprocessable('Category does not exist.', [{ field: 'categoryId', message: 'unknown category' }]);
    const doc = {
      _id: newId('exm'), name: b.name.trim(), slug: b.slug || slugify(b.name), categoryId: b.categoryId,
      description: b.description || '', languages: b.languages || ['en'], stages: b.stages || [{ key: 'main', name: 'Main examination' }],
      info: b.info || {}, isActive: b.isActive ?? true, order: 100, createdAt: ctx.now, updatedAt: ctx.now,
    };
    try { await exams.insertOne(doc); } catch (e) { if (e.code === 11000) throw conflict('An examination with this slug already exists.'); throw e; }
    await audit(ctx, 'exam.create', 'exam', doc._id, { name: doc.name });
    return { id: doc._id };
  });

  router.patch('/api/admin/exams/:id', { perm: 'exam.manage' }, async (ctx) => {
    const b = assertValid(ctx.body, examRules(true));
    const $set = { ...b, updatedAt: ctx.now };
    const updated = await exams.findOneAndUpdate({ _id: ctx.params.id }, { $set }, { returnDocument: 'after' });
    if (!updated) throw notFound('Examination');
    await audit(ctx, 'exam.update', 'exam', ctx.params.id, { fields: Object.keys(b) });
    return { id: updated._id };
  });

  // ---------- admin: pattern versions ----------
  router.get('/api/admin/exams/:id/patterns', { perm: ['exam.manage', 'test.manage'] }, async (ctx) => {
    const list = await patterns.find({ examId: ctx.params.id }).sort({ stageKey: 1, version: -1 }).toArray();
    return list.map((p) => publicPattern(p, { withConfig: false }));
  });

  router.post('/api/admin/patterns/validate', { perm: 'exam.manage' }, async (ctx) => {
    const exam = ctx.body.examId ? await exams.findOne({ _id: ctx.body.examId }) : null;
    const errors = validatePatternConfig(ctx.body.config, { examLanguages: exam?.languages });
    return { valid: errors.length === 0, errors, summary: errors.length ? null : summarizePattern(ctx.body.config) };
  });

  router.post('/api/admin/exams/:id/patterns', { perm: 'exam.manage', status: 201 }, async (ctx) => {
    const exam = await exams.findOne({ _id: ctx.params.id });
    if (!exam) throw notFound('Examination');
    const b = assertValid(ctx.body, obj({
      stageKey: str({ required: true }), label: str({ required: true, min: 2, max: 120 }),
      basedOnPatternId: str({ max: 40 }), config: { type: 'any' }, effectiveFrom: str({ max: 30 }),
    }));
    if (!exam.stages.some((s) => s.key === b.stageKey)) throw unprocessable('Unknown stage for this examination.', [{ field: 'stageKey', message: 'unknown stage' }]);
    let config = b.config;
    if (b.basedOnPatternId) {
      const base = await patterns.findOne({ _id: b.basedOnPatternId, examId: exam._id });
      if (!base) throw notFound('Base pattern');
      config = config ?? structuredClone(base.config);
    }
    if (!config) throw unprocessable('Provide a config or a pattern to copy from.');
    // Drafts may be incomplete; validation is enforced on publish.
    for (let tries = 0; tries < 3; tries++) {
      const [latest] = await patterns.find({ examId: exam._id, stageKey: b.stageKey }).sort({ version: -1 }).limit(1).toArray();
      const doc = {
        _id: newId('pat'), examId: exam._id, stageKey: b.stageKey, version: (latest?.version || 0) + 1,
        label: b.label.trim(), status: 'draft', config, basedOn: b.basedOnPatternId || null,
        effectiveFrom: b.effectiveFrom ? new Date(b.effectiveFrom) : null, createdBy: ctx.user._id, createdAt: ctx.now,
      };
      try {
        await patterns.insertOne(doc);
        await audit(ctx, 'pattern.create', 'pattern', doc._id, { examId: exam._id, version: doc.version });
        return publicPattern(doc);
      } catch (e) { if (e.code !== 11000) throw e; }
    }
    throw conflict('Another administrator created a version at the same time. Please retry.');
  });

  router.get('/api/admin/patterns/:id', { perm: ['exam.manage', 'test.manage'] }, async (ctx) => {
    const p = await patterns.findOne({ _id: ctx.params.id });
    if (!p) throw notFound('Pattern');
    const exam = await exams.findOne({ _id: p.examId });
    return { ...publicPattern(p), errors: validatePatternConfig(p.config, { examLanguages: exam?.languages }) };
  });

  router.put('/api/admin/patterns/:id', { perm: 'exam.manage' }, async (ctx) => {
    const b = assertValid(ctx.body, obj({ label: str({ min: 2, max: 120 }), config: { type: 'any' }, effectiveFrom: str({ max: 30 }) }));
    const $set = { updatedAt: ctx.now, updatedBy: ctx.user._id };
    if (b.label) $set.label = b.label.trim();
    if (b.config !== undefined) $set.config = b.config;
    if (b.effectiveFrom !== undefined) $set.effectiveFrom = b.effectiveFrom ? new Date(b.effectiveFrom) : null;
    const p = await patterns.findOneAndUpdate({ _id: ctx.params.id, status: 'draft' }, { $set }, { returnDocument: 'after' });
    if (!p) {
      if (await patterns.findOne({ _id: ctx.params.id })) throw conflict('Published versions are immutable. Create a new version from this one instead.');
      throw notFound('Pattern');
    }
    await audit(ctx, 'pattern.update', 'pattern', p._id, {});
    return publicPattern(p);
  });

  router.post('/api/admin/patterns/:id/publish', { perm: 'exam.manage' }, async (ctx) => {
    const p = await patterns.findOne({ _id: ctx.params.id });
    if (!p) throw notFound('Pattern');
    if (p.status !== 'draft') throw conflict(`This version is already ${p.status}.`);
    const exam = await exams.findOne({ _id: p.examId });
    const errors = validatePatternConfig(p.config, { examLanguages: exam?.languages });
    if (errors.length) throw unprocessable('Fix the pattern before publishing.', errors);
    const updated = await patterns.findOneAndUpdate({ _id: p._id, status: 'draft' }, { $set: { status: 'published', publishedAt: ctx.now, publishedBy: ctx.user._id } }, { returnDocument: 'after' });
    if (!updated) throw conflict('This version changed while publishing. Reload and try again.');
    await audit(ctx, 'pattern.publish', 'pattern', p._id, { examId: p.examId, version: p.version });
    return publicPattern(updated);
  });

  router.post('/api/admin/patterns/:id/retire', { perm: 'exam.manage' }, async (ctx) => {
    const p = await patterns.findOneAndUpdate({ _id: ctx.params.id, status: 'published' }, { $set: { status: 'retired', retiredAt: ctx.now } }, { returnDocument: 'after' });
    if (!p) throw conflict('Only published versions can be retired.');
    await audit(ctx, 'pattern.retire', 'pattern', p._id, {});
    return publicPattern(p);
  });
}
