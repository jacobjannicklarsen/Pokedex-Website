const{test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../battle-calculations'),engine=require('../battle-engine'),data=require('../battle-data'),snapshot=require('../data/battle-v5.json'),{Runner}=require('../battle-runner');
const move=id=>snapshot.moves.find(m=>m.id===id),rng=value=>()=>value;
function fighter({id=1,level=50,types=['normal'],stats={hp:200,attack:100,defense:100,'special-attack':100,'special-defense':100,speed:100},moves=[move(1)],...rest}={}){return{id,name:'pokemon-'+id,level,types,stats,moves,...rest};}
test('pinned historical snapshot covers every standard species, Gen V types/stats and verified learnsets',()=>{
 assert.equal(snapshot.pokemon.length,649);assert.equal(new Set(snapshot.pokemon.map(p=>p.id)).size,649);assert.equal(snapshot.moves.length,559);assert.equal(snapshot.moves.filter(m=>m.supported).length,559);assert.equal(Object.keys(snapshot.types).length,17);assert.equal(snapshot.types.fairy,undefined);
 assert.deepEqual(snapshot.pokemon.find(p=>p.id===35).types,['normal']);assert.equal(snapshot.pokemon.find(p=>p.id===25).stats.defense,30);assert.equal(snapshot.types.ghost.steel,.5);assert.equal(snapshot.types.dark.steel,.5);assert.equal(snapshot.types.dragon.steel,.5);
 assert.match(snapshot.source.revision,/^[a-f0-9]{40}$/);for(const hash of Object.values(snapshot.source.files))assert.match(hash,/^[a-f0-9]{64}$/);
 assert.equal(move(53).power,95);assert.equal(move(85).power,95);assert.equal(move(33).power,50);
});
test('level 1/100 integer stats and Shedinja exception use 31 IVs, zero EVs and neutral nature',()=>{
 const p=snapshot.pokemon[0];assert.deepEqual(c.stats(p,1),{hp:12,attack:6,defense:6,'special-attack':6,'special-defense':6,speed:6});assert.deepEqual(c.stats(p,100),{hp:231,attack:134,defense:134,'special-attack':166,'special-defense':166,speed:126});
 assert.equal(c.stats(snapshot.pokemon.find(p=>p.id===292),100).hp,1);for(const value of [0,101,1.5,NaN])assert.throws(()=>c.stats(p,value));
});
test('all 649 species have a playable route at level 1 and 100; four distinct supported eligible moves only',()=>{
 for(const p of snapshot.pokemon)for(const level of [1,100]){const eligible=data.eligible(p,level,snapshot);assert.ok(eligible.every(m=>m.methods.every(r=>r.method!=='level-up'||r.level<=level)));const ids=eligible.filter(m=>m.supported).slice(0,4).map(m=>m.id),configured=data.configure(snapshot,p.id,level,ids),battle=engine.create(configured,configured);assert.ok(engine.choices(battle.fighters[0]).length>=1);}
 assert.throws(()=>data.configure(snapshot,1,50,[33,33]));assert.throws(()=>data.configure(snapshot,1,1,[63]));assert.throws(()=>data.configure(snapshot,999,50,[]));assert.equal(move(144).supported,true);
});
test('physical/special damage, STAB, criticals, burn, stages, double weakness and immunities match integer examples',()=>{
 const [a,b]=engine.create(fighter(),fighter()).fighters,m={...move(1),power:100};
 assert.equal(c.damage(a,b,m,snapshot.types,{random:1}).amount,69);assert.equal(c.damage(a,b,{...m,type:'water'},snapshot.types,{random:1}).amount,46);assert.equal(c.damage(a,b,m,snapshot.types,{random:1,critical:true}).amount,138);
 a.status='burn';assert.equal(c.damage(a,b,m,snapshot.types,{random:1}).amount,34);assert.equal(c.damage(a,b,{...m,category:'special'},snapshot.types,{random:1}).amount,69);
 a.status=null;a.stages.attack=-2;b.stages.defense=2;assert.equal(c.damage(a,b,m,snapshot.types,{random:1,critical:true}).amount,138);
 b.types=['ghost'];assert.equal(c.damage(a,b,m,snapshot.types).amount,0);b.types=['grass','steel'];assert.equal(c.effectiveness('fire',b.types,snapshot.types),4);assert.equal(c.effectiveness('electric',['ground'],snapshot.types),0);
});
test('priority overrides speed, speed ties consume injected randomness, PP is consumed on misses, null accuracy hits',()=>{
 const a=fighter({id:1,stats:{...fighter().stats,speed:1},moves:[move(98)]}),b=fighter({id:2,stats:{...fighter().stats,speed:200}});let state=engine.step(engine.create(a,b),[98,1],snapshot.types,rng(.99));assert.equal(state.events.find(e=>e.kind==='attack').side,0);
 state=engine.step(engine.create(fighter(),fighter()),[1,1],snapshot.types,rng(.4));assert.equal(state.events.find(e=>e.kind==='attack').side,1);
 state=engine.step(engine.create(fighter({moves:[move(5)]}),fighter()),[5,1],snapshot.types,rng(.99));assert.ok(state.events.some(e=>e.kind==='miss'));assert.equal(state.fighters[0].moves[0].remainingPP,19);
 state=engine.step(engine.create(fighter({moves:[move(129)]}),fighter()),[129,1],snapshot.types,rng(.99));assert.ok(!state.events.some(e=>e.kind==='miss'));assert.ok(state.fighters[1].hp<200);
});
test('burn/poison residuals, paralysis turn restriction, sleep duration, freeze and bounded stages are explicit',()=>{
 let battle=engine.create(fighter({moves:[move(261)],stats:{...fighter().stats,speed:200}}),fighter({moves:[move(14)]}));
 let next=engine.step(battle,[261,14],snapshot.types,rng(.5));assert.equal(next.fighters[1].status,'burn');assert.equal(next.fighters[1].hp,175);
 battle=engine.create(fighter({moves:[move(77)],stats:{...fighter().stats,speed:200}}),fighter({moves:[move(14)]}));next=engine.step(battle,[77,14],snapshot.types,rng(.5));assert.equal(next.fighters[1].status,'poison');assert.equal(next.fighters[1].hp,175);
 battle=engine.create(fighter({moves:[move(147),move(45)],stats:{...fighter().stats,speed:200}}),fighter({moves:[move(14)]}));next=engine.step(battle,[147,14],snapshot.types,rng(.2));assert.equal(next.fighters[1].status,'sleep');assert.equal(next.fighters[1].moves[0].remainingPP,30);next=engine.step(next,[45,14],snapshot.types,rng(.2));assert.equal(next.fighters[1].status,null);assert.equal(next.fighters[1].moves[0].remainingPP,29);
 battle=engine.create(fighter({moves:[move(14)]}),fighter({moves:[move(14)]}));battle.fighters[0].status='paralysis';assert.equal(c.speed(battle.fighters[0]),25);next=engine.step(battle,[14,14],snapshot.types,rng(0));assert.equal(next.fighters[0].moves[0].remainingPP,30);
 battle.fighters[0].status='freeze';next=engine.step(battle,[14,14],snapshot.types,rng(.99));assert.equal(next.fighters[0].status,'freeze');next=engine.step(battle,[14,14],snapshot.types,rng(.1));assert.equal(next.fighters[0].status,null);
 battle.fighters[0].status=null;battle.fighters[0].stages.attack=6;next=engine.step(battle,[14,14],snapshot.types,rng(.9));assert.equal(next.fighters[0].stages.attack,6);
 assert.equal(move(150).supported,true);
});
test('knockouts end immediately, HP never goes negative, no-PP uses typeless Struggle and recoil',()=>{
 let battle=engine.create(fighter(),fighter({stats:{...fighter().stats,hp:1}}));let next=engine.step(battle,[1,1],snapshot.types,rng(.9));assert.equal(next.phase,'finished');assert.equal(next.fighters[1].hp,0);assert.throws(()=>engine.step(next,[1,1],snapshot.types));assert.equal(battle.fighters[1].hp,1,'transition must not mutate its input');
 battle=engine.create(fighter(),fighter({types:['ghost'],moves:[move(14)]}));battle.fighters[0].moves[0].remainingPP=0;assert.deepEqual(engine.choices(battle.fighters[0]).map(m=>m.id),[165]);next=engine.step(battle,[165,14],snapshot.types,rng(.9));assert.ok(next.fighters[1].hp<200);assert.equal(next.fighters[0].hp,150);assert.equal(next.fighters[0].moves[0].remainingPP,0);
 assert.throws(()=>engine.step(battle,[1,14],snapshot.types));
});
test('AI avoids immune attacks, seeded runs reproduce exactly, and the 200-turn limit ends status loops',()=>{
 const battle=engine.create(fighter({moves:[move(1),move(55)]}),fighter({types:['ghost'],moves:[move(14)]}));assert.equal(engine.chooseAI(battle,0,snapshot.types,rng(.3)),55);
 const seed=()=>{let n=123;return()=>((n=(1664525*n+1013904223)>>>0)/4294967296);};const run=()=>{let s=engine.create(fighter(),fighter()),r=seed();while(s.phase==='ready'){s=engine.step(s,[engine.chooseAI(s,0,snapshot.types,r),engine.chooseAI(s,1,snapshot.types,r)],snapshot.types,r);}return s;};assert.deepEqual(run(),run());assert.match(engine.summary(run()),/Informational only/);
 let s=engine.create(fighter({moves:[move(14)]}),fighter({moves:[move(14)]}));s.turn=199;s=engine.step(s,[14,14],snapshot.types,rng(.9));assert.equal(s.phase,'finished');assert.equal(s.winner,'draw');
});
test('pause/restart cancels stale auto turns; engine exceptions stop scheduling',()=>{
 let turns=0,queue=[],cleared=[],error;const runner=new Runner({turn:()=>{turns++;return true;},set:fn=>{queue.push(fn);return queue.length;},clear:id=>cleared.push(id),onError:e=>error=e});runner.start();const stale=queue[0];runner.stop();stale();assert.equal(turns,0);runner.start();stale();assert.equal(turns,0);queue[1]();assert.equal(turns,1);runner.start(250);queue[2]();assert.equal(turns,1);assert.ok(cleared.length>=2);runner.turn=()=>{throw Error('invalid turn');};queue.at(-1)();assert.equal(runner.running,false);assert.equal(error.message,'invalid turn');
});

test('damaging stage moves deal damage before their guaranteed change; Scald is available through the full simulator',()=>{
 const a=fighter({moves:[move(490)],stats:{...fighter().stats,speed:200}}),b=fighter({moves:[move(14)]});const next=engine.step(engine.create(a,b),[490,14],snapshot.types,rng(.5));assert.ok(next.fighters[1].hp<200);assert.equal(next.fighters[1].stages.speed,-1);assert.equal(move(503).supported,true);
});
