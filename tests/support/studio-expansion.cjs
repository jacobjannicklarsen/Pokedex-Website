module.exports=async({check,evaluate,command,waitFor,origin,repo,uploadDir,spriteFailures,spriteRequests})=>{
 const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
 const config=require('../../trainer-card-config'),privacy=require('../../server/community');
 const screenshotDir=process.env.QA_SCREENSHOT_DIR||path.join(os.tmpdir(),'dexhaven-v061-review');fs.mkdirSync(screenshotDir,{recursive:true});
 // Earlier outage tests deliberately block all remote artwork. Restore the
 // sprite interception route so these checks can load verified sample GIFs.
 await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
 async function click(key,value){await evaluate(`document.querySelector('.decoration-form [name="${key}"][value="${value}"]').click()`);}
 async function capture(selector,name){
  await evaluate(`document.querySelector('${selector}').scrollIntoView({behavior:'instant',block:'center'})`);await new Promise(r=>setTimeout(r,300));
  const clip=await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});const bytes=Buffer.from(shot.data,'base64');fs.writeFileSync(path.join(screenshotDir,name),bytes);return bytes;
 }
 await check('v0.6.1 Studio previews every background/frame/effect, validates colours, and resets without saving',async()=>{
  const user=repo.users.find(u=>u.username==='browser_trainer');
  const filename='23456789-1234-4123-8123-123456789abc.webp';fs.writeFileSync(path.join(uploadDir,filename),await sharp({create:{width:256,height:256,channels:3,background:'#ee9955'}}).webp().toBuffer());await repo.updateAvatar(user.id,filename);
  await repo.community.saveSettings(user.id,{...await repo.community.settings(user.id),enabled:true,shareAvatar:true,featuredPokemonId:151});
  await command('Page.navigate',{url:origin+'/trainers.html#view=profile'});await waitFor(`document.querySelector('.decoration-form') && document.querySelector('.decoration-preview img')?.naturalWidth>0`);
  const before=await repo.community.decoration(user.id);
  for(const [key,options]of Object.entries(config.choices)){
   const appearances=new Set();
   for(const value of options){
    await click(key,value);assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.${key}`),value);
    const signature=await evaluate(`(()=>{const p=document.querySelector('.decoration-preview'),s=getComputedStyle(p),banner=getComputedStyle(p,'::before'),frame=getComputedStyle(p.querySelector('.avatar-frame')),image=getComputedStyle(p.querySelector('.trainer-avatar')),layer=p.querySelector('.card-finish'),mark=layer?.querySelector('.finish-mark');return JSON.stringify({palette:s.getPropertyValue('--card-accent'),pattern:[banner.backgroundImage,banner.backgroundColor],frame:[frame.clipPath,frame.borderRadius,frame.boxShadow,frame.outlineStyle,frame.outlineWidth,frame.backgroundImage,frame.getPropertyValue('--frame-width'),image.clipPath],effect:layer?[getComputedStyle(layer).backgroundImage,mark?getComputedStyle(mark).width:null,mark?getComputedStyle(mark).backgroundColor:null]:null,borderStyle:[s.borderLeftStyle,s.borderLeftWidth,s.boxShadow]}['${key}'])})()`);
    if(key!=='titleStyle')appearances.add(signature);
   }
   if(key!=='titleStyle')assert.equal(appearances.size,options.length,`${key} choices must produce distinct rendered styles`);
  }
  await click('effect','none');assert.equal(await evaluate(`document.querySelector('.decoration-preview .card-finish')`),null);
  await click('effect','sparkles');assert.equal(await evaluate(`document.querySelectorAll('.decoration-preview .card-finish svg').length`),8);
  await click('effect','shimmer');assert.equal(await evaluate(`document.querySelectorAll('.decoration-preview .card-finish svg').length`),0);
  await click('effect','none');assert.equal(await evaluate(`document.querySelector('.decoration-preview .card-finish')`),null);
  await evaluate(`(()=>{const i=document.querySelector('.decoration-form [name="accentColor"]');i.value='#bad';i.dispatchEvent(new Event('input'));})()`);
  assert.equal(await evaluate(`document.querySelector('.decoration-form').checkValidity()`),false);
  await evaluate(`[...document.querySelectorAll('.decoration-form button')].find(b=>b.textContent==='Reset to default').click()`);
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.palette`),'mint');
  assert.deepEqual(await repo.community.decoration(user.id),before,'reset changes preview only');
  await evaluate(`[...document.querySelectorAll('.decoration-form button')].find(b=>b.textContent==='Reset preview').click()`);
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.palette`),before.palette);
  await evaluate(`(()=>{const s=document.querySelector('.decoration-form [name="preset"]');s.value='Night explorer';s.dispatchEvent(new Event('change'));})()`);
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.pattern`),'nebula');
  await click('effect','sparkles');await click('frame','hexagon');
  for(const [key,value]of Object.entries({accentColor:'#89c9ff',borderColor:'#d0ac63',frameColor:'#e6b776'}))await evaluate(`(()=>{const i=document.querySelector('.decoration-form [name="${key}"]');i.value='${value}';i.dispatchEvent(new Event('input'));})()`);
  await evaluate(`document.querySelector('.decoration-form').requestSubmit()`);await waitFor(`document.querySelector('#account-message').textContent==='Trainer decorations saved.'`);
  await command('Page.reload');await waitFor(`document.querySelector('.decoration-form [name="frameColor"]')?.value==='#e6b776'`);
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').style.getPropertyValue('--card-accent')`),'#89c9ff');
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.frame`),'hexagon');
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.effect`),'sparkles');
  const persisted=await repo.community.decoration(user.id),saveDecoration=repo.community.saveDecoration;
  try{
    repo.community.saveDecoration=async()=>{throw new(require('../../server/validation').HttpError)(503,'Fixture decoration save failed');};
    await click('effect','glow');await evaluate(`document.querySelector('.decoration-form').requestSubmit()`);
    await waitFor(`document.querySelector('.decoration-form .form-error')?.textContent==='Fixture decoration save failed'`);
    assert.equal(await evaluate(`document.querySelector('#account-message').textContent`),'Fixture decoration save failed');
    assert.deepEqual(await repo.community.decoration(user.id),persisted);
  }finally{repo.community.saveDecoration=saveDecoration;}
  await evaluate(`[...document.querySelectorAll('.decoration-form button')].find(b=>b.textContent==='Reset preview').click()`);
  assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.effect`),'sparkles');
 });
 await check('Hexagon has a complete six-edge border and clipped image; Sparkles stays behind content in preview and directory',async()=>{
  const preview=await capture('.decoration-preview .avatar-frame','hexagon-avatar.png');
  const {data,info}=await sharp(preview).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const points=[[.5,.015],[.85,.25],[.85,.75],[.5,.985],[.15,.75],[.15,.25]];
  for(const [x,y]of points){const i=(Math.floor(y*info.height)*info.width+Math.floor(x*info.width))*info.channels;const actual=[...data.slice(i,i+3)];assert.ok(actual.every((v,j)=>Math.abs(v-[230,183,118][j])<30),`six-edge border at ${x},${y}: ${actual}`);}
  for(const theme of ['dark','light']){
    if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
    for(const width of [375,1280]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      await capture('.decoration-preview',`studio-${theme}-${width}.png`);
    }
  }
  const owner=repo.users.find(u=>u.username==='browser_trainer');const saved=await repo.community.decoration(owner.id);
  await command('Page.navigate',{url:origin+'/community.html?q=browser_trainer'});await waitFor(`document.querySelector('.trainer-directory-card')?.dataset.frame==='hexagon'`);
  for(const key of ['palette','pattern','frame','effect','borderStyle','titleStyle'])assert.equal(await evaluate(`document.querySelector('.trainer-directory-card').dataset.${key}`),saved[key]);
  assert.equal(await evaluate(`document.querySelector('.trainer-directory-card').style.getPropertyValue('--frame-accent')`),'#e6b776');
  assert.equal(await evaluate(`document.querySelectorAll('.trainer-directory-card .card-finish svg').length`),8);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.trainer-directory-card .card-finish')).pointerEvents`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.trainer-directory-card'),'::after').content`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.trainer-directory-card .trainer-avatar')).objectFit`),'cover');
  const dirAvatar=await capture('.trainer-directory-card .avatar-frame','directory-hexagon-avatar.png');
  assert.ok((await sharp(dirAvatar).metadata()).width>=90);
  for(const theme of ['dark','light']){
    if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
    for(const width of [375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await capture('.trainer-directory-card',`directory-${theme}-${width}.png`);}
  }
 });
 await check('Mew and Blastoise animate; party slots preserve order and empty slots; reduced motion uses static sprites',async()=>{
  const owner=repo.users.find(u=>u.username==='browser_trainer');
  const team=await repo.createTeam(owner.id,'Sprite six');await repo.saveTeam(owner.id,team.id,{name:'Sprite six',pokemonIds:[151,9,649]});await repo.community.share(owner.id,team.id,'public');
  await repo.community.saveSettings(owner.id,{...await repo.community.settings(owner.id),featuredTeamId:team.id});
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await command('Page.navigate',{url:origin+'/community.html?q=browser_trainer'});await waitFor(`document.querySelector('.directory-partner img')?.dataset.spriteId==='151'`);
  await evaluate(`document.querySelector('.directory-partner').scrollIntoView({behavior:'instant',block:'center'})`);
  await waitFor(`document.querySelector('.directory-partner img').src.endsWith('/animated/151.gif') && document.querySelector('.directory-partner img').naturalWidth>0`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.directory-mini-roster img')].map(i=>Number(i.dataset.spriteId))`),[151,9,649]);
  assert.equal(await evaluate(`document.querySelectorAll('.directory-empty-slot').length`),3);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await waitFor(`document.querySelector('.directory-partner img').src.endsWith('/black-white/151.png') && document.querySelector('.directory-partner img').naturalWidth>0`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.card-finish .finish-mark')).animationName`),'none');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await command('Page.navigate',{url:origin+'/trainer/browser_trainer'});await waitFor(`document.querySelector('.public-profile-hero')`);
  assert.equal(await evaluate(`document.querySelector('.public-profile-hero').dataset.frame`),'hexagon');
  const ids=await evaluate(`[...document.querySelectorAll('.shared-roster')][1].querySelectorAll('.pokemon-sprite').length`);assert.equal(ids,3);
  await evaluate(`(()=>{const i=PokemonSprites.create(9,{name:'Blastoise'});i.id='sprite-proof';document.querySelector('#community-content').prepend(i);i.scrollIntoView({behavior:'instant',block:'center'});})()`);
  await waitFor(`document.querySelector('#sprite-proof').src.endsWith('/animated/9.gif') && document.querySelector('#sprite-proof').naturalWidth>0`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#sprite-proof')).imageRendering`),'pixelated');
  spriteFailures.add('animated');
  await evaluate(`(()=>{document.querySelector('#sprite-proof').remove();const i=PokemonSprites.create(151,{name:'Mew'});i.id='sprite-proof';document.querySelector('#community-content').prepend(i);i.scrollIntoView({behavior:'instant',block:'center'});})()`);
  // Mew may already be decoded in the page cache; simulate its failed image event.
  await evaluate(`document.querySelector('#sprite-proof').dispatchEvent(new Event('error'))`);
  await waitFor(`document.querySelector('#sprite-proof').src.endsWith('/black-white/151.png') && document.querySelector('#sprite-proof').naturalWidth>0`);
  spriteFailures.add('static');spriteFailures.add('party');
  await evaluate(`(()=>{document.querySelector('#sprite-proof').remove();const i=PokemonSprites.create(649,{name:'Genesect'});i.id='sprite-proof';document.querySelector('#community-content').prepend(i);i.scrollIntoView({behavior:'instant',block:'center'});})()`);
  await waitFor(`document.querySelector('#sprite-proof').src.endsWith('/artwork-fallback.svg') && document.querySelector('#sprite-proof').naturalWidth>0`);
  const requests=spriteRequests.length;await new Promise(r=>setTimeout(r,250));assert.equal(spriteRequests.length,requests,'fallback terminates');spriteFailures.clear();
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  console.log(`Studio/sprite screenshots: ${screenshotDir}`);
 });
};
