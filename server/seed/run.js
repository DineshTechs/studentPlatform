// Usage: npm run seed            (seeds an empty database)
//        npm run seed -- --reset (DROPS the configured database first — development only)
import { loadEnvFile, readConfig } from '../config.js';
import { connectDatabase } from '../db/index.js';
import { seedDatabase, DEMO_USERS } from './seed.js';

loadEnvFile();
const config = readConfig();
if (config.dbDriver === 'memory') {
  console.log('DB_DRIVER=memory seeds itself on start-up; nothing to do.');
  process.exit(0);
}
const reset = process.argv.includes('--reset');
if (reset && config.isProd) {
  console.error('Refusing to --reset when NODE_ENV=production.');
  process.exit(1);
}
const db = await connectDatabase(config);
try {
  if (reset) {
    console.log(`Dropping database "${config.mongoDbName}"…`);
    await db.dropDatabase();
    const { ensureIndexes } = await import('../db/index.js');
    await ensureIndexes(db);
  }
  const r = await seedDatabase(db);
  if (!r.skipped) {
    console.log('\nDemo accounts (change these passwords before going live):');
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(28)} ${u.password}`);
  }
} finally {
  await db.close();
}
