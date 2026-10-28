(() => {
 'use strict';let closing=false,started=false;const status=document.getElementById('player-status');
 const tell=(type,text)=>{status.textContent=text;parent.postMessage({scope:'dexhaven-gba',type,text},location.origin);};
 function exit(){if(closing)return;closing=true;tell('closing','Saving and closing the game…');window.dispatchEvent(new Event('beforeunload'));setTimeout(()=>tell('exit','Back to the Game Library.'),1400);}
 addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.scope==='dexhaven-gba'&&e.data.type==='exit')exit();});
 async function init(){
  const game=new URLSearchParams(location.search).get('game'),response=await fetch('/api/local/gba/launch/'+encodeURIComponent(game));const info=await response.json();if(!response.ok)throw Error(info.error||'Game unavailable.');
  const id=await GBASaves.identity(info.id,info.fingerprint);
  await GBASaves.checkStorage();
  // Stable 4.2.3 checks a hardcoded remote version URL on localhost without a
  // rejection handler. Keep this pinned, private frame offline: answer only that
  // optional check with its installed version. All other fetches retain normal
  // browser behavior and the frame's same-origin CSP. No emulator internals change.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,options)=>String(input?.url||input)==='https://cdn.emulatorjs.org/stable/data/version.json'
   ?Promise.resolve(new Response(JSON.stringify({version:'4.2.3',current_version:'4.2.3'}),{headers:{'Content-Type':'application/json'}}))
   :nativeFetch(input,options);
  Object.assign(window,{EJS_player:'#game',EJS_core:'gba',EJS_gameUrl:info.romUrl,EJS_gameName:id.key,EJS_gameID:id.numeric,EJS_pathtodata:'/api/local/gba/runtime/',EJS_startOnLoaded:true,EJS_disableAutoLang:true,EJS_language:'en-US',EJS_threads:false,EJS_forceLegacyCores:true,EJS_CacheLimit:0,EJS_color:'#80e5b8',EJS_backgroundColor:'#10171e',EJS_volume:.5,EJS_defaultOptions:{'save-save-interval':'30'},EJS_Buttons:{saveState:{visible:false},loadState:{visible:false},quickSave:{visible:false},quickLoad:{visible:false},netplay:{visible:false},cheat:{visible:false},cacheManager:{visible:false},saveSavFiles:{visible:true,displayName:'Export save'},loadSavFiles:{visible:true,displayName:'Import save'},exitEmulation:{visible:true,displayName:'Exit to library',callback:()=>{setTimeout(exit,0);}}},EJS_onGameStart:()=>{started=true;tell('started',info.title+' is running. Normal in-game saves stay in this browser.');},EJS_onSaveSave:async e=>{
   try{if(!e.save)throw Error('There is no in-game save to export yet.');const bytes=GBASaves.validate(e.save,id.key+'.sav',id);let backedUp=true;try{await GBASaves.put(id,bytes);}catch{backedUp=false;}GBASaves.download(bytes,id.key+'.sav');tell(backedUp?'backup':'export',backedUp?'Save exported and a separate local backup was stored.':'Save exported, but browser storage could not keep a separate backup. Keep the downloaded file safe.');}catch(e){tell('error',e.message);}
  }});
  // Validate the native toolbar's raw save input before its change handler runs.
  // Only documented toolbar/callback APIs are used; no gameManager/FS access.
  addEventListener('change',e=>{const input=e.target;if(!(input instanceof HTMLInputElement)||input.type!=='file'||!input.files?.length)return;const file=input.files[0];const known=file.name.match(/^([a-z]+)-([a-f0-9]{64})\.sav$/i);const valid=/\.sav$/i.test(file.name)&&[512,8192,32768,65536,131072].some(n=>file.size>=n&&file.size<=n+16)&&(!known||known[1]===id.game&&known[2]===id.fingerprint);if(!valid||!confirm('Import a save from this exact game and ROM revision? This overwrites the current in-game save. Export a backup first.')){e.stopImmediatePropagation();e.preventDefault();input.value='';tell('error',valid?'Save import cancelled.':'That save has an unsupported size or belongs to another game/revision.');}else tell('import','Importing the save through the emulator. Let it restart before continuing.');},true);
  addEventListener('error',e=>tell('error',e.message||'The emulator could not start.'));
  addEventListener('unhandledrejection',()=>tell('error','Emulation or browser storage failed. Export a backup before leaving if possible.'));
  const script=document.createElement('script');script.src='/api/local/gba/runtime/loader.js';script.onerror=()=>tell('error','Emulator files are missing. Run npm run vendor:emulator.');document.head.append(script);
  setTimeout(()=>{if(!started&&!closing)tell('error','Loading is taking longer than expected. Check the local emulator files and browser console.');},45000);
 }
 init().catch(e=>tell('error',e.message));
})();
