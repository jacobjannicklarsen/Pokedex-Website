const {test}=require('node:test'),assert=require('node:assert/strict');
const setup=require('./support/app-fixture.cjs'),policy=require('../server/authorization'),{AdminRepository}=require('../server/admin-repository');
const reason='Reviewed account management request';
async function staff(t){const s=await setup(t);const owner=await s.register('staff_owner'),admin=await s.register('staff_admin'),mod=await s.register('staff_mod'),trainer=await s.register('staff_trainer');await s.repo.administration.bootstrapOwner(owner.user.id);await s.repo.administration.change(owner.user.id,admin.user.id,'role',{role:'administrator',version:0,reason});await s.repo.administration.change(admin.user.id,mod.user.id,'role',{role:'moderator',version:0,reason});return {...s,owner,admin,mod,trainer};}
const post=(client,id,path,body)=>client.call(`/api/admin/users/${id}/${path}`,{method:'POST',body});
test('new registrations cannot claim roles; every administrative API independently requires live staff permissions',async t=>{
 const s=await staff(t),guest=s.client();await guest.call('/api/auth/session');
 for(const path of ['context','overview','users','audit']){assert.equal((await guest.call('/api/admin/'+path)).status,401);assert.equal((await s.trainer.c.call('/api/admin/'+path)).status,403);assert.equal((await s.mod.c.call('/api/admin/'+path)).status,200);}
 for(const [path,body]of [['role',{role:'moderator',version:0,reason}],['permissions',{permissions:[],version:0,reason}],['restrictions',{hours:1,version:0,reason}],['restrictions/revoke',{restrictionId:1,version:0,reason}]]){
  assert.equal((await post(guest,s.trainer.user.id,path,body)).status,401);assert.equal((await post(s.trainer.c,s.trainer.user.id,path,body)).status,403);
 }
 const forged=s.client();await forged.call('/api/auth/session');const register=await forged.call('/api/auth/register',{method:'POST',body:{username:'forged_owner',email:'forged@example.test',password:'secure test password',role:'owner',permissions:['audit.all']}});assert.equal(register.status,201);assert.equal(register.data.user.staff.role,'trainer');
 assert.equal((await forged.call('/api/admin/users',{headers:{'X-Role':'owner','X-User-Id':String(s.owner.user.id)}})).status,403);
 const shell=await guest.call('/admin.html',{raw:true});assert.equal(shell.status,200);assert.ok(!shell.data.includes(s.owner.user.username));assert.ok(!shell.data.includes('password_hash'));
});
test('Owner protection, hierarchy and administrator appointment rules prevent elevation and self-management',async t=>{
 const s=await staff(t);
 for(const actor of [s.owner,s.admin,s.mod])for(const target of [s.owner,s.admin,s.mod].filter(u=>u===actor||u===s.owner)){
  const version=(await s.repo.administration.access(target.user.id)).roleVersion;
  for(const [path,body]of [['role',{role:'trainer',version,reason}],['restrictions',{hours:1,version,reason}],['permissions',{permissions:[],version,reason}]])assert.equal((await post(actor.c,target.user.id,path,body)).status,403);
 }
 assert.equal((await post(s.admin.c,s.trainer.user.id,'role',{role:'administrator',version:0,reason})).status,403);
 assert.equal((await post(s.owner.c,s.trainer.user.id,'role',{role:'owner',version:0,reason})).status,400);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'role',{role:'moderator',version:0,reason})).status,403);
 assert.equal((await post(s.owner.c,s.trainer.user.id,'role',{role:'administrator',version:0,reason})).status,200);
 assert.equal((await post(s.admin.c,s.trainer.user.id,'restrictions',{hours:1,version:1,reason})).status,403);
 await assert.rejects(s.repo.administration.bootstrapOwner(s.trainer.user.id),/already exists/);
});
test('Moderator suspensions are limited, cannot be extended, and revoke only their own; active sessions and login are denied',async t=>{
 const s=await staff(t);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'restrictions',{hours:25,version:0,reason})).status,403);
 const applied=await post(s.mod.c,s.trainer.user.id,'restrictions',{hours:24,version:0,reason});assert.equal(applied.status,200);assert.equal(applied.data.user.restriction.issuedBy,s.mod.user.id);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'restrictions',{hours:1,version:1,reason})).status,403);
 const blocked=await s.trainer.c.call('/api/teams');assert.equal(blocked.status,403);assert.equal(blocked.data.code,'ACCOUNT_RESTRICTED');assert.equal((await s.trainer.c.call('/api/favorites')).status,401);
 const login=s.client();await login.call('/api/auth/session');assert.equal((await login.call('/api/auth/login',{method:'POST',body:{identifier:s.trainer.user.username,password:'staff security test password'}})).status,403);
 const second=await s.register('second_mod');await post(s.admin.c,second.user.id,'role',{role:'moderator',version:0,reason});
 assert.equal((await post(second.c,s.trainer.user.id,'restrictions/revoke',{restrictionId:applied.data.user.restriction.id,version:1,reason})).status,403);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'restrictions/revoke',{restrictionId:applied.data.user.restriction.id,version:1,reason})).status,200);
 assert.equal((await login.call('/api/auth/login',{method:'POST',body:{identifier:s.trainer.user.username,password:'staff security test password'}})).status,200);
 assert.equal((await login.call('/api/teams')).status,200);
});
test('permission removals and demotion take effect in existing sessions; grants cannot exceed the role',async t=>{
 const s=await staff(t);let modVersion=(await s.repo.administration.access(s.mod.user.id)).roleVersion;
 assert.equal((await post(s.owner.c,s.mod.user.id,'permissions',{permissions:['panel.access','users.read','audit.all'],version:modVersion,reason})).status,403);
 const permissions=['panel.access','users.read'];assert.equal((await post(s.owner.c,s.mod.user.id,'permissions',{permissions,version:modVersion,reason})).status,200);
 assert.equal((await s.mod.c.call('/api/admin/users')).status,200);assert.equal((await s.mod.c.call('/api/admin/overview')).status,403);assert.equal((await s.mod.c.call('/api/admin/audit')).status,403);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'restrictions',{hours:1,version:0,reason})).status,403);
 modVersion++;assert.equal((await post(s.admin.c,s.mod.user.id,'role',{role:'trainer',version:modVersion,reason})).status,200);
 assert.equal((await s.mod.c.call('/api/admin/users')).status,403);assert.equal((await s.mod.c.call('/api/auth/session')).data.user.staff.role,'trainer');assert.equal((await s.mod.c.call('/api/teams')).status,200);
});
test('stale/concurrent role changes have one winner; failed audit rolls back the change and no extra metadata is accepted',async t=>{
 const s=await staff(t);const results=await Promise.all([post(s.owner.c,s.trainer.user.id,'role',{role:'moderator',version:0,reason}),post(s.owner.c,s.trainer.user.id,'role',{role:'administrator',version:0,reason})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const before=await s.repo.administration.access(s.trainer.user.id),logs=s.repo.administration.logs.length;s.repo.administration.failAudit=true;
 const fail=await post(s.owner.c,s.trainer.user.id,'role',{role:'trainer',version:before.roleVersion,reason});assert.equal(fail.status,500);assert.equal((await s.repo.administration.access(s.trainer.user.id)).role,before.role);assert.equal(s.repo.administration.logs.length,logs);s.repo.administration.failAudit=false;
 assert.equal((await post(s.owner.c,s.trainer.user.id,'role',{role:'trainer',version:before.roleVersion,reason,metadata:{session:'forged'}})).status,400);
 for(const headers of [{'X-CSRF-Token':''},{Origin:'https://evil.test'}])assert.equal((await s.owner.c.call(`/api/admin/users/${s.trainer.user.id}/role`,{method:'POST',headers,body:{role:'trainer',version:before.roleVersion,reason}})).status,403);
 const log=(await s.owner.c.call('/api/admin/audit')).data.items;assert.ok(log.some(r=>r.action==='owner.bootstrap'));assert.ok(log.every(r=>!JSON.stringify(r).includes('staff security test password')));
 assert.equal((await s.mod.c.call('/api/admin/audit')).data.items.length,0);assert.ok((await s.admin.c.call('/api/admin/audit')).data.items.every(r=>r.action!=='owner.bootstrap'&&r.action!=='permissions.change'));
});
test('removing panel access disables administrative APIs even when another capability remains selected',async t=>{
 const s=await staff(t);assert.equal((await post(s.owner.c,s.mod.user.id,'permissions',{permissions:['users.read','restrictions.apply'],version:1,reason})).status,200);
 for(const path of ['context','users','overview','audit'])assert.equal((await s.mod.c.call('/api/admin/'+path)).status,403);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'restrictions',{hours:1,version:0,reason})).status,403);assert.equal((await s.mod.c.call('/api/teams')).status,200);
});
test('Administrators cannot clear Owner permission limits through same-role updates or demotion/re-promotion',async t=>{
 const s=await staff(t),mod=s.mod.user.id;
 assert.equal((await post(s.owner.c,mod,'permissions',{permissions:['panel.access','users.read'],version:1,reason})).status,200);
 for(const [role,version]of [['moderator',2],['trainer',3],['moderator',4]])assert.equal((await post(s.admin.c,mod,'role',{role,version,reason})).status,200);
 assert.deepEqual((await s.repo.administration.access(mod)).permissions,['panel.access','users.read']);
 assert.equal((await post(s.mod.c,s.trainer.user.id,'restrictions',{hours:1,version:0,reason})).status,403);
 assert.equal((await post(s.owner.c,mod,'role',{role:'moderator',version:5,reason})).status,200);
 assert.ok((await s.repo.administration.access(mod)).permissions.includes('restrictions.apply'));
});
test('staff user search paginates and escapes inputs without granting private profile/team access',async t=>{
 const s=await staff(t);await s.trainer.c.call('/api/profile',{method:'PATCH',body:{bio:'PRIVATE BIO'} });const team=(await s.trainer.c.call('/api/teams',{method:'POST',body:{name:'PRIVATE TEAM'}})).data.team;
 for(let i=0;i<27;i++)await s.repo.createUser({username:'page_'+i,email:`page${i}@example.test`},'fixture-only');
 const first=(await s.admin.c.call('/api/admin/users')).data;assert.equal(first.items.length,25);assert.ok(first.next);const second=(await s.admin.c.call('/api/admin/users?after='+first.next)).data;assert.equal(new Set([...first.items,...second.items].map(u=>u.id)).size,31);
 const users=(await s.mod.c.call('/api/admin/users?q=staff_trainer')).data;assert.equal(users.items.length,1);for(const field of ['email','bio','password_hash','avatar_filename','teams','collection'])assert.ok(!Object.hasOwn(users.items[0],field));
 assert.equal((await s.admin.c.call(`/api/teams/${team.id}/analysis`)).status,404);assert.equal((await s.owner.c.call(`/api/teams/${team.id}`,{method:'DELETE'})).status,404);
 assert.equal((await s.admin.c.call('/api/public/trainers/staff_trainer')).status,404);
 assert.equal((await s.mod.c.call('/api/admin/users?q='+encodeURIComponent("%' OR 1=1 --"))).data.total,0);
 assert.equal((await s.owner.c.call('/api/admin/users?q='+'a'.repeat(65))).status,400);
});
test('expiry restores login and missing administration tables keep base trainer features safe',async t=>{
 const s=await staff(t);const target=s.trainer.user.id;await post(s.mod.c,target,'restrictions',{hours:1,version:0,reason});s.repo.administration.restrictions[0].expiresAt=new Date(Date.now()-1000).toISOString();assert.equal((await s.trainer.c.call('/api/teams')).status,200);
 s.repo.administration.available=false;assert.equal((await s.owner.c.call('/api/admin/overview')).status,503);assert.equal((await s.trainer.c.call('/api/teams')).status,200);
 const empty=new AdminRepository({execute:async()=>{throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});}});assert.equal((await empty.access(1)).available,false);
 const partial=new AdminRepository({execute:async sql=>{if(sql.includes('user_roles'))return [[]];throw Object.assign(Error('missing'),{code:'ER_NO_SUCH_TABLE'});}});await assert.rejects(partial.access(1),e=>e.status===503);
});
test('production writes lock guard first, re-read authority, bind values, and roll back on audit failure',async()=>{
 const calls=[],roles=new Map([[1,{role:'owner',permissions:null,roleVersion:1}],[2,{role:'trainer',permissions:null,roleVersion:0}]]);let auditFail=true;
 const c={beginTransaction:async()=>calls.push(['begin']),commit:async()=>calls.push(['commit']),rollback:async()=>calls.push(['rollback']),release:()=>calls.push(['release']),execute:async(sql,params=[])=>{
  calls.push([sql,params]);if(sql.includes('SELECT schema_version'))return [[{schema_version:1}]];if(sql.startsWith('SELECT role,'))return [[roles.get(params[0])]];if(sql.includes('FROM user_restrictions r'))return [[]];if(sql.startsWith('SELECT id, username'))return [[{id:params[0],username:'target_user'}]];if(sql.startsWith('INSERT INTO user_roles')){roles.set(params[0],{role:params[1],permissions:null,roleVersion:1});return [{}];}if(sql.startsWith('INSERT INTO admin_audit_logs')){if(auditFail)throw Error('Audit unavailable');return [{}];}throw Error(sql);
 }};const repo=new AdminRepository({getConnection:async()=>c});await assert.rejects(repo.change(1,2,'role',{role:'moderator',version:0,reason}),/Audit unavailable/);assert.match(calls[1][0],/admin_state.*FOR UPDATE/);assert.ok(calls.some(x=>x[0]==='rollback'));assert.ok(!calls.some(x=>x[0]==='commit'));
 roles.set(2,{role:'trainer',roleVersion:0,permissions:null});calls.length=0;auditFail=false;await repo.change(1,2,'role',{role:'moderator',version:0,reason});const insert=calls.find(x=>x[0].startsWith('INSERT INTO user_roles'));assert.deepEqual(insert[1],[2,'moderator','owner']);assert.ok(calls.some(x=>x[0]==='commit'));assert.ok(calls.findIndex(x=>x[0].includes('admin_audit_logs'))<calls.findIndex(x=>x[0]==='commit'));
 calls.length=0;roles.set(1,{role:'trainer',roleVersion:2,permissions:null});await assert.rejects(repo.change(1,2,'role',{role:'trainer',version:1,reason}),e=>e.status===403);assert.ok(!calls.some(x=>x[0].startsWith('INSERT')));
});
test('Owner bootstrap arguments require an explicit existing ID confirmation without loading credentials',()=>{
 const {parse}=require('../scripts/bootstrap-owner.cjs');assert.equal(parse(['--user-id','42','--confirm-owner','42']),42);for(const args of [[],['--user-id','jacob','--confirm-owner','jacob'],['--user-id','42','--confirm-owner','43'],['--user-id','0','--confirm-owner','0']])assert.throws(()=>parse(args));
});
test('production staff search batches only permitted identity/role/restriction fields with bound literal search',async()=>{
 const calls=[],pool={execute:async(sql,params)=>{
  calls.push({sql,params});if(sql.startsWith('SELECT COUNT'))return [[{total:2}]];
  if(sql.startsWith('SELECT id, username'))return [[{id:5,username:'trainer_one'},{id:6,username:'trainer_two'}]];
  if(sql.includes('FROM user_roles'))return [[{user_id:6,role:'moderator',permissions:null,roleVersion:1}]];
  if(sql.includes('FROM user_restrictions'))return [[]];throw Error(sql);
 }};
 const repo=new AdminRepository(pool),actor={id:1,...policy.context({role:'administrator'})};
 const result=await repo.users(actor,0,"user_%'");assert.equal(calls.length,4);assert.deepEqual(calls[0].params,["%user=_=%'%","user_%'"]);
 assert.deepEqual(calls[2].params,[5,6]);assert.equal(result.items[1].role,'moderator');assert.ok(calls.every(c=>!c.sql.includes('email')&&!c.sql.includes('bio')&&!c.sql.includes('password')));
 assert.ok(!Object.hasOwn(result.items[0],'permissions')||result.items[0].permissions===undefined);
});
