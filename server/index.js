'use strict';
const mysql = require('mysql2/promise');
const { configFromEnv } = require('./config');
const { Repository } = require('./repository');
const { MySQLSessionStore } = require('./session-store');
const { createApp } = require('./app');

async function main() {
  const config = configFromEnv();
  const pool = mysql.createPool(config.db);
  let server, cleanup;
  try {
    await pool.execute('SELECT id FROM users LIMIT 1');
    await pool.execute('SELECT sid FROM sessions LIMIT 1');
    const store = new MySQLSessionStore(pool);
    await store.prune();
    const app = await createApp({ repo: new Repository(pool), store, config });
    cleanup = setInterval(() => store.prune().catch(error => console.error('Session cleanup failed:', error.code || error.name)), 60 * 60 * 1000);
    cleanup.unref();
    server = app.listen(config.port, config.host, () => console.log(`Pokédex running at ${config.origin}`));
    server.on('error', async error => { console.error('Server could not listen:', error.code); clearInterval(cleanup); await pool.end(); process.exitCode = 1; });
    async function stop() { clearInterval(cleanup); server.close(async () => { await pool.end(); }); }
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) {
    clearInterval(cleanup); await pool.end(); throw error;
  }
}
main().catch(error => {
  console.error('Startup failed:', error.code || error.message);
  console.error('Check .env, start MySQL 8, and import database/schema.sql. No database is created automatically at startup.');
  process.exitCode = 1;
});
