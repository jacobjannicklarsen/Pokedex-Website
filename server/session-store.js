'use strict';
const session = require('express-session');
const TTL = 7 * 24 * 60 * 60 * 1000;
class MySQLSessionStore extends session.Store {
  constructor(pool) { super(); this.pool = pool; }
  get(sid, callback) {
    this.pool.execute('SELECT data FROM sessions WHERE sid = ? AND expires_at > UTC_TIMESTAMP(3)', [sid])
      .then(([rows]) => {
        const data = rows[0]?.data;
        callback(null, data ? (typeof data === 'string' ? JSON.parse(data) : data) : null);
      }).catch(callback);
  }
  set(sid, data, callback = () => {}) {
    const expires = data.cookie?.expires ? new Date(data.cookie.expires) : new Date(Date.now() + TTL);
    this.pool.execute('INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)', [sid, JSON.stringify(data), expires])
      .then(() => callback()).catch(callback);
  }
  touch(sid, data, callback = () => {}) {
    const expires = data.cookie?.expires ? new Date(data.cookie.expires) : new Date(Date.now() + TTL);
    this.pool.execute('UPDATE sessions SET expires_at = ? WHERE sid = ?', [expires, sid]).then(() => callback()).catch(callback);
  }
  destroy(sid, callback = () => {}) {
    this.pool.execute('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => callback()).catch(callback);
  }
  async prune() { await this.pool.execute('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(3)'); }
}
module.exports = { MySQLSessionStore, TTL };
