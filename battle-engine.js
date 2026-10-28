// DOM-free state transitions. Every random decision uses the injected source.
(() => {'use strict';
 const node=typeof module!=='undefined'&&module.exports,c=node?require('./battle-calculations'):globalThis.BattleCalculations,data=node?require('./battle-data'):globalThis.BattleData;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function create(left,right){const fighter=p=>{if(!Array.isArray(p.moves)||p.moves.length>4||new Set(p.moves.map(m=>m.id)).size!==p.moves.length||p.moves.some(m=>!m.supported||!m.effect||!Number.isInteger(m.pp)||m.pp<=0))throw Error('Invalid or unsupported moveset.');c.level(p.level);for(const k of c.statNames)if(!Number.isInteger(p.stats[k])||p.stats[k]<1)throw Error('Invalid battle stats.');return{...structuredClone(p),hp:p.stats.hp,moves:p.moves.map(m=>({...structuredClone(m),remainingPP:m.pp})),status:null,sleepTurns:0,stages:Object.fromEntries([...c.statNames.slice(1),'accuracy','evasion'].map(k=>[k,0]))};};return{fighters:[fighter(left),fighter(right)],turn:0,phase:'ready',winner:null,events:[],log:[]};}
 function rng(source){const value=source();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Battle randomness must be in [0,1).');return value;}
 function choices(p){return p.moves.some(m=>m.remainingPP>0)?p.moves.filter(m=>m.remainingPP>0):[{...data.fallback,remainingPP:1}];}
 function chooseAI(state,side,chart,random=Math.random){if(state.phase!=='ready')throw Error('Battle has ended.');const a=state.fighters[side],b=state.fighters[1-side],scores=choices(a).map(m=>{let score=0;const e=m.effect;if(m.category!=='status')score=c.damage(a,b,m,chart).amount*((m.accuracy??100)/100)+(e.secondary&&!b.status?8:0)+(e.drain&&a.hp<a.stats.hp/2?12:0);else if(e.kind==='heal')score=a.hp<=a.stats.hp/2?50:0;else if(e.kind==='status')score=!b.status?18:0;else if(e.kind==='stage'){const [who,k,change]=e.stage,target=who==='self'?a:b;score=Math.abs(target.stages[k])<4?(change>0?12:9):0;}return{m,score};});const maximum=Math.max(...scores.map(s=>s.score)),best=scores.filter(s=>s.score===maximum);return best[Math.floor(rng(random)*best.length)].m.id;}
 function step(previous,selected,chart,random=Math.random){if(previous.phase!=='ready')throw Error('Battle has ended. Restart to play again.');if(!Array.isArray(selected)||selected.length!==2)throw Error('Select one move for each side.');const state=structuredClone(previous),events=[],r=()=>rng(random),f=state.fighters;const moves=f.map((p,i)=>{const move=choices(p).find(m=>m.id===selected[i]);if(!move)throw Error('Choose an available move with PP remaining.');return move;});state.turn++;
  const emit=(text,kind='info',side=null,amount=null)=>events.push({text,kind,side,amount,turn:state.turn});
  const done=()=>{if(f.some(p=>p.hp<=0)){state.phase='finished';state.winner=f[0].hp<=0&&f[1].hp<=0?'draw':f[0].hp>0?0:1;emit(state.winner==='draw'?'Both Pokémon fainted. Draw.':`${f[state.winner].name} wins!`,'result',state.winner==='draw'?null:state.winner);return true;}return false;};
  const lose=(p,amount)=>{const actual=Math.min(p.hp,Math.max(0,amount));p.hp=Math.max(0,p.hp-actual);return actual;};
  const status=(p,condition,side)=>{if(p.status||p.hp<=0||condition==='burn'&&p.types.includes('fire')||condition==='freeze'&&p.types.includes('ice')||condition==='poison'&&p.types.some(t=>['poison','steel'].includes(t))){emit(`${p.name} cannot receive ${condition}.`);return;}p.status=condition;if(condition==='sleep')p.sleepTurns=1+Math.floor(r()*3);emit(`${p.name}: ${condition}.`,'status',side);};
  const stages=(attacker,defender,change,side)=>{const [who,key,n]=change,target=who==='self'?attacker:defender;const old=target.stages[key];target.stages[key]=clamp(old+n,-6,6);emit(`${target.name}'s ${key} ${old===target.stages[key]?'cannot change further':n>0?'rose':'fell'}.`,'status',who==='self'?side:1-side);};
  const order=[0,1];if(moves[1].priority>moves[0].priority||moves[1].priority===moves[0].priority&&(c.speed(f[1])>c.speed(f[0])||c.speed(f[1])===c.speed(f[0])&&r()<.5))order.reverse();const flinched=new Set();
  emit(`Turn ${state.turn}`);
  for(const side of order){const a=f[side],b=f[1-side],m=moves[side],e=m.effect;if(a.hp<=0||b.hp<=0)break;
   if(flinched.has(side)){emit(`${a.name} flinched.`,'status',side);continue;}
   if(a.status==='sleep'){a.sleepTurns--;if(a.sleepTurns>=0){emit(`${a.name} is asleep.`,'status',side);continue;}a.status=null;emit(`${a.name} woke up.`,'status',side);}
   if(a.status==='freeze'){if(r()<.2){a.status=null;emit(`${a.name} thawed.`,'status',side);}else{emit(`${a.name} is frozen.`,'status',side);continue;}}
   if(a.status==='paralysis'&&r()<.25){emit(`${a.name} is fully paralyzed.`,'status',side);continue;}
   const actual=a.moves.find(v=>v.id===m.id);if(actual&&!e.struggle)actual.remainingPP--;
   emit(`${a.name} used ${m.name}.`,'attack',side);
   const self=m.target===7||e.kind==='heal'||e.kind==='stage'&&e.stage[0]==='self',accuracy=e.alwaysHit||m.accuracy===null||self?1:Math.min(1,m.accuracy/100*c.stage(clamp(a.stages.accuracy-b.stages.evasion,-6,6),true));
   if(accuracy<1&&r()>=accuracy){emit(`${a.name}'s attack missed.`,'miss',side);continue;}
   if(e.kind==='status'){if(m.type==='electric'&&c.effectiveness(m.type,b.types,chart)===0)emit(`It has no effect on ${b.name}.`,'immune',1-side);else status(b,e.status,1-side);}
   else if(e.kind==='heal'){const amount=Math.min(a.stats.hp-a.hp,Math.max(1,Math.floor(a.stats.hp*e.fraction)));a.hp+=amount;emit(`${a.name} recovered ${amount} HP.`,'heal',side,amount);}
   else if(e.kind==='stage')stages(a,b,e.stage,side);
   else{const critical=!e.struggle&&r()<(e.highCrit?1/8:1/16),roll=(85+Math.floor(r()*16))/100,result=c.damage(a,b,m,chart,{critical,random:roll}),amount=lose(b,result.amount);emit(`${b.name} lost ${amount} HP.`,'damage',1-side,amount);if(result.effectiveness===0)emit('It has no effect.','immune',1-side);else{if(critical)emit('A critical hit!','critical',1-side);if(result.effectiveness>1)emit("It's super effective!",'effective',1-side);if(result.effectiveness<1)emit("It's not very effective.",'resisted',1-side);
     if(m.type==='fire'&&b.status==='freeze'){b.status=null;emit(`${b.name} thawed from the fire attack.`,'status',1-side);}
     if(e.drain&&amount){const healed=Math.min(a.stats.hp-a.hp,Math.max(1,Math.floor(amount*e.drain)));a.hp+=healed;emit(`${a.name} drained ${healed} HP.`,'heal',side,healed);}
     if(b.hp>0&&e.secondary&&r()<e.chance/100){if(e.secondary==='flinch')flinched.add(1-side);else status(b,e.secondary,1-side);}
     if(b.hp>0&&e.stage&&r()<e.chance/100)stages(a,b,e.stage,side);
    }
    if(e.recoil&&amount){const recoil=lose(a,Math.max(1,Math.floor(amount*e.recoil)));emit(`${a.name} took ${recoil} recoil.`,'damage',side,recoil);}
    if(e.struggle){const recoil=lose(a,Math.max(1,Math.floor(a.stats.hp/4)));emit(`${a.name} took ${recoil} Struggle recoil.`,'damage',side,recoil);}
   }
   if(done())break;
  }
  if(state.phase==='ready'){for(const side of order){const p=f[side];if(p.hp>0&&['burn','poison'].includes(p.status)){const n=lose(p,Math.max(1,Math.floor(p.stats.hp/8)));emit(`${p.name} took ${n} ${p.status} damage.`,'damage',side,n);}}done();}
  if(state.phase==='ready'&&state.turn>=200){state.phase='finished';state.winner='draw';emit('200-turn safety limit reached. Draw.','result');}
  for(const [side,p]of f.entries())if(p.hp===0)emit(`${p.name} fainted.`,'faint',side);
  state.events=events;state.log.push(...events);return state;
 }
 function summary(state){if(state.phase!=='finished')throw Error('Finish the battle before sharing.');return`Dexhaven Battle Arena — unofficial local simulation (Black/White inspired)\n${state.fighters.map(p=>`${p.name} #${p.id} Lv.${p.level} · ${p.moves.map(m=>m.name).join(', ')||'Struggle fallback'}`).join('\n')}\nResult: ${state.winner==='draw'?'Draw':state.fighters[state.winner].name+' wins'} · ${state.turn} turns\n${state.log.filter(e=>['critical','effective','faint'].includes(e.kind)).slice(-6).map(e=>e.text).join('\n')}\nInformational only; no ranks, achievements or competitive rating awarded.`;}
 const api={create,choices,chooseAI,step,summary};if(node)module.exports=api;else globalThis.BattleEngine=api;
})();
