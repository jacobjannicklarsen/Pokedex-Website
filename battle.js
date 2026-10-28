(() => {'use strict';
 const root=document.querySelector('#battle-content');if(!root)return;const el=element;
 let snapshot,state=null,initial=null,mode='player',loading=0,selectors=[],configs=[],stage,log,movesBox,status,result,turnLabel,startButton,pauseButton;
 let readySummary,restartButton;
 let difficulty='normal',difficultySelect,difficultyHelp,recordChoice,recording=null,recordedRun=null,recordVersion=0,lastUserId,difficultyTouched=false;
 function updateDifficultyHelp(){
  if(!difficultyHelp)return;
  const descriptions={easy:'Random move choices, usually favouring attacks.',normal:'Scores damage, accuracy and basic healing or status moves.',hard:'Adds knockout and priority bonuses, more selective healing and status moves, and caution with recoil.'};
  difficultyHelp.textContent=descriptions[difficulty]+' Changes CPU decisions, not stats. Applies to both sides in Auto Battle.';
 }
 const runner=new BattleRunner({turn:()=>{resolve();return state?.phase==='ready';},onError:e=>notice(e.message,true)});
 const button=(text,fn,cls='text-button')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
 function notice(text,error=false){const p=document.querySelector('#battle-notice');p.hidden=false;p.className=error?'form-error':'account-message';p.textContent=text;}
 function sprite(id,back=false){const img=el('img','battle-sprite');img.src=`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${back?'back/':''}${id}.png`;img.alt=`Pokémon #${id}`;img.dataset.pokemonId=String(id);img.width=160;img.height=160;img.onerror=()=>{img.onerror=null;img.src='artwork-fallback.svg';};return img;}
 function resetForConfig(){runner.stop();recordVersion++;recording=null;recordedRun=null;state=null;initial=null;document.querySelector('#battle-stage-panel').hidden=true;startButton.disabled=false;startButton.textContent='Enter the Arena';pauseButton.hidden=true;if(restartButton)restartButton.hidden=true;updateReadySummary();}
 function typeBadge(type){const badge=el('span','type-badge type-'+type,prettyName(type));badge.style.setProperty('--type-color',TYPE_COLORS[type]||'#bdbaa7');return badge;}
 function typeBadges(types){const row=el('div','types');for(const type of types)row.append(typeBadge(type));return row;}
 function sectionHeading(step,title,copy){const header=el('header','battle-section-heading');header.append(el('p','eyebrow',step),el('h2','',title),el('p','form-help',copy));return header;}
 function updateReadySummary(){
  if(!readySummary)return;
  const valid=configs.length===2&&configs.every(c=>snapshot.pokemon.some(p=>p.id===c.id)&&Number.isInteger(Number(c.level.value))&&Number(c.level.value)>=1&&Number(c.level.value)<=100);
  startButton.disabled=!valid;
  readySummary.textContent=valid?configs.map(c=>`${prettyName(snapshot.pokemon.find(p=>p.id===c.id).name)} · Lv. ${c.level.value} · ${c.selected.length}/4 moves`).join('  vs  '):'Choose two Pokémon and levels between 1 and 100 to enter the Arena.';
 }
 function movePicker(config,side,supported){
  const options=el('fieldset','battle-moveset');options.append(el('legend','','Build your moveset'));
  const count=el('p','form-help battle-move-count');count.setAttribute('role','status');
  const equipped=el('div','battle-equipped');equipped.setAttribute('aria-label','Equipped moves');
  const filters=el('div','battle-move-filters');
  const filterField=(text,input)=>{const label=el('label','',text);label.append(input);filters.append(label);return input;};
  const search=filterField('Find a move',el('input'));search.type='search';search.placeholder='Search moves';search.autocomplete='off';
  const type=filterField('Type',el('select')),category=filterField('Category',el('select'));
  for(const [select,values,all]of [[type,[...new Set(supported.map(m=>m.type))].sort(),'All types'],[category,['physical','special','status'],'All categories']]){
   const first=el('option','',all);first.value='';select.append(first);
   for(const value of values){const option=el('option','',prettyName(value));option.value=value;select.append(option);}
  }
  const list=el('div','battle-move-list'),empty=el('p','form-help','No moves match these filters. Try another name, type or category.');empty.hidden=true;
  const clear=button('Clear filters',()=>{search.value='';type.value='';category.value='';filter();search.focus();});clear.classList.add('battle-clear-filters');
  function filter(){const query=search.value.trim().toLowerCase();let visible=0;for(const row of list.children){row.hidden=!(row.dataset.name.includes(query)&&(!type.value||row.dataset.type===type.value)&&(!category.value||row.dataset.category===category.value));if(!row.hidden)visible++;}empty.hidden=visible!==0;clear.hidden=!query&&!type.value&&!category.value;count.textContent=`${config.selected.length}/4 equipped · ${visible} of ${supported.length} moves shown`;}
  function counters(){
   list.querySelectorAll('input[type=checkbox]').forEach(i=>{i.checked=config.selected.includes(Number(i.value));i.disabled=!i.checked&&config.selected.length>=4;});
   equipped.replaceChildren();
   for(const id of config.selected){const move=supported.find(m=>m.id===id);if(!move)continue;const chip=button(prettyName(move.name)+' ×',()=>{config.selected=config.selected.filter(value=>value!==id);resetForConfig();counters();search.focus();},'battle-equipped-chip');chip.setAttribute('aria-label','Remove '+prettyName(move.name));equipped.append(chip);}
   if(!config.selected.length)equipped.append(el('p','form-help','No moves equipped. This Pokémon will use Struggle.'));
   filter();updateReadySummary();
  }
  for(const move of supported){
   const row=el('label','battle-move-choice'),input=el('input');input.type='checkbox';input.value=move.id;input.name='move-'+side;
   row.dataset.name=prettyName(move.name).toLowerCase();row.dataset.type=move.type;row.dataset.category=move.category;
   input.onchange=()=>{if(input.checked){if(config.selected.length>=4){input.checked=false;return;}config.selected.push(move.id);}else config.selected=config.selected.filter(id=>id!==move.id);resetForConfig();counters();};
   const name=el('span','battle-move-name',prettyName(move.name));
   row.append(input,name,typeBadge(move.type),el('small','battle-move-metadata',`${prettyName(move.category)} · Power ${move.power??'—'} · Accuracy ${move.accuracy??'Always hit'} · PP ${move.pp} · Priority ${move.priority}`),el('small','form-help',move.methods.map(r=>r.method==='level-up'?'Level '+r.level:r.method==='machine'?'BW machine':'BW breeding').join(' / ')));list.append(row);
  }
  search.addEventListener('input',filter);type.addEventListener('change',filter);category.addEventListener('change',filter);
  options.append(count,equipped,filters,clear,empty,list);counters();return options;
 }
 function updateConfig(side,newSpecies=false){
  const config=configs[side],pokemon=snapshot.pokemon.find(p=>p.id===config.id);resetForConfig();config.view.replaceChildren();
  if(!pokemon){config.view.append(el('p','form-help','Choose a Pokémon to see its battle statistics and legal moves.'));updateReadySummary();return;}
  const level=Number(config.level.value);
  if(!Number.isInteger(level)||level<1||level>100){config.view.append(el('p','form-error','Choose a whole-number level between 1 and 100.'));updateReadySummary();return;}
  const eligible=BattleData.eligible(pokemon,level,snapshot),supported=eligible.filter(m=>m.supported),legal=new Set(supported.map(m=>m.id));
  config.selected=newSpecies?[]:(config.selected||[]).filter(id=>legal.has(id));
  if(!config.selected.length){const seen=new Set();for(const move of supported.filter(m=>m.category!=='status'))if(!seen.has(move.type)&&config.selected.length<4){config.selected.push(move.id);seen.add(move.type);}if(!config.selected.length&&supported[0])config.selected.push(supported[0].id);}
  const summary=el('div','battle-selection-summary');summary.append(sprite(pokemon.id),el('p','eyebrow',side?'THE OPPOSITION':'YOUR PARTNER'),el('h3','',`${prettyName(pokemon.name)} · #${String(pokemon.id).padStart(3,'0')}`),typeBadges(pokemon.types));config.view.append(summary);
  const calculated=BattleCalculations.stats(pokemon,level),table=el('table','battle-stats');table.append(el('caption','','31 IVs · 0 EVs · neutral nature'));
  const header=el('tr');for(const text of ['Stat','Base','Lv. '+level]){const th=el('th','',text);th.scope='col';header.append(th);}const thead=el('thead');thead.append(header);table.append(thead);
  const tbody=el('tbody');
  for(const key of BattleCalculations.statNames){const row=el('tr'),name=el('th','',({hp:'HP','special-attack':'Sp. Attack','special-defense':'Sp. Defense'})[key]||prettyName(key));name.scope='row';const track=el('span','battle-stat-track'),fill=el('span');track.setAttribute('aria-hidden','true');fill.style.width=pokemon.stats[key]/255*100+'%';track.append(fill);name.append(track);row.append(name,el('td','',pokemon.stats[key]),el('td','',calculated[key]));tbody.append(row);}
  table.append(tbody);config.view.append(table,movePicker(config,side,supported));
  config.view.append(el('p','form-help battle-struggle-help','Empty moveset or no PP remaining? Struggle is used automatically.'));
 }
 function setup(){
  root.replaceChildren();configs=[];selectors.forEach(selector=>selector.close());selectors=[];
  root.append(sectionHeading('01 / THE MATCHUP','Choose your contenders.','Set a level, compare their stats and equip up to four moves on each side.'));
  const setup=el('section','battle-setup');setup.setAttribute('aria-label','Configure the battle');
  for(const [side,id]of [9,6].entries()){
   const card=el('article','battle-config');card.dataset.side=side;
   card.append(el('p','eyebrow',side?'02 / OPPONENT':'01 / YOUR SIDE'),el('h2','',side?'Your rival':'Your challenger'));
   const selector=PokemonSelector.create({slot:side+1,label:side?'Opponent Pokémon':'Your Pokémon',selectedId:id,getPokemon:id=>snapshot.pokemon.find(p=>p.id===id),excludedIds:()=>new Set(),formatName:prettyName,makeArtwork:p=>sprite(p.id),onChange:value=>{configs[side].id=value;updateConfig(side,true);}});selectors.push(selector);
   const label=el('label','battle-level-label','Level'),level=el('input');level.type='number';level.min=1;level.max=100;level.step=1;level.required=true;level.value=50;level.name='level-'+side;label.append(level);
   const view=el('div','battle-config-detail');configs.push({id,level,view,selected:[]});level.oninput=()=>updateConfig(side);card.append(selector.element,label,view);setup.append(card);
  }
  root.append(setup);
  const panel=el('section','battle-controls trainer-panel');panel.append(sectionHeading('02 / YOUR RULES','Make the next move.','Take control of your partner or let the CPU play both sides.'));
  const settings=el('div','battle-settings-grid'),modeField=el('div','battle-mode-field'),modes=el('div','team-actions battle-mode-group');
  modeField.append(el('p','battle-field-label','Battle mode'));modes.setAttribute('role','group');modes.setAttribute('aria-label','Battle mode');
  for(const [key,text]of [['player','Player vs CPU'],['auto','Auto Battle']]){const b=button(text,()=>{mode=key;resetForConfig();modes.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',n===b));});b.dataset.battleMode=key;b.setAttribute('aria-pressed',mode===key);modes.append(b);}modeField.append(modes);
  const speedLabel=el('label','','Animation speed'),speed=el('select');speed.id='battle-speed';
  for(const [value,text]of [[1400,'Relaxed'],[800,'Normal'],[250,'Fast']]){const option=el('option','',text);option.value=value;option.selected=value===800;speed.append(option);}speedLabel.append(speed);speed.onchange=()=>{runner.delay=Number(speed.value);if(runner.running)runner.start(runner.delay);};runner.delay=800;
  const difficultyLabel=el('label','','AI difficulty');difficultySelect=el('select');difficultySelect.id='battle-difficulty';
  for(const key of ['easy','normal','hard']){const option=el('option','',prettyName(key));option.value=key;option.selected=key===difficulty;difficultySelect.append(option);}difficultySelect.onchange=()=>{difficulty=difficultySelect.value;difficultyTouched=true;updateDifficultyHelp();resetForConfig();};
  difficultyHelp=el('span','battle-difficulty-help');difficultyHelp.id='battle-difficulty-help';difficultyHelp.setAttribute('role','status');difficultySelect.setAttribute('aria-describedby',difficultyHelp.id);difficultyLabel.append(difficultySelect,difficultyHelp);updateDifficultyHelp();
  settings.append(modeField,difficultyLabel,speedLabel);panel.append(settings);
  const recordingLabel=el('label','battle-recording-option','Prepare an activity recording for the next battle');recordChoice=el('input');recordChoice.type='checkbox';recordChoice.id='record-battle';recordingLabel.prepend(recordChoice);recordingLabel.hidden=!globalThis.DexhavenAccount?.getUser();panel.append(recordingLabel);
  readySummary=el('p','battle-ready-summary');readySummary.setAttribute('role','status');panel.append(readySummary);
  const actions=el('div','battle-session-actions');
  startButton=button('Enter the Arena',start,'action-button');startButton.id='battle-start';
  pauseButton=button('Pause',()=>{if(runner.running){runner.stop();pauseButton.textContent='Resume';notice('Auto Battle paused.');}else if(state?.phase==='ready'){runner.start(Number(speed.value));pauseButton.textContent='Pause';notice('Auto Battle resumed.');}});pauseButton.id='battle-pause';pauseButton.hidden=true;
  restartButton=button('Restart battle',start);restartButton.id='battle-restart';restartButton.hidden=true;
  const history=el('a','text-button','Battle history & replays');history.href='battle-history.html';actions.append(startButton,pauseButton,restartButton,history);panel.append(actions);
  const help=el('details','battle-recording-help');help.append(el('summary','','About saved simulations & activity awards'),el('p','form-help','Save a completed simulation to revisit it in your private history. Local imports never grant activity awards. Qualified activity requires a server-prepared, balanced level-50 recording with at least three moves per side and three turns. Simulations never change caught records or caught-based ranks.'));panel.append(help);root.append(panel);
  const arena=el('section','battle-stage-panel');arena.id='battle-stage-panel';arena.hidden=true;
  const arenaHeading=el('header','battle-section-heading');turnLabel=el('h2','battle-turn');arenaHeading.append(el('p','eyebrow','03 / THE BATTLEFIELD'),turnLabel);
  stage=el('div','battle-stage');stage.setAttribute('aria-label','Battlefield');status=el('p','battle-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  movesBox=el('div','battle-move-buttons');movesBox.setAttribute('aria-label','Available moves');result=el('div','battle-result');log=el('ol','battle-log');log.setAttribute('aria-label','Turn-by-turn battle log');
  arena.append(arenaHeading,stage,status,movesBox,result,el('h3','battle-log-title','How the battle unfolded'),log);root.append(arena);configs.forEach((_,side)=>updateConfig(side,true));
 }
 async function start(){const version=++recordVersion;runner.stop();try{const team=configs.map(c=>BattleData.configure(snapshot,c.id,Number(c.level.value),c.selected));initial=structuredClone(team);let run=null;if(recordChoice.checked&&DexhavenAccount.getUser()){startButton.disabled=true;notice('Preparing your recording...');run=await DexhavenAccount.request('/battles/start',{method:'POST',body:{configuration:team.map(p=>({id:p.id,level:p.level,moves:p.moves.map(m=>m.id)})),mode,difficulty}});if(version!==recordVersion)return;}const seed=run?.seed||Math.floor(Math.random()*4294967294)+1;begin(team,seed,run);}catch(e){if(version===recordVersion)notice(e.message,true);}finally{if(version===recordVersion)updateReadySummary();}}

 function begin(team,seed,run){runner.stop();recordedRun=run;recording=new BattleRecording.Recording(snapshot,team.map(p=>({id:p.id,level:p.level,moves:p.moves.map(m=>m.id)})),mode,difficulty,seed);state=recording.state;stage.replaceChildren();for(const [side,p]of state.fighters.entries()){const fighter=el('div','battle-fighter battle-side-'+side);fighter.dataset.side=side;const hud=el('div','battle-hud'),h=el('h3','',`${prettyName(p.name)} · Lv.${p.level}`),hp=el('div','battle-hp-track'),fill=el('span','battle-hp-fill');hp.setAttribute('role','progressbar');hp.setAttribute('aria-label',`${p.name} HP`);hp.setAttribute('aria-valuemin','0');hp.setAttribute('aria-valuemax',p.stats.hp);hp.append(fill);hud.append(el('p','eyebrow',side?'RIVAL / CPU':mode==='player'?'YOUR SIDE':'PARTNER / CPU'),h,typeBadges(p.types),hp,el('p','battle-hp-text'),el('span','battle-status-badge'));fighter.append(hud,sprite(p.id,side===0),el('span','battle-damage-number'));stage.append(fighter);}log.replaceChildren();result.replaceChildren();document.querySelector('#battle-stage-panel').hidden=false;startButton.textContent='Start new battle';pauseButton.hidden=mode!=='auto';pauseButton.textContent='Pause';restartButton.hidden=false;render();notice(mode==='auto'?'Auto Battle started.':'Choose your first move.');document.querySelector('#battle-stage-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});if(mode==='auto')runner.start();}
 function resolve(playerMove=null){if(!state||state.phase!=='ready')return;state=recording.turn(mode==='auto'?null:playerMove);render();}

 function render(){turnLabel.textContent=`Turn ${state.turn}${state.phase==='finished'?' · Complete':''}`;for(const [side,p]of state.fighters.entries()){const node=stage.querySelector(`[data-side="${side}"]`),hp=node.querySelector('.battle-hp-track');hp.setAttribute('aria-valuenow',p.hp);const fill=node.querySelector('.battle-hp-fill');fill.style.width=p.hp/p.stats.hp*100+'%';fill.dataset.health=p.hp/p.stats.hp<.2?'low':p.hp/p.stats.hp<.5?'mid':'high';node.querySelector('.battle-hp-text').textContent=`${p.hp} / ${p.stats.hp} HP`;const types=node.querySelector('.battle-hud .types');if(types)types.replaceWith(typeBadges(p.types));const art=node.querySelector('.battle-sprite');if(p.appearanceId&&art.dataset.pokemonId!==String(p.appearanceId)){const changed=sprite(p.appearanceId,side===0);art.replaceWith(changed);}const badge=node.querySelector('.battle-status-badge');const conditions=[p.status,...(p.conditions||[])].filter(Boolean);badge.textContent=conditions.map(prettyName).join(' / ');badge.hidden=!conditions.length;node.classList.toggle('is-fainted',p.hp===0);node.classList.remove('is-attacking','is-hit');const events=state.events.filter(e=>e.side===side);void node.offsetWidth;node.classList.toggle('is-attacking',events.some(e=>e.kind==='attack'));node.classList.toggle('is-hit',events.some(e=>e.kind==='damage'));const numbers=events.filter(e=>e.kind==='damage').reduce((n,e)=>n+e.amount,0);node.querySelector('.battle-damage-number').textContent=numbers?'-'+numbers:'';}
  for(const event of state.events){const row=el('li','battle-event-'+event.kind,event.text);log.append(row);}log.scrollTop=log.scrollHeight;status.textContent=state.events.slice(-3).map(e=>e.text).join(' ')||(mode==='player'?'Choose a move.':'The simulation is ready.');movesBox.replaceChildren();if(mode==='player')for(const move of BattleEngine.choices(state.fighters[0])){const b=button('',()=>{b.disabled=true;try{resolve(move.id);}catch(e){notice(e.message,true);b.disabled=false;}},'battle-move-button');b.dataset.moveId=move.id;b.append(el('strong','',prettyName(move.name)),typeBadge(move.type),el('small','',`${prettyName(move.category)} · ${move.power??'—'} power · ${move.remainingPP}/${move.pp} PP`));b.disabled=state.phase!=='ready';movesBox.append(b);}if(state.phase==='finished'){runner.stop();pauseButton.hidden=true;const won=state.winner===0,draw=state.winner==='draw';result.className='battle-result '+(mode==='auto'?'is-simulation':draw?'is-draw':won?'is-victory':'is-defeat');result.replaceChildren(el('p','eyebrow','SIMULATION COMPLETE'),el('h2','',draw?'A hard-fought draw.':mode==='player'?(won?'Victory is yours!':'A lesson for the next battle.'):`${prettyName(state.fighters[state.winner].name)} wins!`),el('p','form-help',`${state.turn} turns · ${prettyName(difficulty)} AI · ${mode==='auto'?'Auto simulation':'Player vs CPU'} · Unranked`));const copy=button('Copy battle summary',async()=>{try{await navigator.clipboard.writeText(BattleEngine.summary(state));notice('Battle summary copied.');}catch{const text=el('textarea','battle-summary-copy');text.readOnly=true;text.value=BattleEngine.summary(state);text.setAttribute('aria-label','Copyable battle summary');result.append(text);text.focus();text.select();notice('Select and copy the summary below.');}},'action-button');const share=button('Share in the forums',()=>{try{sessionStorage.setItem('dexhaven-battle-draft',JSON.stringify({body:BattleEngine.summary(state),createdAt:Date.now()}));location.href='forums.html#new=1';}catch{notice('Browser storage is unavailable. Copy the summary and paste it into a discussion.',true);}},'text-button');const save=button('Save simulation',async()=>{if(!DexhavenAccount.getUser()){document.querySelector('#account-button').click();notice('Log in, then choose Save simulation again.');return;}const captured=recording,accountId=DexhavenAccount.getUser().id;save.disabled=true;try{const saved=await DexhavenAccount.request(recordedRun?'/battles/'+recordedRun.token+'/complete':'/battles/import',{method:'POST',body:recordedRun?{actions:captured.actions}:{configuration:captured.configuration,mode:captured.mode,difficulty:captured.difficulty,seed:captured.seed,actions:captured.actions}});if(!save.isConnected||recording!==captured||DexhavenAccount.getUser()?.id!==accountId)return;save.textContent='Simulation saved';const replay=el('a','text-button','Open saved replay');replay.href='battle-history.html#battle='+saved.id;result.append(replay);notice(saved.qualified?'Simulation saved as a qualified activity recording.':'Local simulation saved. This import does not grant activity awards.');globalThis.TrainerProgress?.refresh();}catch(e){if(save.isConnected){notice(e.message,true);save.disabled=false;}}},'action-button');save.id='battle-save';result.append(save,copy,share);}}
 async function load(){const current=++loading;root.replaceChildren(el('p','form-help','Preparing the Black/White field guide…'));try{snapshot=await BattleData.load();if(current===loading)setup();}catch(e){if(current===loading)root.replaceChildren(el('p','form-error',e.message),button('Retry battle data',load,'action-button'));}}
 addEventListener('dexhaven:session',event=>{if(!event.detail.ready)return;const id=event.detail.user?.id||null;if(lastUserId&&lastUserId!==id&&startButton)resetForConfig();lastUserId=id;if(recordChoice)recordChoice.parentElement.hidden=!id;if(id&&!difficultyTouched&&!state)DexhavenAccount.request('/settings/preferences').then(p=>{if(!difficultyTouched&&!state&&difficultySelect&&DexhavenAccount.getUser()?.id===id){difficulty=p.battleDifficulty;difficultySelect.value=difficulty;updateDifficultyHelp();}}).catch(()=>{});});
 addEventListener('pagehide',()=>runner.stop());load();
})();
