(() => {
 'use strict';
 const KEY='dexhaven.music.v1',LEASE='dexhaven.music.lease';
 const validId=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
 function normalize(value={}){return{enabled:value.enabled===true,playing:value.playing===true,track:validId(value.track)?value.track:null,playlist:typeof value.playlist==='string'?value.playlist.slice(0,200):'',position:Number.isFinite(value.position)?Math.max(0,value.position):0,volume:Number.isFinite(value.volume)?Math.max(0,Math.min(1,value.volume)):.35,muted:value.muted===true,shuffle:value.shuffle===true,repeat:['off','all','one'].includes(value.repeat)?value.repeat:'all',order:Array.isArray(value.order)?[...new Set(value.order.filter(validId))].slice(0,20000):[]};}
 function read(storage){try{return normalize(JSON.parse(storage.getItem(KEY)||'{}'));}catch{return normalize();}}
 function write(storage,state){try{storage.setItem(KEY,JSON.stringify(normalize(state)));return true;}catch{return false;}}
 function shuffled(ids,random=Math.random){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 class Queue{
  constructor(ids,{shuffle=false,repeat='all',current=null,order=[],random=Math.random}={}){this.ids=[...new Set(ids)];this.shuffle=shuffle;this.repeat=repeat;this.random=random;this.order=shuffle?[...order.filter((id,i)=>this.ids.includes(id)&&order.indexOf(id)===i),...shuffled(this.ids.filter(id=>!order.includes(id)),random)]:[...this.ids];this.index=Math.max(0,this.order.indexOf(current));}
  get current(){return this.order[this.index]||null;}
  select(id){const at=this.order.indexOf(id);if(at>=0)this.index=at;return this.current;}
  setShuffle(value){const current=this.current;this.shuffle=value;this.order=value?[current,...shuffled(this.ids.filter(id=>id!==current),this.random)].filter(Boolean):[...this.ids];this.index=Math.max(0,this.order.indexOf(current));}
  advance(direction=1,ended=false){if(!this.order.length)return null;if(ended&&this.repeat==='one')return this.current;const next=this.index+direction;if(next>=0&&next<this.order.length){this.index=next;return this.current;}if(this.repeat!=='all')return null;
   if(direction>0&&this.shuffle&&this.order.length>1){const old=this.current;this.order=shuffled(this.ids,this.random);if(this.order[0]===old)[this.order[0],this.order[1]]=[this.order[1],this.order[0]];}
   this.index=direction>0?0:this.order.length-1;return this.current;
  }
 }
 const api={KEY,LEASE,normalize,read,write,Queue,shuffled};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.DexhavenMusicLibrary=api;
})();
