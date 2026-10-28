// Isolated Firefox BiDi visual checks. No real MySQL, existing browser profile or uploads.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),sharp=require('sharp');
const {createApp}=require('../server/app'),{MemoryRepository}=require('./support/memory-repository.cjs');
const {createPokeFixture}=require('./support/pokeapi-fixture.cjs');
const session=require('express-session'),config=require('../trainer-card-config'),privacy=require('../server/community');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dexhaven-firefox-')),uploadDir=path.join(temp,'avatars');
const output=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'dexhaven-v061-firefox');
let browser,socket,server;const pending=new Map();let seq=0;
async function main(){
 const executable=process.env.FIREFOX_PATH||'C:/Program Files/Mozilla Firefox/firefox.exe';if(!fs.existsSync(executable))throw Error('Firefox is unavailable. Set FIREFOX_PATH.');
 server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const repo=new MemoryRepository(),app=await createApp({repo,store:new session.MemoryStore(),config:{origin,uploadDir,production:false,secret:'firefox-fixture-secret-'.repeat(4)}});
 server.on('request',(req,res)=>{
  const file=req.url.match(/^\/qa-sprite\/(9|151|649)-(animated|static|party)\.(gif|png)$/);
  if(file){res.setHeader('Content-Type',file[3]==='gif'?'image/gif':'image/png');fs.createReadStream(path.join(__dirname,'fixtures/sprites',file[0].split('/').pop())).pipe(res);return;}
  app(req,res);
 });
 const user=await repo.createUser({username:'firefox_trainer',email:'firefox@example.test'},await require('argon2').hash('firefox secure password'));
 const avatar='34567890-1234-4123-8123-123456789abc.webp';fs.mkdirSync(uploadDir,{recursive:true});fs.writeFileSync(path.join(uploadDir,avatar),await sharp({create:{width:180,height:300,channels:3,background:'#ee9955'}}).webp().toBuffer());await repo.updateAvatar(user.id,avatar);
 await repo.administration.bootstrapOwner(user.id);
 for(let id=1;id<=25;id++)await repo.progression.set(user.id,id,'caught');
 const adminTarget=await repo.createUser({username:'firefox_target',email:'private-target@example.test'},'fixture-only');
 await repo.updateBio(user.id,'A Firefox trainer biography for independent hover hitbox checks.');
 await repo.community.saveSettings(user.id,{...privacy.defaults(),enabled:true,shareAvatar:true,shareBio:true,featuredPokemonId:151});
 await repo.community.saveDecoration(user.id,{...config.defaults(),palette:'violet',pattern:'nebula',frame:'hexagon',effect:'sparkles',accentColor:'#89c9ff',frameColor:'#e6b776',borderColor:'#d0ac63',title:'Across every region'});
 const profileDir=path.join(temp,'profile');fs.mkdirSync(profileDir);
 const reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const bidiPort=reservation.address().port;await new Promise(r=>reservation.close(r));
 browser=spawn(executable,['-wait-for-browser','--headless','--no-remote','--profile',profileDir,'--remote-debugging-port',String(bidiPort),'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let endpoint='',launchError,logs='';browser.on('error',e=>{launchError=e;});
 browser.stdout.on('data',chunk=>{logs+=String(chunk);});browser.stderr.on('data',chunk=>{logs+=String(chunk);});
 for(let i=0;i<150&&!endpoint;i++){
  if(launchError)throw launchError;
  try{await fetch(`http://127.0.0.1:${bidiPort}/`,{signal:AbortSignal.timeout(250)});endpoint=`ws://127.0.0.1:${bidiPort}/session`;}catch{await sleep(100);}
 }assert.ok(endpoint,'Firefox BiDi did not start: '+logs.slice(-2000));
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.type==='error'?p.reject(Error(JSON.stringify(message))):p.resolve(message.result);});
 async function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('BiDi timeout '+method));},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
 await send('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:false}}});
 const {contexts}=await send('browsingContext.getTree');const context=contexts[0].context;
 async function evaluate(expression){const r=await send('script.evaluate',{expression:`(async()=>JSON.stringify((await (${expression}))??null))()`,target:{context},awaitPromise:true});if(r.type==='exception')throw Error(JSON.stringify(r.exceptionDetails));return JSON.parse(r.result.value);}
 async function wait(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await sleep(50);}throw Error('Timed out '+expression);}
 await send('script.addPreloadScript',{functionDeclaration:`()=>{
   const fixture=(${createPokeFixture.toString()})();const original=fetch;
   window.fetch=async(url,options)=>String(url).startsWith('https://pokeapi.co/api/v2/')?{ok:true,json:async()=>fixture.response(url)}:original(url,options);
   const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{get:src.get,set(value){if(String(value).includes('raw.githubusercontent.com')){const id=String(value).match(/\/(9|151|649)\.(gif|png)$/)?.[1];const kind=String(value).includes('/icons/')?'party':String(value).includes('/animated/')?'animated':'static';value=id?'/qa-sprite/'+id+'-'+kind+(kind==='animated'?'.gif':'.png'):'/artwork-fallback.svg';}src.set.call(this,value);}});
 }`});
 await send('browsingContext.navigate',{context,url:origin+'/index.html',wait:'interactive'});
 await wait(`document.querySelector('#guest-actions')?.hidden===false`);
 assert.equal(await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();return(await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},body:JSON.stringify({identifier:'firefox_trainer',password:'firefox secure password'})})).status})()`),200);
 fs.mkdirSync(output,{recursive:true});let checks=0;
 for(const [route,selector]of [['trainers.html#view=profile','.decoration-preview'],['community.html','.trainer-directory-card'],['trainer/firefox_trainer','.public-profile-hero']]){
  await send('browsingContext.navigate',{context,url:origin+'/'+route,wait:'interactive'});await wait(`document.querySelector('${selector}')?.dataset.frame==='hexagon'`);
  for(const theme of ['dark','light'])for(const width of [375,1280]){
   await send('browsingContext.setViewport',{context,viewport:{width,height:1000},devicePixelRatio:1});
   await evaluate(`(()=>{localStorage.setItem('pokedex-theme','${theme}');document.documentElement.dataset.theme='${theme}';document.querySelector('${selector}').scrollIntoView({behavior:'instant',block:'center'});})()`);await sleep(300);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   assert.equal(await evaluate(`document.querySelectorAll('${selector} .card-finish svg').length`),8);
   assert.match(await evaluate(`getComputedStyle(document.querySelector('${selector} .trainer-avatar')).clipPath`),/polygon/);
   assert.equal(await evaluate(`getComputedStyle(document.querySelector('${selector} .trainer-avatar')).objectFit`),'cover');
   assert.equal(await evaluate(`getComputedStyle(document.querySelector('${selector} .card-finish')).pointerEvents`),'none');
   if(route==='community.html'){
    assert.equal(await evaluate(`document.querySelector('.directory-name-link').dataset.staffNameRole`),'owner');assert.equal(await evaluate(`document.querySelectorAll('.directory-name-link .staff-name-star svg').length`),4);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.directory-profile-link'),'::after').content`),'none');
    const before=await evaluate(`(()=>{const c=document.querySelector('.trainer-directory-card'),r=c.getBoundingClientRect(),b=c.querySelector('.directory-card-bio').getBoundingClientRect();return{top:r.top,width:r.width,height:r.height,x:Math.round(b.x+20),y:Math.round(b.y+10)}})()`);
    await send('input.performActions',{context,actions:[{type:'pointer',id:'community-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:before.x,y:before.y,origin:'viewport',duration:0}]}]});await sleep(220);
    const after=await evaluate(`(()=>{const c=document.querySelector('.trainer-directory-card'),r=c.getBoundingClientRect();return{top:r.top,width:r.width,height:r.height}})()`);assert.deepEqual(after,{top:before.top,width:before.width,height:before.height});
    assert.equal(await evaluate(`document.elementFromPoint(${before.x},${before.y}).closest('a')`),null);
   }
   const shot=await send('browsingContext.captureScreenshot',{context,origin:'viewport',format:{type:'image/png'}});fs.writeFileSync(path.join(output,`${route.split(/[\/#]/)[0]}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));checks++;
  }
  if(route.startsWith('trainers')){
   for(const effect of ['none','shimmer','sparkles']){await evaluate(`document.querySelector('.decoration-form [name="effect"][value="${effect}"]').click()`);assert.equal(await evaluate(`document.querySelectorAll('.decoration-preview .card-finish').length`),effect==='none'?0:1);}
  }
 }
 await send('browsingContext.navigate',{context,url:origin+'/admin.html',wait:'interactive'});await wait(`document.querySelectorAll('.admin-overview article').length===3`);
 for(const theme of ['dark','light'])for(const width of [375,1280]){
  await send('browsingContext.setViewport',{context,viewport:{width,height:1000},devicePixelRatio:1});await evaluate(`(()=>{document.documentElement.dataset.theme='${theme}';document.querySelector('[data-admin-tab="overview"]').click();})()`);await wait(`document.querySelectorAll('.admin-overview article').length===3`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);checks++;
  await evaluate(`document.querySelector('[data-admin-tab="users"]').click()`);await wait(`document.querySelectorAll('.admin-user').length===2`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);checks++;
  await evaluate(`[...document.querySelectorAll('.admin-user[data-user-id="${adminTarget.id}"] button')].find(b=>b.textContent==='Suspend').click()`);await wait(`document.querySelector('.admin-dialog')?.open===true`);assert.equal(await evaluate('document.activeElement.name'),'hours');assert.equal(await evaluate(`document.querySelector('.admin-dialog').getBoundingClientRect().right<=innerWidth`),true);checks++;
  await sleep(250);const shot=await send('browsingContext.captureScreenshot',{context,origin:'viewport',format:{type:'image/png'}});fs.writeFileSync(path.join(output,`admin-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));await evaluate(`document.querySelector('.admin-form button[type="button"]').click()`);
 }
 const forumThread=await repo.forums.create(user.id,{categoryId:2,title:'Firefox community discussion',body:'A shared strategy [[pokemon:151]]',teamShareId:null,quotePostId:null});
 for(const [route,ready]of [['forums.html',`document.querySelector('.forum-thread-card')`],['forums.html#thread='+forumThread.id,`document.querySelector('.forum-post')`],['battle.html',`document.querySelector('#battle-start')`]]){
  await send('browsingContext.navigate',{context,url:origin+'/'+route,wait:'interactive'});await wait(ready);
  for(const theme of ['dark','light'])for(const width of [375,1280]){await send('browsingContext.setViewport',{context,viewport:{width,height:1000},devicePixelRatio:1});await evaluate(`document.documentElement.dataset.theme='${theme}'`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,route+' '+width+' '+theme);await sleep(250);const shot=await send('browsingContext.captureScreenshot',{context,origin:'viewport',format:{type:'image/png'}});fs.writeFileSync(path.join(output,`v070-${route.split(/[.#]/)[0]}-${route.includes('thread')?'thread-':''}${theme}-${width}.png`),Buffer.from(shot.data,'base64'));checks++;}
  if(route==='battle.html'){await evaluate(`(()=>{Math.random=()=>.5;document.querySelector('#battle-start').click();document.querySelector('.battle-move-button').click()})()`);await wait(`document.querySelector('.battle-turn').textContent==='Turn 1'`);await evaluate(`(()=>{document.querySelector('[data-battle-mode=auto]').click();document.querySelector('#battle-start').click();document.querySelector('#battle-pause').click()})()`);await sleep(950);assert.equal(await evaluate(`document.querySelector('.battle-turn').textContent`),'Turn 0');await evaluate(`document.querySelector('#battle-pause').click()`);await wait(`document.querySelector('.battle-turn').textContent!=='Turn 0'`);await evaluate(`document.querySelector('#battle-pause').click()`);checks++;}
 }
 console.log(`PASS Firefox: ${checks}/37 checks; shared pages, Forums, Battle Arena, mobile/desktop themes and manual/auto battle controls. Screenshots: ${output}`);
 await send('browser.close');
 await Promise.race([new Promise(r=>browser.once('exit',r)),sleep(3000)]);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(socket?.readyState===WebSocket.OPEN)socket.close();if(browser&&browser.exitCode===null){browser.kill();await Promise.race([new Promise(r=>browser.once('exit',r)),sleep(3000)]);}server?.close();
 if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('dexhaven-firefox-'))throw Error('Unexpected temporary path');
 try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{console.log('Temporary Firefox profile retained: '+temp);}
});
