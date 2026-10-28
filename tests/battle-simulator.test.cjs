const {test}=require('node:test'),assert=require('node:assert/strict');
const snapshot=require('../data/battle-v5.json'),data=require('../battle-data'),engine=require('../battle-engine'),{Battle}=require('@pkmn/sim');
const move=id=>snapshot.moves.find(m=>m.id===id),rng=()=>.42;
// Engine unit scenarios deliberately bypass learnset validation; the public configuration API does not.
function fighter(id,moves,level=100){return{...data.configure(snapshot,id,level,[]),moves:moves.map(move)};}
function start(moves,opponent=[150],right=242){return engine.create(fighter(151,moves),fighter(right,opponent));}
const step=(state,a,b=150)=>engine.step(state,[a,b],snapshot.types,rng);

test('all 559 historical moves and all forced continuations execute without unsupported fallbacks',()=>{
 for(const m of snapshot.moves){
  assert.equal(m.supported,true,m.name);
  let state=start([m.id]);
  state=step(state,m.id);
  assert.ok(state.events.some(e=>e.kind==='attack'||e.kind==='status'),m.name);
  if(state.phase==='ready'){
   const choices=state.fighters.map(p=>engine.choices(p));
   assert.ok(choices.every(c=>c.length>0),m.name+' requests a legal next move');
   // Taunt, Torment and Gravity can disable Splash, forcing the opponent to Struggle.
   state=step(state,choices[0][0].id,choices[1][0].id);
   for(const difficulty of ['easy','normal','hard'])if(state.phase==='ready')assert.ok(engine.choices(state.fighters[0]).some(m=>m.id===engine.chooseAI(state,0,snapshot.types,rng,difficulty)),m.name+' AI choice');
  }
 }
});

test('Solar Beam charges, forces its continuation and consumes PP only once',()=>{
 const initial=start([76,150]),hp=initial.fighters[1].hp;
 let state=step(initial,76);
 assert.equal(state.fighters[1].hp,hp);
 assert.deepEqual(engine.choices(state.fighters[0]).map(m=>m.id),[76]);
 assert.equal(state.fighters[0].moves[0].remainingPP,move(76).pp-1);
 state=step(state,76);
 assert.ok(state.fighters[1].hp<hp);
 assert.equal(state.fighters[0].moves[0].remainingPP,move(76).pp-1);
});

test('Hyper Beam requests a real recharge turn rather than another attack',()=>{
 let state=step(start([63,150]),63);
 assert.deepEqual(engine.choices(state.fighters[0]).map(m=>m.id),[0]);
 state=step(state,0);
 assert.ok(state.events.some(e=>/recharge/i.test(e.text)));
 assert.ok(engine.choices(state.fighters[0]).some(m=>m.id===63));
});

test('Protect blocks damage; Substitute absorbs a later hit with its own HP',()=>{
 const initial=start([182],[33]),hp=initial.fighters[0].hp;
 const protectedState=step(initial,182,33);
 assert.equal(protectedState.fighters[0].hp,hp);
 assert.ok(protectedState.events.some(e=>/Protect/.test(e.text)));
 let state=step(start([164,150],[33]),164,33);
 assert.ok(state.fighters[0].conditions.includes('substitute'));
 const afterCost=state.fighters[0].hp;
 state=step(state,150,33);
 assert.equal(state.fighters[0].hp,afterCost);
});

test('Transform copies the actual opponent appearance, types and moves at five PP',()=>{
 const state=step(start([144],[85,98],25),144,98);
 assert.equal(state.fighters[0].appearanceId,25);
 assert.deepEqual(state.fighters[0].types,['electric']);
 assert.deepEqual(engine.choices(state.fighters[0]).map(m=>m.id),[85,98]);
 assert.ok(state.fighters[0].moves.every(m=>m.remainingPP===5));
});

test('Transform into a shorter moveset restores and continues without losing original PP slots',()=>{
 let state=step(start([144,76,164,182],[150]),144);
 assert.deepEqual(engine.choices(state.fighters[0]).map(m=>m.id),[150]);
 assert.equal(state.simulation.sides[0].pokemon[0].baseMoveSlots.length,4);
 assert.equal(engine.chooseAI(state,0,snapshot.types,rng,'hard'),150);
 state=step(state,150);
 assert.equal(state.fighters[0].moves.length,1);
 assert.equal(state.fighters[0].moves[0].remainingPP,4);
 assert.equal(state.simulation.sides[0].pokemon[0].baseMoveSlots.length,4);
});

test('fixed damage and multi-hit effects use their historical mechanics',()=>{
 let initial=start([82]);assert.equal(initial.fighters[1].hp-step(initial,82).fighters[1].hp,40);
 initial=start([69]);assert.equal(initial.fighters[1].hp-step(initial,69).fighters[1].hp,100);
 const state=step(start([41]),41);assert.ok(state.events.some(e=>e.text==='Hit 2 times.'));
});

test('weather changes the field and Toxic damage escalates over successive turns',()=>{
 let state=step(start([241,240]),241);
 assert.equal(state.simulation.field.weather,'sunnyday');
 state=step(state,240);assert.equal(state.simulation.field.weather,'raindance');
 const initial=start([92,150]);state=step(initial,92);assert.equal(state.fighters[1].status,'badly-poisoned');
 const first=initial.fighters[1].hp-state.fighters[1].hp,remaining=state.fighters[1].hp;
 state=step(state,150);assert.ok(remaining-state.fighters[1].hp>first);
});

test('Struggle is automatic and simulator transitions do not mutate earlier states',()=>{
 const initial=engine.create(fighter(151,[]),fighter(242,[150])),before=JSON.stringify(initial);
 assert.deepEqual(engine.choices(initial.fighters[0]).map(m=>m.id),[165]);
 const next=step(initial,165);assert.ok(next.fighters[0].hp<initial.fighters[0].hp);
 assert.equal(JSON.stringify(initial),before);
});

test('Generation V snapshot and simulator agree on every species base HP and stats',()=>{
 for(const p of snapshot.pokemon){
  const config=data.configure(snapshot,p.id,50,[]),state=engine.create(config,config);
  assert.deepEqual(state.fighters[0].stats,config.stats,p.name);
 }
});
