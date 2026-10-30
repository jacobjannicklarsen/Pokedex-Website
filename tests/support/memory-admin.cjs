// Test adapter only. Production authorization/policy is shared; persistence is MySQL.
const policy=require('../../server/authorization'),{HttpError}=require('../../server/validation');
class MemoryAdmin{
 constructor(repo){this.repo=repo;this.roles=new Map();this.restrictions=[];this.logs=[];this.available=true;this.sequence=0;this.tail=Promise.resolve();this.failAudit=false;}
 async access(id){return policy.context({...this.roles.get(id),available:this.available,restriction:this.restrictions.find(r=>r.userId===id&&!r.revokedAt&&Date.parse(r.expiresAt)>Date.now())||null});}
 async target(id){const user=await this.repo.user(id);if(!user)throw new HttpError(404,'Trainer not found.');return {id,username:user.username,createdAt:user.created_at,...await this.access(id)};}
 view(actor,target){return require('../../server/admin-repository').AdminRepository.prototype.view.call(this,actor,target);}
 async audit(actor,before=Number.MAX_SAFE_INTEGER){policy.requireAccess(actor,'audit.read');const permitted=this.logs.filter(r=>r.id<before&&(actor.permissions.includes('audit.all')||actor.role==='administrator'&&['role.change','restriction.apply','restriction.revoke'].includes(r.action)&&['trainer','moderator'].includes(r.targetRole)||actor.role==='moderator'&&r.actorId===actor.id)).sort((a,b)=>b.id-a.id);return {items:structuredClone(permitted.slice(0,25)),next:permitted.length>25?permitted[24].id:null};}
 async overview(actor){policy.requireAccess(actor,'overview.read');return {trainers:this.repo.users.length,staff:[...this.roles.values()].filter(r=>r.role!=='trainer').length,restricted:new Set(this.restrictions.filter(r=>!r.revokedAt&&Date.parse(r.expiresAt)>Date.now()).map(r=>r.userId)).size,recent:actor.permissions.includes('audit.read')?(await this.audit(actor)).items.slice(0,6):[]};}
 async users(actor,after=0,query=''){policy.requireAccess(actor,'users.read');const all=this.repo.users.filter(u=>u.username.toLowerCase().includes(query.toLowerCase())||String(u.id)===query),rows=all.filter(u=>u.id>after).sort((a,b)=>a.id-b.id);return {items:await Promise.all(rows.slice(0,25).map(async u=>this.view(actor,await this.target(u.id)))),next:rows.length>25?rows[24].id:null,total:all.length};}
 record(actor,target,action,metadata){if(this.failAudit)throw Error('Fixture audit storage failure');this.logs.push({id:++this.sequence,actorId:actor.id,actor:this.repo.users.find(u=>u.id===actor.id)?.username,targetId:target.id,target:target.username,targetRole:target.role,action,metadata:structuredClone(metadata),createdAt:new Date().toISOString()});}
 async atomic(operation){const prior=this.tail;let release;this.tail=new Promise(r=>{release=r;});await prior;const snapshot=structuredClone({roles:this.roles,restrictions:this.restrictions,logs:this.logs,sequence:this.sequence,users:this.repo.users,settings:this.repo.enhancements.store.base.data.settings});try{return await operation();}catch(error){this.repo.users=snapshot.users;this.repo.enhancements.store.base.data.settings=snapshot.settings;delete snapshot.users;delete snapshot.settings;Object.assign(this,snapshot);throw error;}finally{release();}}
 async change(actorId,targetId,kind,value){return this.atomic(async()=>{
  const actor={id:actorId,...await this.access(actorId)},target=await this.target(targetId);policy.change(actor,target,kind,value);if(value.version!==target.roleVersion)throw new HttpError(409,'This account changed. Refresh the user list before trying again.');
  const role={role:target.role,permissions:this.roles.get(targetId)?.permissions??null,roleVersion:target.roleVersion+1};
  if(kind==='password'||kind==='username'){
   if((await this.repo.user(actorId)).password_hash!==value.actorHash)throw new HttpError(409,'Your credentials changed.');
   const settings=await this.repo.enhancements.settings.owned(this.repo.enhancements.store,targetId);
   await this.repo.enhancements.store.update('settings',settings.id,{securityVersion:settings.securityVersion+1});
   if(kind==='username'){
    if(target.username===value.newUsername)throw new HttpError(400,'Choose a different username.');
    if(this.repo.users.some(u=>u.id!==targetId&&u.username.toLowerCase()===value.newUsername.toLowerCase()))throw new HttpError(409,'That username is already taken.');
    this.repo.users.find(u=>u.id===targetId).username=value.newUsername;
    this.record(actor,target,'username.change',{from:target.username,to:value.newUsername,reason:value.reason,sessionsRevoked:true});
   }else{
    this.repo.users.find(u=>u.id===targetId).password_hash=value.hash;
    this.record(actor,target,'password.change',{reason:value.reason,sessionsRevoked:true});
   }
  }
  if(kind==='role'){role.role=value.role;if(actor.role==='owner')role.permissions=null;this.record(actor,target,'role.change',{from:target.role,to:value.role,reason:value.reason});}
  if(kind==='permissions'){role.permissions=[...value.permissions];this.record(actor,target,'permissions.change',{from:target.permissions,to:value.permissions,reason:value.reason});}
  if(kind==='suspend'){const restriction={id:++this.sequence,userId:targetId,issuedBy:actorId,reason:value.reason,expiresAt:new Date(Date.now()+value.hours*3600000).toISOString()};this.restrictions.push(restriction);this.record(actor,target,'restriction.apply',{hours:value.hours,reason:value.reason});}
  if(kind==='revoke'){if(target.restriction?.id!==value.restrictionId)throw new HttpError(409,'That restriction is no longer active.');target.restriction.revokedAt=new Date().toISOString();target.restriction.revokedBy=actorId;this.record(actor,target,'restriction.revoke',{restrictionId:value.restrictionId,reason:value.reason});}
  this.roles.set(targetId,role);return this.view(actor,await this.target(targetId));
 });}
 async bootstrapOwner(id){return this.atomic(async()=>{if(!this.available)throw new HttpError(503,'Administration requires the manual v0.6.2 migration.');if([...this.roles.values()].some(r=>r.role==='owner'))throw new HttpError(409,'An Owner already exists.');const target=await this.target(id);if(target.restriction)throw new HttpError(409,'Revoke the restriction first.');this.roles.set(id,{role:'owner',permissions:null,roleVersion:target.roleVersion+1});this.record({id},target,'owner.bootstrap',{source:'explicit-local-command',to:'owner'});return {id,username:target.username,role:'owner'};});}
}
module.exports={MemoryAdmin};
