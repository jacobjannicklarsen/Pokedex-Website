// Full, deterministic Generation V mechanics projected onto the Arena's existing UI state.
(() => {
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const {Battle,Dex,PRNG}=node?require('@pkmn/sim'):globalThis.DexhavenSimulator;
 const dex=Dex.forGen(5),ruleset='showdown-gen5';
 const numberedMoves=new Map(dex.moves.all().filter(m=>m.num>=1&&m.num<=559).map(m=>[m.num,m]));
 // Typed Hidden Power variants share number 237; always configure the canonical move.
 numberedMoves.set(237,dex.moves.get('hiddenpower'));
 const getMove=id=>typeof id==='number'?numberedMoves.get(id)||dex.moves.get(id===0?'recharge':'unknown'):dex.moves.get(id);
 const keys={atk:'attack',def:'defense',spa:'special-attack',spd:'special-defense',spe:'speed',accuracy:'accuracy',evasion:'evasion'};
 const statuses={brn:'burn',par:'paralysis',slp:'sleep',frz:'freeze',psn:'poison',tox:'badly-poisoned'};
 const conditions={confusion:'confused',substitute:'substitute',leechseed:'seeded',taunt:'taunted',encore:'encore',disable:'move disabled',twoturnmove:'charging',mustrecharge:'recharging',lockedmove:'locked into a move',perishsong:'perish song',protect:'protected'};
 function random(source){const n=source();if(!Number.isFinite(n)||n<0||n>=1)throw Error('Battle randomness must be in [0,1).');return n;}
 function restore(state){
  const serialized=JSON.parse(JSON.stringify(state.simulation));
  // Upstream 0.10.11 assumes baseMoveSlots never outnumber transformed moveSlots.
  // Restore their identity relationship ourselves so Transform into a shorter moveset
  // round-trips safely, without modifying the installed simulator or earlier states.
  const baseSlots=serialized.sides.map(side=>side.pokemon.map(p=>{const slots=p.baseMoveSlots;delete p.baseMoveSlots;return slots;}));
  const battle=Battle.fromJSON(serialized);
  battle.sides.forEach((side,i)=>side.pokemon.forEach((p,j)=>{if(baseSlots[i][j])p.baseMoveSlots=baseSlots[i][j].map((base,k)=>p.moveSlots[k]?.id===base.id&&!p.moveSlots[k].virtual?p.moveSlots[k]:base);}));
  return battle;
 }
 function moveInfo(id,pokemon){
  if(id==='recharge'||id===0)return{id:0,name:'recharge',type:'normal',category:'status',power:null,accuracy:null,pp:1,priority:0,supported:true,effect:{kind:'simulator'}};
  const move=getMove(id);
  return{id:move.num,name:move.id==='recharge'?'recharge':move.name.toLowerCase().replace(/ /g,'-'),type:move.num===237&&pokemon?pokemon.hpType.toLowerCase():move.type.toLowerCase(),category:move.category.toLowerCase(),power:move.num===237&&pokemon?pokemon.hpPower:move.basePower||null,accuracy:move.accuracy===true?null:move.accuracy,pp:move.pp||1,priority:move.priority||0,supported:true,effect:{kind:'simulator'},target:move.target==='self'?7:10};
 }
 function project(battle,previous,turn,events=[]){
  // Timestamps are presentation metadata, not part of deterministic simulation state.
  battle.log=battle.log.filter(line=>!line.startsWith('|t:|'));
  const fighters=battle.sides.map((side,i)=>{
   const p=side.active[0]||side.pokemon[0],original=previous.fighters[i],request=side.activeRequest?.active?.[0]?.moves||[];
   const moves=original.emptyMoveset?[]:p.moveSlots.map(slot=>({...moveInfo(slot.id,p),pp:slot.maxpp,remainingPP:slot.pp}));
   const available=request.filter(m=>!m.disabled&&(m.pp===undefined||m.pp>0)).map(m=>{
    const value=moveInfo(m.id,p),slot=p.moveSlots.find(s=>getMove(s.id).num===value.id);
    return{...value,pp:m.maxpp??slot?.maxpp??value.pp,remainingPP:m.pp??slot?.pp??1,command:'move '+(request.indexOf(m)+1)};
   });
   return{...original,simulator:ruleset,hp:p.hp,stats:{hp:p.maxhp,...Object.fromEntries(Object.entries(p.storedStats).map(([k,v])=>[keys[k],v]))},types:p.getTypes().map(t=>t.toLowerCase()),status:statuses[p.status]||null,conditions:Object.keys(p.volatiles).filter(k=>conditions[k]).map(k=>conditions[k]),appearanceId:p.species.num>0&&p.species.num<=649?p.species.num:original.id,stages:Object.fromEntries(Object.entries(keys).map(([k,v])=>[v,p.boosts[k]||0])),moves,available};
  });
  const winner=battle.ended?(battle.winner===battle.p1.name?0:battle.winner===battle.p2.name?1:'draw'):null;
  return{simulator:ruleset,simulation:JSON.parse(JSON.stringify(battle.toJSON())),fighters,turn,phase:battle.ended?'finished':'ready',winner,events,log:[...(previous.log||[]),...events]};
 }
 function create(left,right,{seed=1}={}){
  const configured=[left,right].map(p=>({...p,emptyMoveset:!p.moves.length}));
  for(const p of configured){if(!Array.isArray(p.moves)||p.moves.length>4||new Set(p.moves.map(m=>m.id)).size!==p.moves.length||p.moves.some(m=>!m.supported||!getMove(m.id).exists))throw Error('Invalid moveset.');}
  const battle=new Battle({formatid:'gen5customgame',seed:[seed>>>16,seed&65535,0,1]});
  for(const [i,p]of configured.entries()){
   const species=dex.species.get(p.name.replace(/-male$/,''));if(!species.exists||p.level<1||p.level>100||!Number.isInteger(p.level))throw Error('Invalid battle configuration.');
   battle.setPlayer('p'+(i+1),{name:i?'Opponent':'Challenger',team:[{species:species.name,name:species.name,level:p.level,moves:p.moves.length?p.moves.map(m=>getMove(m.id).id):['splash'],ability:'No Ability',item:'',nature:'Serious',happiness:255,evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31}}]});
  }
  // Arena uses base PP rather than automatically applying three PP Ups.
  for(const [i,side]of battle.sides.entries())for(const p of side.pokemon)for(const slots of [p.moveSlots,p.baseMoveSlots])for(const slot of slots){const selected=configured[i].moves.find(m=>getMove(m.id).id===slot.id);slot.pp=slot.maxpp=selected?.pp||0;}
  if(battle.requestState==='teampreview'){battle.choose('p1','team 1');battle.choose('p2','team 1');}
  return project(battle,{fighters:configured,log:[]},0);
 }
 function choices(p){return p.available||[];}
 function chooseAI(state,side,chart,source=Math.random,difficulty='normal'){
  if(!['easy','normal','hard'].includes(difficulty))throw Error('Unsupported AI difficulty.');
  if(state.phase!=='ready')throw Error('Battle has ended.');
  const available=choices(state.fighters[side]);if(!available.length)throw Error('No move request is available.');
  if(available.length===1)return available[0].id;
  if(difficulty==='easy'){const attacks=available.filter(m=>m.category!=='status'),pool=attacks.length&&random(source)<.75?attacks:available;return pool[Math.floor(random(source)*pool.length)].id;}
  const scores=available.map(choice=>{
   const battle=restore(state),a=battle.sides[side].active[0],b=battle.sides[1-side].active[0],move=getMove(choice.id===0?'recharge':choice.id);
   let damage=0;if(move.category!=='Status'){const value=battle.actions.getDamage(a,b,move,true);damage=typeof value==='number'?value:0;if(move.multihit)damage*=Array.isArray(move.multihit)?3:move.multihit;if(move.drain&&a.hp<a.maxhp/2)damage+=12;}
   let score=damage*(move.accuracy===true?1:move.accuracy/100);
   if(move.heal)score=a.hp<a.maxhp*(difficulty==='hard'?.4:.5)?(difficulty==='hard'?65:50):0;
   if(move.status)score=!b.status?18:0;
   if(move.boosts)score=Object.entries(move.boosts).reduce((n,[k,v])=>n+(Math.abs((move.target==='self'?a:b).boosts[k]||0)<6?Math.abs(v)*8:0),0);
   if(move.volatileStatus){const target=move.target==='self'?a:b;score=target.volatiles[move.volatileStatus]?0:12;if(move.id==='protect'||move.id==='detect')score=a.volatiles.stall?0:8;}
   if(move.weather)score=battle.field.weather===move.weather?0:12;
   if(move.sideCondition)score=10;
   if(difficulty==='hard'){
    if(damage>=b.hp&&damage>0)score+=60+(move.priority>0?30:0);
    if(move.recoil&&a.hp<a.maxhp*.25)score-=20;
    if(move.status&&(!b.runStatusImmunity(move.status)||!battle.dex.getImmunity(move.type,b)))score=0;
    if(choice.category!=='status')score+=Math.min(5,choice.remainingPP||0);
   }
   return{choice,score:Number.isFinite(score)?score:0};
  });
  const max=Math.max(...scores.map(s=>s.score)),best=scores.filter(s=>s.score===max);return best[Math.floor(random(source)*best.length)].choice.id;
 }
 function eventsFrom(lines,state,turn){
  const events=[],hp=state.fighters.map(p=>p.hp),sideOf=text=>text?.startsWith('p1')?0:text?.startsWith('p2')?1:null;
  const name=text=>text?.replace(/^p[12][a-z]?: /,'')||'The move';
  function emit(text,kind='info',side=null,amount=null){events.push({text,kind,side,amount,turn});}
  emit('Turn '+turn);
  for(let i=0;i<lines.length;i++){
   const line=lines[i];if(line.startsWith('|split|')){lines=[...lines.slice(0,i),lines[i+1],...lines.slice(i+3)];i--;continue;}
   const [,type,target,value,extra]=line.split('|'),side=sideOf(target),who=name(target);
   if(type==='move')emit(`${who} used ${value}.`,'attack',side);
   else if(['-damage','-heal','-sethp'].includes(type)&&side!==null){const n=parseInt(value,10)||0,amount=Math.abs(hp[side]-n);hp[side]=n;emit(`${who} ${type==='-heal'?'recovered':'lost'} ${amount} HP.`,type==='-heal'?'heal':'damage',side,amount);}
   else if(type==='-status')emit(`${who}: ${statuses[value]||value}.`,'status',side);
   else if(type==='-curestatus')emit(`${who} recovered from ${statuses[value]||value}.`,'status',side);
   else if(type==='-boost'||type==='-unboost')emit(`${who}'s ${keys[value]||value} ${type==='-boost'?'rose':'fell'} ${extra} stage(s).`,'status',side);
   else if(type==='-crit')emit('A critical hit!','critical',side);
   else if(type==='-supereffective')emit("It's super effective!",'effective',side);
   else if(type==='-resisted')emit("It's not very effective.",'resisted',side);
   else if(type==='-immune')emit(`It has no effect on ${who}.`,'immune',side);
   else if(type==='-miss')emit(`${who}'s attack missed.`,'miss',side);
   else if(type==='faint')emit(`${who} fainted.`,'faint',side);
   else if(type==='cant')emit(`${who} cannot move: ${value}${extra?' ('+extra+')':''}.`,'status',side);
   else if(type==='-fail')emit(`${who}'s move failed.`,'info',side);
   else if(type==='-nothing')emit('Nothing happened.');
   else if(type==='-prepare')emit(`${who} is preparing ${value}.`,'status',side);
   else if(type==='-mustrecharge')emit(`${who} must recharge.`,'status',side);
   else if(type==='-hitcount')emit(`Hit ${value} times.`,'info',side);
   else if(type==='-weather')emit(`Weather: ${target==='none'?'clear':target}.`,'status');
   else if(['-start','-end','-activate','-singleturn','-singlemove','-sidestart','-sideend','-fieldstart','-fieldend','-transform','-formechange','-clearboost','-clearallboost','-swapboost','-copyboost','-setboost'].includes(type))emit(`${who}: ${(value||type.slice(1)).replace(/^move: /,'')}${type==='-end'||type==='-sideend'||type==='-fieldend'?' ended':''}.`,'status',side);
   else if(type==='win')emit(target+' wins!','result',target==='Challenger'?0:1);
   else if(type==='tie')emit('The battle ended in a draw.','result');
   else if(type==='message')emit(target);
  }
  return events;
 }
 function step(previous,selected,chart,source=Math.random){
  if(previous.phase!=='ready')throw Error('Battle has ended. Restart to play again.');
  if(!Array.isArray(selected)||selected.length!==2)throw Error('Select one move for each side.');
  const commands=previous.fighters.map((p,i)=>{const m=choices(p).find(m=>m.id===selected[i]);if(!m)throw Error('Choose an available move with PP remaining.');return m.command;});
  const battle=restore(previous),offset=battle.log.length;
  // One injected RNG owns both AI choices and all simulator randomness.
  battle.prng=new PRNG([0,0,0,0].map(()=>Math.floor(random(source)*65536)));
  if(!battle.choose('p1',commands[0])||!battle.choose('p2',commands[1]))throw Error('The selected move is not available.');
  const turn=previous.turn+1;
  if(!battle.ended&&turn>=200){battle.add('message','200-turn safety limit reached. Draw.');battle.tie();}
  const events=eventsFrom(battle.log.slice(offset),previous,turn);
  return project(battle,previous,turn,events);
 }
 function summary(state){if(state.phase!=='finished')throw Error('Finish the battle before sharing.');return`Dexhaven Battle Arena — unofficial Generation V simulation\n${state.fighters.map(p=>`${p.name} #${p.id} Lv.${p.level}`).join('\n')}\nResult: ${state.winner==='draw'?'Draw':state.fighters[state.winner].name+' wins'} · ${state.turn} turns\nInformational only; no Pokédex rank or competitive rating changes. Activity awards require a separately qualified recording.`;}
 const api={create,choices,chooseAI,step,summary};if(node)module.exports=api;else globalThis.BattleSimulator=api;
})();
