const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const setup=require('./support/app-fixture.cjs'),{games,local,romFile}=require('../server/gba');
test('Shoutbox public reads, authenticated posting, plain text, validation, cooldown and duplicate protection',async t=>{
 const s=await setup(t),a=await s.register('shout_alice'),guest=s.client();await guest.call('/api/auth/session');
 assert.equal((await guest.call('/api/shoutbox/messages')).status,200);
 assert.equal((await guest.call('/api/shoutbox/messages',{method:'POST',body:{message:'Hello'}})).status,401);
 for(const body of [{message:' '},{message:'x'.repeat(501)},{message:'hello',userId:999}])assert.equal((await a.c.call('/api/shoutbox/messages',{method:'POST',body})).status,400);
 const text='<script>alert(1)</script> SQL: \' OR 1=1 --';
 assert.equal((await a.c.call('/api/shoutbox/messages',{method:'POST',body:{message:text}})).status,200);
 const data=(await guest.call('/api/shoutbox/messages')).data;
 assert.equal(data.items[0].message,text);assert.equal(data.items[0].author.username,'shout_alice');assert.equal(data.items[0].author.avatarUrl,null);assert.equal(data.items[0].author.profileAvailable,false);assert.ok(!JSON.stringify(data).includes('email'));assert.ok(!JSON.stringify(data).includes('password'));
 assert.equal((await a.c.call('/api/shoutbox/messages',{method:'POST',body:{message:text}})).status,409);
 assert.equal((await a.c.call('/api/shoutbox/messages',{method:'POST',body:{message:'Another thought'}})).status,429);
});
test('Shoutbox moderation uses live permissions and hierarchy, logs audit, hides removed messages and rolls back failures',async t=>{
 const s=await setup(t),owner=await s.register('shout_owner'),mod=await s.register('shout_mod'),a=await s.register('shout_trainer');await s.repo.administration.bootstrapOwner(owner.user.id);await s.repo.administration.change(owner.user.id,mod.user.id,'role',{role:'moderator',version:0,reason:'Test moderation'});
 const posted=await a.c.call('/api/shoutbox/messages',{method:'POST',body:{message:'A message to moderate'}}),id=posted.data.id;
 assert.equal((await a.c.call('/api/shoutbox/messages/'+id,{method:'DELETE',body:{reason:'Reviewed message'}})).status,403);
 s.repo.forums.store.failAudit=true;assert.equal((await mod.c.call('/api/shoutbox/messages/'+id,{method:'DELETE',body:{reason:'Reviewed message'}})).status,500);assert.equal((await a.c.call('/api/shoutbox/messages')).data.items.length,1);s.repo.forums.store.failAudit=false;
 assert.equal((await mod.c.call('/api/shoutbox/messages/'+id,{method:'DELETE',body:{reason:'Reviewed message'}})).status,200);
 const list=(await a.c.call('/api/shoutbox/messages?ids='+id)).data;assert.equal(list.items.length,0);assert.deepEqual(list.deletedIds,[id]);assert.equal(s.repo.forums.store.data.audit.at(-1).action,'shoutbox.remove');
 const own=await owner.c.call('/api/shoutbox/messages',{method:'POST',body:{message:'Owner message'}});assert.equal((await mod.c.call('/api/shoutbox/messages/'+own.data.id,{method:'DELETE',body:{reason:'Cannot target owner'}})).status,403);
});
test('Shoutbox pagination and account rate limits remain enforced across requests; missing migration is isolated',async t=>{
 const s=await setup(t),a=await s.register('shout_pages');
 for(let i=0;i<35;i++)await s.repo.shoutbox.store.insert(a.user.id,'Fixture message '+i);
 const first=(await a.c.call('/api/shoutbox/messages?limit=20')).data;assert.equal(first.items.length,20);const older=(await a.c.call('/api/shoutbox/messages?limit=20&before='+first.next)).data;assert.equal(older.items.length,15);assert.ok(!older.items.some(x=>first.items.some(y=>x.id===y.id)));
 s.repo.shoutbox.store.rows.forEach((r,i)=>r.createdAt=new Date(Date.now()-6000-i).toISOString());assert.equal((await a.c.call('/api/shoutbox/messages',{method:'POST',body:{message:'Too many'}})).status,429);
 s.repo.shoutbox.store.available=false;assert.equal((await a.c.call('/api/shoutbox/messages')).status,503);assert.equal((await a.c.call('/',{raw:true})).status,200);
});
test('private game map, local configuration, Host/Origin checks and realpath traversal restrictions',async t=>{
 assert.deepEqual(games.map(g=>g.id),['firered','leafgreen','ruby','sapphire','emerald','lightplatinum']);
 assert.equal(games.find(g=>g.id==='ruby').file,'Pokemon - Ruby Version.gba');
 const config={origin:'http://localhost:3000',host:'127.0.0.1',gbaEnabled:true};
 const req=(host='localhost:3000',remote='127.0.0.1',origin)=>({socket:{remoteAddress:remote},get:k=>({'host':host,'origin':origin}[k])});
 assert.equal(local(req(),config),true);for(const c of [{...config,production:true},{...config,trustProxy:true},{...config,gbaEnabled:false},{...config,host:'0.0.0.0'}])assert.equal(local(req(),c),false);
 assert.equal(local(req('evil.test:3000'),config),false);assert.equal(local(req('localhost:3000','192.168.1.2'),config),false);assert.equal(local(req('localhost:3000','127.0.0.1','https://evil.test'),config),false);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dexhaven-gba-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.writeFile(path.join(dir,games[0].file),Buffer.alloc(192));
 assert.equal((await romFile({gbaRomsDir:dir},'firered')).stat.size,192);await assert.rejects(romFile({gbaRomsDir:dir},'../.env'));await assert.rejects(romFile({gbaRomsDir:dir},'emerald'),e=>e.status===404&&!e.message.includes(dir));
});
test('private game endpoints require the local Owner and never expose the configured path',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dexhaven-gba-api-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.writeFile(path.join(dir,games[0].file),Buffer.alloc(192));
 const s=await setup(t,{host:'127.0.0.1',gbaEnabled:true,gbaRomsDir:dir,fixtureLocalOrigin:true}),owner=await s.register('game_owner'),a=await s.register('game_trainer');await s.repo.administration.bootstrapOwner(owner.user.id);
 const headers={Host:'localhost'};
 assert.equal((await a.c.call('/api/local/gba/rom/firered',{headers,raw:true})).status,403);
 assert.equal((await owner.c.call('/api/local/gba/rom/firered',{headers,raw:true})).status,200);
 assert.equal((await owner.c.call('/api/local/gba/rom/firered?path=.env',{headers})).status,400);
 assert.equal((await owner.c.call('/api/local/gba/rom/unknown',{headers})).status,404);
 assert.equal((await owner.c.call('/api/local/gba/rom/firered',{headers:{Origin:'https://evil.test'},raw:true})).status,404);
 const catalog=await owner.c.call('/api/local/gba/games',{headers});assert.equal(catalog.data.games.length,6);assert.ok(!JSON.stringify(catalog).includes(dir));
 assert.equal((await owner.c.call('/Dexhaven-GBA/ROMs/'+encodeURIComponent(games[0].file),{raw:true})).status,404);
});
test('save keys separate games and revisions; raw save validation rejects incompatible backups',async()=>{
 const saves=require('../gba-saves'),a=await saves.identity('ruby','a'.repeat(64)),b=await saves.identity('lightplatinum','a'.repeat(64)),c=await saves.identity('ruby','b'.repeat(64));assert.notEqual(a.key,b.key);assert.notEqual(a.numeric,b.numeric);assert.notEqual(a.key,c.key);assert.ok(Number.isSafeInteger(a.numeric));
 assert.equal(saves.validate(new Uint8Array(131072),a.key+'.sav',a).length,131072);assert.throws(()=>saves.validate(new Uint8Array(131072),b.key+'.sav',a));assert.throws(()=>saves.validate(new Uint8Array(17),'bad.sav',a));assert.throws(()=>saves.validate(new Uint8Array(131072),'state.state',a));
});

