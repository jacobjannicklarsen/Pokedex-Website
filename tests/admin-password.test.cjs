const { test } = require('node:test');
const assert = require('node:assert/strict');
const argon2 = require('argon2');
const setup = require('./support/app-fixture.cjs');
const reason = 'Requested account password change';
const oldPassword = 'staff security test password';
const newPassword = 'replacement secure password 123';

async function accounts(t) {
  const s = await setup(t);
  const owner = await s.register('password_owner');
  const trainer = await s.register('password_trainer');
  const admin = await s.register('password_admin');
  await s.repo.administration.bootstrapOwner(owner.user.id);
  await s.repo.administration.change(owner.user.id, admin.user.id, 'role', { version: 0, reason, role: 'administrator' });
  return { ...s, owner, trainer, admin };
}
const change = (actor, target, overrides = {}) => actor.c.call(`/api/admin/users/${target.user.id}/password`, {
  method: 'POST', body: { version: 0, reason, currentPassword: oldPassword, newPassword, ...overrides }
});

test('only Owner can change passwords; stale requests and invalid credentials fail without mutation', async t => {
  const s = await accounts(t);
  const original = (await s.repo.user(s.trainer.user.id)).password_hash;
  for (const actor of [s.trainer, s.admin]) {
    assert.equal((await change(actor, s.trainer)).status, 403);
    const list = await actor.c.call('/api/admin/users');
    if (list.status === 200) assert.ok(list.data.items.every(u => !u.actions.canPassword));
  }
  const guest = { c: s.client() }; await guest.c.call('/api/auth/session');
  assert.equal((await change(guest, s.trainer)).status, 401);
  assert.equal((await change(s.owner, s.trainer, { currentPassword: 'incorrect' })).status, 403);
  assert.equal((await change(s.owner, s.trainer, { newPassword: 'short' })).status, 400);
  assert.equal((await change(s.owner, s.trainer, { version: 99 })).status, 409);
  assert.equal((await s.repo.user(s.trainer.user.id)).password_hash, original);
});

test('Owner password change hashes the password, revokes sessions, preserves profile and audits without secrets', async t => {
  const s = await accounts(t);
  const target = s.trainer.user.id;
  const result = await change(s.owner, s.trainer);
  assert.equal(result.status, 200);
  assert.equal(result.data.user.version, 1);
  const user = await s.repo.user(target);
  assert.ok(await argon2.verify(user.password_hash, newPassword));
  assert.ok(!await argon2.verify(user.password_hash, oldPassword));
  assert.equal((await s.trainer.c.call('/api/teams')).status, 401);
  const login = s.client(); await login.call('/api/auth/session');
  assert.equal((await login.call('/api/auth/login', { method: 'POST', body: { identifier: user.username, password: oldPassword } })).status, 401);
  assert.equal((await login.call('/api/auth/login', { method: 'POST', body: { identifier: user.username, password: newPassword } })).status, 200);
  const audit = s.repo.administration.logs.at(-1);
  assert.equal(audit.action, 'password.change');
  assert.deepEqual(audit.metadata, { reason, sessionsRevoked: true });
  for (const secret of [oldPassword, newPassword, user.password_hash]) assert.ok(!JSON.stringify({ result, audit }).includes(secret));
  assert.equal((await change(s.owner, s.trainer)).status, 409);
  assert.equal((await s.owner.c.call('/api/admin/context')).status, 200);
});

test('Owner can change own password and must sign in again', async t => {
  const s = await accounts(t);
  assert.equal((await change(s.owner, s.owner, { version: 1 })).status, 200);
  assert.equal((await s.owner.c.call('/api/admin/context')).status, 401);
  assert.ok(await argon2.verify((await s.repo.user(s.owner.user.id)).password_hash, newPassword));
});

test('audit failure rolls back password and session revocation', async t => {
  const s = await accounts(t);
  const hash = (await s.repo.user(s.trainer.user.id)).password_hash;
  const version = await s.repo.enhancements.securityVersion(s.trainer.user.id);
  s.repo.administration.failAudit = true;
  assert.equal((await change(s.owner, s.trainer)).status, 500);
  assert.equal((await s.repo.user(s.trainer.user.id)).password_hash, hash);
  assert.equal(await s.repo.enhancements.securityVersion(s.trainer.user.id), version);
  assert.equal((await s.trainer.c.call('/api/teams')).status, 200);
});

test('production password write locks authority and commits credentials, revocation and audit together', async () => {
  const { AdminRepository } = require('../server/admin-repository');
  const calls = []; let auditFails = false;
  const connection = {
    beginTransaction: async () => calls.push(['begin']), commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']), release: () => calls.push(['release']),
    execute: async (sql, params = []) => {
      calls.push([sql, params]);
      if (sql.includes('SELECT schema_version')) return [[{ schema_version: 1 }]];
      if (sql.startsWith('SELECT role,')) return [[{ role: params[0] === 1 ? 'owner' : 'trainer', roleVersion: 0 }]];
      if (sql.includes('FROM user_restrictions r')) return [[]];
      if (sql.startsWith('SELECT id, username')) return [[{ id: 2, username: 'target' }]];
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: 'expected-owner-hash' }]];
      if (sql.startsWith('INSERT INTO admin_audit_logs') && auditFails) throw Error('Audit unavailable');
      if (/^(INSERT|UPDATE)/.test(sql)) return [{ affectedRows: 1 }];
      throw Error(sql);
    }
  };
  const repo = new AdminRepository({ getConnection: async () => connection });
  const value = { version: 0, reason, hash: 'new-target-hash', actorHash: 'expected-owner-hash' };
  await repo.change(1, 2, 'password', value);
  assert.match(calls[1][0], /admin_state.*FOR UPDATE/);
  assert.ok(calls.some(([sql]) => sql.includes('security_version = security_version + 1')));
  assert.deepEqual(calls.find(([sql]) => sql.startsWith('UPDATE users'))[1], ['new-target-hash', 2]);
  const audit = calls.find(([sql]) => sql.startsWith('INSERT INTO admin_audit_logs'));
  assert.equal(audit[1][3], 'password.change');
  assert.deepEqual(JSON.parse(audit[1][4]), { reason, sessionsRevoked: true });
  assert.ok(calls.findIndex(([sql]) => sql === 'commit') > calls.indexOf(audit));
  calls.length = 0; auditFails = true;
  await assert.rejects(repo.change(1, 2, 'password', value), /Audit unavailable/);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.ok(!calls.some(([sql]) => sql === 'commit'));
});
