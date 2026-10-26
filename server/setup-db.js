'use strict';
// Explicit opt-in setup only. Normal startup never creates or migrates tables.
const mysql = require('mysql2/promise');
const fs = require('node:fs/promises');
const path = require('node:path');
const { configFromEnv } = require('./config');
async function main() {
  const { db } = configFromEnv();
  const { database, ...options } = db;
  const connection = await mysql.createConnection({ ...options, multipleStatements: true });
  try {
    const sql = await fs.readFile(path.join(__dirname, '../database/schema.sql'), 'utf8');
    await connection.query(sql); // Trusted, fixed setup file only; never receives user data.
    console.log('pokedex_app schema is ready. No other database was selected or changed.');
  } finally { await connection.end(); }
}
main().catch(error => { console.error('Setup failed:', error.code || error.message); process.exitCode = 1; });
