'use strict';
const policy=require('./authorization'),{HttpError}=require('./validation');
const unavailable=()=>new HttpError(503,'Administration is unavailable or partially migrated. Review database/MIGRATION_v0.6.2.md.');
const restrictionFields="r.id, r.user_id AS userId, r.issued_by AS issuedBy, r.reason, DATE_FORMAT(r.expires_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS expiresAt";
class AdminRepository{
 constructor(pool){this.pool=pool;}
 async ready(connection=this.pool,lock=false){
  try{const [rows]=await connection.execute(`SELECT schema_version FROM admin_state WHERE id = 1${lock?' FOR UPDATE':''}`);if(rows[0]?.schema_version!==1)throw unavailable();return true;}
  catch(error){
   if(error.code!=='ER_NO_SUCH_TABLE')throw error;
   // Complete absence is a supported pre-upgrade state; partial tables fail closed.
   for(const table of ['user_roles','user_restrictions','admin_audit_logs']){
    try{await connection.execute(`SELECT 1 FROM ${table} LIMIT 1`);throw unavailable();}
    catch(failure){if(failure.code!=='ER_NO_SUCH_TABLE')throw failure;}
   }
   return false;
  }
 }
 async active(connection,id){const [rows]=await connection.execute(`SELECT ${restrictionFields} FROM user_restrictions r WHERE r.user_id = ? AND r.revoked_at IS NULL AND r.expires_at > UTC_TIMESTAMP(3) ORDER BY r.id DESC LIMIT 1`,[id]);return rows[0]||null;}
 async access(id,connection=this.pool,ready=false){
  if(!ready&&!await this.ready(connection))return policy.context({available:false});
  const [rows]=await connection.execute('SELECT role, permissions_json AS permissions, version AS roleVersion FROM user_roles WHERE user_id = ?',[id]);
  return policy.context({...rows[0],restriction:await this.active(connection,id)});
 }
 async target(connection,id){
  const [rows]=await connection.execute('SELECT id, username, created_at AS createdAt FROM users WHERE id = ?',[id]);if(!rows.length)throw new HttpError(404,'Trainer not found.');
  return {...rows[0],...await this.access(id,connection,true)};
 }
 async auditWhere(actor){
  policy.requireAccess(actor,'audit.read');
  if(actor.permissions.includes('audit.all'))return {sql:'1 = 1',params:[]};
  if(actor.role==='administrator')return {sql:"a.action IN ('role.change','restriction.apply','restriction.revoke') AND a.target_role IN ('trainer','moderator')",params:[]};
  return {sql:'a.actor_id = ?',params:[actor.id]};
 }
 async audit(actor,before=Number.MAX_SAFE_INTEGER,connection=this.pool){
  const filter=await this.auditWhere(actor);
  const [rows]=await connection.execute(`SELECT a.id, a.actor_id AS actorId, au.username AS actor, a.target_id AS targetId, tu.username AS target, a.action, a.metadata, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt FROM admin_audit_logs a JOIN users au ON au.id = a.actor_id JOIN users tu ON tu.id = a.target_id WHERE a.id < ? AND (${filter.sql}) ORDER BY a.id DESC LIMIT 26`,[before,...filter.params]);
  const items=rows.slice(0,25).map(r=>({...r,metadata:typeof r.metadata==='string'?JSON.parse(r.metadata):r.metadata}));return {items,next:rows.length>25?items.at(-1).id:null};
 }
 async overview(actor){
  policy.requireAccess(actor,'overview.read');
  const [rows]=await this.pool.execute("SELECT (SELECT COUNT(*) FROM users) AS trainers, (SELECT COUNT(*) FROM user_roles WHERE role <> 'trainer') AS staff, (SELECT COUNT(DISTINCT user_id) FROM user_restrictions WHERE revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)) AS restricted");
  const recent=actor.permissions.includes('audit.read')?(await this.audit(actor)).items.slice(0,6):[];
  return {...Object.fromEntries(Object.entries(rows[0]).map(([k,n])=>[k,Number(n)])),recent};
 }
 async users(actor,after=0,query=''){
  policy.requireAccess(actor,'users.read');const pattern=`%${query.replace(/[=%_]/g,'=$&')}%`;
  const [totals]=await this.pool.execute("SELECT COUNT(*) AS total FROM users WHERE username LIKE ? ESCAPE '=' OR CAST(id AS CHAR) = ?",[pattern,query]);
  const [rows]=await this.pool.execute("SELECT id, username, created_at AS createdAt FROM users WHERE id > ? AND (username LIKE ? ESCAPE '=' OR CAST(id AS CHAR) = ?) ORDER BY id LIMIT 26",[after,pattern,query]);
  const page=rows.slice(0,25),roles=new Map(),active=new Map();
  if(page.length){
   const ids=page.map(u=>u.id),placeholders=ids.map(()=>'?').join(',');
   const [assigned]=await this.pool.execute(`SELECT user_id, role, permissions_json AS permissions, version AS roleVersion FROM user_roles WHERE user_id IN (${placeholders})`,ids);
   const [restrictions]=await this.pool.execute(`SELECT ${restrictionFields} FROM user_restrictions r WHERE r.user_id IN (${placeholders}) AND r.revoked_at IS NULL AND r.expires_at > UTC_TIMESTAMP(3) ORDER BY r.id DESC`,ids);
   for(const role of assigned)roles.set(role.user_id,role);
   for(const restriction of restrictions)if(!active.has(restriction.userId))active.set(restriction.userId,restriction);
  }
  const items=page.map(row=>this.view(actor,{...row,...policy.context({...roles.get(row.id),restriction:active.get(row.id)||null})}));
  return {items,next:rows.length>25?items.at(-1).id:null,total:Number(totals[0].total)};
 }
 view(actor,target){return {id:target.id,username:target.username,createdAt:target.createdAt,role:target.role,version:target.roleVersion,restriction:target.restriction,permissions:actor.role==='owner'?[...target.permissions]:undefined,actions:policy.actions(actor,target)};}
 async record(connection,actor,target,action,metadata){await connection.execute('INSERT INTO admin_audit_logs (actor_id, target_id, target_role, action, metadata, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))',[actor.id,target.id,target.role,action,JSON.stringify(metadata)]);}
 async change(actorId,targetId,kind,value){
  const connection=await this.pool.getConnection();
  try{
   await connection.beginTransaction();if(!await this.ready(connection,true))throw unavailable();
   // Lock the shared guard before reading either authority: no absent-row promotion races.
   const actor={id:actorId,...await this.access(actorId,connection,true)},target=await this.target(connection,targetId);
   policy.change(actor,target,kind,value);
   if(value.version!==target.roleVersion)throw new HttpError(409,'This account changed. Refresh the user list before trying again.');
   if(kind==='role'){
    await connection.execute("INSERT INTO user_roles (user_id, role, permissions_json, version) VALUES (?, ?, NULL, 1) ON DUPLICATE KEY UPDATE role = VALUES(role), permissions_json = IF(? = 'owner', NULL, permissions_json), version = version + 1",[targetId,value.role,actor.role]);
    await this.record(connection,actor,target,'role.change',{from:target.role,to:value.role,reason:value.reason});
   }else if(kind==='permissions'){
    await connection.execute('UPDATE user_roles SET permissions_json = ?, version = version + 1 WHERE user_id = ?',[JSON.stringify(value.permissions),targetId]);
    await this.record(connection,actor,target,'permissions.change',{from:target.permissions,to:value.permissions,reason:value.reason});
   }else if(kind==='suspend'){
    await connection.execute('INSERT INTO user_restrictions (user_id, issued_by, reason, issued_at, expires_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), TIMESTAMPADD(HOUR, ?, UTC_TIMESTAMP(3)))',[targetId,actorId,value.reason,value.hours]);
    await this.record(connection,actor,target,'restriction.apply',{hours:value.hours,reason:value.reason});
   }else{
    if(target.restriction?.id!==value.restrictionId)throw new HttpError(409,'That restriction is no longer active. Refresh the user list.');
    await connection.execute('UPDATE user_restrictions SET revoked_at = UTC_TIMESTAMP(3), revoked_by = ?, revoke_reason = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',[actorId,value.reason,value.restrictionId,targetId]);
    await this.record(connection,actor,target,'restriction.revoke',{restrictionId:value.restrictionId,reason:value.reason});
   }
   // Bump the version on restrictions too, preventing stale changes in another tab.
   if(['suspend','revoke'].includes(kind))await connection.execute("INSERT INTO user_roles (user_id, role, permissions_json, version) VALUES (?, 'trainer', NULL, 1) ON DUPLICATE KEY UPDATE version = version + 1",[targetId]);
   const result=this.view(actor,await this.target(connection,targetId));await connection.commit();return result;
  }catch(error){await connection.rollback();if(error.code==='ER_NO_SUCH_TABLE')throw unavailable();throw error;}finally{connection.release();}
 }
 async bootstrapOwner(userId){
  const connection=await this.pool.getConnection();
  try{
   await connection.beginTransaction();if(!await this.ready(connection,true))throw unavailable();
   const [owners]=await connection.execute("SELECT user_id FROM user_roles WHERE role = 'owner'");if(owners.length)throw new HttpError(409,'An Owner already exists. Bootstrap cannot replace or add an Owner.');
   const target=await this.target(connection,userId);if(target.restriction)throw new HttpError(409,'Revoke the selected account restriction before bootstrap.');
   await connection.execute("INSERT INTO user_roles (user_id, role, permissions_json, version) VALUES (?, 'owner', NULL, 1) ON DUPLICATE KEY UPDATE role = 'owner', permissions_json = NULL, version = version + 1",[userId]);
   await this.record(connection,{id:userId},target,'owner.bootstrap',{source:'explicit-local-command',to:'owner'});await connection.commit();return {id:userId,username:target.username,role:'owner'};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 }
}
module.exports={AdminRepository};
