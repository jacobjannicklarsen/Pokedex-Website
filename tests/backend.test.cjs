const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const session = require('express-session');
const argon2 = require('argon2');
const sharp = require('sharp');
const { createApp } = require('../server/app');
const { Repository } = require('../server/repository');
const { MySQLSessionStore } = require('../server/session-store');
const { configFromEnv } = require('../server/config');
const { MemoryRepository } = require('./support/memory-repository.cjs');
const v = require('../server/validation');

async function setup(t,{production=false,authLimit=100}={}) {
  const uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'pokedex-api-test-'));
  const config={secret:'test-only-session-secret-'.repeat(4),production,trustProxy:production,origin:production?'https://pokedex.example':'http://localhost',uploadDir};
  const repo=new MemoryRepository();const store=new session.MemoryStore();
  const app=await createApp({repo,store,config,authLimit});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));store.clear(()=>{});
    if(path.dirname(path.resolve(uploadDir))!==path.resolve(os.tmpdir())||!path.basename(uploadDir).startsWith('pokedex-api-test-'))throw Error('Unexpected temp path');
    await fs.rm(uploadDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  });
  function client() {
    const state={cookie:'',csrf:''};
    return {state,async call(url,{method='GET',body,form,headers={},raw=false}={}) {
      const response=await fetch(base+url,{method,headers:{...(state.cookie?{Cookie:state.cookie}:{}),...(method!=='GET'?{'X-CSRF-Token':state.csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(production?{'X-Forwarded-Proto':'https'}:{}),...headers},body:form||(body===undefined?undefined:JSON.stringify(body))});
      const cookie=response.headers.get('set-cookie');if(cookie)state.cookie=cookie.split(';')[0];
      const data=raw?await response.text():response.status===204?{}:await response.json();
      if(data.csrfToken)state.csrf=data.csrfToken;
      return {status:response.status,data,headers:response.headers};
    }};
  }
  return {repo,store,client,uploadDir};
}
async function register(client, suffix='one') {
  await client.call('/api/auth/session');
  return client.call('/api/auth/register',{method:'POST',body:{username:`trainer_${suffix}`,email:`${suffix}@example.test`,password:'a sufficiently long test password'}});
}

test('private collection states, timestamps, completion and awards persist across login with owner isolation',async t=>{
  const app=await setup(t),alice=app.client(),bob=app.client(),guest=app.client();
  await guest.call('/api/auth/session');
  for(const url of ['/api/pokedex','/api/pokedex/25','/api/progression','/api/achievements'])assert.equal((await guest.call(url)).status,401);
  assert.equal((await guest.call('/api/pokedex/25',{method:'PUT',body:{status:'caught'}})).status,401);
  await register(alice,'collection_alice');await register(bob,'collection_bob');
  const empty=await alice.call('/api/pokedex');assert.match(empty.headers.get('cache-control'),/no-store/);assert.equal(empty.data.statistics.national.seen,0);assert.ok(empty.data.achievements.every(a=>!a.unlockedAt));
  assert.equal((await alice.call('/api/pokedex/25')).data.status,'not-registered');
  const caught=await alice.call('/api/pokedex/25',{method:'PUT',body:{status:'caught'}});assert.equal(caught.status,200);
  assert.equal(caught.data.collection.length,1);assert.equal(caught.data.statistics.national.seen,1);assert.equal(caught.data.statistics.national.caught,1);
  assert.equal(caught.data.statistics.national.caughtPercentage,100/649);assert.equal(caught.data.statistics.generations[0].caughtPercentage,100/151);
  assert.ok(caught.data.collection[0].seenAt);assert.ok(caught.data.collection[0].caughtAt);
  const awards=caught.data.achievements.filter(a=>a.unlockedAt);assert.deepEqual(awards.map(a=>a.key),['first-encounter','first-catch']);
  const repeat=await alice.call('/api/pokedex/25',{method:'PUT',body:{status:'caught'}});assert.deepEqual(repeat.data.collection,caught.data.collection);assert.deepEqual(repeat.data.achievements, caught.data.achievements);
  assert.equal((await bob.call('/api/pokedex/25?user_id=1')).data.status,'not-registered');
  await bob.call('/api/pokedex/649',{method:'PUT',body:{status:'seen'}});
  assert.equal((await alice.call('/api/pokedex')).data.collection.length,1);
  const seen=await alice.call('/api/pokedex/25',{method:'PUT',body:{status:'seen'}});assert.equal(seen.data.collection[0].caughtAt,null);assert.equal(seen.data.collection[0].seenAt,caught.data.collection[0].seenAt);
  assert.equal(seen.data.statistics.national.caught,0);assert.deepEqual(seen.data.achievements.filter(a=>a.unlockedAt).map(a=>a.unlockedAt),awards.map(a=>a.unlockedAt));
  await alice.call('/api/auth/logout',{method:'POST'});assert.equal((await alice.call('/api/pokedex')).status,401);
  await alice.call('/api/auth/session');await alice.call('/api/auth/login',{method:'POST',body:{identifier:'collection_alice@example.test',password:'a sufficiently long test password'}});
  assert.equal((await alice.call('/api/pokedex/25')).data.status,'seen');
  const removed=await alice.call('/api/pokedex/25',{method:'DELETE'});assert.equal(removed.data.collection.length,0);assert.equal(removed.data.statistics.national.notSeen,649);assert.equal(removed.data.achievements.filter(a=>a.unlockedAt).length,2);
  assert.equal((await alice.call('/api/pokedex/25',{method:'DELETE'})).data.collection.length,0);
  assert.equal((await bob.call('/api/pokedex')).data.collection[0].pokemonId,649);
});
test('collection API rejects invalid IDs, forged awards/owners and CSRF, and reports manual migration requirements',async t=>{
  const app=await setup(t),client=app.client();await register(client,'prog_valid');
  for(const id of ['0','650','-1','1.5','01','1e2','unknown'])for(const method of ['GET','PUT','DELETE'])assert.equal((await client.call(`/api/pokedex/${id}`,{method,...(method==='PUT'?{body:{status:'seen'}}:{})})).status,400);
  for(const body of [{},{status:'not-registered'},{status:'caught',user_id:2},{status:'caught',achievement:'national-pokedex-master'},{status:true},['caught']])assert.equal((await client.call('/api/pokedex/1',{method:'PUT',body})).status,400);
  assert.equal((await client.call('/api/pokedex/1',{method:'PUT',body:{status:'caught'},headers:{'X-CSRF-Token':''}})).status,403);
  assert.equal((await client.call('/api/achievements',{method:'POST',body:{key:'national-pokedex-master'}})).status,404);
  assert.ok((await client.call('/api/achievements')).data.achievements.every(a=>!a.unlockedAt));
  app.repo.progression.snapshot=async()=>{const error=Error('missing table');error.code='ER_NO_SUCH_TABLE';throw error;};
  const unavailable=await client.call('/api/pokedex');assert.equal(unavailable.status,503);assert.match(unavailable.data.error,/manual v0.5.0 migration/);
  assert.equal((await client.call('/api/teams',{method:'POST',body:{name:'Still works'}})).status,201);
});
test('server awards collector and full-team milestones once and keeps timestamps after records/team deletion',async t=>{
  const app=await setup(t),client=app.client();await register(client,'awards');
  for(let id=1;id<=25;id++)await client.call(`/api/pokedex/${id}`,{method:'PUT',body:{status:'caught'}});
  const first=(await client.call('/api/achievements')).data.achievements.find(a=>a.key==='pokemon-collector');assert.ok(first.unlockedAt);assert.equal(first.current,25);
  const created=await client.call('/api/teams',{method:'POST',body:{name:'Six members'}});const id=created.data.team.id;
  await client.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Six members',pokemonIds:[1,25,152,252,387,649]}});
  const teamAward=(await client.call('/api/achievements')).data.achievements.find(a=>a.key==='team-builder');assert.ok(teamAward.unlockedAt);
  await client.call(`/api/teams/${id}`,{method:'DELETE'});for(let n=1;n<=25;n++)await client.call(`/api/pokedex/${n}`,{method:'DELETE'});
  const after=(await client.call('/api/achievements')).data.achievements;
  assert.equal(after.find(a=>a.key==='pokemon-collector').unlockedAt,first.unlockedAt);assert.equal(after.find(a=>a.key==='pokemon-collector').current,0);
  assert.equal(after.find(a=>a.key==='team-builder').unlockedAt,teamAward.unlockedAt);assert.equal(after.find(a=>a.key==='team-builder').current,0);
  const stats=(await client.call('/api/progression')).data.statistics;assert.equal(stats.teams,0);assert.equal(stats.national.caught,0);
});

test('public homepage and Pokédex serve without authentication; legacy trainer routes remain available',async t=>{
  const app=await setup(t),client=app.client();
  for(const route of ['/','/index.html']) {
    const page=await client.call(route,{raw:true});assert.equal(page.status,200);
    assert.match(page.data,/class="hero"/);assert.ok(!page.data.includes('id="pokemon-grid"'));
  }
  const page=await client.call('/pokemon.html',{raw:true});assert.equal(page.status,200);
  assert.match(page.data,/<title>National Pokédex — Dexhaven<\/title>/);
  assert.match(page.data,/id="pokemon-grid"/);
  for(const route of ['/trainers.html','/teams','/favorites','/profile']) {
    const hub=await client.call(route,{raw:true});assert.equal(hub.status,200);
    assert.match(hub.data,/<title>Trainer Hub — Dexhaven<\/title>/);
    assert.match(hub.data,/id="trainer-invitation"/);
  }
  const dashboard=await client.call('/dashboard.html',{raw:true});assert.equal(dashboard.status,200);
  assert.match(dashboard.data,/id="comparison-chart"/);
  const snapshot=await client.call('/data/pokemon-summary.json');assert.equal(snapshot.status,200);assert.equal(snapshot.data.pokemon.length,649);
  for(const asset of ['/pokemon-data.js','/advanced-filters.js','/dashboard.js','/encyclopedia-data.js','/encyclopedia.js','/vendor/chart.umd.js'])assert.equal((await client.call(asset,{raw:true})).status,200);
  for(const secret of ['/scripts/update-pokemon-data.cjs','/node_modules/chart.js/package.json'])assert.equal((await client.call(secret)).status,404);
});

test('registration, Argon2id, cookies, session rotation, login/logout and validation',async t=>{
  const app=await setup(t);const client=app.client();
  const init=await client.call('/api/auth/session');const anonymous=client.state.cookie;
  assert.match(init.headers.get('set-cookie'),/HttpOnly/i);assert.match(init.headers.get('set-cookie'),/SameSite=Lax/i);
  const result=await register(client);assert.equal(result.status,201);assert.equal(result.data.user.username,'trainer_one');
  assert.ok(!('password_hash'in result.data.user));assert.notEqual(client.state.cookie,anonymous);
  assert.match(app.repo.users[0].password_hash,/^\$argon2id\$/);
  assert.equal(await argon2.verify(app.repo.users[0].password_hash,'a sufficiently long test password'),true);
  const old=app.client();old.state.cookie=anonymous;assert.equal((await old.call('/api/profile')).status,401);
  const duplicate=app.client();assert.equal((await register(duplicate)).status,409);
  assert.equal((await client.call('/api/auth/logout',{method:'POST'})).status,204);
  assert.equal((await client.call('/api/profile')).status,401);
  await client.call('/api/auth/session');
  assert.equal((await client.call('/api/auth/login',{method:'POST',body:{identifier:'one@example.test',password:'wrong password'}})).status,401);
  assert.equal((await client.call('/api/auth/login',{method:'POST',body:{identifier:'one@example.test',password:'a sufficiently long test password'}})).status,200);
  const invalid=app.client();await invalid.call('/api/auth/session');
  for(const body of [{username:'ab',email:'a@b.test',password:'123456789012'},{username:'trainer2',email:'bad',password:'123456789012'},{username:'trainer2',email:'a@b.test',password:'short'}])assert.equal((await invalid.call('/api/auth/register',{method:'POST',body})).status,400);
});

test('CSRF, origin checks, authentication, parameter validation and secret-file isolation',async t=>{
  const app=await setup(t);const client=app.client();await client.call('/api/auth/session');
  assert.equal((await client.call('/api/teams')).status,401);
  for(const token of ['', 'é'.repeat(64)]) assert.equal((await client.call('/api/teams',{method:'POST',body:{name:'test'},headers:{'X-CSRF-Token':token}})).status,403);
  assert.equal((await client.call('/api/auth/logout',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await client.call('/api/auth/logout',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const url of ['/.env','/server/config.js','/database/schema.sql','/node_modules/express/package.json','/tests/backend.test.cjs'])assert.equal((await client.call(url)).status,404);
  await register(client);
  for(const id of ['0','-1','1e2','999999999999999999999'])assert.equal((await client.call(`/api/teams/${id}`,{method:'DELETE'})).status,400);
});

test('private teams: max six, duplicates, replace/remove, ownership and favorites isolation',async t=>{
  const app=await setup(t);const alice=app.client(),bob=app.client();await register(alice,'alice');await register(bob,'bob');
  const created=await alice.call('/api/teams',{method:'POST',body:{name:'Kanto Six'}});assert.equal(created.status,201);const id=created.data.team.id;
  for(const pokemonIds of [[1,1],[1,2,3,4,5,6,7],[0],[650],['25'],[1.5]])assert.equal((await alice.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Team',pokemonIds}})).status,400);
  assert.equal((await alice.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Saved Six',pokemonIds:[1,152,252,387,494,649]}})).status,200);
  assert.equal((await bob.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Stolen',pokemonIds:[]}})).status,404);
  assert.equal((await bob.call(`/api/teams/${id}`,{method:'DELETE'})).status,404);
  assert.equal((await bob.call('/api/teams')).data.teams.length,0);
  await alice.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Smaller Team',pokemonIds:[25,26]}});
  assert.deepEqual((await alice.call('/api/teams')).data.teams[0].pokemonIds,[25,26]);
  for(let i=0;i<2;i++)assert.equal((await alice.call('/api/favorites/25',{method:'PUT'})).status,204);
  assert.deepEqual((await alice.call('/api/favorites')).data.pokemonIds,[25]);assert.deepEqual((await bob.call('/api/favorites')).data.pokemonIds,[]);
  assert.equal((await alice.call('/api/favorites/649',{method:'PUT'})).status,204);
  assert.deepEqual((await alice.call('/api/favorites')).data.pokemonIds,[25,649]);
  assert.equal((await alice.call('/api/favorites/650',{method:'PUT'})).status,400);
  await alice.call('/api/favorites/649',{method:'DELETE'});
  await alice.call('/api/favorites/25',{method:'DELETE'});assert.deepEqual((await alice.call('/api/favorites')).data.pokemonIds,[]);
  await alice.call(`/api/teams/${id}`,{method:'DELETE'});assert.equal((await alice.call('/api/teams')).data.teams.length,0);
});

test('profile fields, image sniffing/size limits, re-encoding and previous-file cleanup',async t=>{
  const app=await setup(t);const client=app.client();await register(client);
  const bio='<script>text only, never HTML</script>';
  assert.equal((await client.call('/api/profile',{method:'PATCH',body:{bio}})).data.user.bio,bio);
  assert.equal((await client.call('/api/profile',{method:'PATCH',body:{bio:'x'.repeat(501)}})).status,400);
  const upload=async(bytes,type,name='photo.png')=>{const form=new FormData();form.append('avatar',new Blob([bytes],{type}),name);return client.call('/api/profile/avatar',{method:'POST',form});};
  assert.equal((await upload(Buffer.from('not an image'),'image/png')).status,400);
  assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),'image/png')).status,400);
  assert.equal((await upload(Buffer.from('x'),'image/svg+xml')).status,400);
  assert.equal((await upload(Buffer.alloc(2*1024*1024+1),'image/png')).status,413);
  const png=await sharp({create:{width:8,height:4,channels:3,background:'#80e5b8'}}).png().toBuffer();
  const first=await upload(png,'image/png','../../evil.html');assert.equal(first.status,200);assert.match(first.data.user.avatarUrl,/^\/media\/avatars\/[0-9a-f-]{36}\.webp$/);
  const file=path.join(app.uploadDir,path.basename(first.data.user.avatarUrl));const metadata=await sharp(await fs.readFile(file)).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,256);assert.equal(metadata.height,256);
  const second=await upload(png,'image/png');assert.equal(second.status,200);await assert.rejects(fs.access(file));
});

test('production session cookie is Secure; rate limits return JSON',async t=>{
  const app=await setup(t,{production:true,authLimit:1});const client=app.client();
  const init=await client.call('/api/auth/session');assert.match(init.headers.get('set-cookie'),/; Secure/i);
  const body={identifier:'nobody',password:'not-correct'};
  assert.equal((await client.call('/api/auth/login',{method:'POST',body})).status,401);
  const limited=await client.call('/api/auth/login',{method:'POST',body});assert.equal(limited.status,429);assert.ok(limited.data.error);
});

test('SQL repository locks ownership before replacement and rolls back on failure',async()=>{
  const calls=[];let owned=true,failInsert=false;
  const connection={async beginTransaction(){calls.push('begin');},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');},async execute(sql,params){calls.push({sql,params});if(sql.startsWith('SELECT'))return [owned?[{id:7}]:[]];if(failInsert&&sql.startsWith('INSERT'))throw Error('insert failed');return [{affectedRows:1}];}};
  const repo=new Repository({getConnection:async()=>connection});
  await repo.saveTeam(3,7,{name:"Team ' ?",pokemonIds:[25,1]});
  assert.match(calls[1].sql,/user_id = \? FOR UPDATE/);assert.deepEqual(calls[1].params,[7,3]);
  assert.ok(calls.includes('commit'));assert.equal(calls.at(-1),'release');
  calls.length=0;owned=false;await assert.rejects(repo.saveTeam(4,7,{name:'No',pokemonIds:[]}),/Team not found/);
  assert.equal(calls.some(c=>c.sql?.startsWith('DELETE')),false);assert.ok(calls.includes('rollback'));
  calls.length=0;owned=true;failInsert=true;await assert.rejects(repo.saveTeam(3,7,{name:'Failure',pokemonIds:[25]}));assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));
});

test('session-store SQL persistence works across store instances and uses bound values',async()=>{
  const records=new Map();const calls=[];
  const pool={async execute(sql,params=[]){calls.push({sql,params});if(sql.startsWith('INSERT'))records.set(params[0],JSON.parse(params[1]));if(sql.startsWith('DELETE FROM sessions WHERE sid'))records.delete(params[0]);return [sql.startsWith('SELECT')&&records.has(params[0])?[{data:records.get(params[0])}]:[]];}};
  const a=new MySQLSessionStore(pool),b=new MySQLSessionStore(pool);const sid="session-?-'";
  await new Promise((resolve,reject)=>a.set(sid,{userId:4,cookie:{}},e=>e?reject(e):resolve()));
  const data=await new Promise((resolve,reject)=>b.get(sid,(e,d)=>e?reject(e):resolve(d)));assert.equal(data.userId,4);
  await new Promise((resolve,reject)=>b.destroy(sid,e=>e?reject(e):resolve()));assert.equal(records.size,0);
  assert.equal(calls[0].params[0],sid);assert.ok(!calls[0].sql.includes(sid));
});

test('configuration refuses other databases and insecure production origins',()=>{
  const env={DB_USER:'test-only',DB_PASSWORD:'',SESSION_SECRET:'test-only-secret'.repeat(5)};
  assert.equal(configFromEnv(env).db.database,'pokedex_app');
  assert.throws(()=>configFromEnv({...env,DB_NAME:'another_database'}),/DB_NAME/);
  assert.throws(()=>configFromEnv({...env,NODE_ENV:'production',APP_ORIGIN:'http://localhost:3000'}),/HTTPS/);
  assert.throws(()=>v.team({name:'Team',pokemonIds:[25,25]}),/duplicate/);
});
