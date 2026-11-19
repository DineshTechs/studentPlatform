import { createServer } from 'node:http';
import { loadEnvFile, readConfig } from './config.js';
import { connectDatabase } from './db/index.js';
import { createApp } from './app.js';
import { createEngine } from './modules/attempts.js';
import { seedDatabase } from './seed/seed.js';

loadEnvFile();
const config = readConfig();

const db = await connectDatabase(config);
if (db.kind === 'memory') {
  console.warn('⚠  DB_DRIVER=memory — data lives in RAM and is lost on restart. Seeding demo data…');
  await seedDatabase(db, { log: () => {} });
}

const clock = { now: () => new Date() };
const handler = createApp({ db, config, clock });
const server = createServer(handler);
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;

// Finalise attempts whose time ran out while the student was away.
const engine = createEngine({ db, config, clock });
const sweeper = setInterval(() => engine.sweep().catch((e) => console.error('[sweep]', e.message)), config.sweepIntervalMs);

server.listen(config.port, config.host, () => {
  console.log(`Exam prep platform running on http://localhost:${config.port} (database: ${db.kind})`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down…`);
  clearInterval(sweeper);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
