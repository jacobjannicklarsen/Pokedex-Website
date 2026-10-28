const assert=require('node:assert/strict');
module.exports=async({check,evaluate,command,waitFor,origin,repo})=>{
 const user=repo.users.find(u=>u.username==='browser_trainer'),config=require('../../trainer-card-config');
 await check('linked homepage hero glows on hover and keyboard focus without moving its hitbox',async()=>{
  await command('Page.navigate',{url:origin+'/index.html'});await waitFor(`document.querySelector('.hero-art img')`);
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
  const before=await evaluate(`(()=>{const h=document.querySelector('.hero-art'),r=h.getBoundingClientRect();return{glow:getComputedStyle(h).getPropertyValue('--hero-glow'),x:r.x,y:r.y,w:r.width,h:r.height,href:h.getAttribute('href')}})()`);
  assert.equal(before.href,'about.html');
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+before.w/2,y:before.y+before.h/2});
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.hero-art')).getPropertyValue('--hero-glow')`),before.glow);
  assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('.hero-art').getBoundingClientRect();return[r.x,r.y,r.width,r.height]})()`),[before.x,before.y,before.w,before.h]);
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await evaluate(`document.querySelector('.hero-art').focus()`);
  assert.equal(await evaluate(`document.querySelector('.hero-art').matches(':focus-visible')`),true);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.hero-art')).getPropertyValue('--hero-glow')`),before.glow);
 });
 await check('Trainer Profile groups editing with avatar before biography and previews eight distinct title styles',async()=>{
  await command('Page.navigate',{url:origin+'/trainers.html#view=profile'});await waitFor(`document.querySelector('.decoration-form')`);
  assert.equal(await evaluate(`document.querySelector('.profile-editor-grid').firstElementChild.querySelector('input[type=file]')!==null`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.profile-panel .profile-progress').length`),1);
  assert.equal(await evaluate(`document.querySelectorAll('.profile-summary-grid>.profile-summary').length`),2);
  await evaluate(`(()=>{const i=document.querySelector('.decoration-form [name=title]');i.value='Journey keeper';i.dispatchEvent(new Event('input'));})()`);
  const signatures=new Set();
  for(const value of config.choices.titleStyle){
   await evaluate(`document.querySelector('.decoration-form [name=titleStyle][value=${value}]').click()`);
   assert.equal(await evaluate(`document.querySelectorAll('.decoration-preview .trainer-title-ribbon').length`),1);
   signatures.add(await evaluate(`(()=>{const t=document.querySelector('.decoration-preview .trainer-title-ribbon'),s=getComputedStyle(t),b=getComputedStyle(t,'::before');return JSON.stringify([s.borderStyle,s.borderWidth,s.borderRadius,s.backgroundImage,s.backgroundColor,s.padding,b.content])})()`));
  }
  assert.equal(signatures.size,config.choices.titleStyle.length);
  await evaluate(`document.querySelector('.decoration-form').requestSubmit()`);await waitFor(`document.querySelector('#account-message').textContent==='Trainer decorations saved.'`);
  await command('Page.reload');await waitFor(`document.querySelector('.decoration-preview')?.dataset.titleStyle==='champion'`);
  assert.equal((await repo.community.decoration(user.id)).titleStyle,'champion');
 });
 await check('profile and Studio fit mobile/desktop in both themes with usable section shortcuts',async()=>{
  for(const width of [320,390,1280])for(const theme of ['dark','light']){
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   await evaluate(`document.documentElement.dataset.theme='${theme}'`);
   assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,`${width}/${theme} overflow`);
   assert.equal(await evaluate(`[...document.querySelectorAll('.profile-editor-grid>.trainer-panel,.profile-progress,.decoration-workspace,.profile-summary')].every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1})`),true);
   if(process.env.QA_SCREENSHOT_DIR){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});await evaluate(`document.querySelector('.profile-panel').scrollIntoView({behavior:'instant',block:'start'})`);await new Promise(r=>setTimeout(r,300));const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,`profile-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));}
  }
  await evaluate(`document.querySelector('.profile-shortcuts button').click()`);
  assert.equal(await evaluate(`document.activeElement.closest('.profile-editor')!==null`),true);
 });
 await check('directory separates motto and biography, aligns identity labels and never substitutes motto for hidden bio',async()=>{
  const settings=await repo.community.settings(user.id);await repo.updateBio(user.id,'Biography only.');
  await repo.community.saveSettings(user.id,{...settings,enabled:true,shareBio:true});
  await repo.community.saveDecoration(user.id,{...await repo.community.decoration(user.id),motto:'Onward, together!'});
  await command('Page.navigate',{url:origin+'/community.html?q='+user.username});await waitFor(`document.querySelector('.directory-card-bio')?.textContent==='Biography only.'`);
  assert.equal(await evaluate(`document.querySelector('.directory-card-identity .trainer-name-row .trainer-motto-inline').textContent`),'Onward, together!');
  assert.equal(await evaluate(`document.querySelector('.directory-card-identity .trainer-identity-meta .trainer-title-ribbon').textContent`),'Journey keeper');
  const positions=await evaluate(`(()=>{const n=document.querySelector('.directory-name-link').getBoundingClientRect(),m=document.querySelector('.trainer-motto-inline').getBoundingClientRect();return{n:n.right,m:m.left}})()`);assert.ok(positions.m>=positions.n);
  await repo.community.saveSettings(user.id,{...settings,enabled:true,shareBio:false});
  await command('Page.reload');await waitFor(`document.querySelector('.trainer-directory-card')`);
  assert.equal(await evaluate(`document.querySelector('.directory-card-bio')`),null);
  assert.equal(await evaluate(`document.querySelector('.trainer-motto-inline').textContent`),'Onward, together!');
  await evaluate(`document.querySelector('.directory-name-link').click()`);await waitFor(`document.querySelector('.public-profile-name')`);
  assert.equal(await evaluate(`document.querySelectorAll('.public-profile-hero .trainer-title-ribbon').length`),1);
  assert.equal(await evaluate(`document.querySelectorAll('.public-profile-hero .trainer-motto-inline').length`),1);
 });
};
