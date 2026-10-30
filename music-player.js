(() => {
 'use strict';
 if(globalThis.DexhavenMusic||document.querySelector('meta[name="dexhaven-private-music"][content="disabled"]'))return;
 const lib=globalThis.DexhavenMusicLibrary;if(!lib)return;
 const lifetime=new AbortController(),listen=(target,event,handler)=>target.addEventListener(event,handler,{signal:lifetime.signal});
 let storage;try{storage=localStorage;}catch{}
 let state=lib.read(storage),tracks=[],queue=new lib.Queue([]),userId=null,revision=0,playRevision=0,pendingSeek=null,lastSaved=0,emulating=false,emulatorTimer,leaving=false,blockedByTab=false,storageWarned=false;
 const failed=new Set(),tab=crypto.randomUUID(),audio=new Audio();audio.preload='metadata';audio.volume=state.volume;audio.muted=state.muted;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const paths={music:'M9 18V5l12-3v13M9 8l12-3M9 18c0 1.7-1.6 3-3.5 3S2 20 2 18.5 3.6 16 5.5 16 9 16.7 9 18Zm12-3c0 1.7-1.6 3-3.5 3s-3.5-1-3.5-2.5 1.6-2.5 3.5-2.5 3.5.7 3.5 2Z',play:'m8 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',next:'m5 5 10 7-10 7ZM19 5v14',previous:'m19 5-10 7 10 7ZM5 5v14',expand:'m6 14 6-6 6 6',collapse:'m6 10 6 6 6-6',shuffle:'M3 6h3c5 0 7 12 12 12h3M18 15l3 3-3 3M3 18h3c1.5 0 3-2 4-4M14 8c1-1 2.5-2 4-2h3M18 3l3 3-3 3',repeat:'m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',volume:'M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',mute:'M11 4 6 8H3v8h3l5 4ZM16 9l6 6M22 9l-6 6'};
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]);svg.append(path);return svg;}
 function button(label,image,action,cls=''){const b=node('button','music-button '+cls);b.type='button';b.setAttribute('aria-label',label);b.title=label;b.append(icon(image));b.onclick=action;return b;}
 const root=node('aside','music-player');root.hidden=true;root.setAttribute('aria-label','Dexhaven soundtrack player');
 const bar=node('div','music-bar'),symbol=node('span','music-symbol');symbol.append(icon('music'));
 const copy=node('div','music-copy'),title=node('strong','','Pokémon soundtrack'),subtitle=node('small','','Site soundtrack');copy.append(title,subtitle);
 const panel=node('section','music-panel');panel.id='music-panel';panel.hidden=true;panel.setAttribute('aria-label','Soundtrack controls');
 const compactPlay=button('Play music','play',togglePlay,'music-play'),compactNext=button('Next track','next',()=>advance(1)),expand=button('Expand music player','expand',()=>setExpanded(panel.hidden));expand.setAttribute('aria-controls',panel.id);expand.setAttribute('aria-expanded','false');bar.append(symbol,copy,compactPlay,compactNext,expand);
 const heading=node('h2','music-heading','Your soundtrack'),region=node('p','form-help','All Tracks'),status=node('p','music-status','Loading the music library…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const controls=node('div','music-controls'),previous=button('Previous track','previous',()=>advance(-1)),play=button('Play music','play',togglePlay,'music-play'),next=button('Next track','next',()=>advance(1)),shuffle=button('Shuffle','shuffle',()=>{state.shuffle=!state.shuffle;queue.setShuffle(state.shuffle);save();render();}),repeat=button('Repeat all','repeat',()=>{state.repeat={all:'one',one:'off',off:'all'}[state.repeat];queue.repeat=state.repeat;save();render();});controls.append(shuffle,previous,play,next,repeat);
 const seek=node('input');seek.type='range';seek.min=0;seek.max=100;seek.step=.1;seek.value=0;seek.disabled=true;seek.setAttribute('aria-label','Seek within track');
 const progress=node('div','music-progress'),elapsed=node('span','','0:00'),duration=node('span','','—');progress.append(elapsed,duration);
 const volumeRow=node('div','music-volume'),mute=button('Mute music','volume',()=>{state.muted=!state.muted;audio.muted=state.muted;save();render();}),volume=node('input'),volumeValue=node('output');volume.type='range';volume.min=0;volume.max=100;volume.step=1;volume.value=Math.round(state.volume*100);volume.setAttribute('aria-label','Music volume');volumeRow.append(mute,volume,volumeValue);
 const playlistLabel=node('label','music-playlist-label','Playlist'),playlist=node('select');playlist.setAttribute('aria-label','Soundtrack playlist');playlistLabel.append(playlist);
 const list=node('ol','music-track-list');list.setAttribute('aria-label','Available tracks');
 const tools=node('div','music-tools'),refresh=node('button','text-button','Refresh library'),disable=node('button','text-button','Turn music off');refresh.type=disable.type='button';refresh.onclick=()=>loadLibrary(true);disable.onclick=()=>{state.enabled=false;state.playing=false;audio.pause();release();save();notify('Music is off. Press Play whenever you want to listen.');render();};tools.append(refresh,disable);
 panel.append(heading,region,status,controls,seek,progress,volumeRow,playlistLabel,list,tools);root.append(bar,panel);document.body.append(root);
 function notify(text){status.textContent=text;}
 function setExpanded(value){panel.hidden=!value;expand.setAttribute('aria-expanded',String(value));expand.setAttribute('aria-label',value?'Collapse music player':'Expand music player');expand.title=expand.getAttribute('aria-label');expand.replaceChildren(icon(value?'collapse':'expand'));}
 function time(value){return Number.isFinite(value)?Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0'):'—';}
 function currentTrack(){return tracks.find(t=>t.id===state.track);}
 function render(){
  const track=currentTrack(),playing=!audio.paused&&!audio.ended;title.textContent=track?.title||(tracks.length?'Choose your soundtrack':'Soundtrack unavailable');title.title=title.textContent;heading.textContent=track?.title||'Your soundtrack';region.textContent=state.playlist||'All Tracks';
  subtitle.textContent=emulating?'Paused for your game':blockedByTab?'Playing in another tab':playing?'Now playing':track?'Paused · '+(track.playlist||'All Tracks'):'Site soundtrack';
  for(const b of [play,compactPlay]){b.replaceChildren(icon(playing?'pause':'play'));const label=playing?'Pause music':'Play music';b.setAttribute('aria-label',label);b.title=label;b.disabled=!track||emulating;}
  for(const b of [previous,next,compactNext,shuffle,repeat])b.disabled=!queue.current||emulating;
  shuffle.setAttribute('aria-pressed',String(state.shuffle));repeat.setAttribute('aria-pressed',String(state.repeat!=='off'));repeat.setAttribute('aria-label','Repeat '+state.repeat);repeat.title='Repeat '+state.repeat;repeat.dataset.mode=state.repeat;
  mute.replaceChildren(icon(state.muted?'mute':'volume'));mute.setAttribute('aria-label',state.muted?'Unmute music':'Mute music');mute.title=mute.getAttribute('aria-label');mute.setAttribute('aria-pressed',String(state.muted));volumeValue.value=Math.round(state.volume*100)+'%';volume.value=Math.round(state.volume*100);volume.setAttribute('aria-valuetext',volumeValue.value);
  for(const b of list.querySelectorAll('button')){if(b.dataset.id===state.track)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
 }
 function renderList(){
  list.replaceChildren();for(const [i,t]of tracks.filter(t=>!state.playlist||t.playlist===state.playlist).entries()){const li=node('li'),b=node('button','music-track');b.type='button';b.dataset.id=t.id;b.append(node('span','',String(i+1).padStart(2,'0')),node('span','',t.title));b.onclick=()=>{failed.clear();queue.select(t.id);state.enabled=true;select(t.id,0,false);start(true);};li.append(b);list.append(li);}if(!list.children.length)list.append(node('li','music-status','No playable tracks in this playlist.'));
 }
 function rebuildQueue(){const ids=tracks.filter(t=>!state.playlist||t.playlist===state.playlist).map(t=>t.id);queue=new lib.Queue(ids,{...state,current:state.track});state.track=queue.current;}
 function save(){
  if(leaving||blockedByTab)return;state.order=[...queue.order];if(audio.src&&pendingSeek===null&&Number.isFinite(audio.currentTime))state.position=audio.currentTime;
  if(!lib.write(storage,state)&&!storageWarned){storageWarned=true;notify('Browser storage is unavailable. Playback works, but preferences cannot be remembered.');}
 }
 function getLease(){try{return JSON.parse(storage?.getItem(lib.LEASE)||'null');}catch{return null;}}
 function claim(explicit=false){
  const owner=getLease();if(!explicit&&owner&&owner.tab!==tab&&owner.until>Date.now()){blockedByTab=true;notify('Music is playing in another tab. Press Play to listen here.');render();return false;}
  blockedByTab=false;try{storage?.setItem(lib.LEASE,JSON.stringify({tab,until:Date.now()+8000}));}catch{}channel?.postMessage({type:'claim',tab});return true;
 }
 function release(){try{if(getLease()?.tab===tab)storage?.removeItem(lib.LEASE);}catch{}}
 let channel;try{channel=new BroadcastChannel('dexhaven.music');channel.onmessage=e=>{if(e.data?.type==='claim'&&e.data.tab!==tab)yieldToTab();};}catch{}
 function yieldToTab(){if(audio.paused)return;audio.pause();blockedByTab=true;notify('Music moved to another tab. Press Play to listen here.');render();}
 listen(window,'storage',e=>{if(e.key===lib.LEASE){const owner=getLease();if(owner?.tab!==tab&&owner?.until>Date.now())yieldToTab();}});
 async function start(explicit=false){
  if(emulating||!currentTrack()||leaving)return;if(!claim(explicit))return;const token=++playRevision;state.enabled=true;state.playing=true;save();
  try{await audio.play();if(token!==playRevision||leaving)return;notify('Enjoy your soundtrack.');render();}
  catch(e){if(token!==playRevision||leaving||e.name==='AbortError')return;release();if(e.name==='NotAllowedError'){notify('Press Play to resume. Your browser needs a new interaction on this page.');render();}else unavailable();}
 }
 function togglePlay(){if(emulating)return;failed.clear();if(!audio.paused){playRevision++;state.playing=false;audio.pause();release();save();notify('Music paused.');render();}else{if(!audio.src&&state.track)select(state.track,state.position,false);start(true);}}
 function select(id,position=0,shouldPlay=state.playing){
  const track=tracks.find(t=>t.id===id);if(!track)return;playRevision++;audio.pause();state.track=id;state.position=position;pendingSeek=position;state.playing=shouldPlay;audio.src='/api/local/music/stream/'+id;audio.load();seek.disabled=true;duration.textContent='—';elapsed.textContent=time(position);render();save();if(shouldPlay&&state.enabled&&!emulating)start();
 }
 function advance(direction,ended=false){
  if(emulating)return;if(direction<0&&audio.currentTime>3){try{audio.currentTime=0;state.position=0;save();}catch{notify('This track cannot seek yet.');}return;}
  const id=queue.advance(direction,ended);if(id)select(id,0,state.playing);else{state.playing=false;audio.pause();release();save();notify('End of playlist. Choose a track or enable Repeat all.');render();}
 }
 function unavailable(){
  if(leaving||!state.track||failed.has(state.track))return;failed.add(state.track);const wasPlaying=state.playing;
  if(!wasPlaying){notify('This track could not be loaded. Refresh the library or choose another track.');return;}
  let id=null;for(let n=0;n<queue.order.length;n++){const candidate=queue.advance(1);if(!candidate)break;if(!failed.has(candidate)){id=candidate;break;}}
  if(id){select(id,0,true);notify('A track was unavailable or unsupported. Skipping to the next track.');}else{state.playing=false;audio.pause();release();save();notify('No remaining playable tracks. Refresh the library or choose a different playlist.');render();}
 }
 listen(audio,'loadedmetadata',()=>{if(pendingSeek!==null){const target=Number.isFinite(audio.duration)?Math.min(pendingSeek,Math.max(0,audio.duration-.25)):0;try{audio.currentTime=target;}catch{notify('The saved position could not be restored. Starting from the beginning.');}pendingSeek=null;}duration.textContent=time(audio.duration);seek.max=Number.isFinite(audio.duration)?audio.duration:100;seek.disabled=!Number.isFinite(audio.duration)||audio.duration<=0;});
 for(const event of ['loadedmetadata','canplay','progress','durationchange'])listen(audio,event,()=>{seek.disabled=!Number.isFinite(audio.duration)||audio.duration<=0||!audio.seekable.length;});
 listen(audio,'timeupdate',()=>{if(pendingSeek===null){elapsed.textContent=time(audio.currentTime);seek.value=audio.currentTime;seek.setAttribute('aria-valuetext',time(audio.currentTime)+' of '+time(audio.duration));}if(Date.now()-lastSaved>5000){lastSaved=Date.now();save();}});
 listen(audio,'play',render);listen(audio,'pause',render);listen(audio,'ended',()=>advance(1,true));listen(audio,'error',unavailable);
 seek.oninput=()=>{try{if(!Number.isFinite(audio.duration)||!audio.seekable.length)throw Error();audio.currentTime=Number(seek.value);state.position=audio.currentTime;save();}catch{notify('Seeking is not available for this track yet.');}};
 volume.oninput=()=>{state.volume=Number(volume.value)/100;audio.volume=state.volume;save();render();};
 playlist.onchange=()=>{state.playlist=playlist.value;state.order=[];state.track=null;failed.clear();rebuildQueue();renderList();if(queue.current)select(queue.current,0,state.playing);else{audio.pause();audio.removeAttribute('src');audio.load();state.playing=false;save();render();}};
 async function loadLibrary(force=false){
  const token=++revision;refresh.disabled=true;notify('Loading the music library…');
  try{const data=await DexhavenAccount.request('/local/music/tracks'+(force?'?refresh=1':''));if(token!==revision)return;tracks=data.tracks.filter(t=>Boolean(audio.canPlayType(t.mime)));if(!data.playlists.includes(state.playlist))state.playlist='';
   playlist.replaceChildren(new Option('All Tracks',''));for(const p of data.playlists.filter(p=>tracks.some(t=>t.playlist===p)))playlist.add(new Option(p,p));playlist.value=state.playlist;
   const old=state.track,position=state.position;rebuildQueue();renderList();failed.clear();if(state.track){if(audio.src&&old===state.track){render();}else select(state.track,old===state.track?position:0,state.playing&&state.enabled);notify(tracks.length+' tracks in the music library.');}else{audio.pause();audio.removeAttribute('src');audio.load();state.playing=false;notify(data.tracks.length?'Your browser does not support the available audio formats.':'No supported audio files found. Add audio to your private folder, then refresh.');render();}
  }catch(e){if(token!==revision)return;notify(e.status===404?'Private music is unavailable here. Use your configured local installation.':e.status===401||e.status===403?'Log in to use music.':'The private music library is unavailable. Check the local configuration, then refresh.');if(!tracks.length)render();}
  finally{if(token===revision)refresh.disabled=false;}
 }
 function session(){
  const user=DexhavenAccount.getUser(),id=user?.id||null;if(id===userId)return;revision++;playRevision++;audio.pause();release();root.hidden=!id;
  if(!id){userId=null;tracks=[];audio.removeAttribute('src');audio.load();return;}userId=id;leaving=false;blockedByTab=false;state=lib.read(storage);audio.volume=state.volume;audio.muted=state.muted;loadLibrary();
 }
 function emulator(active){
  clearTimeout(emulatorTimer);if(active){emulating=true;playRevision++;audio.pause();save();notify('Soundtrack paused while the GBA player is active.');render();}
  else emulatorTimer=setTimeout(()=>{emulating=false;render();if(state.playing&&state.enabled&&!blockedByTab)start();},250);
 }
 listen(window,'dexhaven:gba-state',e=>emulator(Boolean(e.detail?.active)));
 listen(window,'dexhaven:session',e=>{if(e.detail.ready)session();});
 const heartbeat=setInterval(()=>{if(!audio.paused&&!leaving){try{storage?.setItem(lib.LEASE,JSON.stringify({tab,until:Date.now()+8000}));}catch{}}},2500);
 listen(window,'pagehide',()=>{save();leaving=true;playRevision++;audio.pause();release();clearTimeout(emulatorTimer);});
 listen(window,'pageshow',e=>{if(e.persisted){leaving=false;emulating=false;if(state.playing&&state.enabled&&!root.hidden)start();}});
 listen(document,'visibilitychange',()=>{if(document.hidden)save();});
 // A single page instance, exposed only for lifecycle observation; no raw paths/audio data.
 globalThis.DexhavenMusic={getState:()=>({...state,actualPlaying:!audio.paused,emulating,blockedByTab}),dispose:()=>{save();leaving=true;audio.pause();release();clearInterval(heartbeat);clearTimeout(emulatorTimer);revision++;playRevision++;lifetime.abort();channel?.close();audio.removeAttribute('src');audio.load();root.remove();delete globalThis.DexhavenMusic;}};
 render();if(globalThis.DexhavenAccount?.isReady())session();
})();
