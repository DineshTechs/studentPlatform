// Offline demo: in-memory database, seeded on start-up. Works on Windows/macOS/Linux.
process.env.DB_DRIVER = 'memory';
await import('./index.js');
