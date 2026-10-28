const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
module.exports=async({check,evaluate,command,waitFor,origin})=>{
 await command('Page.navigate',{url:origin+'/battle.html'});
 await waitFor(`document.querySelector('#battle-start')?.disabled===false`);
 await check('battle setup hides unsupported counts and explains each difficulty without changing stats',async()=>{
  assert.equal(await evaluate(`document.querySelectorAll('.battle-unsupported').length`),0);
  assert.equal(await evaluate(`document.querySelector('#battle-content').textContent.includes('eligible moves not supported')`),false);
  const stats=await evaluate(`[...document.querySelectorAll('.battle-stats')].map(t=>t.textContent)`);
  for(const [value,description]of [['easy','Random'],['normal','Scores damage'],['hard','knockout']]){
   await evaluate(`(()=>{const s=document.querySelector('#battle-difficulty');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   assert.ok(await evaluate(`document.querySelector('#battle-difficulty-help').textContent.includes('${description}')`));
   assert.deepEqual(await evaluate(`[...document.querySelectorAll('.battle-stats')].map(t=>t.textContent)`),stats);
  }
  assert.equal(await evaluate(`document.querySelector('#battle-difficulty').getAttribute('aria-describedby')`),'battle-difficulty-help');
 });
 await check('arena action is larger and fits desktop, tablet and mobile in both themes',async()=>{
  const dir=path.join(os.tmpdir(),'dexhaven-battle-polish');fs.mkdirSync(dir,{recursive:true});
  for(const width of [320,768,1280])for(const theme of ['dark','light']){
   await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('#battle-start').scrollIntoView({behavior:'instant',block:'center'})`);
   const box=await evaluate(`(()=>{const b=document.querySelector('#battle-start'),r=b.getBoundingClientRect();return {height:r.height,width:r.width,left:r.left,right:r.right,font:parseFloat(getComputedStyle(b).fontSize)};})()`);
   assert.ok(box.height>=68&&box.font>=18);assert.ok(box.left>=0&&box.right<=width);
   assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),true,width+'/'+theme);
   if(width!==768&&theme==='dark'){const s=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,'arena-'+width+'.png'),Buffer.from(s.data,'base64'));}
  }
 });
 await check('restyled action starts a playable battle and difficulty changes reset it',async()=>{
  await evaluate(`document.querySelector('#battle-start').click()`);
  await waitFor(`document.querySelector('#battle-stage-panel').hidden===false`);
  assert.equal(await evaluate(`document.querySelector('#battle-start').textContent`),'Start new battle');
  await evaluate(`document.querySelector('.battle-move-buttons button').click()`);
  await waitFor(`document.querySelector('.battle-log').children.length>0`);
  await evaluate(`(()=>{const s=document.querySelector('#battle-difficulty');s.value='easy';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelector('#battle-stage-panel').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('#battle-start').textContent`),'Enter the Arena');
  assert.equal(await evaluate(`document.querySelector('#battle-start').disabled`),false);
 });
 await check('browser and server reconstruct identical complex-move recordings',async()=>{
  const result=await evaluate(`(async()=>{
   const snapshot=await BattleData.load();
   const config=[{id:151,level:100,moves:[144,76,182,164]},{id:6,level:100,moves:[52,17,163]}];
   const record=new BattleRecording.Recording(snapshot,config,'player','hard',77);
   record.turn(144);
   if(record.state.fighters[0].appearanceId!==6)throw Error('Transform did not change appearance');
   while(record.state.phase==='ready')record.turn(BattleEngine.chooseAI(record.state,0,snapshot.types,()=>.5,'normal'));
   return{config,actions:record.actions,replay:record.replay()};
  })()`);
  const expected=require('../../battle-recording').reconstruct(require('../../data/battle-v5.json'),result.config,'player','hard',77,result.actions);
  assert.deepEqual(result.replay,expected);
 });
 await check('newly available Transform works through the actual move picker and updates the live HUD',async()=>{
  await evaluate(`(()=>{const input=document.querySelector('.battle-config:first-child [role="combobox"]');input.value='mew';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(`document.querySelector('.battle-config:first-child [role="option"][data-pokemon-id="151"]')`);
  await evaluate(`document.querySelector('.battle-config:first-child [role="option"][data-pokemon-id="151"]').click()`);
  await waitFor(`document.querySelector('.battle-config:first-child .battle-move-choice input[value="144"]')`);
  await evaluate(`(()=>{const card=document.querySelector('.battle-config:first-child');for(const input of card.querySelectorAll('.battle-move-choice input:checked'))input.click();card.querySelector('.battle-move-choice input[value="144"]').click();const level=document.querySelector('[name="level-1"]');level.value='1';level.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#battle-start').click();})()`);
  await waitFor(`document.querySelector('.battle-move-buttons button[data-move-id="144"]')`);
  await evaluate(`document.querySelector('.battle-move-buttons button[data-move-id="144"]').click()`);
  await waitFor(`document.querySelector('.battle-side-0 .battle-sprite')?.dataset.pokemonId==='6'`);
  assert.equal(await evaluate(`document.querySelector('.battle-side-0 .types .type-fire')!==null`),true);
  assert.equal(await evaluate(`document.querySelector('.battle-move-buttons button[data-move-id="144"]')`),null);
  assert.ok(await evaluate(`document.querySelectorAll('.battle-move-buttons button').length>0`));
 });
};
