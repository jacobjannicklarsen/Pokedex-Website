const {test}=require('node:test'),assert=require('node:assert/strict');
const setup=require('./support/app-fixture.cjs'),defaults=require('../server/community').defaults;
const {CommunityRepository}=require('../server/community-repository');
test('public staff name identity comes only from actual roles and enabled profiles; no permissions or private staff details leak',async t=>{
 const s=await setup(t),owner=await s.register('public_staff_owner'),mod=await s.register('public_staff_mod'),ordinary=await s.register('public_staff_trainer'),guest=s.client();
 await s.repo.administration.bootstrapOwner(owner.user.id);await s.repo.administration.change(owner.user.id,mod.user.id,'role',{role:'moderator',version:0,reason:'Review public staff presentation'});
 assert.equal((await guest.call('/api/public/trainers/public_staff_owner')).status,404);assert.equal((await guest.call('/api/public/trainers')).data.total,0);
 for(const user of [owner,mod,ordinary])await user.c.call('/api/community/settings',{method:'PUT',body:{...defaults(),enabled:true}});
 const profile=(await guest.call('/api/public/trainers/public_staff_owner')).data.profile;assert.equal(profile.staffRole,'owner');for(const field of ['permissions','roleVersion','restrictions','email','staff'])assert.ok(!Object.hasOwn(profile,field));
 const cards=(await guest.call('/api/public/trainers')).data.trainers;assert.equal(cards.find(c=>c.username===mod.user.username).staffRole,'moderator');assert.ok(!Object.hasOwn(cards.find(c=>c.username===ordinary.user.username),'staffRole'));
 assert.equal((await ordinary.c.call('/api/profile/decorations',{method:'PUT',body:{...require('../server/decorations').defaults(),staffRole:'owner'}})).status,400);
 assert.equal((await ordinary.c.call('/api/admin/context')).status,403);
 await s.repo.administration.change(owner.user.id,mod.user.id,'role',{role:'trainer',version:1,reason:'Remove public staff assignment'});
 assert.ok(!Object.hasOwn((await guest.call('/api/public/trainers/public_staff_mod')).data.profile,'staffRole'));
 await owner.c.call('/api/community/settings',{method:'PUT',body:defaults()});assert.equal((await guest.call('/api/public/trainers/public_staff_owner')).status,404);assert.ok(!(await guest.call('/api/public/trainers')).data.trainers.some(c=>c.staffRole==='owner'));
});
test('public role reads are batched, parameterized and publication-gated, with safe visual fallback before staff migration',async()=>{
 const calls=[],pool={execute:async(sql,params)=>{calls.push({sql,params});return [[{userId:1,role:'owner'},{userId:2,role:'administrator'},{userId:3,role:'fake-owner'}]];}};
 const repo=new CommunityRepository(pool);assert.deepEqual([...await repo.publicRoles([1,2,3])],[[1,'owner'],[2,'administrator']]);assert.equal(calls.length,1);assert.deepEqual(calls[0].params,[1,2,3]);assert.match(calls[0].sql,/s.enabled = 1/);assert.ok(!calls[0].sql.includes('permissions'));assert.ok(!calls[0].sql.includes('restrictions'));
 assert.equal((await repo.publicRoles([])).size,0);assert.equal(calls.length,1);
 pool.execute=async()=>{throw Object.assign(Error('missing staff table'),{code:'ER_NO_SUCH_TABLE'});};assert.equal((await repo.publicRoles([1])).size,0);
 pool.execute=async()=>{throw Object.assign(Error('database offline'),{code:'ECONNREFUSED'});};await assert.rejects(repo.publicRoles([1]),/database offline/);
});
