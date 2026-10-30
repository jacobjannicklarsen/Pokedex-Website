const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
async function seed(repo,uploadDir){
 const crypto=require('node:crypto'),sharp=require('sharp'),privacy=require('../../server/community'),decoration=require('../../trainer-card-config');
 let ownerId=[...repo.administration.roles].find(([,r])=>r.role==='owner')?.[0],owner=ownerId?await repo.user(ownerId):await repo.createUser({username:'polish_owner',email:'community-owner@example.test'},'fixture-only');
 if(!ownerId)await repo.administration.bootstrapOwner(owner.id);
 const users=[{...owner,expectedRole:'owner'}];
 for(const role of ['administrator','moderator','trainer']){const user=await repo.createUser({username:({administrator:'polish_admin',moderator:'polish_mod',trainer:'polish_trainer'})[role],email:`community-${role}@example.test`},'fixture-only');if(role!=='trainer')await repo.administration.change(owner.id,user.id,'role',{role,version:0,reason:'Community visual test fixture'});users.push({...user,expectedRole:role});}
 for(const [i,user]of users.entries()){
  const filename=crypto.randomUUID()+'.webp';fs.writeFileSync(path.join(uploadDir,filename),await sharp({create:{width:180,height:240,channels:3,background:['#a17852','#6f598d','#3f8678','#416b8c'][i]}}).webp().toBuffer());await repo.updateAvatar(user.id,filename);
  await repo.updateBio(user.id,'A shared journey, a favourite partner and a carefully chosen team.');
  const team=await repo.createTeam(user.id,'Companions on the road');await repo.saveTeam(user.id,team.id,{name:'Companions on the road',pokemonIds:[151,9,649]});await repo.community.share(user.id,team.id,'public');
  await repo.community.saveSettings(user.id,{...privacy.defaults(),enabled:true,shareAvatar:true,shareBio:true,shareProgress:user.expectedRole==='trainer',featuredPokemonId:i%2?9:151,featuredTeamId:team.id});
  await repo.community.saveDecoration(user.id,{...decoration.defaults(),palette:['gold','violet','mint','ocean'][i],pattern:['royal','nebula','forest','depths'][i],effect:'sparkles',title:'Every journey has a story'});
 }
 return users;
}
async function baseline(ctx){
 const {repo,uploadDir,origin,command,evaluate,waitFor}=ctx;await seed(repo,uploadDir);
 await command('Page.navigate',{url:origin+'/community.html?q=community_polish'});await waitFor(`document.querySelectorAll('.trainer-directory-card').length===4`);
 const selector='.trainer-directory-card:first-child';await evaluate(`document.querySelector('${selector}').scrollIntoView({behavior:'instant',block:'center'})`);
 const before=await evaluate(`(()=>{const a=document.querySelector('${selector} .directory-profile-link'),s=getComputedStyle(a,'::after'),r=a.getBoundingClientRect();return{overlay:s.content,width:s.width,height:s.height,buttonWidth:r.width,buttonHeight:r.height,cardTransform:getComputedStyle(a.closest('article')).transform}})()`);
 const point=await evaluate(`(()=>{const r=document.querySelector('${selector} .directory-card-bio').getBoundingClientRect();return{x:r.x+30,y:r.y+10}})()`);await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 const samples=[];for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,45));samples.push(await evaluate(`(()=>{const a=document.querySelector('${selector} .directory-profile-link'),s=getComputedStyle(a,'::after');return{hover:a.matches(':hover'),width:s.width,height:s.height,transform:getComputedStyle(a).transform}})()`));}
 const dir=path.join(os.tmpdir(),'dexhaven-community-hover-before');fs.mkdirSync(dir,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'before.png'),Buffer.from(shot.data,'base64'));fs.writeFileSync(path.join(dir,'findings.json'),JSON.stringify({before,samples},null,2));console.log(JSON.stringify({dir,before,samples},null,2));
}
async function run(ctx){
 const {check,repo,uploadDir,origin,command,evaluate,waitFor}=ctx,users=await seed(repo,uploadDir),normal=users.find(u=>u.expectedRole==='trainer');
 const output=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'dexhaven-community-polish');fs.mkdirSync(output,{recursive:true});
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function ready(){await waitFor(`document.querySelector('.community-directory')?.getAttribute('aria-busy')==='false'`);}
 async function search(value){await evaluate(`(()=>{document.querySelector('#community-search').value=${JSON.stringify(value)};document.querySelector('.community-search').requestSubmit();})()`);await ready();}
 async function capture(selector,name){await evaluate(`document.querySelector('${selector}').scrollIntoView({behavior:'instant',block:'center'})`);await pause(220);const clip=await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64'));}
 await check('community hover hitboxes stay fixed; biography and rank controls no longer navigate through an invisible link',async()=>{
  await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});await command('Page.navigate',{url:origin+'/community.html?q='+normal.username});await ready();
  await evaluate(`document.querySelector('.trainer-directory-card').scrollIntoView({behavior:'instant',block:'center'})`);
  const before=await evaluate(`(()=>{const c=document.querySelector('.trainer-directory-card'),r=c.getBoundingClientRect();return{top:r.top,height:r.height,width:r.width}})()`);
  const point=await evaluate(`(()=>{const r=document.querySelector('.directory-card-bio').getBoundingClientRect();return{x:r.x+20,y:r.y+10}})()`);await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  for(let i=0;i<8;i++){await pause(40);const current=await evaluate(`(()=>{const c=document.querySelector('.trainer-directory-card'),r=c.getBoundingClientRect(),a=c.querySelector('.directory-profile-link');return{top:r.top,height:r.height,width:r.width,overlay:getComputedStyle(a,'::after').content,hover:a.matches(':hover')}})()`);assert.equal(current.top,before.top);assert.equal(current.height,before.height);assert.equal(current.width,before.width);assert.equal(current.overlay,'none');assert.equal(current.hover,false);}
  assert.equal(await evaluate(`document.elementFromPoint(${point.x},${point.y}).closest('a')`),null);
  for(const selector of ['.directory-avatar-link','.directory-name-link','.directory-profile-link'])assert.match(await evaluate(`document.querySelector('${selector}').href`),new RegExp('/trainer/'+normal.username+'$'));
  await evaluate(`document.querySelector('.directory-card-body .rank-badge').scrollIntoView({behavior:'instant',block:'center'})`);const rankPoint=await evaluate(`(()=>{const r=document.querySelector('.directory-card-body .rank-badge').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rankPoint});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rankPoint});assert.equal(await evaluate(`document.querySelector('.directory-card-body .rank-badge').getAttribute('aria-expanded')`),'true');assert.equal(await evaluate(`document.querySelector('.rank-popover').parentElement===document.body`),true);await evaluate(`document.querySelector('.directory-card-body .rank-badge').click()`);assert.equal(await evaluate(`document.querySelector('.rank-popover')`),null);assert.equal(await evaluate('location.pathname'),'/community.html');
 });
 await check('staff names have real role-specific colours and contained glitter; ordinary names stay normal',async()=>{
  const colours=new Set();
  if(await evaluate('document.documentElement.dataset.theme')!=='dark')await evaluate(`document.querySelector('#theme-toggle').click()`);
  for(const user of users){await search(user.username);const card=await evaluate(`fetch('/api/public/trainers?q=${user.username}').then(r=>r.json())`);const dto=card.trainers.find(t=>t.username===user.username);assert.ok(dto);assert.equal(dto.staffRole,user.expectedRole==='trainer'?undefined:user.expectedRole);
   assert.equal(await evaluate(`document.querySelector('.directory-card-identity h3').textContent`),user.username);
   if(user.expectedRole==='trainer'){assert.equal(await evaluate(`document.querySelector('.directory-card-identity .staff-name')`),null);continue;}
   assert.equal(await evaluate(`document.querySelector('.directory-name-link').dataset.staffNameRole`),user.expectedRole);assert.equal(await evaluate(`document.querySelectorAll('.directory-name-link .staff-name-star svg').length`),4);
   assert.equal(await evaluate(`(()=>{const r=document.querySelector('.trainer-identity-meta .community-staff-label').getBoundingClientRect(),t=document.querySelector('.trainer-identity-meta .trainer-title-ribbon').getBoundingClientRect();return Math.abs((r.top+r.height/2)-(t.top+t.height/2))<1})()`),true,'role and title share a center line');
   colours.add(await evaluate(`getComputedStyle(document.querySelector('.directory-name-link')).getPropertyValue('--staff-ink')`));
   assert.equal(await evaluate(`getComputedStyle(document.querySelector('.staff-name-glitter')).pointerEvents`),'none');
   await capture('.trainer-directory-card',`${user.expectedRole}-dark.png`);
   await evaluate(`document.querySelector('.directory-name-link').click()`);await waitFor(`document.querySelector('.public-profile-name')?.textContent==='${user.username}'`);assert.equal(await evaluate(`document.querySelector('.public-profile-name').dataset.staffNameRole`),user.expectedRole);
   await command('Page.navigate',{url:origin+'/community.html?q='+user.username});await ready();
  }assert.equal(colours.size,3);
 });
 await check('community search has recoverable loading/error states, clear search and stale-response protection',async()=>{
  await evaluate(`(()=>{const original=fetch;window.qaCommunityFail=false;window.qaCommunityDelay=0;window.fetch=async(url,options)=>{const u=new URL(String(url),location.href);if(u.pathname==='/api/public/trainers'){if(window.qaCommunityDelay)await new Promise(r=>setTimeout(r,window.qaCommunityDelay));if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');if(window.qaCommunityFail)return{ok:false,status:503,json:async()=>({error:'Fixture community outage'})};}return original(url,options);};})()`);
  await evaluate(`window.qaCommunityDelay=200;document.querySelector('#community-search').value='${normal.username}';document.querySelector('.community-search').requestSubmit()`);assert.equal(await evaluate(`document.querySelectorAll('.community-skeleton').length`),3);assert.equal(await evaluate(`document.querySelector('.community-directory').inert`),true);await ready();assert.equal(await evaluate(`document.querySelectorAll('.community-skeleton').length`),0);assert.equal(await evaluate(`document.querySelector('.community-directory').inert`),false);
  await evaluate(`window.qaCommunityDelay=0;window.qaCommunityFail=true;document.querySelector('.community-search').requestSubmit()`);await waitFor(`document.querySelector('.community-error')?.textContent.includes('Fixture community outage')`);assert.equal(await evaluate(`document.querySelectorAll('.community-skeleton').length`),0);await evaluate(`window.qaCommunityFail=false;document.querySelector('.community-error button').click()`);await ready();assert.equal(await evaluate(`document.querySelector('.community-error')`),null);
  await evaluate(`window.qaCommunityDelay=200;document.querySelector('#community-search').value='${users[1].username}';document.querySelector('.community-search').requestSubmit();window.qaCommunityDelay=0;document.querySelector('#community-search').value='${normal.username}';document.querySelector('.community-search').requestSubmit()`);await ready();await pause(260);assert.equal(await evaluate(`document.querySelector('.directory-card-identity h3').textContent`),normal.username);
  await evaluate(`document.querySelector('.community-search-clear').click()`);await ready();assert.equal(await evaluate(`document.querySelector('#community-search').value`),'');assert.equal(await evaluate(`document.querySelector('.community-search-clear').hidden`),true);
 });
 await check('community cards and staff glitter fit both themes/mobile and retain keyboard, touch and reduced-motion access',async()=>{
  const member=users.find(u=>u.expectedRole==='administrator');await search(member.username);
  for(const theme of ['dark','light']){if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
   for(const width of [320,375,768,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await capture('.trainer-directory-card',`${theme}-${width}.png`);}
  }
  await search('w'.repeat(64));assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await search(member.username);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await evaluate(`document.querySelector('.directory-name-link').focus()`);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.staff-name-text')).animationName`),'none');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.staff-name-star')).animationName`),'none');
  assert.equal(await evaluate(`document.activeElement.classList.contains('directory-name-link')`),true);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await waitFor(`document.querySelector('.public-profile-name')?.textContent==='${member.username}'`);
  await command('Page.navigate',{url:origin+'/community.html?q='+member.username});await ready();await evaluate(`document.querySelector('.directory-avatar-link').scrollIntoView({behavior:'instant',block:'center'})`);const point=await evaluate(`(()=>{const r=document.querySelector('.directory-avatar-link').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitFor(`document.querySelector('.public-profile-name')?.textContent==='${member.username}'`);await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});console.log('Community polish screenshots: '+output);
 });
}
module.exports={seed,baseline,run};
