// Database bootstrap. Production uses the official MongoDB driver; DB_DRIVER=memory runs an
// in-process stand-in (tests / offline demo only — data is lost on restart).
import { createMemoryDb } from './memory.js';

export async function connectDatabase(config) {
  if (config.dbDriver === 'memory') {
    const db = createMemoryDb();
    await ensureIndexes(db);
    return db;
  }
  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is not set. Put it in .env (see .env.example) or run with DB_DRIVER=memory for a throwaway demo.');
  }
  let MongoClient;
  try {
    ({ MongoClient } = await import('mongodb'));
  } catch {
    throw new Error('The "mongodb" package is not installed. Run `npm install` in the project folder.');
  }
  const client = new MongoClient(config.mongoUri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
    appName: 'exam-prep-platform',
  });
  await client.connect();
  const mdb = client.db(config.mongoDbName);
  const db = {
    kind: 'mongodb',
    collection: (name) => mdb.collection(name),
    dropDatabase: () => mdb.dropDatabase(),
    close: () => client.close(),
  };
  await ensureIndexes(db);
  return db;
}

export async function ensureIndexes(db) {
  const c = (n) => db.collection(n);
  await Promise.all([
    c('users').createIndex({ email: 1 }, { unique: true, name: 'uniq_email' }),
    c('users').createIndex({ role: 1, createdAt: -1 }),
    c('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_sessions' }),
    c('sessions').createIndex({ userId: 1 }),
    c('categories').createIndex({ slug: 1 }, { unique: true, name: 'uniq_category_slug' }),
    c('exams').createIndex({ slug: 1 }, { unique: true, name: 'uniq_exam_slug' }),
    c('exams').createIndex({ categoryId: 1 }),
    c('patterns').createIndex({ examId: 1, stageKey: 1, version: 1 }, { unique: true, name: 'uniq_pattern_version' }),
    c('syllabus').createIndex({ parentId: 1, order: 1 }),
    c('syllabus').createIndex({ examIds: 1, type: 1 }),
    c('questions').createIndex({ status: 1, subjectId: 1, type: 1, difficulty: 1 }),
    c('questions').createIndex({ topicId: 1, status: 1 }),
    c('questions').createIndex({ hash: 1 }),
    c('questions').createIndex({ createdBy: 1, status: 1 }),
    c('question_reviews').createIndex({ questionId: 1, at: -1 }),
    c('mock_tests').createIndex({ examId: 1, status: 1 }),
    c('papers').createIndex({ mockTestId: 1 }, { unique: true, name: 'uniq_paper_test' }),
    c('attempts').createIndex({ userId: 1, startedAt: -1 }),
    c('attempts').createIndex({ mockTestId: 1, status: 1, 'result.score': -1 }),
    c('attempts').createIndex({ status: 1, expiresAt: 1 }),
    c('practice_log').createIndex({ userId: 1, at: -1 }),
    c('practice_log').createIndex({ userId: 1, questionId: 1, at: -1 }),
    c('user_topic_stats').createIndex({ userId: 1, subjectId: 1 }),
    c('user_activity').createIndex({ userId: 1, day: -1 }),
    c('bookmarks').createIndex({ userId: 1, createdAt: -1 }),
    c('audit_log').createIndex({ at: -1 }),
    c('audit_log').createIndex({ actorId: 1, at: -1 }),
    c('announcements').createIndex({ publishedAt: -1 }),
  ]);
}
