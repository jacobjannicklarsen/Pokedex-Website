const {test}=require('node:test');
const assert=require('node:assert/strict');
const {search}=require('../pokemon-selector');
const {createPokeFixture}=require('./support/pokeapi-fixture.cjs');
const pokemon=createPokeFixture().response('https://pokeapi.co/api/v2/pokemon-species/?limit=649').results.map((p,i)=>({id:i+1,name:p.name}));
const format=name=>({'nidoran-f':'Nidoran ♀','mr-mime':'Mr. Mime',farfetchd:'Farfetch’d'})[name]||name;
test('every one of 649 species is searchable by exact and padded National number',()=>{
  for(let id=1;id<=649;id++)for(const query of [String(id),`#${String(id).padStart(3,'0')}`])assert.deepEqual(search(pokemon,query,format).items.map(p=>p.id),[id]);
  for(const query of ['650','#650','0','000','-','not-a-pokemon'])assert.equal(search(pokemon,query,format).count,0);
});
test('selector name search handles case, whitespace, partial names and punctuation',()=>{
  for(const [query,id]of[[' PIKA ',25],['gene',649],["farfetch'd",83],['mr mime',122],['nidoran ♀',29]])assert.deepEqual(search(pokemon,query,format).items.map(p=>p.id),[id]);
});
test('results are bounded while reporting all matches, without modifying source records',()=>{
  const before=JSON.stringify(pokemon);
  assert.equal(search(pokemon,'',format).count,649);assert.equal(search(pokemon,'',format).items.length,12);
  assert.equal(search(pokemon,'',format,5).items.length,5);assert.equal(JSON.stringify(pokemon),before);
});
