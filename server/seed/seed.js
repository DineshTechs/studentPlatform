import { newId } from '../lib/ids.js';
import { hashPassword } from '../lib/auth.js';
import { validatePatternConfig } from '../engine/pattern.js';
import { selectQuestions, sectionFilter } from '../engine/selection.js';
import { questionProblems, hashOf } from '../modules/questions.js';
import { buildPaper } from '../modules/tests.js';
import { CATEGORIES, EXAMS, SYLLABUS, PATTERNS, MOCK_TESTS } from './catalog.js';
import { QUESTIONS, WORKFLOW_QUESTIONS } from './questions.js';

export const DEMO_USERS = [
  { role: 'admin', name: 'Platform Admin', email: 'admin@examprep.local', password: 'Admin@12345' },
  { role: 'editor', name: 'Content Editor', email: 'editor@examprep.local', password: 'Editor@12345' },
  { role: 'reviewer', name: 'Question Reviewer', email: 'reviewer@examprep.local', password: 'Reviewer@12345' },
  { role: 'mentor', name: 'Mentor Sharma', email: 'mentor@examprep.local', password: 'Mentor@12345' },
  { role: 'student', name: 'Aarav Student', email: 'student@examprep.local', password: 'Student@12345' },
];

export async function seedDatabase(db, { log = console.log, now = new Date() } = {}) {
  if (await db.collection('exams').countDocuments({})) {
    log('Database already has examinations — skipping seed.');
    return { skipped: true };
  }
  const col = (n) => db.collection(n);

  // Users
  const userIds = {};
  for (const u of DEMO_USERS) {
    const _id = newId('usr');
    userIds[u.role] = _id;
    await col('users').insertOne({ _id, email: u.email, name: u.name, role: u.role, status: 'active', passwordHash: await hashPassword(u.password), targetExamIds: [], activeExamId: null, preferences: { language: 'en' }, createdAt: now });
  }

  // Categories & exams
  const catIds = {};
  for (const [i, [slug, name]] of CATEGORIES.entries()) {
    catIds[slug] = newId('cat');
    await col('categories').insertOne({ _id: catIds[slug], slug, name, order: i, createdAt: now });
  }
  const examIds = {};
  for (const [i, [slug, name, cat, languages, stages, info]] of EXAMS.entries()) {
    examIds[slug] = newId('exm');
    await col('exams').insertOne({ _id: examIds[slug], slug, name, categoryId: catIds[cat], languages, stages, info, description: '', isActive: true, order: i, createdAt: now, updatedAt: now });
  }

  // Syllabus tree
  const nodeIds = {}; // "subject", "subject/chapter", "subject/chapter/topic"
  let order = 0;
  for (const [sKey, s] of Object.entries(SYLLABUS)) {
    const sid = newId('syl');
    nodeIds[sKey] = sid;
    const exams = s.exams.map((e) => examIds[e]);
    await col('syllabus').insertOne({ _id: sid, type: 'subject', name: s.name, parentId: null, subjectId: sid, examIds: exams, order: order++, createdAt: now });
    for (const [cKey, [cName, topics]] of Object.entries(s.chapters)) {
      const cid = newId('syl');
      nodeIds[`${sKey}/${cKey}`] = cid;
      await col('syllabus').insertOne({ _id: cid, type: 'chapter', name: cName, parentId: sid, subjectId: sid, examIds: exams, order: order++, path: { subjectId: sid }, createdAt: now });
      for (const [tKey, tName] of Object.entries(topics)) {
        const tid = newId('syl');
        nodeIds[`${sKey}/${cKey}/${tKey}`] = tid;
        await col('syllabus').insertOne({ _id: tid, type: 'topic', name: tName, parentId: cid, subjectId: sid, examIds: exams, order: order++, path: { subjectId: sid, chapterId: cid }, createdAt: now });
      }
    }
  }

  // Questions
  const insertQuestion = async (raw, status) => {
    const [s, c] = raw.topic.split('/');
    const q = {
      type: raw.type, content: raw.content, answer: raw.answer, difficulty: raw.difficulty,
      subjectId: nodeIds[s], chapterId: nodeIds[`${s}/${c}`], topicId: nodeIds[raw.topic], subtopicId: null,
      source: { kind: 'original' }, tags: ['sample'], media: [], examIds: [],
    };
    const problems = await questionProblems(db, q);
    if (problems.length) throw new Error(`Seed question invalid (${raw.content.en.stem.slice(0, 60)}…): ${JSON.stringify(problems)}`);
    const approved = status === 'approved';
    await col('questions').insertOne({
      _id: newId('q'), ...q, hash: hashOf(q), status, version: 1,
      createdBy: userIds.editor, updatedBy: userIds.editor, createdAt: now, updatedAt: now,
      ...(approved ? { reviewedBy: userIds.reviewer, reviewedAt: now } : {}), ...(status === 'in_review' ? { submittedAt: now } : {}),
      stats: { attempts: 0, correct: 0 },
    });
  };
  for (const raw of QUESTIONS) await insertQuestion(raw, 'approved');
  for (const { status, q } of WORKFLOW_QUESTIONS) await insertQuestion(q, status);

  // Patterns (subject keys → ids)
  const patternIds = {};
  const versions = {};
  for (const p of PATTERNS) {
    const config = structuredClone(p.config);
    for (const s of config.sections) s.selection.subjectIds = s.selection.subjectIds.map((k) => nodeIds[k]);
    const exam = EXAMS.find((e) => e[0] === p.exam);
    const errors = validatePatternConfig(config, { examLanguages: exam[3] });
    if (errors.length) throw new Error(`Seed pattern "${p.label}" invalid: ${JSON.stringify(errors)}`);
    const vk = `${p.exam}:${p.stage}`;
    versions[vk] = (versions[vk] || 0) + 1;
    const _id = newId('pat');
    patternIds[`${p.exam}:${p.label}`] = _id;
    await col('patterns').insertOne({
      _id, examId: examIds[p.exam], stageKey: p.stage, version: versions[vk], label: p.label, status: p.status, config,
      effectiveFrom: p.effectiveFrom ? new Date(p.effectiveFrom) : null, createdBy: userIds.admin, createdAt: now,
      ...(p.status !== 'draft' ? { publishedAt: now, publishedBy: userIds.admin } : {}),
    });
  }

  // Mock tests: select, snapshot and publish
  for (const m of MOCK_TESTS) {
    const pattern = await col('patterns').findOne({ _id: patternIds[`${m.exam}:${m.patternLabel}`] });
    const pools = {};
    for (const sec of pattern.config.sections) {
      pools[sec.key] = {};
      for (const part of sec.composition) pools[sec.key][part.type] = await col('questions').find(sectionFilter(sec, part.type)).toArray();
    }
    const others = await col('mock_tests').find({ examId: pattern.examId }).toArray();
    const excludeIds = new Set(others.flatMap((t) => t.sections.flatMap((s) => s.questionIds)));
    const { sections, shortfalls } = selectQuestions(pattern.config, pools, { seed: m.seed, excludeIds });
    if (shortfalls.length) throw new Error(`Seed mock test "${m.title}" short of questions: ${JSON.stringify(shortfalls)}`);
    const test = {
      _id: newId('mt'), examId: pattern.examId, patternId: pattern._id, patternVersion: pattern.version, title: m.title, description: '',
      kind: m.kind, status: 'published', seed: m.seed, sections, availableFrom: null, availableUntil: null, maxAttempts: null,
      createdBy: userIds.admin, createdAt: now, publishedAt: now, publishedBy: userIds.admin,
    };
    const ids = sections.flatMap((s) => s.questionIds);
    const docs = await col('questions').find({ _id: { $in: ids } }).toArray();
    const byId = Object.fromEntries(docs.map((d) => [d._id, d]));
    await col('mock_tests').insertOne(test);
    await col('papers').insertOne(buildPaper(test, pattern, byId));
  }

  // Student targets
  await col('users').updateOne({ _id: userIds.student }, { $set: { targetExamIds: [examIds['jee-main'], examIds['ssc-cgl'], examIds['upsc-cse-prelims']], activeExamId: examIds['jee-main'] } });

  await col('announcements').insertOne({ _id: newId('ann'), title: 'Welcome to the platform', body: 'Mini mocks are live for JEE Main, NEET, SSC CGL and UPSC. Start with a short test to see the exam interface.', examIds: [], publishedAt: now, createdBy: userIds.admin });

  log(`Seeded ${EXAMS.length} examinations, ${QUESTIONS.length + WORKFLOW_QUESTIONS.length} questions, ${PATTERNS.length} pattern versions, ${MOCK_TESTS.length} mock tests.`);
  return { skipped: false, examIds, userIds, nodeIds };
}
