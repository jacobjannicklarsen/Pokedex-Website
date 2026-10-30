const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
module.exports=async({check,evaluate,command,waitFor,origin,repo})=>{
 const owner=await repo.createUser({username:'v072_owner',email:'v072@example.test'},await require('argon2').hash('Version 072 test password'));await repo.administration.bootstrapOwner(owner.id);
 const trainer=await repo.createUser({username:'v072_trainer',email:'trainer072@example.test'},'fixture-only');
 await repo.shoutbox.store.insert(trainer.id,'Welcome to the Shoutbox. <script>window.shoutXSS=true</script>');
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function nav(page){await command('Page.navigate',{url:origin+'/'+page});await waitFor(`location.href===${JSON.stringify(origin+'/'+page)}&&globalThis.DexhavenAccount?.isReady()`);}
 async function capture(name){const dir=path.join(os.tmpdir(),'dexhaven-v072-review');fs.mkdirSync(dir,{recursive:true});const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,name),Buffer.from(s.data,'base64'));}
 await check('homepage Shoutbox stays hidden for guests and supports signed-in posting/moderation',async()=>{
  await nav('');assert.equal(await evaluate(`document.querySelector('#shoutbox').hidden`),true);
  assert.equal(await evaluate('window.shoutXSS===true'),false);assert.equal(await evaluate(`document.querySelector('.shoutbox-form').hidden`),true);assert.equal(await evaluate(`document.querySelector('.shoutbox-remove')`),null);
  await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='v072_owner';document.querySelector('#auth-password').value='Version 072 test password';document.querySelector('#auth-form').requestSubmit()`);
  await waitFor(`DexhavenAccount.getUser()?.username==='v072_owner'&&document.querySelector('.shoutbox-form').hidden===false&&document.querySelector('.shoutbox-message')`);assert.equal(await evaluate(`document.querySelector('#shoutbox').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('.shoutbox-form').getBoundingClientRect().top>=document.querySelector('.shoutbox-history').getBoundingClientRect().bottom`),true);
  assert.equal(await evaluate(`document.querySelector('.shoutbox-send').disabled`),true);
  await evaluate(`document.querySelector('.shoutbox-form textarea').value='Hello from the Owner';document.querySelector('.shoutbox-form').requestSubmit()`);
  await waitFor(`document.querySelector('#shoutbox').textContent.includes('Hello from the Owner')`);
  await evaluate(`document.querySelector('.shoutbox-remove').click()`);await waitFor(`document.querySelector('.shoutbox-confirm[open]')`);
  await evaluate(`document.querySelector('.shoutbox-confirm textarea').value='Reviewing the public message';document.querySelector('.shoutbox-confirm form').requestSubmit()`);
  await waitFor(`document.querySelectorAll('.shoutbox-message').length===1`);
  assert.equal(repo.forums.store.data.audit.at(-1).action,'shoutbox.remove');
 });
 await check('Shoutbox can page beyond its bounded history window and return to live messages',async()=>{
  for(let i=0;i<240;i++)await repo.shoutbox.store.insert(trainer.id,'History fixture '+i);
  await nav('');await waitFor(`document.querySelectorAll('.shoutbox-message').length===30`);
  const first=()=>evaluate(`Number(document.querySelector('.shoutbox-message')?.dataset.messageId)`);
  for(let i=0;i<8;i++){const old=await first();await evaluate(`document.querySelector('.shoutbox-older:not([hidden]):not(:disabled)').click()`);await waitFor(`Number(document.querySelector('.shoutbox-message')?.dataset.messageId)<${old}`);}
  assert.equal(await first(),2);assert.equal(await evaluate(`document.querySelectorAll('.shoutbox-message').length`),200);
  await evaluate(`document.querySelector('.shoutbox-latest').click()`);
  await waitFor(`document.querySelectorAll('.shoutbox-message').length===30`);assert.equal(await first(),213);
 });
 await check('Game Library contains six native cards and browser saves isolate games and revisions',async()=>{
  await nav('games.html');assert.equal(await evaluate(`document.querySelectorAll('.game-card').length`),6);
  assert.equal(await evaluate(`document.querySelectorAll('.trainer-nav a[data-page="games"]').length`),1);
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes('IT-Arkitektur')`),false);
  const saves=await evaluate(`(async()=>{const a=await GBASaves.identity('ruby','a'.repeat(64)),b=await GBASaves.identity('lightplatinum','a'.repeat(64));await GBASaves.put(a,new Uint8Array(131072).fill(42));const own=await GBASaves.get(a.key),other=await GBASaves.get(b.key);return{own:own.data[0],other};})()`);
  assert.equal(saves.own,42);assert.equal(saves.other,null);
  await command('Page.reload');await waitFor(`globalThis.GBASaves&&globalThis.DexhavenAccount?.isReady()`);
  assert.equal(await evaluate(`(async()=>{const a=await GBASaves.identity('ruby','a'.repeat(64));return(await GBASaves.get(a.key)).data[0]})()`),42);
 });
 await check('player cleanup ignores foreign messages and old exit timers cannot destroy a new game',async()=>{
  const result=await evaluate(`(async()=>{const host=document.createElement('div');document.body.append(host);const p=new GBAPlayer(host,()=>{});await p.open({title:'Test one',playerUrl:'about:blank'});window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{scope:'dexhaven-gba',type:'exit'}}));const kept=!!p.frame;const old=p.frame.contentWindow,stopped=p.stop();window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:old,data:{scope:'dexhaven-gba',type:'exit'}}));await stopped;await p.open({title:'Test two',playerUrl:'about:blank'});await new Promise(r=>setTimeout(r,2300));const alive=!!p.frame;p.destroy();await p.dispose();host.remove();return{kept,alive}})()`);
  assert.deepEqual(result,{kept:true,alive:true});
 });
 await check('homepage and Games fit small/mobile/tablet/desktop in both themes',async()=>{
  for(const page of ['', 'games.html']){await nav(page);for(const width of [320,768,1280])for(const theme of ['dark','light']){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),true,page+'/'+width+'/'+theme);if(width!==768&&theme==='dark'){await evaluate(page?`scrollTo(0,0)`:`document.querySelector('#shoutbox').scrollIntoView({behavior:'instant',block:'center'})`);await capture((page?'games':'shoutbox')+'-'+width+'.png');}}}
 });
 if(process.env.QA_V072_REAL_ROMS)await check('all six authorized local ROMs start through the real EmulatorJS/mGBA player',async()=>{
  await nav('games.html');await waitFor(`document.querySelectorAll('.game-card button:enabled').length===6`);
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  for(const id of ['firered','leafgreen','ruby','sapphire','emerald','lightplatinum']){
   const cls='.game-'+({firered:'fire',leafgreen:'grass',ruby:'ruby',sapphire:'water',emerald:'emerald',lightplatinum:'platinum'}[id])+' button';
   await evaluate(`document.querySelector(${JSON.stringify(cls)}).scrollIntoView({behavior:'instant',block:'center'})`);const pt=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(cls)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pt});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pt});
   for(let n=0;n<30;n++){const status=await evaluate(`document.querySelector('#games-status').textContent`);if(status.includes('is running'))break;if(/EvalError|Content Security|missing|unavailable|failed|Failed/.test(status))throw Error(id+': '+status);await pause(500);}
   assert.ok(await evaluate(`document.querySelector('#games-status').textContent.includes('is running')`),id+' starts');
   await pause(1800);assert.ok(await evaluate(`document.querySelector('#games-viewport iframe').contentDocument.querySelector('canvas')?.width>0`),id+' canvas');await capture('real-'+id+'.png');
   await evaluate(`document.querySelector('#games-exit').click()`);await waitFor(`document.querySelector('#games-player').hidden===true`);
  }
 });
};
