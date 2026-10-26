'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 3000);
  const dbPort = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) throw Error('PORT and DB_PORT must be valid port numbers.');
  if ((env.DB_NAME || 'pokedex_app') !== 'pokedex_app') throw Error('DB_NAME must be pokedex_app. Other databases are not supported.');
  if (!env.DB_USER) throw Error('Set DB_USER and DB_PASSWORD in your untracked .env file.');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 48) throw Error('Set SESSION_SECRET to a randomly generated secret of at least 48 characters.');
  const origin = env.APP_ORIGIN || `http://localhost:${port}`;
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw Error('APP_ORIGIN must be an HTTP(S) origin without a trailing slash.');
  if (production && parsed.protocol !== 'https:') throw Error('Production requires HTTPS APP_ORIGIN for Secure cookies.');
  return {
    production, port, host: env.HOST || '127.0.0.1', origin,
    secret: env.SESSION_SECRET, trustProxy: env.TRUST_PROXY === 'true',
    uploadDir: path.join(__dirname, '../uploads/avatars'),
    db: { host: env.DB_HOST || '127.0.0.1', port: dbPort, user: env.DB_USER, password: env.DB_PASSWORD || '', database: 'pokedex_app', connectionLimit: 10, timezone: 'Z', charset: 'utf8mb4', multipleStatements: false }
  };
}
module.exports = { configFromEnv };
