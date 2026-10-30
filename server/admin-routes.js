'use strict';
const {rateLimit}=require('express-rate-limit'),v=require('./validation');
const policy=require('./authorization'),{mutation}=require('./admin-validation');
function routes(app,repo){
 const argon2=require('argon2');
 const passwordLimit=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many password change attempts. Please wait 15 minutes.'}});
 const usernameLimit=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many username change attempts. Please wait 15 minutes.'}});
 app.use('/api/admin',rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many administration requests. Please wait a minute.'}}));
 app.get('/api/admin/context',policy.authorize('panel.access'),(req,res)=>res.json({role:req.staff.role,permissions:req.staff.permissions,moderatorMaxHours:24,staffMaxHours:720}));
 app.get('/api/admin/overview',policy.authorize('overview.read'),async(req,res)=>res.json(await repo.administration.overview(req.staff)));
 app.get('/api/admin/users',policy.authorize('users.read'),async(req,res)=>res.json(await repo.administration.users(req.staff,req.query.after===undefined?0:v.id(req.query.after),v.text(req.query.q??'','User search',0,64))));
 app.get('/api/admin/audit',policy.authorize('audit.read'),async(req,res)=>res.json(await repo.administration.audit(req.staff,req.query.before===undefined?Number.MAX_SAFE_INTEGER:v.id(req.query.before))));
 app.post('/api/admin/users/:id/password',policy.authorize('passwords.manage'),passwordLimit,async(req,res)=>{
  const targetId=v.id(req.params.id),value=mutation('password',req.body);
  const owner=await repo.findLogin(req.user.username);
  if(!owner||!await argon2.verify(owner.password_hash,value.currentPassword))throw new v.HttpError(403,'Your current password is incorrect.');
  const hash=await argon2.hash(value.newPassword,{type:argon2.argon2id});
  const user=await repo.administration.change(req.user.id,targetId,'password',{version:value.version,reason:value.reason,hash,actorHash:owner.password_hash});
  res.json({user});
 });
 app.post('/api/admin/users/:id/username',policy.authorize('usernames.manage'),usernameLimit,async(req,res)=>{
  const targetId=v.id(req.params.id),value=mutation('username',req.body),owner=await repo.findLogin(req.user.username);
  if(!owner||!await argon2.verify(owner.password_hash,value.currentPassword))throw new v.HttpError(403,'Your current password is incorrect.');
  const user=await repo.administration.change(req.user.id,targetId,'username',{version:value.version,reason:value.reason,newUsername:value.newUsername,actorHash:owner.password_hash});res.json({user});
 });
 for(const [kind,path]of Object.entries({role:'role',permissions:'permissions',suspend:'restrictions',revoke:'restrictions/revoke'})){
  const permission={role:'roles.manage',permissions:'permissions.manage',suspend:'restrictions.apply',revoke:'restrictions.revoke'}[kind];
  app.post(`/api/admin/users/:id/${path}`,policy.authorize(permission),async(req,res)=>{
   const user=await repo.administration.change(req.user.id,v.id(req.params.id),kind,mutation(kind,req.body));res.json({user});
  });
 }
}
module.exports={routes};
