'use strict';
const {rateLimit}=require('express-rate-limit'),v=require('./validation');
const policy=require('./authorization'),{mutation}=require('./admin-validation');
function routes(app,repo){
 app.use('/api/admin',rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many administration requests. Please wait a minute.'}}));
 app.get('/api/admin/context',policy.authorize('panel.access'),(req,res)=>res.json({role:req.staff.role,permissions:req.staff.permissions,moderatorMaxHours:24,staffMaxHours:720}));
 app.get('/api/admin/overview',policy.authorize('overview.read'),async(req,res)=>res.json(await repo.administration.overview(req.staff)));
 app.get('/api/admin/users',policy.authorize('users.read'),async(req,res)=>res.json(await repo.administration.users(req.staff,req.query.after===undefined?0:v.id(req.query.after),v.text(req.query.q??'','User search',0,64))));
 app.get('/api/admin/audit',policy.authorize('audit.read'),async(req,res)=>res.json(await repo.administration.audit(req.staff,req.query.before===undefined?Number.MAX_SAFE_INTEGER:v.id(req.query.before))));
 for(const [kind,path]of Object.entries({role:'role',permissions:'permissions',suspend:'restrictions',revoke:'restrictions/revoke'})){
  const permission={role:'roles.manage',permissions:'permissions.manage',suspend:'restrictions.apply',revoke:'restrictions.revoke'}[kind];
  app.post(`/api/admin/users/:id/${path}`,policy.authorize(permission),async(req,res)=>{
   const user=await repo.administration.change(req.user.id,v.id(req.params.id),kind,mutation(kind,req.body));res.json({user});
  });
 }
}
module.exports={routes};
