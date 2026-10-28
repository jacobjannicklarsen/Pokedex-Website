const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
module.exports=async({check,evaluate,command,waitFor,origin,repo,musicDir})=>{
 const real=Boolean(process.env.QA_MUSIC_REAL_FILES),pause=ms=>new Promise(r=>setTimeout(r,ms));
 if(!real){const rate=8000,samples=rate*60,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*1500),44+i*2);
  for(const name of ['Kanto/Pallet_Town.wav','Kanto/RouteOne.wav','Johto/NewBarkTown.wav','Hoenn/LittlerootTown.wav','QuietTheme.wav']){const file=path.join(musicDir,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);}
 }
 const owner=await repo.createUser({username:'music_browser',email:'music-browser@example.test'},await require('argon2').hash('Music browser password'));await repo.administration.bootstrapOwner(owner.id);
 async function nav(page=''){await command('Page.navigate',{url:origin+'/'+page});await waitFor(`globalThis.DexhavenAccount?.isReady()&&globalThis.DexhavenMusic`);}
 async function click(selector){const pt=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'nearest',behavior:'instant'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pt});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pt});}
 const state=()=>evaluate('DexhavenMusic.getState()');
 async function playing(){await waitFor('DexhavenMusic.getState().actualPlaying');}
 async function pauseMusic(){if((await state()).actualPlaying)await click('.music-bar .music-play');}
 await command('Page.addScriptToEvaluateOnNewDocument',{source:'window.musicTestAudios=[];const NativeMusicAudio=window.Audio;window.Audio=function(...args){const audio=new NativeMusicAudio(...args);musicTestAudios.push(audio);return audio;};window.Audio.prototype=NativeMusicAudio.prototype;'});
 await nav();
 await check('soundtrack stays private for guests; Owner gets the discovered catalog and real controls',async()=>{
  assert.equal(await evaluate('document.querySelector(".music-player").hidden'),true);
  await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='music_browser';document.querySelector('#auth-password').value='Music browser password';document.querySelector('#auth-form').requestSubmit()`);
  await waitFor('document.querySelectorAll(".music-track").length>0');assert.equal((await state()).volume,.35);assert.equal((await state()).actualPlaying,false);
  await click('.music-bar button:last-child');assert.equal(await evaluate('document.querySelector(".music-panel").hidden'),false);
  assert.equal(await evaluate('document.querySelectorAll(".music-track").length'),real?9:5);
 });
 await check('native audio plays/pauses and supports seek, volume and mute',async()=>{
  await click('.music-bar .music-play');await playing();await waitFor('Number(document.querySelector(".music-panel > input").value)>.1');
  await evaluate('(()=>{const v=document.querySelector(".music-volume input");v.value=63;v.dispatchEvent(new Event("input"))})()');assert.equal((await state()).volume,.63);
  await click('.music-volume button');assert.equal((await state()).muted,true);await click('.music-volume button');assert.equal((await state()).muted,false);
  await evaluate('(()=>{const s=document.querySelector(".music-panel > input");s.value=3.5;s.dispatchEvent(new Event("input"))})()');assert.ok((await state()).position>=3.4);
  await click('.music-bar .music-play');assert.equal((await state()).actualPlaying,false);assert.equal((await state()).playing,false);
 });
 await check('next/previous, shuffle, repeat modes, populated playlists and direct track selection work',async()=>{
  const first=(await state()).track;await click('.music-controls button[aria-label="Next track"]');assert.notEqual((await state()).track,first);await click('.music-controls button[aria-label="Previous track"]');assert.equal((await state()).track,first);
  await click('.music-controls button[aria-label="Shuffle"]');assert.equal((await state()).shuffle,true);await click('.music-controls button[aria-label="Next track"]');assert.notEqual((await state()).track,first);
  for(const mode of ['one','off','all']){await click('.music-controls button[data-mode]');assert.equal((await state()).repeat,mode);}
  if(!real){await evaluate('(()=>{const p=document.querySelector(".music-player select");p.value="Kanto";p.dispatchEvent(new Event("change"))})()');assert.equal(await evaluate('document.querySelectorAll(".music-track").length'),2);}
  await click('.music-track-list button');await playing();
 });
 await check('native end-of-track advances, repeats one and stops when repeat is off',async()=>{
  await click('.music-controls button[data-mode]');assert.equal((await state()).repeat,'one');const same=(await state()).track;await waitFor('!document.querySelector(".music-panel > input").disabled');await evaluate('musicTestAudios[0].currentTime=musicTestAudios[0].duration-.05');await waitFor('musicTestAudios[0].currentTime<2&&DexhavenMusic.getState().actualPlaying');assert.equal((await state()).track,same);
  await click('.music-controls button[data-mode]');assert.equal((await state()).repeat,'off');const last=(await state()).order.at(-1);await click('.music-track[data-id="'+last+'"]');await waitFor('!document.querySelector(".music-panel > input").disabled');await evaluate('musicTestAudios[0].currentTime=musicTestAudios[0].duration-.05');await waitFor('!DexhavenMusic.getState().playing');assert.equal((await state()).actualPlaying,false);
  await click('.music-controls button[data-mode]');await click('.music-bar .music-play');await playing();await evaluate('musicTestAudios[0].currentTime=musicTestAudios[0].duration-.05');await waitFor('DexhavenMusic.getState().track!=='+JSON.stringify(last));await playing();
 });
 await check('reload and full-page navigation restore preferences, track and approximate position',async()=>{
  await waitFor('!document.querySelector(".music-panel > input").disabled');
  await evaluate('(()=>{const s=document.querySelector(".music-panel > input");s.value=4;s.dispatchEvent(new Event("input"))})()');const before=await state();await command('Page.reload');await waitFor('globalThis.DexhavenMusic?.getState().track&&document.querySelectorAll(".music-track").length>0');await pause(400);
  let after=await state();assert.equal(after.track,before.track);assert.equal(after.volume,.63);assert.equal(after.shuffle,true);assert.equal(after.playlist,before.playlist);assert.ok(after.position>=3.5);if(!after.actualPlaying)assert.ok(await evaluate('document.querySelector(".music-status").textContent.includes("Press Play")'));
  await nav('pokemon.html');await waitFor('DexhavenMusic.getState().track!==null');after=await state();assert.equal(after.track,before.track);assert.equal(after.volume,.63);
  await nav('games.html');await waitFor('document.querySelectorAll(".music-track").length>0');await click('.music-bar button:last-child');
 });
 await check('GBA lifecycle pauses and conditionally resumes music without a game-switch blip',async()=>{
  if(!await evaluate('Boolean(globalThis.GBAPlayer)')){await nav('games.html');await waitFor('document.querySelectorAll(".music-track").length>0');await click('.music-bar button:last-child');}
  if(!(await state()).actualPlaying){await click('.music-bar .music-play');await playing();}
  await evaluate('window.testMusicHost=document.createElement("div");document.body.append(testMusicHost);window.testMusicGBA=new GBAPlayer(testMusicHost,()=>{});testMusicGBA.open({title:"Fixture GBA",playerUrl:"about:blank"})');await waitFor('DexhavenMusic.getState().emulating&&!DexhavenMusic.getState().actualPlaying');
  await evaluate('testMusicGBA.destroy()');await playing();
  await pauseMusic();await evaluate('testMusicGBA.open({title:"Fixture GBA",playerUrl:"about:blank"})');await waitFor('DexhavenMusic.getState().emulating');await evaluate('testMusicGBA.destroy()');await pause(400);assert.equal((await state()).actualPlaying,false);assert.equal((await state()).playing,false);
  await click('.music-bar .music-play');await playing();await evaluate('testMusicGBA.open({title:"Game one",playerUrl:"about:blank"})');await waitFor('DexhavenMusic.getState().emulating');
  await evaluate('window.playCalls=0;window.originalMusicPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){playCalls++;return originalMusicPlay.apply(this,args)};const old=testMusicGBA.frame.contentWindow;testMusicGBA.open({title:"Game two",playerUrl:"about:blank"});dispatchEvent(new MessageEvent("message",{origin:location.origin,source:old,data:{scope:"dexhaven-gba",type:"exit"}}))');await pause(500);assert.equal(await evaluate('playCalls'),0);assert.equal((await state()).emulating,true);
  await evaluate('HTMLMediaElement.prototype.play=originalMusicPlay;dispatchEvent(new MessageEvent("message",{origin:location.origin,source:testMusicGBA.frame.contentWindow,data:{scope:"dexhaven-gba",type:"error",text:"Fixture startup failure"}}))');await playing();await evaluate('testMusicGBA.destroy();testMusicHost.remove()');await pause(350);
 });
 await check('autoplay rejection is truthful and a later Play gesture recovers',async()=>{
  await pauseMusic();await evaluate('window.realMusicPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException("Fixture policy","NotAllowedError"))}');await click('.music-bar .music-play');await waitFor('document.querySelector(".music-status").textContent.includes("Press Play")');assert.equal((await state()).actualPlaying,false);assert.equal((await state()).playing,true);
  await evaluate('HTMLMediaElement.prototype.play=realMusicPlay');await click('.music-bar .music-play');await playing();
 });
 await check('simultaneous tabs yield playback to the explicitly selected tab',async()=>{
  const target=await command('Target.createTarget',{url:origin+'/about.html'}),attached=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const other=async expression=>{let r;try{r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},attached.sessionId);}catch(e){if(e.message.includes('Cannot find default execution context'))return undefined;throw e;}if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  try{for(let i=0;i<60;i++){if(await other('globalThis.DexhavenMusic?.getState().track'))break;await pause(100);}await pause(200);assert.equal(await other('DexhavenMusic.getState().actualPlaying'),false);
   await other('document.querySelector(".music-bar .music-play").click()');for(let i=0;i<60;i++){if(await other('DexhavenMusic.getState().actualPlaying'))break;await pause(100);}assert.equal(await other('DexhavenMusic.getState().actualPlaying'),true);await waitFor('!DexhavenMusic.getState().actualPlaying&&DexhavenMusic.getState().blockedByTab');
  }finally{await command('Target.closeTarget',{targetId:target.targetId});await command('Page.bringToFront');}
 });
 await check('missing/unsupported audio is skipped with bounded recovery; an empty catalog stays usable',async()=>{
  if(!(await state()).actualPlaying){await click('.music-bar .music-play');await playing();}const failedId=(await state()).track;assert.equal(await evaluate('musicTestAudios.length'),1);await evaluate('musicTestAudios[0].dispatchEvent(new Event("error"))');await waitFor('DexhavenMusic.getState().track!=='+JSON.stringify(failedId));await playing();
  await evaluate('for(let i=0;i<25&&DexhavenMusic.getState().playing;i++)musicTestAudios[0].dispatchEvent(new Event("error"))');await waitFor('document.querySelector(".music-status").textContent.includes("No remaining playable tracks")');assert.equal((await state()).actualPlaying,false);
  await evaluate('window.originalCatalogFetch=fetch;window.fetch=(url,options)=>String(url).includes("/api/local/music/tracks")?Promise.resolve(new Response(JSON.stringify({tracks:[],playlists:[]}))):originalCatalogFetch(url,options);document.querySelector(".music-tools button").click()');await waitFor('document.querySelector(".music-status").textContent.includes("No supported audio files")');assert.equal(await evaluate('document.querySelector(".music-bar .music-play").disabled'),true);
  await evaluate('window.fetch=originalCatalogFetch;document.querySelector(".music-tools button").click()');await waitFor('document.querySelectorAll(".music-track").length>0');
 });
 await check('player fits mobile/desktop themes and yields to open dialogs',async()=>{
  const dir=path.join(os.tmpdir(),'dexhaven-music-review');await fs.mkdir(dir,{recursive:true});for(const width of [320,375,768,1280])for(const theme of ['dark','light']){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));await pause(250);const r=await evaluate('(()=>{const r=document.querySelector(".music-player").getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}})()');assert.ok(r.left>=0&&r.right<=r.width&&r.top>=0&&r.bottom<=900);assert.equal(r.overflow,false);if(width===320||width===1280){const shot=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(dir,'player-'+width+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));}}
  await evaluate('document.querySelector("#auth-dialog").showModal()');assert.equal(await evaluate('getComputedStyle(document.querySelector(".music-player")).visibility'),'hidden');await evaluate('document.querySelector("#auth-dialog").close()');
 });
 if(real)await check('all nine unchanged owner MP3s decode and advance the native playback clock',async()=>{
  await evaluate('(()=>{const p=document.querySelector(".music-player select");p.value="";p.dispatchEvent(new Event("change"))})()');const ids=await evaluate('[...document.querySelectorAll(".music-track")].map(b=>b.dataset.id)');assert.equal(ids.length,9);
  for(const id of ids){await click('.music-track[data-id="'+id+'"]');await playing();await waitFor('musicTestAudios[0].readyState>=3&&!musicTestAudios[0].paused&&musicTestAudios[0].currentTime>.1&&musicTestAudios[0].currentSrc.endsWith('+JSON.stringify('/'+id)+')');assert.equal((await state()).track,id);}
 });
 await check('logout hides and stops the private soundtrack',async()=>{await evaluate('DexhavenAccount.request("/auth/logout",{method:"POST"}).then(()=>DexhavenAccount.refresh())');await waitFor('document.querySelector(".music-player").hidden');assert.equal((await state()).actualPlaying,false);});
 await check('duplicate scripts cannot create another player and public-preview mode makes no private requests',async()=>{
  await evaluate('new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="music-player.js?duplicate=1";s.onload=resolve;s.onerror=reject;document.head.append(s)})');assert.equal(await evaluate('musicTestAudios.length'),1);
  await evaluate('DexhavenMusic.dispose();const meta=document.createElement("meta");meta.name="dexhaven-private-music";meta.content="disabled";document.head.append(meta);window.previewMusicRequests=0;const originalPreviewFetch=fetch;window.fetch=(url,options)=>{if(String(url).includes("/api/local/music/"))previewMusicRequests++;return originalPreviewFetch(url,options)}');
  await evaluate('new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="music-player.js?preview=1";s.onload=resolve;s.onerror=reject;document.head.append(s)})');assert.equal(await evaluate('previewMusicRequests'),0);assert.equal(await evaluate('Boolean(globalThis.DexhavenMusic)'),false);assert.equal(await evaluate('document.querySelector(".music-player")'),null);
 });
};
