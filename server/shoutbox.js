'use strict';
const v=require('./validation'),policy=require('./authorization'),{fields}=require('./forum-validation');
const missing=()=>new v.HttpError(503,'The Shoutbox needs the manual database/migrations/v0.7.2-shoutbox.sql migration.');
function cooldownSeconds(rows,now=Date.now()){
 const times=rows.map(row=>+new Date(row.createdAt)).sort((a,b)=>a-b);let until=0,window=[];
 for(const time of times){if(time<until)continue;window=window.filter(previous=>time-previous<10000);window.push(time);if(window.length>=4){until=time+30000;window=[];}}
 return Math.max(0,Math.ceil((until-now)/1000));
}
class Shoutbox {
 constructor(repo,store){this.repo=repo;this.store=store;}
 async read(query,viewer=null){
  const allowed=['before','limit','ids'];if(Object.keys(query).some(k=>!allowed.includes(k)))v.fail('Invalid Shoutbox query.');
  const before=query.before===undefined?4294967296:v.id(query.before),limit=query.limit===undefined?30:v.id(query.limit,50);
  const ids=query.ids?String(query.ids).split(',').map(n=>v.id(n)):[];if(ids.length>200)v.fail('Too many message IDs.');
  const rows=await this.store.list(before,limit+1),access=viewer?{id:viewer,...await this.repo.administration.access(viewer)}:null;
  const items=await Promise.all(rows.slice(0,limit).map(async row=>{
   const author=await this.repo.forums.author(row.userId),target=await this.repo.administration.access(row.userId);
   return{id:row.id,message:row.message,createdAt:row.createdAt,author,canRemove:Boolean(access?.available&&!access.restriction&&access.permissions.includes('panel.access')&&access.permissions.includes('forums.moderate')&&(viewer===row.userId||policy.levels[access.role]>policy.levels[target.role]))};
  }));
  return{items:items.reverse(),next:rows.length>limit?rows[limit-1].id:null,deletedIds:ids.length?await this.store.deleted(ids):[],maxLength:500,cooldownSeconds:viewer?cooldownSeconds(await this.store.recent(viewer)):0};
 }
 async post(userId,body){
  fields(body,['message']);const message=v.text(typeof body.message==='string'?body.message.normalize('NFC'):body.message,'Message',1,500);
  return this.store.atomic(async s=>{
   const actor=await s.access(userId);if(!actor.available)throw missing();if(actor.restriction)throw new v.HttpError(403,'Your account is temporarily suspended.');
   const recent=await s.recent(userId),now=Date.now();
   const remaining=cooldownSeconds(recent,now);if(remaining){const error=new v.HttpError(429,'A quick pause: try again in '+remaining+' seconds.');error.code='SHOUTBOX_COOLDOWN';error.retryAfterSeconds=remaining;throw error;}
   if(recent.some(r=>r.message===message&&now-+new Date(r.createdAt)<300000))throw new v.HttpError(409,'You already sent that message.');
   return{id:await s.insert(userId,message),cooldownSeconds:cooldownSeconds([...recent,{createdAt:new Date(now)}],now)};
  });
 }
 async remove(userId,id,body){
  fields(body,['reason']);const reason=v.text(body.reason,'Reason',5,300);
  return this.store.atomic(async s=>{
   const actor={id:userId,...await s.access(userId)};policy.requireAccess(actor,'forums.moderate');
   const row=await s.get(id);if(!row||row.deletedAt)throw new v.HttpError(404,'Message unavailable.');
   const target=await s.access(row.userId);
   if(userId!==row.userId&&policy.levels[actor.role]<=policy.levels[target.role])throw new v.HttpError(403,'You cannot moderate an account with equal or higher authority.');
   await s.remove(id,userId);await s.record(userId,row.userId,id,reason);return{removed:true};
  });
 }
}
class ShoutboxStore {
 constructor(pool,repo,connection=null){Object.assign(this,{pool,repo,connection});}
 get db(){return this.connection||this.pool;}
 async list(before,limit){const [r]=await this.db.execute('SELECT id,user_id AS userId,message,UNIX_TIMESTAMP(created_at)*1000 AS createdAtEpoch FROM shoutbox_messages WHERE deleted_at IS NULL AND id < ? ORDER BY id DESC LIMIT ?',[before,limit]);return r.map(({createdAtEpoch,...row})=>({...row,createdAt:new Date(Number(createdAtEpoch))}));}
 async deleted(ids){const [r]=await this.db.execute(`SELECT id FROM shoutbox_messages WHERE deleted_at IS NOT NULL AND id IN (${ids.map(()=>'?').join(',')})`,ids);return r.map(r=>r.id);}
 async atomic(fn){const c=await this.pool.getConnection();try{await c.beginTransaction();if(!await this.repo.administration.ready(c,true))throw missing();const value=await fn(new ShoutboxStore(this.pool,this.repo,c));await c.commit();return value;}catch(e){await c.rollback();throw e;}finally{c.release();}}
 async access(id){return this.repo.administration.access(id,this.db,true);}
 async recent(id){const [r]=await this.db.execute('SELECT message,UNIX_TIMESTAMP(created_at)*1000 AS createdAtEpoch FROM shoutbox_messages WHERE user_id=? AND created_at>CURRENT_TIMESTAMP(3)-INTERVAL 5 MINUTE ORDER BY id DESC',[id]);return r.map(({createdAtEpoch,...row})=>({...row,createdAt:new Date(Number(createdAtEpoch))}));}
 async insert(id,message){const [r]=await this.db.execute('INSERT INTO shoutbox_messages (user_id,message) VALUES (?,?)',[id,message]);return r.insertId;}
 async get(id){const [r]=await this.db.execute('SELECT id,user_id AS userId,deleted_at AS deletedAt FROM shoutbox_messages WHERE id=? FOR UPDATE',[id]);return r[0];}
 async remove(id,actor){await this.db.execute('UPDATE shoutbox_messages SET deleted_at=UTC_TIMESTAMP(3),deleted_by=? WHERE id=? AND deleted_at IS NULL',[actor,id]);}
 async record(actor,target,id,reason){await this.db.execute("INSERT INTO forum_audit_logs (actor_id,target_user_id,action,reason,metadata) VALUES (?,?,'shoutbox.remove',?,?)",[actor,target,reason,JSON.stringify({messageId:id})]);}
}
function routes(app,repo,publicOnly=false){
 const {rateLimit}=require('express-rate-limit');
 const wrap=fn=>async(req,res)=>{try{if(!repo.shoutbox)throw missing();res.json(await fn(req));}catch(e){if(e.code==='SHOUTBOX_COOLDOWN'){res.set('Retry-After',String(e.retryAfterSeconds)).status(429).json({error:e.message,code:e.code,retryAfterSeconds:e.retryAfterSeconds});return;}if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code))throw missing();throw e;}};
 if(publicOnly){app.get('/api/shoutbox/messages',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}),wrap(req=>repo.shoutbox.read(req.query,req.session?.userId)));return;}
 app.post('/api/shoutbox/messages',wrap(req=>repo.shoutbox.post(req.user.id,req.body)));
 app.delete('/api/shoutbox/messages/:id',policy.authorize('forums.moderate'),wrap(req=>repo.shoutbox.remove(req.user.id,v.id(req.params.id),req.body)));
}
module.exports={Shoutbox,ShoutboxStore,routes};
