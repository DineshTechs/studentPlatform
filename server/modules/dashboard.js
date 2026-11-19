import { round2, dayKey } from '../lib/ids.js';
import { buildTree } from './syllabus.js';

const MIN_FOR_STRENGTH = 5;

export function streakFrom(days, today, tz) {
  const set = new Set(days);
  let streak = 0;
  const cursor = new Date(today);
  // A streak survives until the end of today even if today has no activity yet.
  if (!set.has(dayKey(cursor, tz))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (set.has(dayKey(cursor, tz))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return streak;
}

export default function register(router, { db, config, clock }) {
  router.get('/api/dashboard', { perm: 'practice' }, async (ctx) => {
    const now = clock.now();
    const u = ctx.user;
    const examId = ctx.query.get('examId') || u.activeExamId;
    const targets = u.targetExamIds?.length ? await db.collection('exams').find({ _id: { $in: u.targetExamIds } }, { projection: { name: 1 } }).toArray() : [];

    const [topicStats, activity, recentAttempts, announcements] = await Promise.all([
      db.collection('user_topic_stats').find({ userId: u._id }).toArray(),
      db.collection('user_activity').find({ userId: u._id }).sort({ day: -1 }).limit(400).toArray(),
      db.collection('attempts').find({ userId: u._id }, { projection: { responses: 0, events: 0, 'result.perQuestion': 0 } }).sort({ startedAt: -1 }).limit(10).toArray(),
      db.collection('announcements').find({ publishedAt: { $lte: now }, $or: [{ examIds: { $size: 0 } }, { examIds: examId ?? '' }] }).sort({ publishedAt: -1 }).limit(5).toArray(),
    ]);

    let tree = [];
    if (examId) tree = await buildTree(db, examId);
    const topicIds = new Set();
    const subjectOfTopic = {};
    const topicName = {};
    for (const s of tree) for (const ch of s.children) for (const t of ch.children) { topicIds.add(t.id); subjectOfTopic[t.id] = s.id; topicName[t.id] = { topic: t.name, chapter: ch.name, subject: s.name }; }

    const examStats = topicStats.filter((t) => topicIds.has(t.topicId));
    const attempted = examStats.reduce((a, t) => a + t.attempted, 0);
    const correct = examStats.reduce((a, t) => a + t.correct, 0);
    const coveredTopics = examStats.filter((t) => t.attempted > 0).length;

    const subjects = tree.map((s) => {
      const st = examStats.filter((t) => subjectOfTopic[t.topicId] === s.id);
      const att = st.reduce((a, t) => a + t.attempted, 0);
      const cor = st.reduce((a, t) => a + t.correct, 0);
      return { id: s.id, name: s.name, attempted: att, accuracy: att ? round2((cor / att) * 100) : null };
    });
    const rated = subjects.filter((s) => s.attempted >= MIN_FOR_STRENGTH);
    const weakTopics = examStats.filter((t) => t.attempted >= 3).map((t) => ({ topicId: t.topicId, ...topicName[t.topicId], accuracy: round2((t.correct / t.attempted) * 100), attempted: t.attempted }))
      .sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
    const untouched = [...topicIds].filter((id) => !examStats.some((t) => t.topicId === id)).slice(0, 3).map((id) => ({ topicId: id, ...topicName[id] }));

    const days = activity.map((a) => a.day);
    const todayKey = dayKey(now, config.timezone);
    const today = activity.find((a) => a.day === todayKey);
    const dailyTarget = u.preferences?.dailyQuestionTarget || 30;

    const examAttempts = recentAttempts.filter((a) => !examId || a.examId === examId);
    const submitted = examAttempts.filter((a) => a.status === 'submitted' && a.result);
    const tests = await db.collection('mock_tests').find({ _id: { $in: examAttempts.map((a) => a.mockTestId) } }, { projection: { title: 1 } }).toArray();
    const titleOf = Object.fromEntries(tests.map((t) => [t._id, t.title]));
    const upcoming = examId ? await db.collection('mock_tests').find({ examId, status: 'published', $or: [{ availableUntil: null }, { availableUntil: { $gt: now } }] }, { projection: { title: 1, availableFrom: 1, availableUntil: 1, kind: 1 } }).sort({ availableFrom: 1 }).limit(5).toArray() : [];
    const takenIds = new Set(examAttempts.map((a) => a.mockTestId));

    return {
      user: { name: u.name },
      activeExamId: examId || null,
      targets: targets.map((t) => ({ id: t._id, name: t.name })),
      stats: {
        questionsAttempted: attempted,
        accuracy: attempted ? round2((correct / attempted) * 100) : null,
        preparation: topicIds.size ? round2((coveredTopics / topicIds.size) * 100) : 0,
        topicsCovered: coveredTopics, topicsTotal: topicIds.size,
        streak: streakFrom(days, now, config.timezone),
        today: { done: today?.questions || 0, target: dailyTarget },
        mocksTaken: submitted.length,
        avgMockPercentage: submitted.length ? round2(submitted.reduce((a, x) => a + x.result.percentage, 0) / submitted.length) : null,
      },
      subjects,
      strong: rated.filter((s) => s.accuracy >= 70).sort((a, b) => b.accuracy - a.accuracy).slice(0, 3),
      weak: rated.filter((s) => s.accuracy < 50).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3),
      recommendations: [
        ...weakTopics.slice(0, 3).map((t) => ({ kind: 'revise', ...t, reason: `${t.accuracy}% accuracy over ${t.attempted} questions` })),
        ...untouched.map((t) => ({ kind: 'start', ...t, reason: 'Not practised yet' })),
      ],
      recentAttempts: examAttempts.slice(0, 5).map((a) => ({ id: a._id, title: titleOf[a.mockTestId] || 'Mock test', status: a.status, startedAt: a.startedAt, score: a.result?.score ?? null, maxScore: a.result?.maxScore ?? null, percentage: a.result?.percentage ?? null })),
      mockTrend: submitted.slice(0, 8).reverse().map((a) => ({ id: a._id, percentage: a.result.percentage, at: a.submittedAt })),
      upcomingTests: upcoming.map((t) => ({ id: t._id, title: t.title, kind: t.kind, availableFrom: t.availableFrom, availableUntil: t.availableUntil, taken: takenIds.has(t._id) })),
      announcements: announcements.map((a) => ({ id: a._id, title: a.title, body: a.body, publishedAt: a.publishedAt })),
    };
  });
}
