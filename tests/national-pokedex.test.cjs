const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createPokeFixture}=require('./support/pokeapi-fixture.cjs');
class Node {
  constructor(){this.children=[];this.dataset={};this.attributes={};this.style={setProperty(){}};this.textContent='';this.hidden=false;this.listeners={};}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  get lastChild(){return this.children.at(-1);}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k]??this[k];}
  addEventListener(type,fn){this.listeners[type]=fn;}
  focus(){this.focused=true;}
  remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}
  insertBefore(node,reference){node.remove();node.parent=this;this.children.splice(reference?this.children.indexOf(reference):this.children.length,0,node);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  showModal(){this.open=true;}
}
function setup({failures=new Set(),mode='ok',blocked=false,collection=true,hero=true,details=true}={}){
  const nodes=new Map(),storage=new Map(),calls=[];let active=0,maxActive=0;
  const fixture=createPokeFixture();
  const context=vm.createContext({
    PokemonData:require('../pokemon-data'),
    document:{querySelector(selector){if((!collection&&selector==='#pokemon-grid')||(!hero&&selector==='.hero-art img')||(!details&&selector==='#pokemon-dialog'))return null;if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);},querySelectorAll(){return nodes.get('#type-filters')?.children||[];},createElement(){return new Node();},createTextNode(text){const n=new Node();n.textContent=text;return n;},addEventListener(){}},
    AbortController,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,mode==='timeout'&&ms===12000?1:ms),requestAnimationFrame:fn=>setTimeout(fn,0),
    localStorage:{getItem(k){if(blocked)throw Error('Blocked');return storage.get(k)||null;},setItem(k,v){if(blocked)throw Error('Blocked');storage.set(k,v);}},
    fetch:async(url,options)=>{
      const key=fixture.key(url);calls.push(key);active++;maxActive=Math.max(active,maxActive);
      try{
        if(mode==='timeout')await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true}));
        await new Promise(resolve=>setTimeout(resolve,1));
        if(mode==='network')throw new TypeError('Failed to fetch');
        if(failures.has(key))return {ok:false,status:503};
        return {ok:true,json:async()=>{if(mode==='json')throw SyntaxError('Invalid JSON');return mode==='malformed'?{}:fixture.response(url);}};
      }finally{active--;}
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../script.js'),'utf8').replace(/loadPokemon\(\);\s*$/,'globalThis.ready=loadPokemon();'),context);
  return {context,nodes,storage,calls,run:code=>vm.runInContext(code,context),maxActive:()=>maxActive};
}
const ids=app=>app.nodes.get('#pokemon-grid').children.map(c=>Number(c.dataset.id));

test('advanced stat predicates and all new sorts integrate with collection generation/type/search/reset',async()=>{
  const app=setup();await app.context.ready;
  const records=require('../data/pokemon-summary.json').pokemon;
  app.context.realRecords=records;
  app.run('state.statData=new Map(realRecords.map(p=>[p.id,p]));state.pokemon=new Map(realRecords.map(p=>[p.id,p]))');
  for(const key of [...require('../pokemon-data').stats,'total']) {
    const value=require('../pokemon-data').value(records[444],key);
    app.run(`state.sort='number';state.statRanges={${JSON.stringify(key)}:{min:${value},max:${value}}};render()`);
    const expected=records.filter(p=>require('../pokemon-data').value(p,key)===value).map(p=>p.id);
    assert.deepEqual(ids(app),expected);
    app.run(`state.statRanges={};state.sort='stat:${key}:desc';render()`);
    assert.deepEqual(ids(app),[...records].sort(require('../pokemon-data').compare(key)).map(p=>p.id));
  }
  app.run("state.sort='stat:total:asc';render()");assert.deepEqual(ids(app),[...records].sort(require('../pokemon-data').compare('total',true)).map(p=>p.id));
  app.run("resetFilters();state.generation='4';state.type='dragon';state.statRanges={attack:{min:100},speed:{min:90}};state.query='garch';render()");assert.deepEqual(ids(app),[445]);
  app.run("state.statRanges={hp:{min:255},speed:{min:255}};render()");assert.equal(ids(app).length,0);assert.equal(app.nodes.get('#empty-state').hidden,false);
  app.run('resetFilters()');assert.equal(ids(app).length,649);assert.equal(app.run('state.sort'),'number');assert.equal(app.run('Object.keys(state.statRanges).length'),0);
});

