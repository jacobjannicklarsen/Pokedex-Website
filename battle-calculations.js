(() => {'use strict';
 const statNames=['hp','attack','defense','special-attack','special-defense','speed'];
 function level(value){if(!Number.isInteger(value)||value<1||value>100)throw Error('Choose a level from 1 to 100.');return value;}
 function stats(species,l){level(l);const result={};for(const k of statNames){const base=species.stats[k];if(!Number.isInteger(base)||base<1||base>255)throw Error('Invalid base statistics.');result[k]=k==='hp'?(species.id===292?1:Math.floor((2*base+31)*l/100)+l+10):Math.floor((2*base+31)*l/100)+5;}return result;}
 const stage=(value,accuracy=false)=>{const n=Math.max(-6,Math.min(6,value)),base=accuracy?3:2;return n>=0?(base+n)/base:base/(base-n);};
 function effectiveness(type,types,chart){if(type==='typeless')return 1;if(!chart[type])throw Error('Unsupported attacking type.');return types.reduce((value,t)=>{if(!Number.isFinite(chart[type][t]))throw Error('Unsupported defending type.');return value*chart[type][t];},1);}
 function speed(p){return Math.max(1,Math.floor(p.stats.speed*stage(p.stages.speed)*(p.status==='paralysis'?.25:1)));}
 function damage(attacker,defender,move,chart,{critical=false,random=.925}={}){
  if(move.category==='status'||!Number.isFinite(move.power)||move.power<=0)return{amount:0,effectiveness:1,critical:false};
  const physical=move.category==='physical',a=physical?'attack':'special-attack',d=physical?'defense':'special-defense';
  const attack=Math.max(1,Math.floor(attacker.stats[a]*stage(critical?Math.max(0,attacker.stages[a]):attacker.stages[a]))),defense=Math.max(1,Math.floor(defender.stats[d]*stage(critical?Math.min(0,defender.stages[d]):defender.stages[d])));
  const base=Math.floor(Math.floor((Math.floor(2*attacker.level/5)+2)*move.power*attack/defense)/50)+2;
  const factor=effectiveness(move.type,defender.types,chart),stab=move.type!=='typeless'&&attacker.types.includes(move.type)?1.5:1,burn=physical&&attacker.status==='burn'?.5:1;
  return{amount:factor===0?0:Math.max(1,Math.floor(Math.floor(Math.floor(base*(critical?2:1)*random)*stab)*factor*burn)),effectiveness:factor,critical};
 }
 const api={statNames,level,stats,stage,speed,effectiveness,damage};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.BattleCalculations=api;
})();
