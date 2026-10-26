'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const data = require('../pokemon-data');
const snapshot = require('../data/pokemon-summary.json');
const records = snapshot.pokemon;
const find = id => records.find(p => p.id === id);

test('snapshot contains exactly the standard species, actual known values and complete details', () => {
  assert.equal(data.validateSnapshot(snapshot),snapshot);
  assert.deepEqual(records.map(p=>p.id),Array.from({length:649},(_,i)=>i+1));
  assert.equal(find(1).name,'bulbasaur');assert.equal(find(386).name,'deoxys');assert.equal(find(649).name,'genesect');
  assert.deepEqual(find(1).stats.map(s=>s.value),[45,49,49,65,65,45]);
  assert.deepEqual(find(445).stats.map(s=>s.value),[108,130,95,80,85,102]);
  assert.equal(data.value(find(493),'total'),720);
  assert.equal(find(1).height,7);assert.equal(find(1).weight,69);
  assert.ok(find(1).abilities.some(a=>a.name==='chlorophyll'&&a.hidden));
});
test('aggregations count five generation boundaries, dual memberships and unrounded means', () => {
  const summary=data.summarize(records);
  assert.equal(summary.total,649);assert.equal(summary.generationCount,5);assert.equal(summary.typeCount,18);
  assert.deepEqual(summary.groups.map(g=>g.count),[151,100,135,107,156]);
  assert.deepEqual(find(6).types,['fire','flying']);
  assert.equal(summary.types.fire,records.filter(p=>p.types.includes('fire')).length);
  assert.equal(summary.types.flying,records.filter(p=>p.types.includes('flying')).length);
  assert.equal(Object.values(summary.types).reduce((a,b)=>a+b,0),records.reduce((n,p)=>n+p.types.length,0));
  assert.ok(Object.values(summary.types).reduce((a,b)=>a+b,0)>649);
  let sum=0;const genSums=Array.from({length:5},()=>Array(6).fill(0));
  for(const p of records)for(let i=0;i<6;i++){sum+=p.stats[i].value;genSums[data.generation(p.id).id-1][i]+=p.stats[i].value;}
  assert.equal(summary.averageTotal,sum/649);
  summary.groups.forEach((g,i)=>g.averages.forEach((v,j)=>assert.equal(v,genSums[i][j]/g.count)));
});
test('no incomplete, duplicated, alternate-form or malformed dataset can be aggregated', () => {
  const invalids=[records.slice(1),[...records.slice(1),records[1]],records.map(p=>p.id===649?{...p,id:10001}:p),records.map(p=>p.id===1?{...p,stats:p.stats.slice(1)}:p),records.map(p=>p.id===1?{...p,types:['unknown']}:p)];
  for(const invalid of invalids)assert.throws(()=>data.summarize(invalid));
  assert.throws(()=>data.validateSnapshot({...snapshot,schemaVersion:99}));
  assert.throws(()=>data.validateSnapshot({...snapshot,source:{...snapshot.source,retrievedAt:'invalid'}}));
});
test('all seven ranges are inclusive and combine; invalid numeric bounds never become active', () => {
  for(const key of [...data.stats,'total']) {
    const v=data.value(find(445),key);
    assert.equal(data.matches(find(445),data.parseRanges({[key]:{min:String(v),max:String(v)}}).ranges),true);
    assert.equal(data.matches(find(445),{[key]:{min:v+1}}),false);
    assert.equal(data.matches(find(445),{[key]:{max:v-1}}),false);
    assert.ok(data.parseRanges({[key]:{min:'100',max:'99'}}).error);
  }
  const ranges=data.parseRanges({attack:{min:'100'},speed:{min:'90'}}).ranges;
  assert.equal(data.matches(find(445),ranges),true);assert.equal(data.matches(find(443),ranges),false);
  for(const invalid of ['-1','1.5','abc','1e2','Infinity','256'])assert.ok(data.parseRanges({hp:{min:invalid}}).error);
  assert.ok(data.parseRanges({total:{max:'1531'}}).error);
  assert.deepEqual(data.parseRanges({hp:{min:'0',max:''}}).ranges,{hp:{min:0}});
  assert.deepEqual(data.parseRanges({}).ranges,{});
});
test('every ranking/stat sort is numeric, deterministic for ties, and does not mutate records', () => {
  const original=records.map(p=>p.id);
  for(const key of [...data.stats,'total']) {
    const ranking=[...records].sort(data.compare(key));
    for(let i=1;i<ranking.length;i++) {
      const previous=data.value(ranking[i-1],key),current=data.value(ranking[i],key);
      assert.ok(previous>=current);if(previous===current)assert.ok(ranking[i-1].id<ranking[i].id);
    }
    assert.equal(ranking.slice(0,10).length,10);
  }
  assert.equal([...records].sort(data.compare('total'))[0].id,493);
  assert.equal([...records].sort(data.compare('hp'))[0].name,'blissey');
  assert.equal([...records].sort(data.compare('total',true))[0].name,'sunkern');
  assert.deepEqual(records.map(p=>p.id),original);
  assert.equal(data.value(find(649),'total')-data.value(find(1),'total'),282);
  assert.equal(data.value(find(150),'total')-data.value(find(249),'total'),0);
});
test('loader coalesces calls and rejects partial data without caching failure; retry succeeds',async()=>{
  let calls=0,fail=true;
  const context=vm.createContext({AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;return{ok:true,json:async()=>fail?{...snapshot,pokemon:records.slice(1)}:snapshot};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../pokemon-data.js'),'utf8'),context);
  const [a,b]=await Promise.allSettled([context.PokemonData.load(),context.PokemonData.load()]);
  assert.equal(a.status,'rejected');assert.equal(b.status,'rejected');assert.equal(calls,1);
  fail=false;const loaded=await context.PokemonData.load();assert.equal(loaded.pokemon.length,649);assert.equal(calls,2);
  await context.PokemonData.load();assert.equal(calls,2);
});
