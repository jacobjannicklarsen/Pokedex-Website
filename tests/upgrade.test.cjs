const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('Dexhaven branding and custom hero are preserved',()=>{
  const html=read('index.html');
  assert.match(html,/<title>Dexhaven — [^<]+<\/title>/);
  assert.equal((html.match(/>dexhaven<span>/g)||[]).length,2);
  assert.match(html,/src="\.\/images\/group-picture\.png"/);
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../images/group-picture.png'))).digest('hex');
  assert.equal(hash,'2d2aa845789f32e5b7188dcf0ef7b71b74eef671f0ffb9987cfe1869db14138f');
  assert.equal(JSON.parse(read('package.json')).version,'0.6.0');
});
test('manual migration widens two checks without recreating or deleting data',()=>{
  const sql=read('database/migrations/v0.2.0-national-pokedex.sql');
  assert.equal((sql.match(/ALTER TABLE/g)||[]).length,2);
  assert.equal((sql.match(/BETWEEN 1 AND 649/g)||[]).length,2);
  assert.ok(!/\b(?:DROP\s+(?:TABLE|DATABASE)|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/i.test(sql));
  assert.match(sql,/USE pokedex_app/);
  const schema=read('database/schema.sql');
  for(const name of ['ck_team_pokemon_v020','ck_favorite_pokemon_v020'])assert.ok(schema.includes(name)&&sql.includes(name));
  for(const file of ['server/index.js','server/setup-db.js'])assert.ok(!read(file).includes('v0.2.0-national-pokedex.sql'));
});

test('v0.5.0 preserves shared layout, trainer isolation and four-page navigation',()=>{
  const home=read('index.html'),pokemon=read('pokemon.html'),hub=read('trainers.html'),dashboard=read('dashboard.html');
  assert.ok(!home.includes('id="pokemon-grid"'));
  assert.match(home,/class="explore-link" href="pokemon.html"/);
  assert.match(pokemon,/<title>National Pokédex — Dexhaven<\/title>/);
  assert.match(pokemon,/id="pokemon-grid"/);
  assert.ok(!pokemon.includes('class="hero"'));
  for(const selector of [/<header[\s\S]*?<\/header>/,/<footer>[\s\S]*?<\/footer>/,/<dialog id="auth-dialog"[\s\S]*?<\/dialog>/]) {
    assert.equal(home.match(selector)[0],pokemon.match(selector)[0]);assert.equal(home.match(selector)[0],hub.match(selector)[0]);
    assert.equal(home.match(selector)[0],dashboard.match(selector)[0]);
  }
  for(const html of [home,pokemon,hub,dashboard]) {
    assert.ok(/href="dashboard\.html"/.test(html));
    assert.ok(html.includes('href="trainers.html"'));
    for(const script of ['theme.js','script.js','account.js'])assert.ok(html.includes(`src="${script}"`));
  }
  for(const html of [home,pokemon]) {
    assert.ok(!html.includes('id="account-content"'));
    assert.ok(!html.includes('id="trainer-area"'));
    assert.ok(!html.includes('src="pokemon-selector.js"'));
  }
  for(const view of ['teams','favorites','profile'])assert.ok(hub.includes(`data-view="/${view}"`));
  assert.ok(hub.includes('src="pokemon-selector.js"'));
  assert.ok(hub.includes('id="trainer-invitation"'));
  assert.match(hub,/<title>Trainer Hub — Dexhaven<\/title>/);
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(lock.version,'0.6.1');assert.equal(lock.packages[''].version,'0.6.1');
});
