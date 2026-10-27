const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const sync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const session=require('express-session');
const sharp=require('sharp');
const {createApp}=require('../server/app');
const {MemoryRepository}=require('./support/memory-repository.cjs');
const community=require('../server/community');
const {CommunityRepository}=require('../server/community-repository');
const {analyze}=require('../team-analysis-data');
const data=require('../pokemon-data');
const snapshot=require('../data/pokemon-summary.json');
const chart=require('../data/type-chart.json');
const run=ids=>analyze(ids,snapshot.pokemon,chart.resources);
async function setup(t){
 const repo=new MemoryRepository(),store=new session.MemoryStore(),uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'dexhaven-community-qa-'));
 const app=await createApp({repo,store,config:{origin:'http://localhost',uploadDir,production:false,secret:'community-fixture-secret-'.repeat(4)}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));store.clear(()=>{});if(path.dirname(path.resolve(uploadDir))!==path.resolve(os.tmpdir())||!path.basename(uploadDir).startsWith('dexhaven-community-qa-'))throw Error('Unexpected temp path');await fs.rm(uploadDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
 function client(){let cookie='',csrf='';return {async call(url,{method='GET',body,form,headers={},raw=false}={}){const r=await fetch(base+url,{method,headers:{Cookie:cookie,...(method!=='GET'?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:form||(body?JSON.stringify(body):undefined)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const payload=raw?await r.text():r.status===204?{}:await r.json();if(payload.csrfToken)csrf=payload.csrfToken;return {status:r.status,data:payload,headers:r.headers};}};}
 async function register(c,name){await c.call('/api/auth/session');return (await c.call('/api/auth/register',{method:'POST',body:{username:name,email:`${name}@example.test`,password:'community secure test password'}})).data.user;}
 return {repo,client,register};
}
test('bundled official chart is complete, reciprocal and uses the Encyclopedia modern rules',()=>{
 assert.equal(chart.source,'https://pokeapi.co/api/v2/type/');assert.ok(Number.isFinite(Date.parse(chart.retrievedAt)));
 assert.deepEqual(chart.resources.map(r=>r.name),data.types);
 for(const a of chart.resources)for(const b of chart.resources)for(const prefix of ['no','half','double'])assert.equal(a.damage_relations[`${prefix}_damage_to`].some(t=>t.name===b.name),b.damage_relations[`${prefix}_damage_from`].some(t=>t.name===a.name));
 const a=run([6]);assert.equal(a.members[0].defense.rock,4);assert.equal(a.members[0].defense.grass,.25);assert.equal(a.members[0].defense.ground,0);assert.equal(a.members[0].defense.water,2);assert.equal(a.members[0].defense.fighting,.5);assert.equal(a.members[0].defense.normal,1);
 assert.equal(run([81]).members[0].defense.ghost,1);assert.equal(run([81]).members[0].defense.poison,0);
});
test('incomplete teams exclude empty slots from exact averages, totals, offense and defensive counts',()=>{
 const a=run([1,6]);assert.equal(a.count,2);assert.equal(a.emptySlots,4);assert.equal(a.defensive.length,18);assert.equal(a.offensive.length,18);
 for(const [i,key]of data.stats.entries())assert.equal(a.averages[i].value,(data.value(snapshot.pokemon[0],key)+data.value(snapshot.pokemon[5],key))/2);
 assert.equal(a.total,852);assert.deepEqual(a.ownTypes,['fire','grass','poison','flying']);
 assert.deepEqual(a.defensive.find(d=>d.type==='rock'),{type:'rock',multipliers:[1,4],weak:1,resistant:0,immune:0,neutral:1});
 assert.ok(a.offensive.find(d=>d.type==='grass').attackers.includes('fire'));
 assert.ok(a.offensive.find(d=>d.type==='grass').attackers.includes('flying'));
 for(const d of a.defensive)assert.equal(d.weak+d.resistant+d.immune+d.neutral,2);
 const empty=run([]);assert.equal(empty.total,0);assert.ok(empty.averages.every(v=>v.value===null));assert.ok(empty.defensive.every(d=>d.weak===0));
 for(const ids of [[1,1],[0],[650],['1'],[1,2,3,4,5,6,7]])assert.throws(()=>run(ids));
 assert.throws(()=>analyze([1],[],chart.resources),/unavailable/);assert.throws(()=>analyze([1],snapshot.pokemon,chart.resources.slice(1)),/Complete/);
});
test('existing trainers/teams stay private; preview and settings are owner-only and allowlisted',async t=>{
 const s=await setup(t),alice=s.client(),bob=s.client(),guest=s.client();const user=await s.register(alice,'community_alice');await s.register(bob,'community_bob');
 await alice.call('/api/profile',{method:'PATCH',body:{bio:'PRIVATE biography'}});
 const team=(await alice.call('/api/teams',{method:'POST',body:{name:'Private lineup'}})).data.team;
 assert.equal((await guest.call('/api/public/trainers/community_alice')).status,404);assert.deepEqual((await guest.call('/api/public/trainers')).data.trainers,[]);
 assert.deepEqual((await alice.call('/api/community/settings')).data.settings,community.defaults());
 assert.deepEqual((await alice.call(`/api/teams/${team.id}/visibility`)).data,{visibility:'private',shareId:null});
 assert.equal((await bob.call(`/api/teams/${team.id}/visibility`)).status,404);
 assert.equal((await guest.call('/api/community/preview')).status,401);
 const preview=(await alice.call('/api/community/preview')).data.profile;
 assert.equal(preview.bio,'');assert.deepEqual(preview.teams,[]);assert.equal(preview.username,user.username);assert.ok(!JSON.stringify(preview).includes('PRIVATE'));
 assert.deepEqual(Object.keys(preview).sort(),['username','bio','createdAt','avatarUrl','featuredPokemonId','featuredTeamId','teams'].sort());
 assert.equal((await alice.call('/api/public/trainers/community_alice')).status,404);
});
test('profiles expose only explicitly approved sections; disable, stale usernames and directory pagination stay private',async t=>{
 const s=await setup(t),alice=s.client(),guest=s.client();const u=await s.register(alice,'public_alice');
 await alice.call('/api/favorites/25',{method:'PUT'});await alice.call('/api/pokedex/6',{method:'PUT',body:{status:'caught'}});
 const publicSettings={...community.defaults(),enabled:true,publicBio:'<script>not executable</script>',featuredPokemonId:6};
 assert.equal((await alice.call('/api/community/settings',{method:'PUT',body:publicSettings})).status,200);
 let result=await guest.call('/api/public/trainers/PUBLIC_ALICE');assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);
 assert.equal(result.data.profile.bio,publicSettings.publicBio);assert.ok(!('favorites'in result.data.profile));assert.ok(!('statistics'in result.data.profile));assert.ok(!('achievements'in result.data.profile));
 for(const forbidden of ['email','password_hash','session','csrf','user_id','collection','shareAvatar'])assert.ok(!Object.hasOwn(result.data.profile,forbidden));
 assert.deepEqual((await guest.call('/api/public/trainers')).data,{trainers:[{username:u.username}],next:null});
 assert.deepEqual((await guest.call(`/api/public/trainers?after=${u.id}`)).data.trainers,[]);
 for (const [flag,field] of [['shareFavorites','favorites'],['shareProgress','statistics'],['shareAchievements','achievements']]) {
   await alice.call('/api/community/settings',{method:'PUT',body:{...publicSettings,[flag]:true}});
   const individual=(await guest.call('/api/public/trainers/public_alice')).data.profile;
   for (const optional of ['favorites','statistics','achievements']) assert.equal(Object.hasOwn(individual,optional),optional===field,`${flag} must authorize only its own section`);
 }
 await alice.call('/api/community/settings',{method:'PUT',body:{...publicSettings,shareFavorites:true,shareProgress:true,shareAchievements:true}});
 result=await guest.call('/api/public/trainers/public_alice');assert.deepEqual(result.data.profile.favorites,[25]);assert.equal(result.data.profile.statistics.national.caught,1);assert.deepEqual(Object.keys(result.data.profile.statistics).sort(),['generations','national']);assert.ok(result.data.profile.achievements.length>=2);assert.ok(!('current'in result.data.profile.achievements[0]));
 assert.equal(s.repo.collections.get(u.id).size,1);const before=s.repo.awards.get(u.id).size;await guest.call('/api/public/trainers/public_alice');assert.equal(s.repo.awards.get(u.id).size,before);
 await alice.call('/api/community/settings',{method:'PUT',body:{...publicSettings,enabled:false}});
 for(const suffix of ['','/teams','/avatar'])assert.equal((await guest.call('/api/public/trainers/public_alice'+suffix,{raw:suffix==='/avatar'})).status,404);
 assert.deepEqual((await guest.call('/api/public/trainers')).data.trainers,[]);
 assert.equal((await guest.call('/api/public/trainers/old_username')).status,404);
});
test('public team tokens grant no editing rights; revocation, deletion, owner analysis and featured ownership are enforced',async t=>{
 const s=await setup(t),alice=s.client(),bob=s.client(),guest=s.client();await s.register(alice,'team_alice');await s.register(bob,'team_bob');
 const id=(await alice.call('/api/teams',{method:'POST',body:{name:'Alpha'}})).data.team.id;
 await alice.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Alpha',pokemonIds:[6,81]}});
 for(const method of ['GET','PUT'])assert.equal((await bob.call(`/api/teams/${id}/visibility`,{method,...(method==='PUT'?{body:{visibility:'public'}}:{})})).status,404);
 assert.equal((await bob.call(`/api/teams/${id}/analysis`)).status,404);assert.equal((await guest.call(`/api/teams/${id}/analysis`)).status,401);
 assert.equal((await bob.call('/api/community/settings',{method:'PUT',body:{...community.defaults(),featuredTeamId:id}})).status,404);
 const sharing=await alice.call(`/api/teams/${id}/visibility`,{method:'PUT',body:{visibility:'public'}});assert.equal(sharing.status,200);assert.match(sharing.data.shareId,/^[a-f0-9-]{36}$/);
 assert.equal((await alice.call(`/api/teams/${id}/visibility`,{method:'PUT',body:{visibility:'public'}})).data.shareId,sharing.data.shareId);
 const url=`/api/public/teams/${sharing.data.shareId}`;let view=await guest.call(url);assert.equal(view.status,200);assert.equal(view.data.team.profileAvailable,false);assert.deepEqual(view.data.team.pokemonIds,[6,81]);assert.equal(view.data.analysis.count,2);assert.ok(!('userId'in view.data.team));
 assert.equal((await bob.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Stolen',pokemonIds:[]}})).status,404);assert.equal((await bob.call(`/api/teams/${id}`,{method:'DELETE'})).status,404);
 await alice.call('/api/community/settings',{method:'PUT',body:{...community.defaults(),enabled:true,featuredTeamId:id}});
 let profile=(await guest.call('/api/public/trainers/team_alice')).data.profile;assert.equal(profile.teams[0].featured,true);
 await alice.call(`/api/teams/${id}`,{method:'PUT',body:{name:'Updated',pokemonIds:[1]}});view=await guest.call(url);assert.equal(view.data.team.name,'Updated');assert.equal(view.data.analysis.count,1);assert.equal(view.data.analysis.total,318);
 await alice.call(`/api/teams/${id}/visibility`,{method:'PUT',body:{visibility:'private'}});assert.equal((await guest.call(url)).status,404);assert.equal((await bob.call(url)).status,404);
 profile=(await guest.call('/api/public/trainers/team_alice')).data.profile;assert.deepEqual(profile.teams,[]);assert.equal(profile.featuredTeamId,null);
 await alice.call(`/api/teams/${id}/visibility`,{method:'PUT',body:{visibility:'public'}});await alice.call(`/api/teams/${id}`,{method:'DELETE'});assert.equal((await guest.call(url)).status,404);
});
test('community rejects forged settings, malformed identities, visibility and missing CSRF; missing schema preserves old features',async t=>{
 const s=await setup(t),c=s.client();await s.register(c,'community_validation');
 for(const body of [{}, {...community.defaults(),enabled:1},{...community.defaults(),userId:2},{...community.defaults(),featuredPokemonId:650},{...community.defaults(),publicBio:'x'.repeat(501)}])assert.equal((await c.call('/api/community/settings',{method:'PUT',body})).status,400);
 assert.equal((await c.call('/api/community/settings',{method:'PUT',body:community.defaults(),headers:{'X-CSRF-Token':''}})).status,403);
 assert.equal((await c.call('/api/community/settings',{method:'PUT',body:community.defaults(),headers:{Origin:'https://evil.test'}})).status,403);
 const id=(await c.call('/api/teams',{method:'POST',body:{name:'Test'}})).data.team.id;
 for(const body of [{visibility:'friends'},{visibility:'public',userId:2},{visibility:true}])assert.equal((await c.call(`/api/teams/${id}/visibility`,{method:'PUT',body})).status,400);
 assert.equal((await c.call(`/api/teams/${id}/visibility`,{method:'PUT',body:{visibility:'public'},headers:{'X-CSRF-Token':''}})).status,403);
 for(const url of ['/api/public/teams/123','/api/public/trainers/x','/api/public/trainers?after=-1'])assert.equal((await c.call(url)).status,400);
 s.repo.community.settings=async()=>{throw Object.assign(Error('internal table secret'),{code:'ER_NO_SUCH_TABLE'});};
 const error=await c.call('/api/community/settings');assert.equal(error.status,503);assert.match(error.data.error,/manual v0.6.0/);assert.ok(!error.data.error.includes('secret'));
 assert.equal((await c.call('/api/teams')).status,200);assert.equal((await c.call('/api/pokedex')).status,200);
});
test('public avatars are individually opted in and revoked, while original uploads remain owner-only',async t=>{
 const s=await setup(t),alice=s.client(),bob=s.client(),guest=s.client();await s.register(alice,'avatar_alice');await s.register(bob,'avatar_bob');
 const png=await sharp({create:{width:8,height:8,channels:3,background:'green'}}).png().toBuffer();const form=new FormData();form.append('avatar',new Blob([png],{type:'image/png'}),'pic.png');
 const uploaded=await alice.call('/api/profile/avatar',{method:'POST',form});const ownerUrl=uploaded.data.user.avatarUrl;
 assert.equal((await alice.call(ownerUrl,{raw:true})).status,200);assert.equal((await guest.call(ownerUrl,{raw:true})).status,404);assert.equal((await bob.call(ownerUrl,{raw:true})).status,404);
 await alice.call('/api/community/settings',{method:'PUT',body:{...community.defaults(),enabled:true}});
 const url='/api/public/trainers/avatar_alice/avatar';assert.equal((await guest.call(url,{raw:true})).status,404);
 await alice.call('/api/community/settings',{method:'PUT',body:{...community.defaults(),enabled:true,shareAvatar:true}});
 assert.equal((await guest.call(url,{raw:true})).status,200);assert.match((await guest.call(url,{raw:true})).headers.get('cache-control'),/no-store/);
 assert.equal((await guest.call('/api/public/trainers/avatar_alice')).data.profile.avatarUrl,url);
 await alice.call('/api/community/settings',{method:'PUT',body:{...community.defaults(),enabled:true}});assert.equal((await guest.call(url,{raw:true})).status,404);assert.equal((await alice.call(ownerUrl,{raw:true})).status,200);
});
test('clean public URLs, explicit asset allowlists and API rate limits work without authentication',async t=>{
 const s=await setup(t),c=s.client();
 for(const url of ['/community.html','/trainer/visitor','/team/064949c0-42b3-404e-80a9-614a261eb999']){const page=await c.call(url,{raw:true});assert.equal(page.status,200);assert.match(page.data,/id="community-content"/);if(url!=='/community.html')assert.match(page.data,/<base href="\/">/);}
 for(const url of ['/team-analysis.js','/team-analysis-data.js','/community.js','/data/type-chart.json'])assert.equal((await c.call(url,{raw:true})).status,200);
 for(const url of ['/server/community.js','/database/migrations/v0.6.0-trainer-community.sql'])assert.equal((await c.call(url,{raw:true})).status,404);
 let response;for(let i=0;i<121;i++)response=await c.call('/api/public/trainers');assert.equal(response.status,429);
});
test('production sharing writes lock owned teams and bind values; settings roll back foreign featured teams',async()=>{
 const calls=[];let found=true;
 const connection={async beginTransaction(){calls.push(['begin']);},async commit(){calls.push(['commit']);},async rollback(){calls.push(['rollback']);},release(){calls.push(['release']);},async execute(sql,params){calls.push([sql,params]);return [sql.startsWith('SELECT id FROM teams')?(found?[{id:7}]:[]):sql.startsWith('SELECT share_id')?[{shareId:'stable-token'}]:[]];}};
 const repo=new CommunityRepository({getConnection:async()=>connection});
 assert.deepEqual(await repo.share(2,7,'public'),{visibility:'public',shareId:'stable-token'});
 assert.deepEqual(calls.find(c=>c[0].startsWith?.('SELECT id FROM teams'))[1],[7,2]);assert.match(calls.find(c=>c[0].startsWith?.('INSERT'))[0],/ON DUPLICATE KEY UPDATE is_public = VALUES\(is_public\)/);assert.ok(calls.find(c=>c[0]==='commit'));
 calls.length=0;found=false;await assert.rejects(repo.share(99,7,'public'),/not found/);assert.ok(!calls.some(c=>c[0].startsWith('INSERT')));assert.ok(calls.some(c=>c[0]==='rollback'));
 calls.length=0;await assert.rejects(repo.saveSettings(2,{...community.defaults(),featuredTeamId:7}),/not found/);assert.ok(calls.some(c=>c[0]==='rollback'));assert.ok(!calls.some(c=>c[0]==='commit'));
});
test('v0.6.0 migration is purely additive and identical to fresh schema with disabled defaults',()=>{
 const read=f=>sync.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');const sql=read('database/migrations/v0.6.0-trainer-community.sql'),schema=read('database/schema.sql');
 assert.match(sql,/USE pokedex_app;/);assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,2);assert.ok(!/(?:^|;)\s*(?:DROP|TRUNCATE|ALTER|DELETE|UPDATE|INSERT)\b/i.test(sql.replace(/^--.*$/gm,'')));
 for(const table of ['trainer_public_settings','team_sharing']){const pattern=new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\) ENGINE=InnoDB;`);assert.equal(schema.match(pattern)[0],sql.match(pattern)[0]);}
 for(const column of ['enabled','share_avatar','share_favorites','share_progress','share_achievements','is_public'])assert.match(sql,new RegExp(`${column} BOOLEAN NOT NULL DEFAULT FALSE`));
 assert.match(sql,/UNIQUE KEY uq_team_share_id/);assert.match(sql,/ON DELETE SET NULL/);assert.match(sql,/ON DELETE CASCADE/);
 for(const file of ['server/index.js','server/setup-db.js'])assert.ok(!read(file).includes('v0.6.0-trainer-community.sql'));
});
