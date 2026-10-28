(() => {
 'use strict';
 class Player {
  constructor(host,onStatus){this.host=host;this.onStatus=onStatus;this.frame=null;this.pending=null;this.receive=e=>{if(e.origin!==location.origin||e.source!==this.frame?.contentWindow||e.data?.scope!=='dexhaven-gba')return;this.onStatus(e.data);if(e.data.type==='exit'){if(this.pending)this.pending.finish();else this.destroy();}};addEventListener('message',this.receive);}
  async open(info){addEventListener('message',this.receive);await this.stop();const frame=document.createElement('iframe');frame.title=info.title+' GBA player';frame.allow='autoplay; fullscreen; gamepad';frame.src=info.playerUrl;this.frame=frame;this.host.replaceChildren(frame);}
  stop(){if(!this.frame)return Promise.resolve();if(this.pending)return this.pending.promise;const frame=this.frame;let resolve,timer;const promise=new Promise(r=>{resolve=r;});const finish=()=>{clearTimeout(timer);if(this.frame===frame)this.destroy();this.pending=null;resolve();};timer=setTimeout(finish,2200);this.pending={promise,finish};frame.contentWindow.postMessage({scope:'dexhaven-gba',type:'exit'},location.origin);return promise;}
  destroy(){this.frame?.remove();this.frame=null;this.host.replaceChildren();this.pending=null;}
  async dispose(){await this.stop();removeEventListener('message',this.receive);}
 }
 globalThis.GBAPlayer=Player;
})();
