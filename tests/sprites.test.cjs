const {test}=require('node:test');
const assert=require('node:assert/strict');
const sprites=require('../pokemon-sprites');
const manifest=require('../data/sprite-availability.json');
const sharp=require('sharp');
const path=require('node:path');

test('verified complete upstream trees contain all supported battle, party and shiny sprite files',()=>{
 assert.match(manifest.revision,/^[a-f0-9]{40}$/);assert.ok(Number.isFinite(Date.parse(manifest.verifiedAt)));
 for(const ids of Object.values(manifest.available))assert.deepEqual(ids,Array.from({length:649},(_,i)=>i+1));
 for(const sample of manifest.samples){assert.equal(sample.status,200);assert.ok(sample.bytes>100);}
});
test('Mew and Blastoise resolve animated battle and static party sprites with a finite fallback chain',()=>{
 for(const id of [9,151,649]){
  const battle=sprites.sources(id);assert.match(battle[0],new RegExp(`/black-white/animated/${id}\\.gif$`));
  assert.match(battle[1],new RegExp(`/black-white/${id}\\.png$`));
  assert.equal(battle.at(-1),'artwork-fallback.svg');assert.equal(new Set(battle).size,battle.length);
  const party=sprites.sources(id,{kind:'party'});assert.match(party[0],new RegExp(`/generation-v/icons/${id}\\.png$`));assert.ok(party.every(url=>!url.endsWith('.gif')));
  assert.ok(sprites.sources(id,{reducedMotion:true}).every(url=>!url.endsWith('.gif')));
 }
 for(const id of [0,650,'151',1.5,null,NaN])assert.throws(()=>sprites.sources(id));
 assert.throws(()=>sprites.sources(151,{kind:'url(javascript:evil)'}));
});
test('shiny sprites require explicit matching existing metadata and have no invented shiny party icons',()=>{
 assert.ok(sprites.sources(151,{pokemon:{id:9,isShiny:true}}).every(url=>!url.includes('/shiny/')));
 assert.ok(sprites.sources(151,{pokemon:{id:151}}).every(url=>!url.includes('/shiny/')));
 assert.match(sprites.sources(151,{pokemon:{id:151,isShiny:true}})[0],/animated\/shiny\/151.gif$/);
 assert.ok(sprites.sources(151,{reducedMotion:true,pokemon:{id:151,isShiny:true}}).every(url=>!url.endsWith('.gif')));
 assert.match(sprites.sources(151,{kind:'party',pokemon:{id:151,isShiny:true}})[0],/icons\/151.png$/);
});
test('downloaded upstream sample images decode; battle GIFs really contain animation and icons have pixel-art dimensions',async()=>{
 for(const id of [9,151,649])for(const kind of ['animated','static','party']){
  const meta=await sharp(path.join(__dirname,'fixtures/sprites',`${id}-${kind}.${kind==='animated'?'gif':'png'}`),{animated:true}).metadata();
  assert.ok(meta.width>0&&meta.height>0);
  if(kind==='animated')assert.ok(meta.pages>1);else assert.equal(meta.format,'png');
  if(kind==='party')assert.ok(meta.width<=64&&meta.height<=64);
 }
});
