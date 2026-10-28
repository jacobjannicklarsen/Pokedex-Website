const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
module.exports=async({check,evaluate,command,waitFor,origin,repo})=>{
 const owner=await repo.createUser({username:'views_owner',email:'views-owner@example.test'},'fixture-only');
 await repo.administration.bootstrapOwner(owner.id);
 const people=[owner];
 for(let i=0;i<27;i++){
  const p=await repo.createUser({username:i===0?'views_admin':'views_mod_'+String(i).padStart(2,'0'),email:`views-${i}@example.test`},'fixture-only');
  await repo.administration.change(owner.id,p.id,'role',{role:i===0?'administrator':'moderator',version:0,reason:'Discovery browser fixture'});people.push(p);
 }
 for(const p of people)await repo.community.saveSettings(p.id,{...await repo.community.settings(p.id),enabled:true});
 const thread=await repo.forums.create(owner.id,{categoryId:2,title:'Choosing a partner for your next adventure',body:'Which starter fits your next team? Share your favourite combinations.'});
 await repo.forums.reply(people[1].id,thread.id,{body:'A different trainer joins this conversation with a thoughtful reply.'});
 async function navigate(page){await command('Page.navigate',{url:origin+'/'+page});await waitFor(`location.href===${JSON.stringify(origin)}+'/'+${JSON.stringify(page)}&&document.readyState!=='loading'&&globalThis.DexhavenAccount?.isReady()`);}
 async function ready(){await waitFor(`document.querySelector('#forum-content')?.getAttribute('aria-busy')==='false'`);}
 async function capture(name){const dir=path.join(os.tmpdir(),'dexhaven-discovery-review');fs.mkdirSync(dir,{recursive:true});const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name),Buffer.from(s.data,'base64'));}
 await check('bare and canonical discovery routes select exactly one matching navigation item',async()=>{
  for(const key of ['trending','latest','members'])for(const suffix of ['', '=1']){
   await navigate('forums.html#'+key+suffix);await ready();
   assert.equal(await evaluate(`document.querySelectorAll('.community-subnav [aria-current="page"]').length`),1);
   assert.ok(await evaluate(`document.querySelector('.community-subnav [aria-current="page"]').hash.includes('${key}')`));
   assert.equal(await evaluate(`document.querySelectorAll('.forum-secondary-nav a').length`),1,'guests see public forum tools');
  }
  await navigate('forums.html#trending');await ready();
  await evaluate(`document.querySelector('.community-subnav a[href*="#latest"]').click()`);await ready();
  await evaluate('history.back()');await waitFor(`location.hash==='#trending'`);await ready();
  assert.ok(await evaluate(`document.querySelector('.community-subnav [aria-current="page"]').hash.includes('trending')`));
  await evaluate('history.forward()');await waitFor(`location.hash==='#latest=1'`);await ready();
  assert.ok(await evaluate(`document.querySelector('.community-subnav [aria-current="page"]').hash.includes('latest')`));
  await command('Page.reload');await waitFor(`globalThis.DexhavenAccount?.isReady()`);await ready();
  assert.ok(await evaluate(`document.querySelector('.community-subnav [aria-current="page"]').hash.includes('latest')`));
  await evaluate('history.back()');await waitFor(`location.hash==='#trending'`);await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.discovery-engagement').length`),1);
  await evaluate(`document.querySelector('.discovery-feed-card h3 a').click()`);await ready();
  assert.equal(await evaluate(`document.querySelector('.community-subnav [aria-current="page"]').textContent`),'Forums');
 });
 await check('member pages retain their active section and offer return to first page',async()=>{
  await navigate('forums.html#members');await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.discovery-members .member-card').length`),25);
  await evaluate(`document.querySelector('.discovery-pagination .action-button').click()`);await ready();
  assert.equal(await evaluate(`document.querySelectorAll('.discovery-members .member-card').length`),3);
  assert.equal(await evaluate(`document.querySelector('.discovery-pagination a').textContent`),'Back to first page');
 });
 await check('staff search, role filters and failed pagination preserve loaded members without duplicates',async()=>{
  await navigate('staff.html');await waitFor(`document.querySelector('#staff-content')?.getAttribute('aria-busy')==='false'`);
  assert.equal(await evaluate(`document.querySelectorAll('#staff-content .member-card').length`),25);
  await evaluate(`document.querySelector('[data-staff-filter="owner"]').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('#staff-content .member-card').length`),1);
  assert.equal(await evaluate(`document.querySelector('[data-staff-filter="owner"]').getAttribute('aria-pressed')`),'true');
  await evaluate(`(()=>{document.querySelector('[data-staff-filter="all"]').click();const q=document.querySelector('.staff-search input');q.value='views_admin';q.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelectorAll('#staff-content .member-card').length`),1);
  await evaluate(`(()=>{const q=document.querySelector('.staff-search input');q.value='missing_staff';q.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelectorAll('#staff-content .member-card').length`),0);
  await evaluate(`document.querySelector('.discovery-empty button').click()`);
  await evaluate(`(()=>{const original=fetch;let fail=true;window.fetch=(url,options)=>String(url).includes('/api/public/staff?after=')&&fail?(fail=false,Promise.resolve({ok:false,status:503,json:async()=>({error:'Directory fixture failure'})})):original(url,options)})()`);
  await evaluate(`document.querySelector('.staff-more').click()`);await waitFor(`document.querySelector('.staff-directory-error').hidden===false&&document.querySelector('#staff-content').getAttribute('aria-busy')==='false'`);
  assert.equal(await evaluate(`document.querySelectorAll('#staff-content .member-card').length`),25);
  await evaluate(`document.querySelector('.staff-directory-error button').click()`);await waitFor(`document.querySelectorAll('#staff-content .member-card').length===28`);
  assert.equal(await evaluate(`document.querySelector('.staff-more').hidden`),true);
 });
 await check('all discovery and staff views fit mobile, tablet and desktop in both themes',async()=>{
  for(const page of ['forums.html#trending','forums.html#latest','forums.html#members','staff.html']){
   await navigate(page);if(page.startsWith('forums'))await ready();else await waitFor(`document.querySelector('#staff-content').getAttribute('aria-busy')==='false'`);
   for(const width of [320,768,1280])for(const theme of ['dark','light']){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),true,page+'/'+width+'/'+theme);
    if(width!==768&&theme==='dark'){await evaluate('scrollTo(0,document.querySelector(".community-subnav").offsetTop-16)');await capture(page.replace(/\W/g,'-')+'-'+width+'.png');}
   }
  }
 });
 await check('staff shares community navigation and member actions have no Preview buttons',async()=>{
  await navigate('staff.html');await waitFor(`document.querySelector('#staff-content').getAttribute('aria-busy')==='false'`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.community-subnav a')].map(a=>a.textContent)`),['Trainer directory','Forums','Trending','What’s new','Members','Staff']);
  assert.equal(await evaluate(`document.querySelectorAll('[data-member-preview]').length`),0);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Preview')`),false);
  repo.users.find(u=>u.id===owner.id).password_hash=await require('argon2').hash('Member actions test password');
  await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='views_owner';document.querySelector('#auth-password').value='Member actions test password';document.querySelector('#auth-form').requestSubmit()`);
  await waitFor(`globalThis.DexhavenAccount?.getUser()?.username==='views_owner'&&document.querySelector('#staff-content').getAttribute('aria-busy')==='false'`);
  const card='.member-card:has(h3 [data-member="views_admin"])';
  await waitFor(`document.querySelector(${JSON.stringify(card+' .member-follow')})`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(card+' .member-follow')}).textContent`),'Follow');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(card+' .member-block')}).textContent`),'Block');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({behavior:'instant',block:'center'})`);await capture('member-social-buttons.png');
  for(const width of [320,768,1280])for(const theme of ['dark','light']){
   await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);
   assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),true,'Authenticated social actions/'+width+'/'+theme);
  }
  await evaluate(`document.querySelector(${JSON.stringify(card+' .member-follow')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(card+' .member-follow')}).getAttribute('aria-pressed')==='true'`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(card+' .member-follow')}).textContent`),'Unfollow');
  assert.equal(await repo.enhancements.store.count('follows',{userId:owner.id,targetId:people[1].id}),1);
  await evaluate(`document.querySelector(${JSON.stringify(card+' .member-follow')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(card+' .member-follow')}).getAttribute('aria-pressed')==='false'`);
  assert.equal(await repo.enhancements.store.count('follows',{userId:owner.id,targetId:people[1].id}),0);
  await evaluate(`document.querySelector(${JSON.stringify(card+' .member-block')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(card+' .member-block')})?.textContent==='Blocked'`);
  assert.equal(await repo.enhancements.store.count('blocks',{userId:owner.id,targetId:people[1].id}),1);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(card+' .member-follow')}).disabled`),true);
  await navigate('forums.html#latest');await ready();
  assert.equal(await evaluate(`document.querySelectorAll('[data-member-preview]').length`),0);
 });
};
