'use strict';
const {rateLimit}=require('express-rate-limit'),v=require('./validation'),f=require('./forum-validation');
function routes(app,repo,publicOnly=false){
 const service=()=>{if(!repo.forums)throw new v.HttpError(503,'Forums require the manual database/MIGRATION_v0.7.0.md upgrade.');return repo.forums;};
 const handle=fn=>async(req,res)=>{try{const forums=service();await forums.store.ready();res.json(await fn(forums,req));}catch(e){if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code))throw new v.HttpError(503,'Forums require the complete manual database/MIGRATION_v0.7.0.md upgrade, including v0.6.2 prerequisites.');throw e;}};
 const page=req=>req.query.page===undefined?1:v.id(req.query.page,10000);
 if(publicOnly){
  app.use('/api/forums',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many forum requests. Please wait a minute.'}}));
  app.get('/api/forums/categories',handle(s=>s.categories()));
  app.get('/api/forums/threads',handle((s,r)=>s.list(f.query(r.query))));
  app.get('/api/forums/threads/:id',handle(async(s,r)=>{let id=r.session.userId||null;if(id){const a=await repo.administration.access(id);if(a.restriction)id=null;}return s.discussion(v.id(r.params.id),page(r),id,r.query.post===undefined?null:v.id(r.query.post));}));return;
 }
 app.use(['/api/forums','/api/notifications','/api/admin/forums'],rateLimit({windowMs:60000,limit:60,skip:r=>r.method==='GET',standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many forum changes. Please wait a minute.'}}));
 app.post('/api/forums/threads',handle((s,r)=>s.create(r.user.id,f.thread(r.body))));
 app.patch('/api/forums/threads/:id',handle((s,r)=>{f.fields(r.body,['title','version']);return s.editTitle(r.user.id,v.id(r.params.id),v.text(r.body.title,'Discussion title',3,120),v.id(r.body.version));}));
 app.post('/api/forums/threads/:id/posts',handle((s,r)=>s.reply(r.user.id,v.id(r.params.id),f.post(r.body))));
 app.patch('/api/forums/posts/:id',handle((s,r)=>s.edit(r.user.id,v.id(r.params.id),f.post(r.body,true))));
 app.delete('/api/forums/posts/:id',handle((s,r)=>{f.fields(r.body,['version']);return s.remove(r.user.id,v.id(r.params.id),v.id(r.body.version));}));
 for(const [part,kind]of [['posts','reactions'],['threads','subscriptions']])for(const method of ['put','delete'])app[method](`/api/forums/${part}/:id/${kind==='reactions'?'reaction':'follow'}`,handle((s,r)=>s.toggle(r.user.id,v.id(r.params.id),kind,method==='put')));
 app.post('/api/forums/threads/:id/reports',handle((s,r)=>{f.fields(r.body,['postId','reason'],['reason']);return s.report(r.user.id,v.id(r.params.id),r.body.postId==null?null:v.id(r.body.postId),v.text(r.body.reason,'Report reason',5,500));}));
 app.get('/api/notifications',handle((s,r)=>s.notifications(r.user.id,page(r))));
 app.put('/api/notifications/:id/read',handle((s,r)=>s.read(r.user.id,v.id(r.params.id))));
 app.get('/api/admin/forums/reports',handle((s,r)=>s.moderation(r.user.id,page(r))));
 app.get('/api/admin/forums/history',handle((s,r)=>s.history(r.user.id,page(r))));
 app.get('/api/admin/forums/threads/:id',handle((s,r)=>s.staffDiscussion(r.user.id,v.id(r.params.id),page(r))));
 app.post('/api/admin/forums/moderate',handle((s,r)=>{f.fields(r.body,['threadId','postId','action','value','reason','version','reportId'],['threadId','action','reason','version']);const b=r.body;if(!['hide','restore','remove','lock','pin','resolve'].includes(b.action))v.fail('Choose a supported moderation action.');if(['lock','pin'].includes(b.action)&&typeof b.value!=='boolean')v.fail('Send a true/false action value.');if(!['lock','pin'].includes(b.action)&&b.value!=null)v.fail('This action has no switch value.');if(b.action==='resolve'&&b.reportId==null)v.fail('Choose a report to resolve.');return s.moderate(r.user.id,{threadId:v.id(b.threadId),postId:b.postId==null?null:v.id(b.postId),reportId:b.reportId==null?null:v.id(b.reportId),action:b.action,value:b.value??null,reason:v.text(b.reason,'Moderation reason',5,500),version:v.id(b.version)});}));
 app.post('/api/admin/forums/categories',handle((s,r)=>s.saveCategory(r.user.id,null,f.category(r.body))));
 app.put('/api/admin/forums/categories/:id',handle((s,r)=>s.saveCategory(r.user.id,v.id(r.params.id),f.category(r.body))));
}
module.exports={routes};
