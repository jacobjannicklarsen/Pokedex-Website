const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const session=require('express-session'),{createApp}=require('../../server/app'),{MemoryRepository}=require('./memory-repository.cjs');
module.exports=async (t,overrides={})=>{
 const repo=new MemoryRepository(),store=new session.MemoryStore(),uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'dexhaven-admin-test-'));
 const config={origin:'http://localhost',uploadDir,production:false,secret:'admin-fixture-only-secret-'.repeat(4),...overrides};
 const app=await createApp({repo,store,config});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;if(overrides.fixtureLocalOrigin)config.origin=base;
 t.after(async()=>{await new Promise(r=>server.close(r));store.clear(()=>{});if(path.dirname(path.resolve(uploadDir))!==path.resolve(os.tmpdir())||!path.basename(uploadDir).startsWith('dexhaven-admin-test-'))throw Error('Unexpected temporary path');await fs.rm(uploadDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
 function client(){let cookie='',csrf='';return {async call(url,{method='GET',body,headers={},raw=false,form}={}){const r=await fetch(base+url,{method,headers:{Cookie:cookie,...(method!=='GET'?{'X-CSRF-Token':csrf}:{}),...(body&&!form?{'Content-Type':'application/json'}:{}),...headers},body:form||(body?JSON.stringify(body):undefined)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=raw?await r.text():r.status===204?{}:await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,data};}};}
 async function register(name){const c=client();await c.call('/api/auth/session');const result=await c.call('/api/auth/register',{method:'POST',body:{username:name,email:`${name}@example.test`,password:'staff security test password'}});if(result.status!==201)throw Error(JSON.stringify(result));return {c,user:result.data.user};}
 return {repo,client,register,uploadDir,base};
};
