const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8').replace(/\r\n/g,'\n');
test('v0.6.2 schema is additive, preserves every existing account, and publishes readiness only after all tables',()=>{
 const sql=read('database/migrations/v0.6.2-ranks-administration.sql'),schema=read('database/schema.sql');
 assert.match(sql,/USE pokedex_app;/);assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,4);
 assert.ok(!/(?:^|;)\s*(?:DROP|TRUNCATE|ALTER|DELETE)\b/i.test(sql.replace(/^--.*$/gm,'')));
 for(const table of ['user_roles','user_restrictions','admin_audit_logs','admin_state']){
  const re=new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?ENGINE=InnoDB;`);
  // The later password audit migration expands only this action constraint.
  const current=schema.match(re)[0],original=sql.match(re)[0];
  assert.equal(table==='admin_audit_logs'?current.replace(",'password.change'",'').replace(",'username.change'",''):current,original);
 }
 assert.match(sql,/UNIQUE KEY uq_protected_owner/);assert.match(sql,/GENERATED ALWAYS AS.*role = 'owner'/);assert.match(sql,/role VARCHAR\(16\) NOT NULL DEFAULT 'trainer'/);assert.match(sql,/fk_audit_target.*ON DELETE RESTRICT/);
 assert.ok(sql.indexOf('INSERT INTO admin_state')>sql.indexOf('CREATE TABLE IF NOT EXISTS admin_audit_logs'));
 assert.ok(!/INSERT INTO (?:users|user_roles)/i.test(sql));
 for(const file of ['server/index.js','server/setup-db.js'])assert.ok(!read(file).includes('v0.6.2-ranks-administration.sql'));
 const metadata=require('../package-lock.json');assert.equal(require('../package.json').version,'0.7.2');assert.equal(metadata.version,'0.7.2');assert.equal(metadata.packages[''].version,'0.7.2');
});

test('password audit migration expands the existing CHECK without changing records',()=>{
 const sql=read('database/migrations/owner-password-audit.sql'),schema=read('database/schema.sql');
 assert.match(sql,/ALTER TABLE admin_audit_logs/);assert.match(sql,/DROP CHECK ck_audit_action/);
 const constraint=/ADD CONSTRAINT ck_audit_action CHECK \(action IN\s*\(([\s\S]*?)\)\)/;
 const values=sql.match(constraint)[1].replace(/\s+/g,'');
 assert.equal(values,schema.replace(",'username.change'",'').match(/CONSTRAINT ck_audit_action CHECK \(action IN \(([^)]+)\)\)/)[1]);
 assert.ok(!/\b(?:DROP TABLE|DROP DATABASE|DELETE FROM|TRUNCATE)\b/i.test(sql));
});
