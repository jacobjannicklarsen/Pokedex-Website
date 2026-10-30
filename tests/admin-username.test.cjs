const {test}=require('node:test'),assert=require('node:assert/strict');
const setup=require('./support/app-fixture.cjs');
const password='staff security test password',reason='Requested username correction';
async function accounts(t){
 const s=await setup(t),owner=await s.register('rename_owner'),trainer=await s.register('rename_trainer'),admin=await s.register('rename_admin');
 await s.repo.administration.bootstrapOwner(owner.user.id);
 await s.repo.administration.change(owner.user.id,admin.user.id,'role',{version:0,reason,role:'administrator'});
 return {...s,owner,trainer,admin};
}
const change=(actor,target,extra={})=>actor.c.call(`/api/admin/users/${target.user.id}/username`,{method:'POST',body:{version:0,reason,currentPassword:password,newUsername:'RenamedTrainer',...extra}});
test('another Owner remains protected from username changes',()=>{
 const policy=require('../server/authorization');
 const actor={id:1,...policy.context({role:'owner'})},target={id:2,...policy.context({role:'owner'})};
 assert.equal(policy.actions(actor,target).canUsername,false);
 assert.throws(()=>policy.change(actor,target,'username',{}),/Other Owner accounts are protected/);
});
test('username changes enforce Owner access, reauthentication, validation, uniqueness and current versions',async t=>{
 const s=await accounts(t);
 for(const actor of [s.trainer,s.admin])assert.equal((await change(actor,s.trainer)).status,403);
 const list=await s.admin.c.call('/api/admin/users');assert.ok(list.data.items.every(u=>!u.actions.canUsername));
 const guest={c:s.client()};await guest.c.call('/api/auth/session');assert.equal((await change(guest,s.trainer)).status,401);
 for(const [extra,status]of [[{currentPassword:'wrong'},403],[{newUsername:'bad name'},400],[{newUsername:'ab'},400],[{newUsername:'RENAME_OWNER'},409],[{newUsername:'rename_trainer'},400],[{version:99},409]])assert.equal((await change(s.owner,s.trainer,extra)).status,status);
 assert.equal((await s.repo.user(s.trainer.user.id)).username,'rename_trainer');
 assert.equal((await s.trainer.c.call('/api/teams')).status,200);
});
test('rename preserves identity and password, revokes sessions, audits both names and permits login with new name',async t=>{
 const s=await accounts(t),before=await s.repo.user(s.trainer.user.id);
 const result=await change(s.owner,s.trainer);assert.equal(result.status,200);assert.equal(result.data.user.version,1);
 const after=await s.repo.user(s.trainer.user.id);assert.deepEqual(after,{...before,username:'RenamedTrainer'});
 assert.equal((await s.trainer.c.call('/api/teams')).status,401);
 const c=s.client();await c.call('/api/auth/session');
 assert.equal((await c.call('/api/auth/login',{method:'POST',body:{identifier:'rename_trainer',password}})).status,401);
 assert.equal((await c.call('/api/auth/login',{method:'POST',body:{identifier:'RenamedTrainer',password}})).status,200);
 const audit=s.repo.administration.logs.at(-1);assert.equal(audit.action,'username.change');
 assert.deepEqual(audit.metadata,{from:'rename_trainer',to:'RenamedTrainer',reason,sessionsRevoked:true});
 assert.ok(!JSON.stringify({result,audit}).includes(password));
 assert.equal((await s.owner.c.call('/api/admin/context')).status,200);
});
test('Owner can rename self and case-only changes work; audit failure rolls back rename and session revocation',async t=>{
 const s=await accounts(t);
 s.repo.administration.failAudit=true;
 assert.equal((await change(s.owner,s.trainer)).status,500);
 assert.equal((await s.repo.user(s.trainer.user.id)).username,'rename_trainer');
 assert.equal((await s.trainer.c.call('/api/teams')).status,200);
 s.repo.administration.failAudit=false;
 assert.equal((await change(s.owner,s.trainer,{newUsername:'Rename_Trainer'})).status,200);
 assert.equal((await change(s.owner,s.owner,{version:1,newUsername:'NewOwner'})).status,200);
 assert.equal((await s.owner.c.call('/api/admin/context')).status,401);
});
test('username audit migration matches fresh schema without removing audit data',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/owner-username-audit.sql'),'utf8');
 const schema=fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8');
 assert.equal(sql.match(/CHECK \(action IN\s*\(([^)]+)\)\)/)[1].replace(/\s+/g,''),schema.match(/CONSTRAINT ck_audit_action CHECK \(action IN \(([^)]+)\)\)/)[1]);
 assert.ok(!/\b(?:DROP TABLE|DELETE FROM|TRUNCATE)\b/i.test(sql));
});

test('production username write binds the new name and rolls back on audit failure', async () => {
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
  const value = { version: 0, reason, newUsername: 'NewTarget', actorHash: 'expected-owner-hash' };
  await repo.change(1, 2, 'username', value);
  assert.match(calls[1][0], /admin_state.*FOR UPDATE/);
  assert.ok(calls.some(([sql]) => sql.includes('security_version = security_version + 1')));
  assert.deepEqual(calls.find(([sql]) => sql.startsWith('UPDATE users'))[1], ['NewTarget', 2]);
  const audit = calls.find(([sql]) => sql.startsWith('INSERT INTO admin_audit_logs'));
  assert.equal(audit[1][3], 'username.change');
  assert.deepEqual(JSON.parse(audit[1][4]), { from: 'target', to: 'NewTarget', reason, sessionsRevoked: true });
  assert.ok(calls.findIndex(([sql]) => sql === 'commit') > calls.indexOf(audit));
  calls.length = 0; auditFails = true;
  await assert.rejects(repo.change(1, 2, 'username', value), /Audit unavailable/);
  assert.ok(calls.some(([sql]) => sql === 'rollback'));
  assert.ok(!calls.some(([sql]) => sql === 'commit'));
});
