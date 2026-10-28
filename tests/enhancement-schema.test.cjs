const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {ForumStore}=require('../server/forum-store');
const {ExtensionStore}=require('../server/extension-store');

test('v0.7.1 migration is additive, preserves legacy biographies and enforces ownership constraints',()=>{
 const sql=fs.readFileSync('database/migrations/v0.7.1-community-settings-battles.sql','utf8');
 const schema=fs.readFileSync('database/schema.sql','utf8');
 assert.ok(schema.includes(sql));
 assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,11);
 assert.ok(!/(?:^|;)\s*(?:DELETE|TRUNCATE|DROP TABLE|UPDATE users)\b/im.test(sql.replace(/^--.*$/gm,'')));
 assert.match(sql,/bio_format VARCHAR\(8\) NOT NULL DEFAULT 'plain'/);
 assert.match(sql,/UNIQUE KEY uq_poll_vote \(poll_id,user_id\)/);
 assert.match(sql,/FOREIGN KEY \(option_id,poll_id\) REFERENCES forum_poll_options\(id,poll_id\)/);
 assert.match(sql,/UNIQUE KEY uq_battle_replay \(user_id,digest\)/);
 assert.match(sql,/actor_id INT UNSIGNED NULL/);
 assert.ok(sql.indexOf('INSERT IGNORE INTO enhancement_state')>sql.indexOf('ALTER TABLE users'));
 for(const file of ['server/index.js','server/setup-db.js'])assert.ok(!fs.readFileSync(file,'utf8').includes('v0.7.1-community-settings-battles.sql'));
});

test('legacy notification projection falls back only for its newly added actor column',async()=>{
 const calls=[];
 const pool={execute:async(sql,params)=>{calls.push({sql,params});if(calls.length===1)throw Object.assign(Error("Unknown column 'actor_id'"),{code:'ER_BAD_FIELD_ERROR'});return [[{id:1,actorId:null}]];}};
 const rows=await new ForumStore(pool,{}).rows('notifications',{userId:7});
 assert.equal(rows[0].actorId,null);assert.match(calls[1].sql,/NULL AS `actorId`/);assert.deepEqual(calls[1].params,[7,30,0]);
 const broken=new ForumStore({execute:async()=>{throw Object.assign(Error("Unknown column 'read_at'"),{code:'ER_BAD_FIELD_ERROR'});}},{});
 await assert.rejects(()=>broken.rows('notifications'),/read_at/);
});

test('enhancement readiness fails closed for partial upgrades and SQL keeps external values bound',async()=>{
 const store=new ExtensionStore({execute:async()=>[[]]},{});await assert.rejects(()=>store.ready(),e=>e.status===503);
 const calls=[];const sqlStore=new ExtensionStore({execute:async(sql,params)=>{calls.push({sql,params});return [[]];}},{});
 await sqlStore.latest(2,{userId:42,categoryId:3,limit:6});assert.deepEqual(calls[0].params,[42,3,7,6]);
 assert.match(calls[0].sql,/p.visibility='visible'/);assert.match(calls[0].sql,/t.visibility='visible'/);
 await assert.rejects(()=>sqlStore.rows('settings',{role:'owner'}),/Invalid internal forum column/);
});