test('Shoutbox concurrent duplicates have one winner; revoking moderation immediately removes access',async t=>{
 const s=await setup(t),owner=await s.register('shout_race_owner'),mod=await s.register('shout_race_mod');await s.repo.administration.bootstrapOwner(owner.user.id);await s.repo.administration.change(owner.user.id,mod.user.id,'role',{role:'moderator',version:0,reason:'Reviewed role change'});
 const results=await Promise.all([1,2].map(()=>owner.c.call('/api/shoutbox/messages',{method:'POST',body:{message:'A single concurrent message'}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const id=results.find(r=>r.status===200).data.id;
 await s.repo.administration.change(owner.user.id,mod.user.id,'permissions',{version:1,reason:'Remove moderation',permissions:['panel.access','users.read']});
 assert.equal((await mod.c.call('/api/shoutbox/messages')).data.items[0].canRemove,false);
 assert.equal((await mod.c.call('/api/shoutbox/messages/'+id,{method:'DELETE',body:{reason:'No longer authorized'}})).status,403);
});

test('production Shoutbox SQL binds input and atomically records moderation with rollback',async()=>{
 const {ShoutboxStore}=require('../server/shoutbox');let fail=false;const calls=[];
 const c={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),execute:async(sql,params)=>{calls.push({sql,params});if(fail&&sql.startsWith('INSERT INTO forum_audit'))throw Error('Audit failed');return[sql.startsWith('SELECT')?[]:{insertId:42}];}};
 const store=new ShoutboxStore({getConnection:async()=>c,execute:c.execute},{administration:{ready:async(connection,lock)=>{assert.equal(connection,c);assert.equal(lock,true);calls.push('authority guard');return true;}}});
 const text="'; DELETE FROM users; --";await store.atomic(async s=>{await s.insert(1,text);await s.remove(42,1);await s.record(1,2,42,'Reviewed removal');});
 assert.deepEqual(calls.find(c=>c.sql?.startsWith('INSERT INTO shoutbox_messages')).params,[1,text]);assert.ok(calls.indexOf('authority guard')<calls.findIndex(c=>c.sql));assert.ok(calls.includes('commit'));
 fail=true;calls.length=0;await assert.rejects(store.atomic(s=>s.record(1,2,42,'Audit must commit')),/Audit failed/);assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));
});

test('v0.7.2 migration is additive, matches fresh installs and never runs at startup',async()=>{
 const sql=await fs.readFile('database/migrations/v0.7.2-shoutbox.sql','utf8'),schema=await fs.readFile('database/schema.sql','utf8');assert.ok(schema.includes(sql.slice(sql.indexOf('CREATE TABLE'))));assert.equal((sql.match(/CREATE TABLE/g)||[]).length,1);assert.ok(!/^\s*(?:DROP|ALTER|TRUNCATE|DELETE|UPDATE)\b/m.test(sql));for(const f of ['server/index.js','server/setup-db.js'])assert.ok(!(await fs.readFile(f,'utf8')).includes('v0.7.2-shoutbox.sql'));
});

test('real MySQL Shoutbox persistence and migration verification remain pending owner execution',{skip:'Owner must manually apply v0.7.2-shoutbox.sql; no database writes are authorized by this test.'},()=>{});
