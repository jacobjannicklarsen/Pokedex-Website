(() => {'use strict';
 // A single generation token owns every scheduled turn. Pause/restart cancels it.
 class Runner{constructor({turn,onError,set=(fn,ms)=>setTimeout(fn,ms),clear=id=>clearTimeout(id)}){this.turn=turn;this.onError=onError;this.set=set;this.clear=clear;this.generation=0;this.timer=null;this.running=false;this.delay=900;}stop(){this.generation++;this.running=false;if(this.timer!==null)this.clear(this.timer);this.timer=null;}start(delay=this.delay){this.stop();this.delay=delay;this.running=true;this.schedule(this.generation);}schedule(token){this.timer=this.set(()=>{this.timer=null;if(!this.running||token!==this.generation)return;try{const again=this.turn();if(again&&this.running&&token===this.generation)this.schedule(token);else this.stop();}catch(e){this.stop();this.onError?.(e);}},this.delay);}}
 if(typeof module!=='undefined'&&module.exports)module.exports={Runner};else globalThis.BattleRunner=Runner;
})();
