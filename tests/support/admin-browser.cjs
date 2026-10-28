module.exports=async({check,evaluate,command,waitFor,origin,repo})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const hash=await require('argon2').hash('admin browser secure password');
 const owner=await repo.createUser({username:'admin_browser_owner',email:'owner-private@example.test'},hash),mod=await repo.createUser({username:'admin_browser_mod',email:'mod-private@example.test'},hash),target=await repo.createUser({username:'admin_browser_target',email:'target-private@example.test'},hash),trainer=await repo.createUser({username:'admin_browser_trainer',email:'trainer-private@example.test'},hash);
 await repo.administration.bootstrapOwner(owner.id);await repo.administration.change(owner.id,mod.id,'role',{role:'moderator',version:0,reason:'Browser fixture staff setup'});await repo.updateBio(target.id,'PRIVATE BIOGRAPHY FOR STAFF TEST');await repo.createTeam(target.id,'PRIVATE LINEUP FOR STAFF TEST');
 const output=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'dexhaven-v062-admin');fs.mkdirSync(output,{recursive:true});
 async function logout(){await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();await fetch('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':s.csrfToken}})})()`);}
 async function login(name){await command('Page.navigate',{url:origin+'/index.html'});await waitFor(`document.querySelector('#guest-actions')?.hidden===false`);await evaluate(`(()=>{document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='${name}';document.querySelector('#auth-password').value='admin browser secure password';document.querySelector('#auth-form').requestSubmit();})()`);await waitFor(`document.querySelector('#logout-button').hidden===false`);}
 async function tab(name){await evaluate(`document.querySelector('[data-admin-tab="${name}"]').click()`);await waitFor(`document.querySelector('.admin-view')?.getAttribute('aria-busy')==='false'`);}
 async function search(name){await evaluate(`(()=>{const f=document.querySelector('.admin-search');f.querySelector('input').value='${name}';f.requestSubmit();})()`);await waitFor(`document.querySelectorAll('.admin-user').length===1 && document.querySelector('.admin-user h3').textContent==='${name}'`);}
 async function open(text){await evaluate(`[...document.querySelectorAll('.admin-user-actions button')].find(b=>b.textContent==='${text}').click()`);await waitFor(`document.querySelector('.admin-dialog')?.open===true`);}
 async function confirm(){await evaluate(`(()=>{const f=document.querySelector('.admin-form');f.querySelector('[name="reason"]').value='Browser reviewed account change';f.querySelector('[name="confirmed"]').checked=true;f.requestSubmit();})()`);await waitFor(`document.querySelector('.admin-dialog')?.open===false && document.querySelector('.admin-notice').textContent==='Change saved. The administrative audit record was committed.'`);}
 await check('Administration direct access shows guest/Trainer gates without private data or staff navigation',async()=>{
  await command('Page.navigate',{url:origin+'/index.html'});await waitFor(`document.querySelector('#guest-actions')`);await logout();await command('Page.navigate',{url:origin+'/admin.html'});await waitFor(`document.querySelector('.admin-gate h2')?.textContent==='Staff access required'`);
  assert.equal(await evaluate(`document.querySelector('[data-staff-link]').hidden`),true);assert.equal(await evaluate(`document.querySelector('.admin-users,.admin-overview')`),null);
  assert.equal(await evaluate(`fetch('/api/admin/users').then(r=>r.status)`),401);
  await login(trainer.username);await command('Page.navigate',{url:origin+'/admin.html'});await waitFor(`document.querySelector('.admin-gate h2')?.textContent==='This area is for staff'`);assert.equal(await evaluate(`document.querySelector('[data-staff-link]').hidden`),true);await logout();
 });
 await check('Owner UI confirms role/permission changes, restrictions and revocation only after backend success',async()=>{
  await login(owner.username);await waitFor(`document.querySelector('[data-staff-link]').hidden===false`);await evaluate(`document.querySelector('[data-staff-link]').click()`);await waitFor(`document.querySelectorAll('.admin-overview article').length===3`);
  assert.equal(await evaluate(`Number(document.querySelector('.admin-overview article strong').textContent)`),repo.users.length);
  await tab('users');await search(target.username);await open('Change role');assert.equal(await evaluate(`document.querySelector('.admin-form [name="role"]').querySelector('[value="owner"]')`),null);
  await evaluate(`document.querySelector('.admin-form').requestSubmit()`);assert.equal((await repo.administration.access(target.id)).role,'trainer');
  await evaluate(`document.querySelector('.admin-form [name="role"]').value='moderator'`);await confirm();assert.equal((await repo.administration.access(target.id)).role,'moderator');
  await open('Staff permissions');await evaluate(`document.querySelector('.admin-form [name="permissions"][value="restrictions.apply"]').checked=false`);await confirm();assert.ok(!(await repo.administration.access(target.id)).permissions.includes('restrictions.apply'));
  await search(trainer.username);await open('Suspend');await evaluate(`document.querySelector('.admin-form [name="hours"]').value=2`);await confirm();assert.match(await evaluate(`document.querySelector('.admin-status').textContent`),/Suspended until/);
  await open('Revoke suspension');await confirm();assert.equal(await evaluate(`document.querySelector('.admin-status').textContent`),'Active account');
  await tab('audit');assert.ok(await evaluate(`document.querySelector('.admin-audit').textContent.includes('owner.bootstrap')`));
  const body=await evaluate('document.body.textContent');for(const secret of ['target-private@example.test','PRIVATE BIOGRAPHY FOR STAFF TEST','PRIVATE LINEUP FOR STAFF TEST','admin browser secure password'])assert.ok(!body.includes(secret));
 });
 await check('Admin Panel supports keyboard confirmation, responsive themes, reduced motion and failed-save feedback',async()=>{
  await tab('users');await search(trainer.username);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await open('Suspend');await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.activeElement.name'),'reason');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await evaluate(`document.querySelector('.admin-dialog').open`),false);
  const hover=await evaluate(`(()=>{const b=[...document.querySelectorAll('.admin-user-actions button')].find(b=>b.textContent==='Suspend');b.scrollIntoView({behavior:'instant',block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width}})()`);
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:hover.x,y:hover.y});await new Promise(r=>setTimeout(r,200));assert.equal(await evaluate(`document.querySelector('.admin-user-actions button:last-child').getBoundingClientRect().width`),hover.width);
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:hover.x,y:hover.y}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitFor(`document.querySelector('.admin-dialog')?.open===true`);await evaluate(`document.querySelector('.admin-form button[type="button"]').click()`);await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  for(const theme of ['dark','light']){
   if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
   for(const width of [320,375,768,1280]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await open('Suspend');assert.equal(await evaluate(`document.activeElement.name`),'hours');assert.equal(await evaluate(`document.querySelector('.admin-dialog').getBoundingClientRect().right<=innerWidth`),true);
    await evaluate(`document.querySelector('.admin-form button[type="button"]').click()`);
   }
   await evaluate(`document.querySelector('.admin-user').scrollIntoView({behavior:'instant',block:'center'})`);await new Promise(r=>setTimeout(r,250));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`users-${theme}.png`),Buffer.from(shot.data,'base64'));
  }
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate(`getComputedStyle(document.querySelector('.admin-user-actions button')).transitionDuration`),'0s');
  await open('Suspend');const saved=repo.administration.change;try{repo.administration.change=async()=>{throw new(require('../../server/validation').HttpError)(503,'Fixture administrative write failure');};await evaluate(`(()=>{const f=document.querySelector('.admin-form');f.querySelector('[name="reason"]').value='Browser action must fail';f.querySelector('[name="confirmed"]').checked=true;f.requestSubmit();})()`);await waitFor(`document.querySelector('.admin-form .form-error')?.textContent==='Fixture administrative write failure'`);assert.equal(await evaluate(`document.querySelector('.admin-form button[type="submit"]').disabled`),false);}finally{repo.administration.change=saved;}
  await evaluate(`document.querySelector('.admin-form button[type="button"]').click()`);await logout();
 });
 await check('Moderator UI exposes only limited actions and loses access immediately after demotion',async()=>{
  await login(mod.username);await command('Page.navigate',{url:origin+'/admin.html'});await waitFor(`document.querySelector('.admin-tabs')`);await tab('users');await search(trainer.username);
  assert.equal(await evaluate(`[...document.querySelectorAll('.admin-user-actions button')].some(b=>b.textContent==='Change role'||b.textContent==='Staff permissions')`),false);
  await open('Suspend');assert.equal(await evaluate(`document.querySelector('.admin-form [name="hours"]').max`),'24');await evaluate(`document.querySelector('.admin-form [name="hours"]').value=25`);assert.equal(await evaluate(`document.querySelector('.admin-form').checkValidity()`),false);await evaluate(`document.querySelector('.admin-form button[type="button"]').click()`);
  await command('Page.navigate',{url:origin+'/trainers.html#view=profile'});await waitFor(`document.querySelector('.profile-panel .staff-badge')?.textContent==='Moderator'`);
  const access=await repo.administration.access(mod.id);await repo.administration.change(owner.id,mod.id,'role',{role:'trainer',version:access.roleVersion,reason:'Browser live permission revocation'});
  assert.equal(await evaluate(`fetch('/api/admin/users').then(r=>r.status)`),403);await evaluate('DexhavenAccount.refresh()');await waitFor(`document.querySelector('.profile-panel .staff-badge')?.textContent==='Trainer'`);
  await command('Page.navigate',{url:origin+'/admin.html'});await waitFor(`document.querySelector('.admin-gate h2')?.textContent==='This area is for staff'`);assert.equal(await evaluate(`document.querySelector('[data-staff-link]').hidden`),true);await logout();
 });
 await check('Trainer rank UI updates from caught records, stays distinct from Owner role, and obeys public progress sharing',async()=>{
  await login(owner.username);await command('Page.navigate',{url:origin+'/trainers.html#view=profile'});await waitFor(`document.querySelector('.profile-panel .rank-badge')?.textContent.includes('Rookie')`);assert.equal(await evaluate(`document.querySelector('.profile-panel .staff-badge').textContent`),'Owner');
  await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();for(let id=1;id<=25;id++)await fetch('/api/pokedex/'+id,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},body:JSON.stringify({status:'caught'})});await TrainerProgress.refresh()})()`);await waitFor(`document.querySelector('.profile-panel .rank-badge')?.textContent.includes('Bronze')`);
  assert.equal(await evaluate(`document.querySelector('.profile-panel .rank-card').open`),true);assert.match(await evaluate(`document.querySelector('.profile-panel .rank-details').textContent`),/75 more unique/);
  for(const width of [320,375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  const settings={...require('../../server/community').defaults(),enabled:true};await repo.community.saveSettings(owner.id,settings);await command('Page.navigate',{url:origin+'/trainer/'+owner.username});await waitFor(`document.querySelector('.public-profile-hero')`);assert.equal(await evaluate(`document.querySelector('.public-profile-hero .rank-card')`),null);
  await repo.community.saveSettings(owner.id,{...settings,shareProgress:true});await command('Page.reload');await waitFor(`document.querySelector('.public-profile-hero .rank-card')?.dataset.rank==='bronze'`);assert.equal(await evaluate(`document.querySelector('.public-profile-hero .staff-badge')`),null);
  for(const width of [320,375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  await repo.administration.change(owner.id,trainer.id,'suspend',{hours:1,version:(await repo.administration.access(trainer.id)).roleVersion,reason:'Browser account suspension enforcement'});
  await logout();await login(owner.username);console.log('Admin screenshots: '+output);
 });
};
