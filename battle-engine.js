// Standard Arena configurations use the full simulator; retain the small engine for legacy consumers.
(() => {
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const legacy=node?require('./battle-engine-legacy'):globalThis.LegacyBattleEngine;
 const simulator=node?require('./battle-simulator'):globalThis.BattleSimulator;
 const native=p=>p?.simulator==='showdown-gen5';
 const api={
  create:(left,right,options)=>native(left)&&native(right)?simulator.create(left,right,options):legacy.create(left,right),
  choices:p=>(native(p)?simulator:legacy).choices(p),
  chooseAI:(state,...args)=>(native(state)?simulator:legacy).chooseAI(state,...args),
  step:(state,...args)=>(native(state)?simulator:legacy).step(state,...args),
  summary:state=>(native(state)?simulator:legacy).summary(state)
 };
 if(node)module.exports=api;else globalThis.BattleEngine=api;
})();
