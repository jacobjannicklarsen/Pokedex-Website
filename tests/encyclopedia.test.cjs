'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const data=require('../encyclopedia-data');
const fixture={...require('./fixtures/encyclopedia.json').resources,...require('./fixtures/abilities.json').resources};
const types=Object.keys(require('../pokemon-data').summarize(require('../data/pokemon-summary.json').pokemon).types);

test('real standard, branching, later-generation and standalone evolution families validate across five generations',()=>{
  const chain=fixture['evolution-chain/1'].chain;
  assert.equal(chain.species.name,'bulbasaur');assert.equal(chain.evolves_to[0].species.name,'ivysaur');assert.equal(chain.evolves_to[0].evolves_to[0].species.name,'venusaur');
  assert.match(data.requirements(chain.evolves_to[0].evolution_details[0]).text,/Level 16/);
  const eevee=fixture['evolution-chain/67'];assert.equal(eevee.chain.evolves_to.length,8);
  assert.ok(eevee.chain.evolves_to.some(n=>data.resourceId(n.species.url,'pokemon-species')===700));
  assert.equal(fixture['evolution-chain/336'].chain.evolves_to.length,0);
  for(const id of [1,152,252,387,494,649]) {
    const species=fixture[`pokemon-species/${id}`];assert.equal(data.valid('pokemon-species',species),true);
    assert.equal(data.valid('evolution-chain',fixture[`evolution-chain/${data.resourceId(species.evolution_chain.url,'evolution-chain')}`]),true);
  }
  assert.equal(data.resourceId('https://untrusted.example/api/v2/evolution-chain/1/','evolution-chain'),null);
});
test('evolution requirements preserve alternative conditions, zero stat relations and special recorded fields',()=>{
  const eevee=fixture['evolution-chain/67'].chain.evolves_to;
  assert.match(data.requirements(eevee[0].evolution_details[0]).text,/Use Water Stone/);
  assert.match(data.requirements(eevee.find(n=>n.species.name==='umbreon').evolution_details[0]).text,/Friendship ≥ .*Time: Night/);
  const tyrogue=fixture['evolution-chain/47'].chain.evolves_to;
  assert.match(data.requirements(tyrogue[2].evolution_details[0]).text,/Attack = Defense/);
  const text=data.requirements({trigger:{name:'trade'},held_item:{name:'metal-coat'},trade_species:{name:'shelmet'},gender:1,known_move:{name:'ancient-power'},known_move_type:{name:'fairy'},party_species:{name:'remoraid'},party_type:{name:'dark'},needs_overworld_rain:true,turn_upside_down:true,needs_multiplayer:true,near_special_rock:true,min_beauty:170,min_affection:2,min_steps:1000,min_damage_taken:49,min_move_count:20,used_move:{name:'psyshield-bash'},allowed_natures:[{name:'bold'}],region:{name:'alola'},condition_expression:{operator:'greater',value:5}}).text;
  for(const expected of ['Trade','Hold Metal Coat','Trade for Shelmet','Female','Knows Ancient Power','Fairy','Remoraid','Dark','Overworld rain','upside down','Multiplayer','special rock','Beauty ≥ 170','Affection ≥ 2','Steps ≥ 1000','Damage taken ≥ 49','Move uses ≥ 20','Psyshield Bash','Bold','Alola','Condition Expression'])assert.ok(text.includes(expected),expected);
  assert.equal(data.requirements({}).text,'Requirements not recorded');
});
test('learnsets remain game-specific with separate methods, levels and exact deduplication',()=>{
  const p=fixture['pokemon/1'];
  for(const group of ['red-blue','gold-silver','ruby-sapphire','diamond-pearl','black-2-white-2']) {
    const rows=data.learnset(p,group);
    const expected=[];for(const entry of p.moves)for(const detail of entry.version_group_details)if(detail.version_group.name===group)expected.push(`${entry.move.name}:${detail.move_learn_method.name}:${detail.level_learned_at}`);
    assert.deepEqual(rows.map(r=>`${r.name}:${r.method}:${r.level}`).sort(),[...new Set(expected)].sort());
  }
  assert.deepEqual(data.learnset(p,'not-a-game'),[]);
  const duplicate=structuredClone(p);duplicate.moves.push(duplicate.moves[0]);assert.equal(data.learnset(duplicate,'red-blue').length,data.learnset(p,'red-blue').length);
});
test('move values follow change boundaries, preserve missing values and use the pre-IV category split',()=>{
  const tackle=fixture['move/33'];
  assert.equal(data.moveValues(tackle,'red-blue').power,35);assert.equal(data.moveValues(tackle,'red-blue').accuracy,95);
  assert.equal(data.moveValues(tackle,'black-white').power,50);assert.equal(data.moveValues(tackle,'black-white').accuracy,100);
  assert.equal(data.moveValues(tackle,'colosseum').power,35);assert.equal(data.moveValues(tackle,'xd').power,35);
  assert.equal(data.moveValues(fixture['move/85'],'black-2-white-2').power,95);
  assert.equal(data.moveValues(fixture['move/45'],'black-white').power,null);
  assert.equal(data.moveValues(fixture['move/182'],'black-white').accuracy,null);
  assert.equal(data.moveValues({...tackle,type:{name:'dark'}},'ruby-sapphire').category,'special');
  assert.equal(data.moveValues({...tackle,type:{name:'dark'}},'diamond-pearl').category,'physical');
  assert.equal(data.moveValues(fixture['move/45'],'ruby-sapphire').category,'status');
  assert.throws(()=>data.moveValues(tackle,'invalid'));
});
test('modern dual-type multipliers calculate 4×, 2×, neutral, half, quarter and zero including immunity precedence',()=>{
  const get=(...names)=>names.map(name=>fixture[`type/${name}`]);
  const charizard=data.matchups(['fire','flying'],get('fire','flying'),types);
  assert.equal(charizard.defense.rock,4);assert.equal(charizard.defense.water,2);assert.equal(charizard.defense.normal,1);assert.equal(charizard.defense.fire,.5);assert.equal(charizard.defense.grass,.25);assert.equal(charizard.defense.ground,0);
  assert.equal(charizard.offense.fire.grass,2);assert.equal(charizard.offense.flying.fighting,2);
  const ghost=data.matchups(['normal','ghost'],get('normal','ghost'),types);assert.equal(ghost.defense.fighting,0);assert.equal(ghost.defense.normal,0);assert.equal(ghost.defense.ghost,0);
  assert.equal(data.matchups(['fire','steel'],get('fire','steel'),types).defense.ice,.25);
  assert.throws(()=>data.matchups(['water'],[],types));
});
test('English entries are normalized and isolated by game; missing optional values and gender ratios are explicit',()=>{
  for(const id of [1,152,252,387,494])assert.ok(data.descriptions(fixture[`pokemon-species/${id}`]).length);
  const entries=data.descriptions({flavor_text_entries:[{language:{name:'en'},version:{name:'red'},flavor_text:'First\fentry\ntext.'},{language:{name:'en'},version:{name:'blue'},flavor_text:'Different entry.'},{language:{name:'ja'},version:{name:'red'},flavor_text:'Japanese'}]});
  assert.deepEqual(entries,[{game:'red',text:'First entry text.'},{game:'blue',text:'Different entry.'}]);
  assert.deepEqual(data.descriptions({flavor_text_entries:[]}),[]);
  assert.equal(data.gender(-1),'Genderless');assert.equal(data.gender(0),'100% male · 0% female');assert.equal(data.gender(8),'0% male · 100% female');assert.equal(data.gender(1),'87.5% male · 12.5% female');assert.equal(data.gender(null),'Not recorded');
});
function context({storage=new Map(),blocked=false,mode='ok'}={}) {
  const calls=[];let active=0,max=0;
  const sandbox=vm.createContext({URL,AbortController,setTimeout:(fn,ms)=>setTimeout(fn,mode==='timeout'?1:ms),clearTimeout,
    localStorage:{getItem(key){if(blocked)throw Error('Blocked');return storage.get(key)||null;},setItem(key,value){if(blocked)throw Error('Blocked');storage.set(key,value);}},
    fetch:async(url,{signal})=>{const key=new URL(url).pathname.replace('/api/v2/','').replace(/\/$/,'');calls.push(key);active++;max=Math.max(max,active);
      try {if(mode==='timeout')await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Aborted'))));await new Promise(resolve=>setTimeout(resolve,2));return {ok:mode!=='http',status:503,json:async()=>mode==='malformed'?{}:fixture[key]};} finally{active--;}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../encyclopedia-data.js'),'utf8'),sandbox);
  return{api:sandbox.PokemonEncyclopediaData,calls,storage,max:()=>max};
}
test('ability descriptions use English effects and fallbacks, validate responses and reuse compact caches',async()=>{
  const overgrow=fixture['ability/overgrow'];assert.equal(data.valid('ability',overgrow),true);
  assert.match(data.abilityDescription(overgrow),/Grass.*1.5/);
  assert.match(data.abilityDescription(fixture['ability/chlorophyll']),/Speed|speed/);
  assert.equal(data.abilityDescription({effect_entries:[],flavor_text_entries:[{language:{name:'fr'},flavor_text:'Français'},{language:{name:'en'},flavor_text:'English\n fallback\ftext'}]}),'English fallback text');
  assert.equal(data.abilityDescription({effect_entries:[{language:{name:'en'},short_effect:'',effect:'Full effect'}],flavor_text_entries:[]}),'Full effect');
  assert.match(data.abilityDescription({effect_entries:[],flavor_text_entries:[]}),/No English description/);
  assert.equal(data.valid('ability',{...overgrow,effect_entries:[{language:{name:'en'},effect:3,short_effect:'Invalid'}]}),false);
  const app=context();await Promise.all([app.api.get('ability','overgrow'),app.api.get('ability','overgrow')]);assert.equal(app.calls.length,1);
  const next=context({storage:app.storage});await next.api.get('ability','overgrow');assert.equal(next.calls.length,0);
  const failure=context({mode:'http'});await assert.rejects(failure.api.get('ability','chlorophyll'));await assert.rejects(failure.api.get('ability','chlorophyll'));assert.equal(failure.calls.length,2);
});

test('shared resources coalesce, queue at most four requests, persist and reuse caches across page contexts',async()=>{
  const app=context();
  await Promise.all([app.api.get('evolution-chain',67),app.api.get('evolution-chain',67)]);assert.equal(app.calls.length,1);
  await Promise.all([33,45,22,76,92,182,85,122].map(id=>app.api.get('move',id)));assert.ok(app.max()<=4);
  const next=context({storage:app.storage});await next.api.get('evolution-chain',67);await next.api.get('move',33);assert.equal(next.calls.length,0);
  app.api.remember('pokemon',1,fixture['pokemon/1']);await app.api.get('pokemon',1);assert.equal(app.calls.filter(k=>k==='pokemon/1').length,0);
});
test('malformed, future, mismatched and blocked caches cannot break resource loading; failed resources remain retryable',async()=>{
  for(const raw of ['{bad',JSON.stringify({timestamp:Date.now()+86400000,data:fixture['move/33']}),JSON.stringify({timestamp:Date.now(),data:fixture['move/45']})]) {
    const app=context({storage:new Map([['dexhaven-encyclopedia-v1-move-33',raw]])});await app.api.get('move',33);assert.equal(app.calls.length,1);
  }
  const blocked=context({blocked:true});await blocked.api.get('move',33);await blocked.api.get('move',33);assert.equal(blocked.calls.length,1);
  for(const mode of ['http','malformed','timeout']){const app=context({mode});await assert.rejects(app.api.get('move',33));await assert.rejects(app.api.get('move',33));assert.equal(app.calls.length,2);}
});
