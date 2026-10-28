// Move metadata for the full Generation V simulator; older effect hints support AI scoring.
(() => {'use strict';
 const stages={11:['self','attack',1],12:['self','defense',1],17:['self','evasion',1],19:['target','attack',-1],20:['target','defense',-1],21:['target','speed',-1],24:['target','accuracy',-1],25:['target','evasion',-1],51:['self','attack',2],52:['self','defense',2],53:['self','speed',2],54:['self','special-attack',2],55:['self','special-defense',2],59:['target','attack',-2],60:['target','defense',-2],61:['target','speed',-2],63:['target','special-defense',-2]};
 const secondaryStages={69:'attack',70:'defense',71:'speed',72:'special-attack',73:'special-defense',74:'accuracy'};
 function describe(m){const e=m.effectId;let effect=null;
  if([1,104].includes(e))effect={kind:'damage'};
  if([18,79].includes(e))effect={kind:'damage',alwaysHit:true};
  if(e===44)effect={kind:'damage',highCrit:true};
  if(e===4)effect={kind:'damage',drain:.5};
  if([49,199].includes(e))effect={kind:'damage',recoil:e===49?.25:1/3};
  if([3,5,6,7,32].includes(e))effect={kind:'damage',secondary:({3:'poison',5:'burn',6:'freeze',7:'paralysis',32:'flinch'})[e],chance:m.effectChance};
  if(secondaryStages[e])effect={kind:'damage',stage:['target',secondaryStages[e],-1],chance:m.effectChance};
  if(stages[e])effect=m.category==='status'?{kind:'stage',stage:stages[e]}:{kind:'damage',stage:stages[e],chance:100};
  if([2,67,68,168].includes(e))effect={kind:'status',status:({2:'sleep',67:'poison',68:'paralysis',168:'burn'})[e]};
  if(e===33)effect={kind:'heal',fraction:.5};
  const supported=Boolean(m.id>=1&&m.id<=559&&m.pp>0);
  return{supported,effect:supported?(effect||{kind:'simulator'}):null,reason:supported?'':'This move is outside the Generation V ruleset.'};
 }
 const api={describe};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.BattleMoveSupport=api;
})();
