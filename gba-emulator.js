(() => {
 'use strict';
 class Player {
  constructor(host,onStatus){this.host=host;this.onStatus=onStatus;this.frame=null;this.pending=null;this.started=false;this.receive=e=>{if(e.origin!==location.origin||e.source!==this.frame?.contentWindow||e.data?.scope!=='dexhaven-gba')return;this.onStatus(e.data);if(e.data.type==='started'){this.started=true;this.state(true);}if(e.data.type==='error'&&!this.started)this.state(false);if(e.data.type==='exit'){if(this.pending)this.pending.finish();else this.destroy();}};addEventListener('message',this.receive);}
  state(active){dispatchEvent(new CustomEvent('dexhaven:gba-state',{detail:{active}}));}
  async open(info){addEventListener('message',this.receive);await this.stop();this.started=false;this.state(true);const frame=document.createElement('iframe');frame.title=info.title+' GBA player';frame.allow='autoplay; fullscreen; gamepad';frame.src=info.playerUrl;frame.onerror=()=>this.state(false);this.frame=frame;this.host.replaceChildren(frame);}
  stop(){if(!this.frame)return Promise.resolve();if(this.pending)return this.pending.promise;const frame=this.frame;let resolve,timer;const promise=new Promise(r=>{resolve=r;});const finish=()=>{clearTimeout(timer);if(this.frame===frame)this.destroy();this.pending=null;resolve();};timer=setTimeout(finish,2200);this.pending={promise,finish};frame.contentWindow.postMessage({scope:'dexhaven-gba',type:'exit'},location.origin);return promise;}
  destroy(){const existed=Boolean(this.frame);this.frame?.remove();this.frame=null;this.host.replaceChildren();this.pending=null;if(existed)this.state(false);}
  async dispose(){await this.stop();removeEventListener('message',this.receive);}
 }
 globalThis.GBAPlayer=Player;
})();
