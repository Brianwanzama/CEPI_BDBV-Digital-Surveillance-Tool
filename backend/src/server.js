'use strict';
const { createPool, migrate, waitForDb } = require('./db');
const { createApp, DATA_MODE } = require('./app');
const { secret } = require('./auth');
const { seedUsers, seedData, resetDemoPasswords } = require('./seed');

async function main() {
  // This version is a synthetic-data pilot: refuse to run in any other mode.
  if (process.env.DATA_MODE && process.env.DATA_MODE !== DATA_MODE) {
    throw new Error('DATA_MODE=' + process.env.DATA_MODE + ' is not supported: this version may only hold synthetic data (see docs/11).');
  }
  secret(); // fails fast if JWT_SECRET is missing or too short
  const pool = createPool(process.env.DATABASE_URL);
  await waitForDb(pool);
  await migrate(pool);
  if (process.env.SEED_DEMO === 'true') { await seedUsers(pool); await seedData(pool); }
  if (process.env.RESET_DEMO_PASSWORDS === 'true') await resetDemoPasswords(pool, process.env.SEED_USER_PASSWORD);
  const port = +(process.env.PORT || 8080);
  const server = createApp(pool).listen(port, () => console.log('BDBV API listening on :' + port + ' (data mode: ' + DATA_MODE + ')'));
  const stop = () => { server.close(() => pool.end().then(() => process.exit(0))); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