test('homepage skips collection initialization; trainer catalogue loads lazily and coalesces callers',async()=>{
  const app=setup({collection:false});
  assert.equal(app.calls.length,0);
  assert.equal(app.nodes.has('#search'),false);
  await Promise.all([app.run('loadPokemon()'),app.run('loadPokemon()')]);
  assert.equal(app.calls.length,19);
  assert.equal(app.run('state.pokemon.size'),649);
  assert.equal(app.nodes.has('#error-state'),false);
  await app.run('loadPokemon()');assert.equal(app.calls.length,19);
  await app.run('showDetails(state.pokemon.get(649))');
  assert.equal(app.nodes.get('#detail-content').children[0].children[2].textContent,'Genesect');
});
test('collection and shared scripts tolerate absent hero and detail dialog',async()=>{
  const app=setup({hero:false,details:false});await app.context.ready;
  assert.equal(ids(app).length,649);
});

test('649 species, 19 bounded index requests, and no eager detail requests',async()=>{
  const app=setup();await app.context.ready;
  assert.equal(app.run('state.pokemon.size'),649);assert.equal(ids(app).length,649);
  assert.equal(app.calls.length,19);assert.ok(app.maxActive()<=4);
  assert.equal(app.calls.some(key=>key.startsWith('pokemon-')),false);
  assert.equal(app.run('state.pokemon.get(649).name'),'genesect');
  assert.equal(app.run('state.pokemon.get(1).height'),undefined);
});
test('generation boundaries and combined generation/name/number/type filtering',async()=>{
  const app=setup();await app.context.ready;
  for(const [generation,start,end]of[['all',1,649],['1',1,151],['2',152,251],['3',252,386],['4',387,493],['5',494,649]]){
    app.run(`state.generation='${generation}';render()`);const shown=ids(app);
    assert.equal(shown.length,end-start+1);assert.equal(shown[0],start);assert.equal(shown.at(-1),end);
    assert.match(app.nodes.get('#result-count').textContent,new RegExp(`of ${end-start+1}`));
  }
  app.run("state.generation='4';state.type='dragon';render()");assert.deepEqual(ids(app),[443,445]);
  app.run("state.query=' GIB ';render()");assert.deepEqual(ids(app),[443]);
  app.run("state.query='#649';state.generation='5';state.type='bug';render()");assert.deepEqual(ids(app),[649]);
  app.run("state.query='#650';render()");assert.deepEqual(ids(app),[]);assert.equal(app.nodes.get('#empty-state').hidden,false);
  app.run('resetFilters()');assert.equal(ids(app).length,649);assert.equal(app.nodes.get('#search').focused,true);
});
test('punctuation searches and all sorting modes',async()=>{
  const app=setup();await app.context.ready;
  for(const [query,id]of[['pika',25],['025',25],["Farfetch'd",83],['mr mime',122],['nidoran f',29],['genesect',649]]){
    app.run(`state.query=${JSON.stringify(query)};render()`);assert.deepEqual(ids(app),[id]);
  }
  app.run("resetFilters();state.sort='reverse';render()");assert.equal(ids(app)[0],649);
  app.run("state.sort='name';render()");
  const names=app.nodes.get('#pokemon-grid').children.map(tile=>tile.children[0].children[2].textContent);
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b)));
});
test('details are on demand, deduplicated, cached, and canonically named',async()=>{
  const app=setup();await app.context.ready;
  await Promise.all([app.run('ensureDetails(649)'),app.run('ensureDetails(649)')]);
  assert.equal(app.calls.filter(key=>key==='pokemon-649').length,1);
  await app.run('showDetails(state.pokemon.get(649))');
  const [hero,body]=app.nodes.get('#detail-content').children;
  assert.equal(hero.children[2].textContent,'Genesect');
  assert.equal(body.children[0].children[0].children[1].textContent,'0.7 m');
  assert.equal(body.children[0].children[1].children[1].textContent,'6.9 kg');
  assert.equal(body.children.at(-1).children[1].textContent,318);
  await app.run('ensureDetails(386)');assert.equal(app.run('state.pokemon.get(386).name'),'deoxys');
  await assert.rejects(app.run('ensureDetails(650)'));
  const image=hero.children[1];image.listeners.error();assert.equal(image.src,'/missing-sprite.png');image.listeners.error();assert.equal(image.src,'artwork-fallback.svg');
});
test('modal detail errors have a working retry; stale responses cannot replace a newer modal',async()=>{
  const failures=new Set(['pokemon-649']);const app=setup({failures});await app.context.ready;
  await app.run('showDetails(state.pokemon.get(649))');
  const loading=app.nodes.get('#detail-content').children[0];assert.match(loading.children[1].textContent,/couldn’t/);
  failures.clear();await loading.children[2].listeners.click();assert.equal(app.nodes.get('#detail-content').children[0].children[2].textContent,'Genesect');
  await Promise.all([app.run('showDetails(state.pokemon.get(1))'),app.run('showDetails(state.pokemon.get(25))')]);
  assert.equal(app.nodes.get('#detail-content').children[0].children[2].textContent,'Pikachu');
});
test('fresh index caches avoid all startup requests; corrupt/future caches refetch',async()=>{
  const app=setup();await app.context.ready;
  app.run('state.pokemon.clear();state.typesLoaded.clear()');await app.run('loadPokemon()');assert.equal(app.calls.length,19);
  const key='dexhaven-index-v2-species';const cached=JSON.parse(app.storage.get(key));cached.timestamp=Date.now()+86400000;app.storage.set(key,JSON.stringify(cached));
  app.run('state.pokemon.clear();state.typesLoaded.clear()');await app.run('loadPokemon()');assert.equal(app.calls.length,20);
  app.storage.set('dexhaven-index-v2-type-fire','{bad json');app.run("state.typesLoaded.delete('fire')");await app.run('loadPokemon()');assert.equal(app.calls.length,21);
});
test('legacy detail caches remain compatible and invalid stats are rejected',async()=>{
  const app=setup();await app.context.ready;await app.run('ensureDetails(1)');
  app.run('state.pokemon.set(1,{id:1,name:"bulbasaur",types:[]})');await app.run('ensureDetails(1)');assert.equal(app.calls.filter(k=>k==='pokemon-1').length,1);
  const key='kanto-pokedex-v1-1';const cached=JSON.parse(app.storage.get(key));cached.data.stats[0].value=-1;app.storage.set(key,JSON.stringify(cached));
  await app.run('ensureDetails(1)');assert.equal(app.calls.filter(k=>k==='pokemon-1').length,2);
});
test('partial type errors preserve search and retry only missing resources',async()=>{
  const failures=new Set(['type-dragon']);const app=setup({failures});await app.context.ready;
  assert.equal(app.run('state.pokemon.size'),649);assert.equal(app.nodes.get('#error-state').hidden,false);
  failures.clear();await app.run('loadPokemon()');assert.equal(app.calls.length,20);assert.equal(app.nodes.get('#error-state').hidden,true);
});
test('progressive type updates refresh reused cards without replacing their buttons',async()=>{
  const app=setup();await app.context.ready;
  const tile=app.run("createCard({id:649,name:'genesect',types:[]})");
  const button=tile.cardParts.card;
  app.context.testTile=tile;app.run('updateCardTypes(testTile,state.pokemon.get(649))');
  assert.equal(tile.cardParts.card,button);assert.equal(tile.dataset.types,'bug,steel');
  assert.equal(tile.cardParts.typeBadges.children.length,2);
});
for(const mode of ['network','timeout','json','malformed'])test(`${mode} index failure clears loader and remains retryable`,async()=>{
  const app=setup({mode});await app.context.ready;assert.equal(app.calls.length,1);assert.equal(app.nodes.get('#load-status').hidden,true);assert.equal(app.nodes.get('#error-state').hidden,false);assert.equal(app.nodes.get('#pokemon-grid').attributes['aria-busy'],'false');
});
test('blocked storage and duplicate-load guard preserve functionality',async()=>{
  const app=setup({blocked:true});assert.equal(app.run('state.loading'),true);await app.run('loadPokemon()');await app.context.ready;
  assert.equal(app.calls.length,19);assert.equal(app.run('state.pokemon.size'),649);await app.run('ensureDetails(649)');assert.equal(app.run('state.pokemon.get(649).name'),'genesect');
});
