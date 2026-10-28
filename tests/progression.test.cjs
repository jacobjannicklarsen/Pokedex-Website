'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const logic=require('../server/progression');
const {ProgressionRepository}=require('../server/progression-repository');
const {awardTeamBuilder}=logic;
const rows=(ids,status='caught')=>ids.map(pokemonId=>({pokemonId,status,seenAt:'2026-10-27T10:00:00.000Z',caughtAt:status==='caught'?'2026-10-27T10:00:00.000Z':null,updatedAt:'2026-10-27T10:00:00.000Z'}));
const range=(start,end)=>Array.from({length:end-start+1},(_,i)=>start+i);
test('national/generation counts include caught as seen, use exact introduction boundaries and never duplicate species',()=>{
  const records=[...rows([1,151,152,251,252,386,387,493,494,649]),...rows([25],'seen')];
  const stats=logic.statistics(records,[{pokemonIds:[1]}],[25,649]);
  assert.deepEqual(stats.generations.map(g=>g.total),[151,100,135,107,156]);
  assert.deepEqual(stats.generations.map(g=>g.caught),[2,2,2,2,2]);
  assert.equal(stats.national.seen,11);assert.equal(stats.national.caught,10);assert.equal(stats.national.notSeen,638);assert.equal(stats.national.notCaught,639);
  assert.equal(stats.national.caughtPercentage,10*100/649);assert.equal(stats.national.seenPercentage,11*100/649);
  assert.equal(stats.generations[0].seenPercentage,3*100/151);assert.equal(stats.teams,1);assert.equal(stats.favorites,2);
  assert.throws(()=>logic.statistics([...records,records[0]]));assert.throws(()=>logic.statistics(rows([650])));
  const complete=logic.statistics(rows(range(1,649)));assert.equal(complete.national.caughtPercentage,100);assert.ok(complete.generations.every(g=>g.seenPercentage===100&&g.caughtPercentage===100));
});
test('personal type memberships overlap correctly, recent records use update time and empty progress is real zero',()=>{
  const records=rows([1,6]);records[1].updatedAt='2026-10-27T11:00:00Z';
  const stats=logic.statistics(records);const type=name=>stats.types.find(t=>t.type===name);
  assert.equal(type('grass').caught,1);assert.equal(type('poison').caught,1);assert.equal(type('fire').caught,1);assert.equal(type('flying').caught,1);
  assert.equal(stats.types.reduce((sum,t)=>sum+t.caught,0),4);assert.equal(stats.recent[0].pokemonId,6);
  assert.equal(logic.statistics([]).national.notCaught,649);assert.equal(logic.statistics([]).national.caughtPercentage,0);
});
test('all achievement thresholds are server-derived and historical awards survive lost current qualification',()=>{
  const eligible=(records,teams=[])=>logic.eligible(logic.statistics(records,teams),teams);
  assert.deepEqual(eligible([]),[]);assert.ok(eligible(rows([25],'seen')).includes('first-encounter'));assert.ok(!eligible(rows([25],'seen')).includes('first-catch'));
  assert.ok(!eligible(rows(range(1,24))).includes('pokemon-collector'));assert.ok(eligible(rows(range(1,25))).includes('pokemon-collector'));
  assert.ok(!eligible(rows(range(1,99))).includes('dedicated-collector'));assert.ok(eligible(rows(range(1,100))).includes('dedicated-collector'));
  assert.ok(eligible(rows(range(1,151))).includes('kanto-completionist'));assert.ok(eligible(rows(range(152,251))).includes('regional-master'));
  assert.ok(!eligible(rows(range(1,648))).includes('national-pokedex-master'));assert.ok(eligible(rows(range(1,649))).includes('national-pokedex-master'));
  assert.ok(eligible([],[{memberCount:6}]).includes('team-builder'));assert.ok(!eligible([],[{memberCount:5}]).includes('team-builder'));
  const historical=logic.achievements(logic.statistics([]),[],[{key:'first-catch',unlockedAt:'2026-10-27T10:00:00Z'}]).find(a=>a.key==='first-catch');
  assert.equal(historical.current,0);assert.equal(historical.unlockedAt,'2026-10-27T10:00:00.000Z');
});
function fakePool() {
  const calls=[],records=new Map(),awards=new Map();let failAward=false,backup;
  const connection={
    async beginTransaction(){calls.push('begin');backup={records:new Map(records),awards:new Map(awards)};},
    async commit(){calls.push('commit');},async rollback(){calls.push('rollback');records.clear();backup.records.forEach((v,k)=>records.set(k,v));awards.clear();backup.awards.forEach((v,k)=>awards.set(k,v));},release(){calls.push('release');},
    async execute(sql,params){calls.push({sql,params});const now='2026-10-27T10:00:00.000Z';
      if(sql.includes('FROM enhancement_state'))return [[]];
      if(sql.startsWith('SELECT id FROM users'))return [[{id:params[0]}]];
      if(sql.startsWith('INSERT INTO user_pokedex')){records.set(params[1],{pokemonId:params[1],seenAt:now,caughtAt:sql.includes('UTC_TIMESTAMP(3), NULL')?null:now,updatedAt:now});return [{}];}
      if(sql.startsWith('DELETE FROM user_pokedex')){records.delete(params[1]);return [{}];}
      if(sql.includes('FROM user_pokedex'))return [[...records.values()]];
      if(sql.includes('FROM teams'))return [[]];if(sql.includes('FROM favorites'))return [[]];
      if(sql.startsWith('INSERT INTO user_achievements')){if(failAward)throw Error('award failed');if(!awards.has(params[1]))awards.set(params[1],{key:params[1],unlockedAt:now});return [{}];}
      if(sql.includes('FROM user_achievements'))return [[...awards.values()]];
      throw Error('Unexpected SQL: '+sql);
    }
  };
  return{pool:{getConnection:async()=>connection},calls,records,awards,setFail(value){failAward=value;}};
}
test('102 unique achievements retain the 96 original thresholds and permanent historical awards',()=>{
  assert.equal(logic.definitions.length,102);assert.equal(new Set(logic.definitions.map(a=>a.key)).size,102);
  const full=logic.statistics(rows(range(1,649)),Array.from({length:5},()=>({memberCount:6})),range(1,100));
  assert.equal(logic.eligible(full,Array.from({length:5},()=>({memberCount:6}))).length,96);
  full.extra={communityThreads:1,communityReplies:25,communityReactions:100,simulations:50,simulationWins:10};assert.equal(logic.eligible(full,Array.from({length:5},()=>({memberCount:6}))).length,102);
  for(const definition of logic.definitions){assert.ok(['bronze','silver','gold','legendary'].includes(definition.rarity));assert.ok(definition.goal>0);assert.ok(definition.category);}
  for(const type of require('../pokemon-data').types){
    const ids=require('../data/pokemon-summary.json').pokemon.filter(p=>p.types.includes(type)).map(p=>p.id);
    assert.ok(!logic.eligible(logic.statistics(rows(ids.slice(0,4))),[]).includes(`type-${type}-scout`));
    assert.ok(logic.eligible(logic.statistics(rows(ids.slice(0,5))),[]).includes(`type-${type}-scout`));
    assert.ok(!logic.eligible(logic.statistics(rows(ids.slice(0,-1))),[]).includes(`type-${type}-master`));
    assert.ok(logic.eligible(logic.statistics(rows(ids)),[]).includes(`type-${type}-master`));
  }
  const saved=logic.definitions.filter(d=>!d.key.startsWith('community-')&&!d.key.startsWith('battle-')).map(d=>({key:d.key,unlockedAt:'2026-10-27T10:00:00Z'}));
  assert.equal(logic.achievements(logic.statistics([]),[],saved).filter(a=>a.unlockedAt).length,96);
});
test('reconciling known achievements avoids repeated INSERTs and preserves their timestamps',async()=>{
  const fake=fakePool(),repo=new ProgressionRepository(fake.pool);const first=await repo.set(42,25,'caught');fake.calls.length=0;
  const repeat=await repo.snapshot(42);assert.ok(!fake.calls.some(c=>c.sql?.startsWith('INSERT INTO user_achievements')));assert.deepEqual(repeat.achievements,first.achievements);
});
test('SQL collection writes lock the user and commit records/awards atomically with parameterized ownership',async()=>{
  const fake=fakePool(),repo=new ProgressionRepository(fake.pool);
  const result=await repo.set(42,25,'caught');assert.equal(result.statistics.national.caught,1);assert.equal(result.achievements.filter(a=>a.unlockedAt).length,2);
  assert.match(fake.calls[1].sql,/users WHERE id = \? FOR UPDATE/);assert.deepEqual(fake.calls[1].params,[42]);
  const insert=fake.calls.find(c=>c.sql?.startsWith('INSERT INTO user_pokedex'));assert.deepEqual(insert.params,[42,25]);assert.match(insert.sql,/COALESCE\(caught_at/);
  assert.ok(fake.calls.includes('commit'));assert.equal(fake.calls.at(-1),'release');
  await repo.remove(42,25);assert.equal(fake.records.size,0);assert.equal(fake.awards.size,2);
  // Seed nine catches so the next mutation earns a genuinely new milestone.
  for (const row of rows(range(1,9))) fake.records.set(row.pokemonId,row);
  fake.setFail(true);fake.calls.length=0;await assert.rejects(repo.set(42,649,'caught'),/award failed/);
  assert.equal(fake.records.size,9);assert.equal(fake.records.has(649),false);assert.equal(fake.awards.size,2);assert.ok(fake.calls.includes('rollback'));assert.ok(!fake.calls.includes('commit'));assert.equal(fake.calls.at(-1),'release');
});
test('team awards skip only a missing pre-migration table; real database failures propagate',async()=>{
  await awardTeamBuilder({execute:async()=>{const e=Error('missing');e.code='ER_NO_SUCH_TABLE';throw e;}},1);
  await assert.rejects(awardTeamBuilder({execute:async()=>{const e=Error('denied');e.code='ER_ACCESS_DENIED_ERROR';throw e;}},1),/denied/);
});
test('the real team repository awards six-member teams before commit and rolls back dependent award failures',async()=>{
  const {Repository}=require('../server/repository');
  for(const failure of [null,'ER_NO_SUCH_TABLE','ER_ACCESS_DENIED_ERROR']){
    const calls=[];
    const connection={async beginTransaction(){calls.push('begin');},async commit(){calls.push('commit');},async rollback(){calls.push('rollback');},release(){calls.push('release');},
      async execute(sql,params){calls.push({sql,params});if(sql.startsWith('SELECT'))return [[{id:7}]];if(sql.startsWith('INSERT INTO user_achievements')&&failure){const error=Error('award failure');error.code=failure;throw error;}return [{affectedRows:1}];}};
    const repo=new Repository({getConnection:async()=>connection});
    const save=repo.saveTeam(42,7,{name:'Six',pokemonIds:[1,25,152,252,387,649]});
    if(failure==='ER_ACCESS_DENIED_ERROR'){await assert.rejects(save,/award failure/);assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));}
    else{await save;assert.ok(calls.includes('commit'));const awardIndex=calls.findIndex(c=>c.sql?.startsWith('INSERT INTO user_achievements'));assert.equal(calls.slice(0,awardIndex).filter(c=>c.sql?.startsWith('INSERT INTO team_pokemon')).length,6);assert.ok(awardIndex<calls.indexOf('commit'));assert.deepEqual(calls[awardIndex].params,[42,'team-builder']);}
    assert.equal(calls.at(-1),'release');
  }
});
test('migration is additive, scoped, repeatable and identical to new-install table definitions',()=>{
  const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n');
  const sql=read('database/migrations/v0.5.0-trainer-progression.sql'),schema=read('database/schema.sql');
  assert.match(sql,/USE pokedex_app;/);assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,2);
  assert.ok(!/(?:^|;)\s*(?:DROP|TRUNCATE|ALTER|DELETE|UPDATE|INSERT)\b/i.test(sql.replace(/^--.*$/gm,'')));
  assert.match(sql,/PRIMARY KEY \(user_id, pokemon_id\)/);assert.match(sql,/PRIMARY KEY \(user_id, achievement_key\)/);
  assert.match(sql,/seen_at DATETIME\(3\) NOT NULL/);assert.match(sql,/caught_at IS NULL OR caught_at >= seen_at/);assert.match(sql,/BETWEEN 1 AND 649/);
  for (const name of ['user_pokedex', 'user_achievements']) {
    const definition = text => text.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\) ENGINE=InnoDB;`))[0];
    assert.equal(definition(schema), definition(sql));
  }
  for(const file of ['server/index.js','server/setup-db.js'])assert.ok(!read(file).includes('v0.5.0-trainer-progression.sql'));
});
