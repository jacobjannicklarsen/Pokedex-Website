const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const config=require('../trainer-card-config'),decorations=require('../server/decorations');
const {CommunityRepository}=require('../server/community-repository');
test('new presets and every curated option validate while legacy settings acquire safe defaults',()=>{
 const legacy={palette:'rose',pattern:'petals',frame:'orbit',effect:'sparkles',title:'Original',motto:'Old card',pinnedBadges:[]};
 assert.deepEqual(decorations.validate(legacy),{...config.defaults(),...legacy});
 for(const value of Object.values(config.presets))assert.deepEqual(decorations.validate({...config.defaults(),...value}),{...config.defaults(),...value});
 for(const [key,options]of Object.entries(config.choices))for(const choice of options)assert.equal(decorations.validate({...config.defaults(),[key]:choice})[key],choice);
 const old=config.normalize({...legacy,palette:'retired',frame:'unknown',effect:'outdated',accentColor:'url(evil)'});
 assert.equal(old.palette,'mint');assert.equal(old.frame,'classic');assert.equal(old.effect,'none');assert.equal(old.accentColor,null);assert.equal(old.title,'Original');
});
test('server rejects CSS injection, malformed colours and unsupported decoration fields',()=>{
 for(const key of ['accentColor','borderColor','frameColor']){
  assert.equal(decorations.validate({...config.defaults(),[key]:'#A0B1C2'})[key],'#a0b1c2');
  for(const value of ['red','#fff','#12345678',' #123456','url(https://evil.test)',{},1,'#123456;background:red'])assert.throws(()=>decorations.validate({...config.defaults(),[key]:value}));
 }
 assert.throws(()=>decorations.validate({...config.defaults(),css:'*{display:none}'}));
});
test('SQL persistence binds all cosmetics to the authenticated owner, reads legacy rows and reports migration failures',async()=>{
 const calls=[];const old={...config.defaults(),accentColor:'#aabbcc',frame:'hexagon',effect:'sparkles'};
 const pool={execute:async(sql,params)=>{calls.push({sql,params});if(sql.includes('achievement_key'))return [[]];return [[]];}};
 const repo=new CommunityRepository(pool);await repo.saveDecoration(42,old);
 const insert=calls.find(c=>c.sql.startsWith('INSERT'));assert.equal(insert.params[0],42);assert.ok(insert.params.includes('#aabbcc'));assert.match(insert.sql,/frame_color/);assert.match(insert.sql,/title_style/);
 let legacyReads=0;
 pool.execute=async sql=>{if(sql.includes('accent_color'))throw Object.assign(Error("Unknown column 'accent_color'"),{code:'ER_BAD_FIELD_ERROR'});legacyReads++;return [[{palette:'rose',pattern:'petals',frame:'hexagon',effect:'sparkles',title:'Legacy',motto:'',pinnedBadges:'[]'}]];};
 assert.equal((await repo.decoration(42)).accentColor,null);assert.equal((await repo.decoration(42)).title,'Legacy');assert.equal(legacyReads,2);
 pool.execute=async sql=>{if(sql.includes('achievement_key'))return [[]];throw Object.assign(Error("Unknown column 'accent_color'"),{code:'ER_BAD_FIELD_ERROR'});};
 await assert.rejects(repo.saveDecoration(42,old),e=>e.status===503&&e.message.includes('v0.6.1-trainer-studio.sql'));
 pool.execute=async sql=>{if(sql.includes('achievement_key'))return [[]];throw Object.assign(Error("Check constraint 'ck_decoration_title_style' is violated."),{code:'ER_CHECK_CONSTRAINT_VIOLATED'});};
 await assert.rejects(repo.saveDecoration(42,{...old,titleStyle:'champion'}),e=>e.status===503&&e.message.includes('database/migrations/trainer-title-styles.sql'));
});

test('title expansion preserves all legacy styles and changes only their named database check',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/trainer-title-styles.sql'),'utf8');
 assert.deepEqual(config.choices.titleStyle.slice(0,3),['ribbon','pill','minimal']);
 assert.equal(config.choices.titleStyle.length,8);
 assert.match(sql,/DROP CHECK ck_decoration_title_style/);
 assert.equal((sql.match(/ALTER TABLE/g)||[]).length,1);
 assert.ok(!/\b(?:DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE |INSERT INTO)\b/.test(sql));
});
test('v0.6.1 schema changes are additive and retain every previous option; version metadata is consistent',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const sql=read('database/migrations/v0.6.1-trainer-studio.sql'),schema=read('database/schema.sql');
 assert.match(sql,/USE pokedex_app;/);assert.equal((sql.match(/ALTER TABLE/g)||[]).length,1);
 assert.ok(!/\b(?:DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE |INSERT INTO)\b/.test(sql));
 const fresh=schema.match(/CREATE TABLE IF NOT EXISTS trainer_decorations \([\s\S]*?ENGINE=InnoDB;/)[0];
 assert.equal((fresh.match(/ENGINE=InnoDB;/g)||[]).length,1);
 for(const line of sql.split(/\r?\n/)){
  const column=line.match(/^  ADD COLUMN (.*),$/),constraint=line.match(/^  ADD (CONSTRAINT .*?)[,;]?$/);
  if(constraint?.[1].includes('ck_decoration_title_style'))continue;
  if(column)assert.ok(fresh.includes(column[1]),`fresh column: ${column[1]}`);
  if(constraint)assert.ok(fresh.includes(constraint[1]),`fresh constraint: ${constraint[1]}`);
 }
 for(const [key,values]of Object.entries(config.choices)){
  const column=key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
  const check=`CONSTRAINT ck_decoration_${column} CHECK (${column} IN (${values.map(v=>"'"+v+"'").join(',')}))`;
  assert.ok((key==='titleStyle'?read('database/migrations/trainer-title-styles.sql'):sql).includes(check));assert.ok(schema.includes(check));
 }
 assert.equal(require('../package.json').version,'0.7.2');const lock=require('../package-lock.json');assert.equal(lock.version,'0.7.2');assert.equal(lock.packages[''].version,'0.7.2');
});
