// Real Chromium QA, without packages. Uses deterministic API fixtures, not live data.
// Run: node tests/browser-qa.cjs (or set CHROME_PATH to a Chromium executable).
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const session = require('express-session');
const { createApp } = require('../server/app');
const { MemoryRepository } = require('./support/memory-repository.cjs');
const { createPokeFixture } = require('./support/pokeapi-fixture.cjs');
const analytics = require('../pokemon-data');
const snapshot = require('../data/pokemon-summary.json');
const encyclopedia = require('../encyclopedia-data');
const encyclopediaFixture = require('./fixtures/encyclopedia.json');
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browserPath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-browser-qa-'));
const uploadDir = path.join(profile, 'avatars');
const results = [];
let browser, socket;
const server = http.createServer();

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fixtureRepo=new MemoryRepository();
  const app = await createApp({repo:fixtureRepo,store:new session.MemoryStore(),config:{origin,uploadDir,production:false,host:'127.0.0.1',gbaEnabled:Boolean(process.env.QA_V072_REAL_ROMS),gbaRomsDir:path.join(root,'Dexhaven-GBA/ROMs'),trustProxy:false,secret:'browser-fixture-only-secret-'.repeat(4)}});
  server.on('request',(req,res)=>{
    const prefix='/preview/Pokedex-Website/';
    const pathname=new URL(req.url,origin).pathname;
    if(!pathname.startsWith(prefix))return app(req,res);
    const relative=pathname.slice(prefix.length)||'index.html';
    const allowed=['games.html','games.js','games.css','gba-emulator.js','gba-saves.js','shoutbox.js','shoutbox.css','settings.html','staff.html','battle-history.html','community-expansion.css','settings.js','member-cards.js','staff.js','profile-extras.js','rich-biography.js','forum-discovery.js','forum-polls.js','battle-recording.js','battle-history.js','forums.html','battle.html','forums.css','forums.js','forum-admin.js','forum-notifications.js','battle.css','battle.js','battle-data.js','battle-calculations.js','battle-engine.js','battle-engine-legacy.js','battle-simulator.js','vendor/battle-simulator.js','battle-runner.js','data/battle-v5.json','about.html','index.html','pokemon.html','trainers.html','dashboard.html','community.html','styles.css','trainer-hub.css','community.css','trainer-names.js','interactions.css','trainer-ranks.js','admin.html','admin.css','admin.js','trainer-cards.css','script.js','theme.js','pokemon-selector.js','account.js','avatar-cropper.js','trainer-progress.js','pokemon-data.js','advanced-filters.js','dashboard.js','encyclopedia-data.js','encyclopedia.js','team-analysis-data.js','team-analysis.js','community.js','profile-decorations.js','trainer-card-config.js','sprite-availability.js','pokemon-sprites.js','data/type-chart.json','data/pokemon-summary.json','vendor/chart.umd.js','artwork-fallback.svg','images/group-picture.png','images/prof_nicklas.png','images/prof_nicklas-cutout.png','images/patrick.png'];
    if(!allowed.includes(relative)){res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Static preview: authenticated features require Express.'}));return;}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
    res.setHeader('Content-Type',mime[path.extname(relative)]);fs.createReadStream(path.join(root,relative)).pipe(res);
  });
  browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  browser.on('error', (error) => { launchError = error; });
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
    await sleep(100);
  }
  assert.ok(port, 'Chrome remote debugging did not become available');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  const spriteFailures=new Set(),spriteRequests=[];
  async function spriteResponse(event){
    const url=new URL(event.request.url),match=url.pathname.match(/\/(\d+)\.(gif|png)$/);
    const game=url.pathname.includes('/versions/generation-v/');
    const kind=url.pathname.includes('/icons/')?'party':url.pathname.includes('/animated/')?'animated':'static';
    spriteRequests.push({url:url.href,kind});
    const filename=match&&path.join(__dirname,'fixtures/sprites',`${Number(match[1])}-${kind}.${kind==='animated'?'gif':'png'}`);
    if(game&&filename&&fs.existsSync(filename)&&!spriteFailures.has(kind)){
      await command('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:kind==='animated'?'image/gif':'image/png'}],body:fs.readFileSync(filename).toString('base64')});
    }else await command('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'});
  }
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if(message.method==='Fetch.requestPaused'){spriteResponse(message.params).catch(error=>exceptions.push(error.message));return;}
    if (message.method === 'Page.javascriptDialogOpening') command('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
  });
  function command(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function check(name, fn) {
    try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) {
      results.push({ name, passed: false }); console.log(`FAIL ${name}: ${error.message}`);
      if(process.env.QA_V072_ONLY){console.log('Script exceptions:',exceptions);console.log(await evaluate(`JSON.stringify(document.querySelector('#games-viewport iframe')?.contentWindow.qaRejections)`).catch(()=> 'Player diagnostics unavailable'));}
      console.log(await evaluate(`JSON.stringify({path:location.pathname,hash:location.hash,mode:window.qaMode,requests:window.qaRequests,message:document.querySelector('#account-message')?.textContent,retryHidden:document.querySelector('#trainer-catalog-retry')?.hidden,status:document.querySelector('#trainer-catalog-status')?.textContent})`).catch(()=> 'Diagnostic page state unavailable'));
      console.log(await evaluate(`JSON.stringify([...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(n=>({tag:n.tagName,class:n.className,width:n.getBoundingClientRect().width})))`).catch(()=> 'Geometry unavailable'));
    }
  }
  async function waitFor(expression) {
    for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}
    throw Error(`Timed out: ${expression}`);
  }
  async function key(key, code, extra = {}) {
    const windowsVirtualKeyCode = {Enter:13,Tab:9,Escape:27,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Home:36,End:35,'/':191}[key];
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r' } : {}), ...extra });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, ...extra });
  }
  async function searchSlot(slot,query) {
    await evaluate(`(()=>{const input=document.querySelectorAll('.team-slot [role="combobox"]')[${slot}];input.focus();input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  }
  async function selectSlot(slot,query) {await searchSlot(slot,query);await key('Enter','Enter');}
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  await command('Page.bringToFront');
  await command('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await command('Fetch.enable',{patterns:[{urlPattern:'*raw.githubusercontent.com*',requestStage:'Request'}]});
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.qaRejections=[];addEventListener('unhandledrejection',e=>qaRejections.push(String(e.reason?.stack||e.reason)));
    window.qaRequests = 0; window.qaDetailRequests = 0; window.qaMode = 'ok'; window.qaSummaryRequests=0;window.qaSummaryMode='ok';
    window.qaResourceRequests={};window.qaResourceFailures=[];window.qaResourceDelay={};
    window.qaProgressReads=0;window.qaFailCollectionRead=false;window.qaFailCollectionWrite=false;
    const fixture = (${createPokeFixture.toString()})(${JSON.stringify({...encyclopediaFixture.resources,...require('./fixtures/abilities.json').resources})});
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      const requestPath = new URL(String(url),location.href).pathname;
      if(requestPath==='/api/pokedex'&&(!options?.method||options.method==='GET')){window.qaProgressReads++;if(window.qaFailCollectionRead)return {ok:false,status:503,json:async()=>({error:'Trainer progression is unavailable. Apply the manual v0.5.0 migration.'})};}
      if(requestPath.startsWith('/api/pokedex/')&&['PUT','DELETE'].includes(options?.method)&&window.qaFailCollectionWrite)return {ok:false,status:503,json:async()=>({error:'Fixture collection save failure'})};
      if(requestPath.endsWith('/data/pokemon-summary.json')) {
        window.qaSummaryRequests++;
        await new Promise(resolve=>setTimeout(resolve,100));
        if(window.qaSummaryMode==='offline')throw new TypeError('Fixture summary outage');
        if(window.qaSummaryMode==='incomplete')return {ok:true,json:async()=>({schemaVersion:1,source:{url:'https://pokeapi.co/api/v2/pokemon/',retrievedAt:new Date().toISOString()},pokemon:[]})};
      }
      if(window.qaFailPrivateReads && ['/api/teams','/api/favorites'].includes(requestPath) && (!options?.method || options.method==='GET')) return {ok:false,status:503,json:async()=>({error:'Fixture private refresh failure'})};
      if(window.qaFailTeamDelete && requestPath.startsWith('/api/teams/') && options?.method==='DELETE') return {ok:false,status:503,json:async()=>({error:'Fixture delete failure'})};
      if(String(url).endsWith('/api/auth/session')){
        window.qaSessionPending=true;await new Promise(resolve=>setTimeout(resolve,500));
        try{return await originalFetch(url,options)}finally{window.qaSessionPending=false}
      }
      if (!String(url).startsWith('https://pokeapi.co/api/v2/')) return originalFetch(url, options);
      const resource=requestPath.split('/').filter(Boolean).slice(2).join('/');
      window.qaResourceRequests[resource]=(window.qaResourceRequests[resource]||0)+1;
      if(window.qaResourceDelay[resource])await new Promise(resolve=>setTimeout(resolve,window.qaResourceDelay[resource]));
      if(window.qaResourceFailures.includes(resource))throw new TypeError('Fixture encyclopedia resource failure');
      window.qaRequests++;
      if (fixture.key(url).startsWith('pokemon-')) window.qaDetailRequests++;
      await new Promise(resolve => setTimeout(resolve, 5));
      if (window.qaMode === 'offline') throw new TypeError('Failed to fetch');
      return {ok:true,json:async()=>fixture.response(url)};
    };` });
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await command('Page.navigate', { url: origin });
  if(process.env.QA_V072_ONLY){await require('./support/v072-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_BATTLE_POLISH_ONLY){await require('./support/battle-polish-browser.cjs')({check,evaluate,command,waitFor,origin});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_DISCOVERY_ONLY){await require('./support/discovery-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_V071_ONLY){await require('./support/v071-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_V070_ONLY){await require('./support/v070-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_COMMUNITY_ONLY){await require('./support/community-polish.cjs').run({check,origin,evaluate,command,waitFor,repo:fixtureRepo,uploadDir});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_COMMUNITY_BASELINE){await require('./support/community-polish.cjs').baseline({origin,evaluate,command,waitFor,repo:fixtureRepo,uploadDir});return;}
  if(process.env.QA_ADMIN_ONLY){await require('./support/admin-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_PROFILE_ONLY){await require('./support/card-baseline.cjs')({origin,evaluate,command,waitFor,repo:fixtureRepo,uploadDir});await require('./support/profile-refresh.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_STUDIO_ONLY){await require('./support/card-baseline.cjs')({origin,evaluate,command,waitFor,repo:fixtureRepo,uploadDir});await require('./support/studio-expansion.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo,uploadDir,spriteFailures,spriteRequests});if(results.some(r=>!r.passed))process.exitCode=1;return;}
  if(process.env.QA_CARD_BASELINE){await require('./support/card-baseline.cjs')({origin,evaluate,command,waitFor,repo:fixtureRepo,uploadDir});return;}
  await check('trainer navigation stays hidden while authentication is loading, then exposes Login/Register only',async()=>{
    await waitFor('window.qaSessionPending===true');
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    assert.equal(await evaluate(`document.querySelector('#guest-actions').hidden`),true);
    assert.equal(await evaluate(`document.querySelector('#home-auth-actions').hidden`),true);
    await waitFor(`!document.querySelector('#guest-actions').hidden`);
    assert.equal(await evaluate(`document.querySelector('#home-auth-actions').hidden`),false);
    assert.equal(await evaluate(`document.querySelector('#logout-button').hidden`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#register-button')).display!=='none'`),true);
  });
  await check('founders link opens rebuilt About page with shared layout, themes and responsive navigation',async()=>{
    await waitFor(`document.querySelector('.hero-art img')?.naturalWidth>0`);
    const image=await evaluate(`(()=>{const i=document.querySelector('.hero-art img');return{width:i.getBoundingClientRect().width,base:parseFloat(getComputedStyle(i).width),mask:getComputedStyle(i).maskImage,dot:getComputedStyle(document.querySelector('.art-label'),'::before').content,background:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily}})()`);
    assert.ok(Math.abs(image.width/image.base-.92)<.001);assert.match(image.mask,/linear-gradient/);assert.ok(['none','normal'].includes(image.dot));
    await evaluate(`document.querySelector('.hero-art').focus()`);await key('Enter','Enter');
    await waitFor(`document.querySelector('#about-title')`);assert.equal(await evaluate('location.pathname'),'/about.html');
    assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`),image.background);
    assert.equal(await evaluate(`getComputedStyle(document.body).fontFamily`),image.font);
    assert.match(await evaluate(`getComputedStyle(document.querySelector('#about-title')).fontFamily`),/Space Grotesk/);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.about-team-list h3')].map(n=>n.textContent)`),['Lucas','Oscar','Jacob Jannick','Patrick']);
    assert.match(await evaluate(`document.querySelector('.about-team-section').textContent`),/IT Architecture students at Erhvervsakademi København/);
    assert.equal(await evaluate(`document.querySelector('.trainer-nav [aria-current="page"]').textContent`),'About');
    assert.equal(await evaluate(`document.querySelector('.site-header .brand')!==null && document.querySelector('#auth-dialog')!==null`),true);
    assert.equal(await evaluate(`document.querySelector('link[href="about.css"],script[src="about.js"]')`),null);
    assert.equal(await evaluate(`/portfolio/i.test(document.body.textContent)`),false);
    assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
    await waitFor(`document.querySelector('#theme-toggle')?.hidden===false`);
    await evaluate(`document.querySelector('#theme-toggle').click()`);assert.equal(await evaluate(`localStorage.getItem('pokedex-theme')`),'light');
    for(const theme of ['dark','light']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`About ${theme} ${width}px`);}
    }
    if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});let shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'about-restyled.png'),Buffer.from(shot.data,'base64'));await evaluate(`document.querySelector('#about-team-title').scrollIntoView({block:'start',behavior:'instant'})`);shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'about-team.png'),Buffer.from(shot.data,'base64'));}
    await command('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate(`document.querySelector('.trainer-nav [data-page="home"]').getBoundingClientRect().width>0`),true);
    await evaluate(`document.querySelector('.trainer-nav [data-page="home"]').click()`);
    await waitFor(`document.querySelector('.hero-art')`);assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
    await evaluate(`localStorage.removeItem('pokedex-theme')`);await command('Page.reload');
    await waitFor(`document.querySelector('#guest-actions')?.hidden===false`);
    await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'founders-hero.png'),Buffer.from(shot.data,'base64'));}
    assert.deepEqual(exceptions,[]);
  });
  await check('dedicated homepage preserves hero, avoids catalogue requests and links to the National Pokédex', async () => {
    await evaluate(`document.querySelector('#home-register').click()`);
    assert.equal(await evaluate(`document.querySelector('#auth-dialog').open`),true);
    assert.equal(await evaluate(`document.querySelector('#auth-title').textContent`),'Join Dexhaven');
    await evaluate(`document.querySelector('#close-auth').click();document.querySelector('#home-login').click()`);
    assert.equal(await evaluate(`document.querySelector('#auth-title').textContent`),'Log in to Dexhaven');
    await evaluate(`document.querySelector('#close-auth').click()`);
    assert.equal(await evaluate(`document.querySelector('#pokemon-grid')`),null);
    assert.equal(await evaluate('window.qaRequests'),0);
    assert.equal(await evaluate(`document.querySelector('.hero-art img').getAttribute('src')`),'./images/group-picture.png');
    await waitFor(`document.querySelector('.hero-art img').naturalWidth>0`);
    assert.equal(await evaluate(`document.querySelector('[aria-current="page"]').textContent`),'Home');
    for (const width of [320,375,768,1280]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    }
    await evaluate(`document.querySelector('.explore-link').click()`);
    await waitFor(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate('location.pathname'),'/pokemon.html');
    assert.equal(await evaluate('document.title'),'National Pokédex — Dexhaven');
  });
  await check('649 real DOM cards; 19 index requests and no eager full details', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.pokemon-card').length`), 649); assert.deepEqual(exceptions, []);
    assert.equal(await evaluate('window.qaRequests'),19);assert.equal(await evaluate('window.qaDetailRequests'),0);
    assert.equal(await evaluate('window.qaProgressReads'),0);
    assert.equal(await evaluate(`document.querySelector('#collection-filter').disabled`),true);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-collection-id]')].every(n=>n.hidden)`),true);
  });
  await check('logged-out direct protected route shows a login prompt and Register opens registration',async()=>{
    await command('Page.navigate',{url:origin+'/teams'});
    await waitFor(`document.querySelector('#trainer-invitation')?.hidden===false`);
    assert.equal(await evaluate('location.pathname'),'/trainers.html');
    assert.equal(await evaluate('location.hash'),'#view=teams');
    assert.equal(await evaluate('window.qaRequests'),0);
    assert.equal(await evaluate(`document.querySelector('#trainer-area').hidden`),true);
    for(const theme of ['light','dark']) {
      await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      for(const width of [320,375,1280]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      }
    }
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    await evaluate(`document.querySelector('#hub-login').click()`);
    assert.equal(await evaluate(`document.querySelector('#auth-title').textContent`),'Log in to Dexhaven');
    await evaluate(`document.querySelector('#close-auth').click();document.querySelector('#hub-register').click()`);
    assert.equal(await evaluate(`document.querySelector('#auth-dialog').open`),true);
    assert.equal(await evaluate(`document.querySelector('#auth-title').textContent`),'Join Dexhaven');
    await evaluate(`document.querySelector('#close-auth').click();document.querySelector('[data-page="pokemon"]').click()`);
    await waitFor(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy')==='false'`);
  });
  await check('accessibility tree exposes search, sort, type group, and named cards', async () => {
    const { nodes } = await command('Accessibility.getFullAXTree');
    const named = (role,name) => nodes.some(n=>!n.ignored && n.role?.value===role && n.name?.value===name);
    assert.ok(named('searchbox','Search by Pokémon name or number'));
    assert.ok(named('combobox','Sort by'));
    assert.ok(named('group','FILTER BY TYPE'));
    assert.ok(named('group','Pokémon collection'));
    assert.ok(named('button','View Bulbasaur, #001, Grass / Poison'));
  });
  await check('search: case, whitespace, numbers, punctuation, empty results', async () => {
    for (const [query, id] of [[' PIKA ',25],['25',25],['025',25],['#025',25],["Farfetch'd",83],['mr mime',122],['nidoran f',29]]) {
      assert.deepEqual(await evaluate(`document.querySelector('#search').value=${JSON.stringify(query)}; document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true})); [...grid.children].map(c=>Number(c.dataset.id))`), [id]);
    }
    assert.equal(await evaluate(`state.query='no-such-pokemon';render();!document.querySelector('#empty-state').hidden`), true);
  });
  await check('combined type filters, pressed state, reset and all sort modes', async () => {
    assert.equal(await evaluate(`state.query='pika';document.querySelector('[data-type="electric"]').click();grid.children.length`), 1);
    assert.equal(await evaluate(`document.querySelector('[data-type="grass"]').click();grid.children.length`), 0);
    assert.equal(await evaluate(`document.querySelector('[data-type="grass"]').getAttribute('aria-pressed')`), 'true');
    await evaluate(`document.querySelector('#reset').click()`);
    assert.equal(await evaluate(`document.activeElement.id`), 'search');
    for (const mode of ['number','reverse','name']) {
      const items = await evaluate(`document.querySelector('#sort').value='${mode}';document.querySelector('#sort').dispatchEvent(new Event('change',{bubbles:true}));[...grid.children].map(c=>({id:Number(c.dataset.id),name:c.querySelector('.card-name').textContent}))`);
      const sorted = [...items].sort((a,b)=>mode === 'name' ? a.name.localeCompare(b.name) : mode === 'reverse' ? b.id-a.id : a.id-b.id);
      assert.deepEqual(items, sorted);
    }
  });
  await check('generation ranges combine with search, types and sorting', async () => {
    for(const [generation,start,end] of [['1',1,151],['2',152,251],['3',252,386],['4',387,493],['5',494,649]]) {
      await evaluate(`document.querySelector('#generation').value='${generation}';document.querySelector('#generation').dispatchEvent(new Event('change'));state.sort='number';render()`);
      assert.equal(await evaluate('grid.children.length'),end-start+1);
      assert.equal(await evaluate('Number(grid.firstElementChild.dataset.id)'),start);
      assert.equal(await evaluate('Number(grid.lastElementChild.dataset.id)'),end);
    }
    await evaluate(`document.querySelector('#generation').value='4';document.querySelector('#generation').dispatchEvent(new Event('change'));document.querySelector('[data-type="dragon"]').click()`);
    assert.deepEqual(await evaluate(`[...grid.children].map(n=>Number(n.dataset.id))`),[443,445]);
    await evaluate(`document.querySelector('#search').value='gib';document.querySelector('#search').dispatchEvent(new Event('input'))`);
    assert.deepEqual(await evaluate(`[...grid.children].map(n=>Number(n.dataset.id))`),[443]);
    assert.match(await evaluate(`document.querySelector('#collection-title').textContent`),/Sinnoh/);
    await evaluate(`document.querySelector('#reset').click()`);
    assert.equal(await evaluate('grid.children.length'),649);
  });
  await check('all advanced stat bounds and new sorts combine with legacy filters and reset', async () => {
    await waitFor(`state.statData?.size===649 && !document.querySelector('#advanced-fields').disabled`);
    assert.equal(await evaluate('window.qaSummaryRequests'),1);
    await evaluate(`resetFilters();document.querySelector('#advanced-filters').open=true`);
    for(const stat of [...analytics.stats,'total']) {
      const value=analytics.value(snapshot.pokemon[444],stat);
      await evaluate(`document.querySelector('#advanced-reset').click();document.querySelector('#stat-${stat}-min').value='${value}';document.querySelector('#stat-${stat}-max').value='${value}';document.querySelector('#stat-${stat}-max').dispatchEvent(new Event('input',{bubbles:true}))`);
      assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),snapshot.pokemon.filter(p=>analytics.value(p,stat)===value).map(p=>p.id));
      await evaluate(`document.querySelector('#advanced-reset').click();document.querySelector('#sort').value='stat:${stat}:desc';document.querySelector('#sort').dispatchEvent(new Event('change'))`);
      assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[...snapshot.pokemon].sort(analytics.compare(stat)).map(p=>p.id));
      await evaluate('resetFilters()');
    }
    await evaluate(`document.querySelector('#sort').value='stat:total:asc';document.querySelector('#sort').dispatchEvent(new Event('change'))`);
    assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[...snapshot.pokemon].sort(analytics.compare('total',true)).map(p=>p.id));
    await evaluate(`resetFilters();document.querySelector('#generation').value='4';document.querySelector('#generation').dispatchEvent(new Event('change'));document.querySelector('[data-type="dragon"]').click();document.querySelector('#stat-attack-min').value='100';document.querySelector('#stat-speed-min').value='90';document.querySelector('#stat-speed-min').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[445]);
    await evaluate(`document.querySelector('#stat-attack-max').value='50';document.querySelector('#stat-attack-max').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelector('#advanced-error').hidden`),false);
    assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[445]);
    await evaluate(`document.querySelector('#stat-attack-max').value='-1';document.querySelector('#stat-attack-max').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.match(await evaluate(`document.querySelector('#advanced-error').textContent`),/whole numbers/);
    await evaluate(`document.querySelector('#advanced-reset').click();document.querySelector('#stat-hp-min').value='255';document.querySelector('#stat-speed-min').value='255';document.querySelector('#stat-speed-min').dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`document.querySelector('#empty-state').hidden`),false);
    await evaluate(`document.querySelector('#reset').click();document.querySelector('#advanced-filters').open=false`);
    assert.equal(await evaluate('grid.children.length'),649);
    assert.equal(await evaluate('state.sort'),'number');
    assert.equal(await evaluate(`document.querySelector('#stat-hp-min').value`),'');
    assert.equal(await evaluate('window.qaDetailRequests'),0);
  });
  await check('detail values, keyboard activation, Tab trap, Escape and focus return', async () => {
    await evaluate(`resetFilters();state.sort='number';render();document.querySelector('button[data-id="1"]').focus()`);
    assert.equal(await evaluate(`document.activeElement.dataset.id`), '1', 'card focused before Enter');
    await key('Enter','Enter');
    assert.equal(await evaluate(`dialog.open`), true, 'Enter should open details');
    await waitFor(`document.querySelectorAll('#detail-content .stat').length===6`);
    assert.equal(await evaluate(`document.querySelector('#detail-name').textContent`), 'Bulbasaur');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.measurements dd')].map(n=>n.textContent)`), ['0.7 m','6.9 kg']);
    assert.equal(await evaluate(`document.querySelector('.stat-total').textContent`), 'Total318');
    assert.equal(await evaluate(`document.querySelector('.ability small').textContent`), 'Hidden ability');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.detail-hero .type-badge')].map(n=>n.textContent)`), ['Grass','Poison']);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.stat > span:not(.stat-label)')].map(n=>Number(n.textContent))`), [45,49,49,65,65,45]);
    const ax = await command('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(n=>!n.ignored && n.role?.value==='dialog' && n.name?.value==='Bulbasaur'));
    assert.equal(await evaluate(`getComputedStyle(document.body).overflow`), 'hidden');
    for (let i=0; i<4; i++) { await key('Tab','Tab'); assert.equal(await evaluate(`dialog.contains(document.activeElement) || document.activeElement === document.body`), true, 'Tab must not focus background controls'); }
    await key('Tab','Tab',{modifiers:8});
    assert.equal(await evaluate(`dialog.contains(document.activeElement) || document.activeElement === document.body`),true);
    await key('Escape','Escape');
    assert.equal(await evaluate(`dialog.open`), false, 'Escape closes dialog');
    assert.equal(await evaluate(`document.activeElement.dataset.id`), '1', 'focus returns to opener');
    await key('/','Slash',{text:'/'}); assert.equal(await evaluate(`document.activeElement.id`), 'search');
  });
  await check('ability descriptions load only on hover/focus, support touch and Escape, cache and retry',async()=>{
    await evaluate(`showDetails(state.pokemon.get(1))`);
    await waitFor(`document.querySelector('#detail-content .ability')`);
    assert.equal(await evaluate(`window.qaResourceRequests['ability/overgrow']||0`),0);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
    const point=await evaluate(`(async()=>{const b=document.querySelector('#detail-content .ability');b.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await waitFor(`document.querySelector('#detail-content [role="tooltip"]:not([hidden])')?.textContent.includes('1.5')`);
    assert.match(await evaluate(`document.querySelector('#detail-content [role="tooltip"]:not([hidden])').textContent`),/Grass/);
    await evaluate(`document.querySelector('#detail-content .ability').focus()`);await key('Escape','Escape');
    assert.equal(await evaluate('dialog.open'),true);
    assert.equal(await evaluate(`document.querySelector('#detail-content [role="tooltip"]').hidden`),true);
    await evaluate(`window.qaResourceFailures.push('ability/chlorophyll');document.querySelectorAll('#detail-content .ability')[1].focus()`);
    await waitFor(`document.querySelector('#detail-content [role="tooltip"]:not([hidden])')?.textContent.includes('could not load')`);
    await evaluate(`window.qaResourceFailures=[];document.querySelectorAll('#detail-content .ability')[1].click()`);
    await waitFor(`document.querySelector('#detail-content [role="tooltip"]:not([hidden])')?.textContent.match(/Speed|speed/)`);
    await evaluate(`dialog.close();showDetails(state.pokemon.get(1))`);await waitFor(`document.querySelector('#detail-content .ability')`);
    await evaluate(`document.querySelector('#detail-content .ability').focus()`);
    await waitFor(`document.querySelector('#detail-content [role="tooltip"]:not([hidden])')?.textContent.includes('1.5')`);
    assert.equal(await evaluate(`window.qaResourceRequests['ability/overgrow']`),1);
    await evaluate(`document.querySelector('#close-dialog').click()`);
  });
  await check('backdrop closes dialog; inside clicks keep it open', async () => {
    await evaluate(`document.querySelector('button[data-id="1"]').click();document.querySelector('#detail-name').click()`);
    assert.equal(await evaluate(`dialog.open`), true);
    await command('Input.dispatchMouseEvent', {type:'mousePressed',x:2,y:2,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent', {type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
    assert.equal(await evaluate(`dialog.open`), false);
  });
  await check('image fallback reaches local placeholder', async () => {
    await evaluate(`document.querySelector('.card-art img').scrollIntoView()`);
    await sleep(200);
    assert.equal(await evaluate(`document.querySelector('.card-art img').getAttribute('src')`), 'artwork-fallback.svg');
  });
  for (const width of [320,375,700,768,1280]) {
    await check(`responsive geometry at ${width}px: no page overflow or clipped artwork`, async () => {
      await command('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
      assert.equal(await evaluate(`[...document.querySelectorAll('.card-art')].every(n=>{const a=n.getBoundingClientRect(),b=n.querySelector('img').getBoundingClientRect();return b.width <= a.width + 1})`), true);
      await evaluate(`document.querySelector('button[data-id="1"]').click()`);
      assert.equal(await evaluate(`dialog.scrollWidth <= dialog.clientWidth`), true);
      await evaluate(`dialog.close()`);
    });
  }
  await check('full outage ends promptly, shows retry, and recovers', async () => {
    await evaluate(`localStorage.clear();state.pokemon.clear();window.qaMode='offline';window.qaRequests=0;window.qaLoad=loadPokemon()`);
    await evaluate('window.qaLoad');
    assert.ok(await evaluate('window.qaRequests') <= 8, 'outage should stop after an index failure');
    assert.equal(await evaluate(`document.querySelector('#error-state').hidden`), false);
    assert.equal(await evaluate(`document.querySelector('#load-status').hidden`), true);
    await evaluate(`window.qaMode='ok';document.querySelector('#retry').click()`);
    for (let i=0; i<100; i++) { if (await evaluate('!state.loading')) break; await sleep(50); }
    assert.equal(await evaluate('state.pokemon.size'),649);
  });
  await check('no uncaught script exceptions across the full interaction run', async () => assert.deepEqual(exceptions,[]));
  await check('theme follows system until toggled, saves the choice, and supports Enter', async () => {
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    await sleep(80);
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');
    await evaluate(`document.querySelector('#theme-toggle').focus()`); await key('Enter','Enter');
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');
    assert.equal(await evaluate(`localStorage.getItem('pokedex-theme')`),'dark');
    assert.equal(await evaluate(`document.querySelector('#theme-toggle').getAttribute('aria-label')`),'Switch to light theme');
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    await sleep(80);
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'dark');
  });
  await check('dark component styling matches the original stylesheet', async () => {
    await sleep(300);
    const equal = await evaluate(`(async()=>{
      const selectors=['body','.pokemon-card','.type-badge','.search-box','#sort','.filter-chip','.action-button','dialog','.close-button','footer'];
      const properties=['color','backgroundColor','borderTopColor','borderRadius','boxShadow','fontSize','paddingTop','paddingLeft'];
      const snapshot=()=>selectors.map(s=>{const c=getComputedStyle(document.querySelector(s));return properties.map(p=>c[p])});
      const current=snapshot();
      const css=await (await fetch('styles.css')).text();
      const sheet=[...document.styleSheets].find(s=>s.href?.endsWith('/styles.css'));
      const original=document.createElement('style');original.textContent=css.split('/* Theme additions')[0];
      document.head.append(original);sheet.disabled=true;
      const expected=snapshot();sheet.disabled=false;original.remove();
      return JSON.stringify(current)===JSON.stringify(expected);
    })()`);
    assert.equal(equal,true);
  });
  await check('light palette: readable text and all 18 type badges; working controls and modal', async () => {
    await evaluate(`document.querySelector('#theme-toggle').click()`);
    await waitFor(`getComputedStyle(document.body).backgroundColor==='rgb(243, 248, 245)'`);
    assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`),'rgb(243, 248, 245)');
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).colorScheme`),'light');
    const contrasts = await evaluate(`(()=>{
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
      const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*(fg[3]/255)+bg[i]*(1-fg[3]/255));
      const lum=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
      const holder=document.createElement('div');holder.className='pokemon-card';holder.append(badges(Object.keys(TYPE_COLORS)));document.body.append(holder);
      const values=[...holder.querySelectorAll('.type-badge')].map(n=>{const c=getComputedStyle(n);return {name:n.textContent,ratio:contrast(rgba(c.color),blend(rgba(c.backgroundColor),[255,255,255]))}});
      holder.remove();
      for(const s of ['h1>span','.text-button']) {const c=getComputedStyle(document.querySelector(s));values.push({name:s,ratio:contrast(rgba(c.color),[243,248,245])})}
      return values;
    })()`);
    assert.deepEqual(contrasts.filter(c=>c.ratio<4.5),[]);
    assert.equal(await evaluate(`document.querySelector('#search').value='pika';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('[data-type="electric"]').click();grid.children.length`),1);
    await evaluate(`grid.firstElementChild.querySelector('.pokemon-card').click()`);
    await waitFor(`document.querySelectorAll('#detail-content .stat').length===6`);
    assert.equal(await evaluate(`document.querySelector('#detail-name').textContent`),'Pikachu');
    assert.equal(await evaluate(`getComputedStyle(dialog).backgroundColor`),'rgb(243, 248, 245)');
    await evaluate(`dialog.close();resetFilters()`);
  });
  await check('saved light preference survives reload against a dark system', async () => {
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    await command('Page.reload');
    for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete' && !!document.querySelector('#theme-toggle') && !document.querySelector('#theme-toggle').hidden`)) break;await sleep(50)}
    assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');
    assert.equal(await evaluate(`document.querySelector('meta[name="theme-color"]').content`),'#f3f8f5');
  });
  await check('light mobile geometry, reduced motion, and no new script exceptions', async () => {
    for(const width of [320,375,768,1280]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('#theme-toggle').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`),true);
    }
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate(`getComputedStyle(document.body).transitionDuration`),'0s');
    assert.deepEqual(exceptions,[]);
  });
  await check('trainer registration through the real Express API', async () => {
    await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-switch').click();document.querySelector('#auth-username').value='browser_trainer';document.querySelector('#auth-email').value='browser@example.test';document.querySelector('#auth-password').value='browser test password 123';document.querySelector('#auth-form').requestSubmit()`);
    await waitFor(`!document.querySelector('#logout-button').hidden && document.querySelector('#guest-actions').hidden`);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>!n.hidden)`),true);
    assert.equal(await evaluate(`document.querySelector('#auth-dialog').open`),false);
    assert.equal(await evaluate(`document.cookie.includes('pokedex.sid')`),false,'session cookie must be HTTP-only');
  });
  await check('team creation, six slots, duplicate rejection, replacing and removing members', async () => {
    await evaluate(`document.querySelector('[data-page="trainers"]').click()`);
    await waitFor(`!!document.querySelector('.profile-panel') && state.pokemon.size===649 && !state.loading`);
    assert.equal(await evaluate('location.pathname'),'/trainers.html');
    await evaluate(`document.querySelector('[data-view="/teams"]').click();document.querySelector('.team-create input').value='Browser Team';document.querySelector('.team-create').requestSubmit()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===1`);
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot').length`),6);
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot select').length`),0);
    await waitFor(`TrainerProgress.caughtState().ready`);
    await evaluate(`document.querySelectorAll('.team-source button')[1].click()`);
    await searchSlot(0,'#1');
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot [role="option"]').length`),0);
    assert.match(await evaluate(`document.querySelector('.team-source .form-help').textContent`),/No caught/);
    await evaluate(`document.querySelectorAll('.team-source button')[0].click()`);
    await selectSlot(0,'bulba');await selectSlot(1,'#649');
    await evaluate(`document.querySelector('.team-editor').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team saved.'`);
    await searchSlot(1,'#001');
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot')[1].querySelector('[role="option"]').getAttribute('aria-disabled')`),'true');
    await key('Enter','Enter');
    await evaluate(`document.querySelectorAll('.team-slot')[1].querySelector('[aria-disabled="true"]').click()`);
    assert.match(await evaluate(`document.querySelectorAll('.team-slot')[1].querySelector('.mini-pokemon').textContent`),/Genesect/);
    await key('Escape','Escape');
    await evaluate(`document.querySelector('.team-slot .selector-clear').click()`);
    await selectSlot(1,'charm');
    await evaluate(`document.querySelector('.team-editor').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team saved.'`);
    await evaluate(`document.querySelector('[data-view="/profile"]').click();document.querySelector('[data-view="/teams"]').click()`);
    assert.match(await evaluate(`document.querySelector('.team-slot [role="combobox"]').value`),/#004 Charmander/);
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot [role="combobox"]')[1].value`),'');
  });
  await check('searchable selector: arrow keys, mouse, Escape, Tab, focus, names/numbers and bounded results',async()=>{
    const requests=await evaluate('window.qaRequests');
    await evaluate(`document.querySelectorAll('.team-slot [role="combobox"]')[1].focus()`);
    assert.ok(await evaluate(`document.querySelectorAll('.team-slot')[1].querySelectorAll('[role="option"]').length`)<=12);
    await key('ArrowDown','ArrowDown');
    assert.match(await evaluate(`document.activeElement.getAttribute('aria-activedescendant')`),/-option-1$/);
    await key('ArrowDown','ArrowDown');
    assert.match(await evaluate(`document.activeElement.getAttribute('aria-activedescendant')`),/-option-2$/);
    await key('ArrowUp','ArrowUp');await key('Enter','Enter');
    assert.match(await evaluate(`document.querySelectorAll('.team-slot [role="combobox"]')[1].value`),/Bulbasaur/);
    await searchSlot(1,'pika');
    const ax=await command('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='combobox'&&n.name?.value==='Slot 2'));
    const point=await evaluate(`(()=>{const option=document.querySelectorAll('.team-slot')[1].querySelector('[data-pokemon-id="25"]');option.scrollIntoView({block:'nearest'});const r=option.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    assert.match(await evaluate(`document.querySelectorAll('.team-slot')[1].querySelector('.mini-pokemon').textContent`),/#025 Pikachu/);
    assert.equal(await evaluate(`document.activeElement===document.querySelectorAll('.team-slot [role="combobox"]')[1]`),true);
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-expanded')`),'false');
    await searchSlot(1,'no-such-pokemon');
    assert.match(await evaluate(`document.querySelectorAll('.team-slot')[1].querySelector('.selector-status').textContent`),/No Pokémon/);
    assert.equal(await evaluate(`document.activeElement.hasAttribute('aria-activedescendant')`),false);
    await key('Escape','Escape');assert.match(await evaluate('document.activeElement.value'),/Pikachu/);
    await searchSlot(1,'genesect');await key('Tab','Tab');
    assert.match(await evaluate(`document.querySelectorAll('.team-slot [role="combobox"]')[1].value`),/Pikachu/,'unconfirmed text must not change the saved member');
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot [role="combobox"]')[1].getAttribute('aria-expanded')`),'false');
    await evaluate(`document.querySelectorAll('.team-slot')[1].querySelector('.selector-clear').click()`);
    assert.equal(await evaluate(`document.activeElement===document.querySelectorAll('.team-slot [role="combobox"]')[1]`),true);
    assert.equal(await evaluate(`document.activeElement.value`),'');
    assert.equal(await evaluate('window.qaRequests'),requests,'search must not fetch full details');
  });
  await check('Trainer Hub section links support history and direct reload with saved team members',async()=>{
    await evaluate(`document.querySelector('[data-view="/profile"]').click();document.querySelector('[data-view="/favorites"]').click();history.back()`);
    await waitFor(`location.hash==='#view=profile' && document.querySelector('#trainer-heading').textContent==='Trainer Profile'`);
    await evaluate('history.forward()');
    await waitFor(`location.hash==='#view=favorites' && document.querySelector('#trainer-heading').textContent==='My Favourites'`);
    await evaluate(`document.querySelector('[data-view="/teams"]').click()`);
    await command('Page.reload');
    await waitFor(`document.querySelector('.team-slot [role="combobox"]')?.value.includes('Charmander')`);
    assert.equal(await evaluate('location.pathname'),'/trainers.html');
    assert.equal(await evaluate('location.hash'),'#view=teams');
    assert.equal(await evaluate(`document.querySelector('[data-view="/teams"]').getAttribute('aria-current')`),'page');
    await waitFor(`state.pokemon.size===649 && !state.loading`);
    assert.equal(await evaluate('window.qaRequests'),0);
  });
  await check('missing selector script cannot block create/rename/delete; mutation success survives unrelated refresh failures',async()=>{
    await evaluate(`delete globalThis.PokemonSelector;window.qaFailPrivateReads=true;document.querySelector('[data-view="/profile"]').click();document.querySelector('[data-view="/teams"]').click()`);
    assert.match(await evaluate(`document.querySelector('#account-content').textContent`),/selection could not load/);
    assert.equal(await evaluate(`document.querySelectorAll('.delete-team').length`),1);
    assert.equal(await evaluate(`document.querySelector('.team-slot .mini-pokemon').textContent.includes('Charmander')`),true);
    await evaluate(`document.querySelector('.team-create input').value='Recovery Team';document.querySelector('.team-create').requestSubmit()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===2`);
    await evaluate(`document.querySelector('.team-editor input').value='Renamed Recovery Team';document.querySelector('.team-editor').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team saved.'`);
    await evaluate(`window.qaFailTeamDelete=true;document.querySelector('.delete-team').click()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Fixture delete failure'`);
    assert.equal(await evaluate(`document.querySelectorAll('.team-editor').length`),2);
    assert.equal(await evaluate(`document.querySelector('.delete-team').disabled`),false);
    await evaluate(`window.qaFailTeamDelete=false;document.querySelector('.delete-team').click()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===1`);
    assert.equal(await evaluate(`document.querySelector('.team-editor input').value`),'Browser Team');
    await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*','*pokemon-selector.js*']});
    await evaluate(`[...document.querySelectorAll('#account-content button')].find(b=>b.textContent==='Retry Pokémon editor').click()`);
    await waitFor(`document.querySelector('#account-message').textContent.includes('Restart Express')`);
    assert.equal(await evaluate(`document.querySelectorAll('.delete-team').length`),1);
    await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*']});
    await evaluate(`[...document.querySelectorAll('#account-content button')].find(b=>b.textContent==='Retry Pokémon editor').click()`);
    await waitFor(`document.querySelectorAll('.team-slot [role="combobox"]').length===6`);
    assert.match(await evaluate(`document.querySelector('.team-slot [role="combobox"]').value`),/Charmander/);
    await evaluate(`window.qaFailPrivateReads=false`);
    assert.deepEqual(exceptions,[]);
  });
  await check('card/detail favourites, dedicated page and profile bio/avatar upload', async () => {
    await evaluate(`document.querySelector('[data-page="pokemon"]').click()`);
    await waitFor(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy')==='false' && !document.querySelector('#logout-button').hidden`);
    await evaluate(`document.querySelector('#pokemon-grid [data-favorite="649"]').click()`);
    await waitFor(`document.querySelector('#pokemon-grid [data-favorite="649"]').getAttribute('aria-pressed')==='true'`);
    await evaluate(`document.querySelector('button[data-id="1"]').click()`);
    await waitFor(`!!document.querySelector('#detail-content [data-favorite="1"]')`);
    await evaluate(`document.querySelector('#detail-content [data-favorite="1"]').click()`);
    await waitFor(`document.querySelector('#detail-content [data-favorite="1"]').getAttribute('aria-pressed')==='true'`);
    await evaluate(`dialog.close();document.querySelector('[data-page="trainers"]').click()`);
    await waitFor(`!!document.querySelector('.profile-panel') && state.pokemon.size===649 && !state.loading`);
    await evaluate(`document.querySelector('[data-view="/favorites"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#favorite-grid .pokemon-card').length`),2);
    await evaluate(`document.querySelector('[data-view="/profile"]').click();const bio=document.querySelector('textarea[name="bio"]');bio.value='My browser-tested trainer bio';bio.closest('form').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Trainer info saved.'`);
    assert.equal(await evaluate(`document.querySelector('[data-profile-bio]').textContent`),'My browser-tested trainer bio');
    const png=await require('sharp')({create:{width:4,height:4,channels:3,background:'#80e5b8'}}).png().toBuffer();
    await evaluate(`(()=>{const input=document.querySelector('input[type="file"]');const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob('${png.toString('base64')}'),c=>c.charCodeAt(0))],'avatar.png',{type:'image/png'}));input.files=data.files;input.closest('form').requestSubmit()})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Profile picture updated.'`);
    assert.match(await evaluate(`document.querySelector('img.trainer-avatar').getAttribute('src')`),/^\/media\/avatars\/[0-9a-f-]+\.webp$/);
    await waitFor(`document.querySelector('#header-avatar').naturalWidth>0`);
    assert.equal(await evaluate(`document.querySelector('#header-avatar').getAttribute('src')===document.querySelector('img.trainer-avatar').getAttribute('src')`),true);
    assert.equal(await evaluate(`document.querySelector('#header-profile').hidden`),false);
    await evaluate(`document.querySelector('[data-view="/teams"]').click();document.querySelector('#header-profile').click();document.querySelector('#profile-dropdown a').click()`);
    await waitFor(`document.querySelector('#trainer-heading')?.textContent==='Trainer Profile'`);
    assert.equal(await evaluate(`document.querySelector('#trainer-heading').textContent`),'Trainer Profile');
  });
  await check('avatar framing previews zoom, pointer/keyboard movement, reset/cancel and uploads the selected crop',async()=>{
    await command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    const oldAvatar=await evaluate(`document.querySelector('#header-avatar').getAttribute('src')`);
    const sharp=require('sharp');const green=await sharp({create:{width:200,height:300,channels:3,background:'green'}}).png().toBuffer(),blue=await sharp({create:{width:200,height:300,channels:3,background:'blue'}}).png().toBuffer();
    const photo=await sharp({create:{width:600,height:300,channels:3,background:'red'}}).composite([{input:green,left:200,top:0},{input:blue,left:400,top:0}]).png().toBuffer();
    const choose=async()=>evaluate(`(()=>{const input=document.querySelector('input[name="avatar"]'),files=new DataTransfer();files.items.add(new File([Uint8Array.from(atob('${photo.toString('base64')}'),c=>c.charCodeAt(0))],'wide.png',{type:'image/png'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await choose();await waitFor(`document.querySelector('.avatar-editor')?.hidden===false && document.querySelector('input[name="avatar"]').closest('form').querySelector('[type="submit"]').disabled===false`);
    assert.equal(await evaluate(`document.querySelector('#header-avatar').getAttribute('src')`),oldAvatar);
    await evaluate(`document.querySelector('.avatar-zoom input').value='2';document.querySelector('.avatar-zoom input').dispatchEvent(new Event('input'));document.querySelector('.avatar-crop-preview').scrollIntoView({block:'center',behavior:'instant'})`);
    await sleep(80);
    const point=await evaluate(`(()=>{const r=document.querySelector('.avatar-crop-preview').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    for(const dx of [60,160,260]){await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y,button:'left',buttons:1});await sleep(30);}
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+260,y:point.y,button:'left',buttons:0,clickCount:1});
    const dragged=await evaluate(`(()=>{const c=document.querySelector('.avatar-crop-preview');return {pixel:[...c.getContext('2d').getImageData(256,256,1,1).data],status:document.querySelector('.avatar-editor [role="status"]').textContent,width:c.getBoundingClientRect().width}})()`);
    assert.ok(dragged.pixel[0]>200,JSON.stringify(dragged));
    await evaluate(`document.querySelector('.avatar-crop-preview').focus()`);await key('ArrowRight','ArrowRight');
    assert.match(await evaluate(`document.querySelector('.avatar-editor [role="status"]').textContent`),/200%/);
    await evaluate(`[...document.querySelectorAll('.avatar-editor button')].find(b=>b.textContent==='Reset framing').click()`);assert.equal(await evaluate(`document.querySelector('.avatar-zoom input').value`),'1');
    await evaluate(`[...document.querySelectorAll('.avatar-editor button')].find(b=>b.textContent==='Cancel picture').click()`);
    assert.equal(await evaluate(`document.querySelector('.avatar-editor').hidden`),true);assert.equal(await evaluate(`document.querySelector('#header-avatar').getAttribute('src')`),oldAvatar);
    await choose();await waitFor(`document.querySelector('.avatar-editor')?.hidden===false && document.querySelector('.avatar-crop-preview')?.width===512 && document.querySelector('input[name="avatar"]').closest('form').querySelector('[type="submit"]').disabled===false`);
    for(const theme of ['dark','light']){if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);for(const width of [320,375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}}
    await evaluate(`document.querySelector('.avatar-zoom input').value='4';document.querySelector('.avatar-zoom input').dispatchEvent(new Event('input'));document.querySelector('.avatar-crop-preview').focus()`);
    for(let i=0;i<60;i++)await key('ArrowRight','ArrowRight');
    assert.equal(await evaluate(`(()=>{const c=document.querySelector('.avatar-crop-preview').getContext('2d');return [[10,10],[256,256],[500,500]].every(([x,y])=>c.getImageData(x,y,1,1).data[0]>200)})()`),true);
    await evaluate(`document.querySelector('input[name="avatar"]').closest('form').requestSubmit()`);
    await waitFor(`document.querySelector('#header-avatar').getAttribute('src')!==${JSON.stringify(oldAvatar)} && document.querySelector('#account-message').textContent==='Profile picture updated.'`);
    const saved=await evaluate(`(async()=>{const r=await fetch(document.querySelector('#header-avatar').getAttribute('src'));return [...new Uint8Array(await r.arrayBuffer())];})()`);
    const stats=await sharp(Buffer.from(saved)).stats();assert.ok(stats.channels[0].mean>200);assert.ok(stats.channels[2].mean<30);
    assert.deepEqual(exceptions,[]);
  });
  await check('authenticated pages fit mobile and desktop in both themes', async () => {
    for(const theme of ['dark','light']) {
      if(await evaluate(`document.documentElement.dataset.theme`) !== theme) await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
        for(const view of ['/profile','/teams','/favorites']) {
          await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
          assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,`${theme} ${view} ${width}px`);
          if(view==='/teams') {
            await searchSlot(1,'#649');
            assert.equal(await evaluate(`(()=>{const r=document.querySelectorAll('.team-slot')[1].querySelector('.selector-popup').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`),true,`${theme} selector ${width}px`);
            await key('Escape','Escape');
          }
        }
      }
    }
  });
  await check('logout/login retains private data; direct page reload and deletion work', async () => {
    await evaluate(`document.querySelector('#logout-button').click()`);
    await waitFor(`!document.querySelector('#guest-actions').hidden && document.querySelector('#logout-button').hidden`);
    assert.equal(await evaluate(`document.querySelector('#trainer-invitation').hidden`),false);
    assert.equal(await evaluate(`document.querySelector('#trainer-area').hidden`),true);
    assert.equal(await evaluate(`document.querySelector('#account-content').children.length`),0);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='browser@example.test';document.querySelector('#auth-password').value='browser test password 123';document.querySelector('#auth-form').requestSubmit()`);
    await waitFor(`!document.querySelector('#logout-button').hidden`);
    await evaluate(`document.querySelector('[data-view="/profile"]').click()`);
    assert.equal(await evaluate(`document.querySelector('textarea[name="bio"]').value`),'My browser-tested trainer bio');
    await command('Page.reload');
    await waitFor('window.qaSessionPending===true');
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    await waitFor(`document.querySelector('textarea[name="bio"]')?.value==='My browser-tested trainer bio'`);
    await waitFor(`state.pokemon.size===649 && !state.loading`);
    await check('authenticated navigation across all four pages preserves session, theme and trainer tools', async () => {
      const theme = await evaluate('document.documentElement.dataset.theme');
      assert.equal(await evaluate(`document.querySelector('#pokemon-grid')`),null);
      await evaluate(`document.querySelector('[data-page="pokemon"]').click()`);
      await waitFor(`document.querySelector('#logout-button')?.hidden===false && state.pokemon.size===649 && !state.loading`);
      assert.equal(await evaluate('document.documentElement.dataset.theme'),theme);
      await evaluate(`document.querySelector('[data-page="dashboard"]').click()`);
      await waitFor(`document.querySelector('#dashboard-content')?.hidden===false && document.querySelector('#logout-button')?.hidden===false`);
      assert.equal(await evaluate('document.documentElement.dataset.theme'),theme);
      assert.equal(await evaluate(`document.querySelector('#header-profile').hidden`),false);
      assert.match(await evaluate(`document.querySelector('#header-avatar').getAttribute('src')`),/^\/media\/avatars\//);
      await evaluate(`document.querySelector('[data-page="home"]').click()`);
      await waitFor(`!!document.querySelector('.hero') && document.querySelector('#logout-button')?.hidden===false`);
      assert.equal(await evaluate(`document.querySelector('#home-auth-actions').hidden`),true);
      assert.equal(await evaluate('document.documentElement.dataset.theme'),theme);
      assert.equal(await evaluate('window.qaRequests'),0);
      assert.equal(await evaluate(`document.querySelector('#account-content')`),null);
      await evaluate(`document.querySelector('#header-profile').click();document.querySelector('#profile-dropdown a').click()`);
      await waitFor(`!!document.querySelector('.profile-panel') && state.pokemon.size===649 && !state.loading`);
      assert.equal(await evaluate('location.pathname'),'/trainers.html');
      assert.equal(await evaluate(`document.querySelector('#header-avatar').getAttribute('src')===document.querySelector('img.trainer-avatar').getAttribute('src')`),true);
      await evaluate(`document.querySelector('[data-view="/teams"]').click()`);
      assert.equal(await evaluate(`document.querySelectorAll('.team-slot [role="combobox"]').length`),6);
    });
    await evaluate(`document.querySelector('[data-view="/teams"]').click()`);
    assert.equal(await evaluate(`document.querySelector('.team-editor input').value`),'Browser Team');
    await evaluate(`document.querySelector('.delete-team').click()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===0`);
    await evaluate(`document.querySelector('[data-view="/favorites"]').click();document.querySelector('#favorite-grid [data-favorite="649"]').click()`);
    await waitFor(`document.querySelectorAll('#favorite-grid .pokemon-card').length===1`);
    assert.deepEqual(exceptions,[]);
  });
  await check('Trainer Hub catalogue outage preserves favourites and recovers through retry',async()=>{
    await evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('dexhaven-index-v2-')).forEach(k=>localStorage.removeItem(k))`);
    const offline=await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.qaMode='offline'`});
    try {
      await command('Page.navigate',{url:origin+'/trainers.html?qa=outage#view=favorites'});
      await waitFor(`document.querySelector('#trainer-catalog-retry')?.hidden===false`);
    } finally { await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:offline.identifier}); }
    assert.equal(await evaluate(`document.querySelectorAll('#favorite-grid .pokemon-card').length`),1);
    assert.equal(await evaluate('state.pokemon.size'),0);
    await evaluate(`window.qaMode='ok';document.querySelector('#trainer-catalog-retry').click()`);
    await waitFor(`state.pokemon.size===649 && !state.loading && document.querySelector('#trainer-catalog-status').hidden`);
    assert.equal(await evaluate(`document.querySelector('#favorite-grid .card-name').textContent`),'Bulbasaur');
    await evaluate(`document.querySelector('#favorite-grid .pokemon-card').click()`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Bulbasaur'`);
    await evaluate('dialog.close()');
    assert.deepEqual(exceptions,[]);
  });
  await check('personal card/detail status controls and collection filters combine with every public filter',async()=>{
    await command('Page.navigate',{url:origin+'/pokemon.html?qa=collection'});
    await waitFor(`document.querySelector('#pokemon-grid [data-collection-id="25"] button')?.disabled===false && !state.loading && state.statData?.size===649`);
    assert.equal(await evaluate('window.qaProgressReads'),1);
    assert.equal(await evaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"] select')`),null);
    assert.equal(await evaluate(`document.querySelectorAll('#pokemon-grid [data-collection-id="25"] button').length`),3);
    assert.equal(await evaluate(`document.querySelectorAll('#pokemon-grid [data-collection-id="25"] [aria-pressed="true"]').length`),1);
    const set=async(id,status,where='#pokemon-grid')=>{
      await evaluate(`document.querySelector('${where} [data-collection-id="${id}"] [data-collection-status="${status}"]').click()`);
      await waitFor(`document.querySelector('${where} [data-collection-id="${id}"] button')?.disabled===false && document.querySelector('${where} [data-collection-id="${id}"]').dataset.status==='${status}'`);
    };
    const filter=async value=>evaluate(`document.querySelector('#collection-filter').value='${value}';document.querySelector('#collection-filter').dispatchEvent(new Event('change'))`);
    await set(25,'seen');await filter('seen');assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[25]);
    await filter('caught');assert.equal(await evaluate('grid.children.length'),0);assert.equal(await evaluate(`document.querySelector('#empty-state').hidden`),false);
    await evaluate('showDetails(state.pokemon.get(25))');await set(25,'caught','#detail-content');
    assert.match(await evaluate(`document.querySelector('.achievement-toast')?.textContent||''`),/First Catch/);
    await evaluate(`document.querySelector('.achievement-toast button').click()`);
    assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[25]);
    const first=await evaluate(`fetch('/api/pokedex').then(r=>r.json())`);assert.equal(first.statistics.national.seen,1);assert.equal(first.statistics.national.caught,1);
    await set(25,'caught','#detail-content');
    assert.equal(await evaluate(`fetch('/api/pokedex').then(r=>r.json()).then(d=>d.collection.length)`),1);
    await evaluate('dialog.close();resetFilters()');
    await set(443,'seen');await set(445,'caught');
    await filter('seen');
    await evaluate(`document.querySelector('#generation').value='4';document.querySelector('#generation').dispatchEvent(new Event('change'));document.querySelector('[data-type="dragon"]').click();document.querySelector('#stat-attack-min').value='100';document.querySelector('#stat-speed-min').value='90';document.querySelector('#stat-speed-min').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#search').value='garch';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('#sort').value='stat:total:desc';document.querySelector('#sort').dispatchEvent(new Event('change'))`);
    assert.deepEqual(await evaluate('[...grid.children].map(n=>Number(n.dataset.id))'),[445]);
    await evaluate('resetFilters()');await filter('not-seen');assert.equal(await evaluate('grid.children.length'),646);
    await filter('not-caught');assert.equal(await evaluate('grid.children.length'),647);
    await evaluate('resetFilters()');assert.equal(await evaluate('grid.children.length'),649);
    await evaluate(`window.qaFailCollectionWrite=true;document.querySelector('#pokemon-grid [data-collection-id="445"] [data-collection-status="seen"]').click()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Fixture collection save failure'`);
    assert.equal(await evaluate(`document.querySelector('#pokemon-grid [data-collection-id="445"]').dataset.status`),'caught');
    await evaluate('window.qaFailCollectionWrite=false');
    assert.deepEqual(exceptions,[]);
  });
  await check('caught team search excludes Seen, preserves drafts and handles collection failure without falling back',async()=>{
    await command('Page.navigate',{url:origin+'/trainers.html#view=teams'});
    await waitFor(`document.querySelector('.team-create') && TrainerProgress.caughtState().ready`);
    await evaluate(`document.querySelector('.team-create input').value='Caught selector QA';document.querySelector('.team-create').requestSubmit()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===1`);
    await selectSlot(1,'#1');
    await evaluate(`document.querySelectorAll('.team-source button')[1].click()`);
    await searchSlot(0,'#443');
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot')[0].querySelectorAll('[role="option"]').length`),0,'Seen is not Caught');
    await searchSlot(0,'#25');await key('Enter','Enter');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.team-slot .selector-input')].slice(0,2).map(n=>n.value.slice(0,4))`),['#025','#001']);
    await evaluate(`window.qaFailCollectionRead=true;TrainerProgress.refresh()`);
    await waitFor(`!!TrainerProgress.caughtState().error`);
    await searchSlot(2,'#445');
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot')[2].querySelectorAll('[role="option"]').length`),0,'failed collection never shows the full catalogue');
    await evaluate(`window.qaFailCollectionRead=false;document.querySelector('.team-source .text-button').click()`);
    await waitFor(`TrainerProgress.caughtState().ready`);
    await selectSlot(2,'#445');
    await evaluate(`document.querySelector('.team-editor').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team saved.'`);
    await command('Page.reload');
    await waitFor(`document.querySelectorAll('.team-slot .selector-input').length===6 && TrainerProgress.caughtState().ready`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.team-slot .selector-input')].slice(0,3).map(n=>n.value.slice(0,4))`),['#025','#001','#445']);
    await evaluate(`document.querySelector('.delete-team').click()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===0`);
  });
  await check('private progress shows correct national/generation/type counts and server-earned achievements',async()=>{
    await command('Page.navigate',{url:origin+'/trainers.html#view=progress'});
    await waitFor(`document.querySelectorAll('#account-content .overview-card').length===8`);
    const metrics=await evaluate(`Object.fromEntries([...document.querySelectorAll('#account-content .overview-card')].map(n=>[n.querySelector('p').textContent,n.querySelector('strong').textContent]))`);
    assert.equal(metrics['Pokémon Seen'],'3');assert.equal(metrics['Pokémon Caught'],'2');assert.equal(metrics['Not Seen'],'646');assert.equal(metrics['Not Caught'],'647');
    assert.equal(metrics['Caught completion'],(200/649).toFixed(2)+'%');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-progress-generation="4"] progress')].map(n=>[n.value,n.max])`),[[2,107],[1,107]]);
    assert.match(await evaluate(`document.querySelector('#account-content').textContent`),/not the different regional Pokédex lists/);
    const dragon=await evaluate(`[...document.querySelectorAll('#account-content tbody tr')].find(n=>n.children[0].textContent==='Dragon')?.textContent`);assert.match(dragon,/Dragon21/);
    assert.equal(await evaluate(`document.querySelectorAll('.recent-registration').length`),3);
    await evaluate(`document.querySelector('[data-view="/achievements"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.achievement-card').length`),102);
    assert.match(await evaluate(`document.querySelector('[data-achievement="first-catch"]').textContent`),/Unlocked/);
    assert.match(await evaluate(`document.querySelector('[data-achievement="pokemon-collector"]').textContent`),/Locked/);
    await evaluate(`document.querySelector('[data-view="/teams"]').click();document.querySelector('.team-create input').value='Progression Six';document.querySelector('.team-create').requestSubmit()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===1`);
    for(const [slot,id] of [1,25,152,252,387,649].entries())await selectSlot(slot,'#'+id);
    await evaluate(`document.querySelector('.team-editor').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team saved.'`);
    await evaluate(`document.querySelector('[data-view="/achievements"]').click()`);
    await waitFor(`document.querySelector('[data-achievement="team-builder"]')?.classList.contains('unlocked')`);
    const unlocked=await evaluate(`document.querySelector('[data-achievement="team-builder"] time').dateTime`);
    await evaluate(`document.querySelector('[data-view="/teams"]').click();document.querySelector('.delete-team').click()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===0`);
    await evaluate(`document.querySelector('[data-view="/achievements"]').click()`);
    await waitFor(`document.querySelector('[data-achievement="team-builder"] progress')?.value===0`);
    assert.equal(await evaluate(`document.querySelector('[data-achievement="team-builder"] time').dateTime`),unlocked);
    assert.deepEqual(exceptions,[]);
  });
  await check('historical collector awards persist after removal, refresh and logout/login; private records never enter localStorage',async()=>{
    await evaluate(`(async()=>{const auth=await(await fetch('/api/auth/session')).json();for(let id=1;id<=25;id++)await fetch('/api/pokedex/'+id,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrfToken},body:JSON.stringify({status:'caught'})});await TrainerProgress.refresh()})()`);
    await waitFor(`document.querySelector('[data-achievement="pokemon-collector"]')?.classList.contains('unlocked')`);
    const date=await evaluate(`document.querySelector('[data-achievement="pokemon-collector"] time').dateTime`);
    await evaluate(`(async()=>{const auth=await(await fetch('/api/auth/session')).json();const data=await(await fetch('/api/pokedex')).json();for(const row of data.collection)await fetch('/api/pokedex/'+row.pokemonId,{method:'DELETE',headers:{'X-CSRF-Token':auth.csrfToken}});await TrainerProgress.refresh()})()`);
    assert.equal(await evaluate(`document.querySelector('[data-achievement="pokemon-collector"] progress').value`),0);
    assert.equal(await evaluate(`document.querySelector('[data-achievement="pokemon-collector"] time').dateTime`),date);
    await command('Page.reload');
    await waitFor(`document.querySelector('[data-achievement="pokemon-collector"]')?.classList.contains('unlocked')`);
    assert.equal(await evaluate(`document.querySelector('[data-achievement="pokemon-collector"] time').dateTime`),date);
    await evaluate(`document.querySelector('#logout-button').click()`);
    await waitFor(`document.querySelector('#trainer-invitation').hidden===false`);
    assert.equal(await evaluate(`document.querySelector('#account-content').children.length`),0);
    await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='browser@example.test';document.querySelector('#auth-password').value='browser test password 123';document.querySelector('#auth-form').requestSubmit()`);
    await waitFor(`document.querySelector('#logout-button').hidden===false`);
    await evaluate(`document.querySelector('[data-view="/achievements"]').click()`);
    await waitFor(`document.querySelector('[data-achievement="pokemon-collector"]')?.classList.contains('unlocked')`);
    assert.equal(await evaluate(`document.querySelector('[data-achievement="pokemon-collector"] time').dateTime`),date);
    assert.equal(await evaluate(`Object.keys(localStorage).filter(k=>k==='dexhaven-progress-change').every(k=>!/(?:pokemonId|caught|seen|userId)/.test(localStorage.getItem(k)))`),true);
  });
  await check('progression failures preserve public browsing and recover with an explicit migration/retry state',async()=>{
    const failure=await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.qaFailCollectionRead=true`});
    try{
      await command('Page.navigate',{url:origin+'/pokemon.html?qa=progress-offline'});
      await waitFor(`document.querySelector('#collection-retry')?.hidden===false && !state.loading`);
      assert.equal(await evaluate('grid.children.length'),649);assert.equal(await evaluate(`document.querySelector('#collection-filter').disabled`),true);
      assert.match(await evaluate(`document.querySelector('#collection-filter-help').textContent`),/manual v0.5.0 migration/);
      await evaluate(`window.qaFailCollectionRead=false;document.querySelector('#collection-retry').click()`);
      await waitFor(`document.querySelector('#collection-filter').disabled===false`);
      await evaluate(`TrainerProgress.update(25,'caught')`);
      assert.equal(await evaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"]').dataset.status`),'caught');
    }finally{await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:failure.identifier});}
  });
  await check('collection status synchronizes in a second tab without sharing private records in browser storage',async()=>{
    const other=await command('Target.createTarget',{url:'about:blank'});const attached=await command('Target.attachToTarget',{targetId:other.targetId,flatten:true});
    const otherEvaluate=async expression=>{
      const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},attached.sessionId);
      if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;
    };
    const otherWait=async expression=>{for(let i=0;i<100;i++){if(await otherEvaluate(expression))return;await sleep(50);}throw Error('Other tab timed out: '+expression);};
    try{
      await command('Network.enable',{},attached.sessionId);
      await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*','*pokeapi.co*']},attached.sessionId);
      await command('Page.navigate',{url:origin+'/pokemon.html'},attached.sessionId);
      await otherWait(`document.querySelector('#pokemon-grid [data-collection-id="25"] button')?.disabled===false`);
      assert.equal(await otherEvaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"]').dataset.status`),'caught');
      await evaluate(`TrainerProgress.update(25,'seen')`);
      await otherWait(`document.querySelector('#pokemon-grid [data-collection-id="25"]')?.dataset.status==='seen'`);
      await evaluate(`document.querySelector('#logout-button').click()`);
      await waitFor(`document.querySelector('#guest-actions').hidden===false`);
      await otherWait(`document.querySelector('#collection-filter')?.disabled===true && document.querySelector('#guest-actions').hidden===false`);
      assert.equal(await otherEvaluate(`[...document.querySelectorAll('[data-collection-id]')].every(n=>n.hidden)`),true);
      await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='browser@example.test';document.querySelector('#auth-password').value='browser test password 123';document.querySelector('#auth-form').requestSubmit()`);
      await waitFor(`document.querySelector('#collection-filter').disabled===false`);
      assert.equal(await evaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"]').dataset.status`),'seen');
      await evaluate(`(async()=>{const session=await(await fetch('/api/auth/session')).json();const response=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({username:'progress_other',email:'progress.other@example.test',password:'other trainer password 123'})});if(!response.ok)throw Error('Other trainer registration failed');localStorage.setItem('dexhaven-progress-change','qa-other-trainer-'+Date.now())})()`);
      await otherWait(`document.querySelector('#header-profile')?.title==='progress_other' && document.querySelector('#collection-filter').disabled===false`);
      assert.equal(await otherEvaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"]').dataset.status`),'not-registered');
      await waitFor(`document.querySelector('#header-profile').title==='progress_other' && document.querySelector('#collection-filter').disabled===false`);
      assert.equal(await evaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"]').dataset.status`),'not-registered');
      await evaluate(`(async()=>{const session=await(await fetch('/api/auth/session')).json();const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({identifier:'browser@example.test',password:'browser test password 123'})});if(!response.ok)throw Error('Original trainer login failed');localStorage.setItem('dexhaven-progress-change','qa-original-trainer-'+Date.now())})()`);
      await otherWait(`document.querySelector('#header-profile')?.title==='browser_trainer' && document.querySelector('#collection-filter').disabled===false`);
      await waitFor(`document.querySelector('#header-profile').title==='browser_trainer' && document.querySelector('#collection-filter').disabled===false`);
      assert.equal(await evaluate(`document.querySelector('#pokemon-grid [data-collection-id="25"]').dataset.status`),'seen');
    }finally{await command('Target.closeTarget',{targetId:other.targetId});await command('Page.bringToFront');}
    assert.deepEqual(exceptions,[]);
  });
  await check('personal progression and achievements remain responsive in both themes',async()=>{
    await command('Page.navigate',{url:origin+'/trainers.html#view=progress'});
    await waitFor(`document.querySelectorAll('#account-content .overview-card').length===8`);
    for(const theme of ['light','dark']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        for(const view of ['/progress','/achievements']){await evaluate(`document.querySelector('[data-view="${view}"]').click()`);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`${theme} ${width} ${view}`);}
      }
    }
    if(process.env.QA_SCREENSHOT_DIR){
      fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});
      await evaluate(`document.querySelector('[data-view="/progress"]').click();window.scrollTo(0,0)`);await sleep(100);
      fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'trainer-progress.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    assert.deepEqual(exceptions,[]);
  });
  await check('public dashboard loads complete real-data metrics, three charts, accessible tables and numeric rankings',async()=>{
    await command('Page.navigate',{url:origin+'/dashboard.html'});
    await waitFor(`document.querySelector('#dashboard-content')?.hidden===false`);
    const summary=analytics.summarize(snapshot.pokemon);
    assert.equal(await evaluate('document.title'),'Pokémon Analytics — Dexhaven');
    assert.equal(await evaluate(`document.querySelector('[data-page="dashboard"]').getAttribute('aria-current')`),'page');
    assert.equal(await evaluate(`document.querySelector('#metric-total').textContent`),'649');
    assert.equal(await evaluate(`document.querySelector('#metric-generations').textContent`),'5');
    assert.equal(await evaluate(`document.querySelector('#metric-types').textContent`),'18');
    assert.equal(await evaluate(`document.querySelector('#metric-average').textContent`),summary.averageTotal.toFixed(2));
    assert.equal(await evaluate('window.qaRequests'),0);assert.equal(await evaluate('window.qaSummaryRequests'),1);
    assert.deepEqual(await evaluate(`Chart.getChart('generation-chart').data.datasets[0].data`),[151,100,135,107,156]);
    assert.deepEqual(await evaluate(`Chart.getChart('type-chart').data.datasets[0].data`),analytics.types.map(t=>summary.types[t]));
    assert.deepEqual(await evaluate(`Chart.getChart('averages-chart').data.datasets.map(d=>d.data)`),analytics.stats.map((_,i)=>summary.groups.map(g=>g.averages[i])));
    assert.equal(await evaluate(`document.querySelectorAll('#type-table tbody tr').length`),18);
    assert.match(await evaluate(`document.querySelector('#type-chart-description').textContent`),/count once in each type/);
    const ax=await command('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='image'&&n.name?.value==='Pokémon distribution by generation'));
    for(const key of ['total',...analytics.stats]) {
      await evaluate(`document.querySelector('#ranking-stat').value='${key}';document.querySelector('#ranking-stat').dispatchEvent(new Event('change'))`);
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('.ranking-entry')].map(n=>Number(n.dataset.id))`),[...snapshot.pokemon].sort(analytics.compare(key)).slice(0,10).map(p=>p.id));
    }
    await evaluate(`document.querySelector('#ranking-stat').value='total';document.querySelector('#ranking-stat').dispatchEvent(new Event('change'));document.querySelector('.ranking-entry').click()`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Arceus'`);
    assert.equal(await evaluate(`document.querySelector('.stat-total').textContent`),'Total720');
    assert.equal(await evaluate('window.qaDetailRequests'),0);
    await evaluate('dialog.close()');
  });
  await check('comparison selectors search independently, reject duplicates and update exact stats, ties and charts',async()=>{
    const choose=async(index,query)=>{
      await evaluate(`(()=>{const input=document.querySelectorAll('#comparison-selectors [role="combobox"]')[${index}];input.focus();input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await key('Enter','Enter');
    };
    await choose(0,'bulba');await choose(1,'#649');
    assert.equal(await evaluate(`document.querySelector('#comparison-results').hidden`),false);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.comparison-card h3')].map(n=>n.textContent)`),['Bulbasaur','Genesect']);
    assert.deepEqual(await evaluate(`Chart.getChart('comparison-chart').data.datasets.map(d=>d.data)`),[snapshot.pokemon[0],snapshot.pokemon[648]].map(p=>p.stats.map(s=>s.value)));
    assert.match(await evaluate(`document.querySelector('#comparison-status').textContent`),/Genesect has 282 more/);
    assert.equal(await evaluate(`document.querySelectorAll('#comparison-table tbody tr').length`),7);
    assert.equal(await evaluate(`document.querySelectorAll('#comparison-table .stat-winner').length`),7);
    assert.match(await evaluate(`document.querySelector('.comparison-card').textContent`),/0.7 m/);
    assert.match(await evaluate(`document.querySelector('.comparison-card').textContent`),/6.9 kg/);
    assert.match(await evaluate(`document.querySelector('.comparison-card').textContent`),/Chlorophyll \(hidden\)/);
    await evaluate(`(()=>{const input=document.querySelectorAll('#comparison-selectors [role="combobox"]')[1];input.focus();input.value='#001';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    assert.equal(await evaluate(`document.querySelectorAll('#comparison-selectors .pokemon-selector')[1].querySelector('[data-pokemon-id="1"]').getAttribute('aria-disabled')`),'true');
    await evaluate(`document.querySelectorAll('#comparison-selectors .pokemon-selector')[1].querySelector('[data-pokemon-id="1"]').click()`);
    await key('Escape','Escape');
    assert.match(await evaluate(`document.querySelectorAll('#comparison-selectors [role="combobox"]')[1].value`),/Genesect/);
    await choose(0,'#150');await choose(1,'lugia');
    assert.match(await evaluate(`document.querySelector('#comparison-status').textContent`),/tied \(difference: 0\)/);
    assert.equal(await evaluate(`document.querySelector('#comparison-table tbody tr:last-child td:last-child').textContent`),'Tie · 0');
    await evaluate(`document.querySelector('#comparison-selectors .selector-clear').click()`);
    assert.equal(await evaluate(`document.querySelector('#comparison-results').hidden`),true);
    assert.equal(await evaluate(`!!Chart.getChart('comparison-chart')`),false);
    await choose(0,'#445');
    assert.equal(await evaluate(`!!Chart.getChart('comparison-chart')`),true);
    assert.equal(await evaluate('window.qaSummaryRequests'),1);assert.equal(await evaluate('window.qaRequests'),0);
  });
  await check('dashboard chart tooltips, responsive geometry and both theme palettes work',async()=>{
    const point=await evaluate(`(()=>{const c=Chart.getChart('generation-chart');c.canvas.scrollIntoView({block:'center'});const bar=c.getDatasetMeta(0).data[0];const r=c.canvas.getBoundingClientRect();return{x:r.left+bar.x,y:r.top+bar.y+10}})()`);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await sleep(80);
    assert.ok(await evaluate(`Chart.getChart('generation-chart').tooltip.opacity`)>0);
    for(const theme of ['light','dark']) {
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      await sleep(80);
      assert.equal(await evaluate(`Chart.getChart('generation-chart').options.scales.x.ticks.color===getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()`),true);
      for(const width of [320,375,768,1280]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await sleep(100);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`${theme} ${width}`);
        assert.equal(await evaluate(`[...document.querySelectorAll('canvas')].every(n=>n.getBoundingClientRect().width<=n.parentElement.getBoundingClientRect().width+1)`),true);
        // Every horizontal type row must track Y, regardless of its bar length or pointer X.
        const typePoints=await evaluate(`(()=>{const c=Chart.getChart('type-chart');c.canvas.scrollIntoView({block:'center'});const r=c.canvas.getBoundingClientRect();return c.getDatasetMeta(0).data.map((bar,index)=>({index,x:r.left+c.chartArea.left+4,y:r.top+bar.y,farX:r.left+c.chartArea.right-4}));})()`);
        for(const point of typePoints) {
          for(const x of [point.x,point.farX]) {
            await command('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:point.y});
            await waitFor(`Chart.getChart('type-chart').tooltip.opacity>0 && Chart.getChart('type-chart').tooltip.dataPoints?.[0]?.dataIndex===${point.index}`);
            assert.equal(await evaluate(`Chart.getChart('type-chart').tooltip.dataPoints[0].label`),analytics.types[point.index][0].toUpperCase()+analytics.types[point.index].slice(1));
          }
        }
        const first=typePoints[0];
        await command('Input.dispatchMouseEvent',{type:'mousePressed',x:first.x,y:first.y,button:'left',clickCount:1});
        await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:first.x,y:first.y,button:'left',clickCount:1});
        await waitFor(`Chart.getChart('type-chart').tooltip.dataPoints?.[0]?.dataIndex===0`);
        await evaluate(`document.querySelector('#comparison-selectors [role="combobox"]').focus()`);
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('#comparison-selectors .selector-popup').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`),true);
        await key('Escape','Escape');
      }
    }
    assert.deepEqual(exceptions,[]);
  });
  if(process.env.QA_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});
    await evaluate('window.scrollTo(0,0)');await sleep(100);
    fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'dashboard-desktop.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await evaluate(`document.querySelector('#comparison').scrollIntoView({block:'start'})`);await sleep(100);
    fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'comparison-desktop.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await check('incomplete analytics snapshots and failed stat data disable dependent controls and recover on retry',async()=>{
    const incomplete=await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.qaSummaryMode='incomplete'`});
    try {
      await command('Page.navigate',{url:origin+'/dashboard.html?qa=incomplete'});
      await waitFor(`document.querySelector('#dashboard-error')?.hidden===false`);
      assert.equal(await evaluate(`document.querySelector('#dashboard-content').hidden`),true);
      assert.equal(await evaluate(`!!Chart.getChart('generation-chart')`),false);
      await evaluate(`window.qaSummaryMode='ok';document.querySelector('#dashboard-retry').click()`);
      await waitFor(`document.querySelector('#dashboard-content').hidden===false`);
      assert.equal(await evaluate(`document.querySelector('#metric-total').textContent`),'649');
    } finally { await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:incomplete.identifier}); }
    const offline=await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.qaSummaryMode='offline'`});
    try {
      await command('Page.navigate',{url:origin+'/pokemon.html?qa=stats-offline'});
      await waitFor(`document.querySelector('#advanced-retry')?.hidden===false && !state.loading`);
      assert.equal(await evaluate(`document.querySelector('#advanced-fields').disabled`),true);
      assert.equal(await evaluate(`document.querySelector('#stat-sort-options').disabled`),true);
      assert.equal(await evaluate('grid.children.length'),649);
      await evaluate(`document.querySelector('#search').value='pika';document.querySelector('#search').dispatchEvent(new Event('input'))`);
      assert.equal(await evaluate('grid.children.length'),1);
      await evaluate(`window.qaSummaryMode='ok';document.querySelector('#advanced-retry').click()`);
      await waitFor(`document.querySelector('#advanced-fields').disabled===false`);
      assert.equal(await evaluate('state.statData.size'),649);
    } finally { await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:offline.identifier}); }
    assert.deepEqual(exceptions,[]);
  });
  await check('dashboard keeps exact tables and comparisons usable if the chart library cannot load',async()=>{
    await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*','*vendor/chart.umd.js*']});
    try {
      await command('Page.navigate',{url:origin+'/dashboard.html?qa=no-chart'});
      await waitFor(`document.querySelector('#dashboard-content')?.hidden===false`);
      assert.equal(await evaluate(`document.querySelector('#chart-warning').hidden`),false);
      assert.equal(await evaluate(`document.querySelectorAll('#generation-table tbody tr').length`),5);
      assert.equal(await evaluate(`document.querySelectorAll('.ranking-entry').length`),10);
      assert.equal(await evaluate(`document.querySelector('#metric-average').textContent`),analytics.summarize(snapshot.pokemon).averageTotal.toFixed(2));
    } finally { await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*']}); }
    assert.deepEqual(exceptions,[]);
  });
  await check('encyclopedia deep links, keyboard sections, English entries and shared evolution caches work',async()=>{
    await evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('dexhaven-encyclopedia-v1-')).forEach(k=>localStorage.removeItem(k))`);
    await command('Page.navigate',{url:origin+'/pokemon.html?pokemon=1'});
    await waitFor(`document.querySelectorAll('.detail-tab').length===6 && document.querySelector('#detail-name')?.textContent==='Bulbasaur'`);
    await waitFor(`document.activeElement.id==='detail-name'`);
    assert.equal(await evaluate(`document.activeElement.id`),'detail-name');
    assert.equal(await evaluate(`window.qaResourceRequests['pokemon-species/1']||0`),0);
    await evaluate(`document.querySelector('#detail-tab-overview').focus()`);await key('ArrowRight','ArrowRight');
    assert.equal(await evaluate(`document.activeElement.id`),'detail-tab-stats');
    assert.equal(await evaluate(`document.querySelector('#detail-panel-stats').hidden`),false);
    await evaluate(`document.querySelector('#detail-tab-evolutions').click()`);
    await waitFor(`document.querySelectorAll('.evolution-card').length===3`);
    assert.match(await evaluate(`document.querySelector('#detail-panel-evolutions').textContent`),/Level 16/);
    assert.equal(await evaluate(`window.qaResourceRequests['evolution-chain/1']`),1);
    await evaluate(`document.querySelector('#detail-tab-species').click()`);
    await waitFor(`!!document.querySelector('#entry-version')`);
    assert.match(await evaluate(`document.querySelector('#detail-panel-species').textContent`),/Seed Pokémon/);
    assert.equal(await evaluate(`window.qaResourceRequests['pokemon-species/1']`),1);
    const entries=encyclopedia.descriptions(encyclopediaFixture.resources['pokemon-species/1']);
    await evaluate(`document.querySelector('#entry-version').value='1';document.querySelector('#entry-version').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`document.querySelector('#pokedex-description').textContent`),entries[1].text);
    await evaluate(`document.querySelector('#detail-tab-evolutions').click();document.querySelector('[data-species-id="2"]').click()`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Ivysaur'`);
    await waitFor(`document.activeElement.id==='detail-name'`);
    assert.equal(await evaluate(`document.activeElement.id`),'detail-name');
    await evaluate(`document.querySelector('#detail-tab-evolutions').click()`);
    await waitFor(`document.querySelectorAll('.evolution-card').length===3`);
    assert.equal(await evaluate(`window.qaResourceRequests['evolution-chain/1']`),1);
    assert.match(await evaluate(`document.querySelector('.detail-navigation a').href`),/pokemon\.html\?pokemon=2$/);
    await evaluate('dialog.close()');
  });
  await check('branching evolutions include labelled unsupported species and standalone species have clear states',async()=>{
    await evaluate(`showDetails(state.pokemon.get(133))`);
    await evaluate(`document.querySelector('#detail-tab-evolutions').click()`);
    await waitFor(`document.querySelectorAll('.evolution-card').length===9`);
    assert.equal(await evaluate(`document.querySelector('[data-species-id="700"]').tagName`),'DIV');
    assert.match(await evaluate(`document.querySelector('[data-species-id="700"]').textContent`),/Beyond #649/);
    assert.match(await evaluate(`document.querySelector('#detail-panel-evolutions').textContent`),/Use Water Stone/);
    assert.match(await evaluate(`document.querySelector('#detail-panel-evolutions').textContent`),/Friendship/);
    await evaluate(`document.querySelector('[data-species-id="134"]').click()`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Vaporeon'`);
    await evaluate(`showDetails(state.pokemon.get(649))`);
    await evaluate(`document.querySelector('#detail-tab-evolutions').click()`);
    await waitFor(`document.querySelector('#detail-panel-evolutions').textContent.includes('no recorded evolutions')`);
    assert.equal(await evaluate(`document.querySelectorAll('.evolution-card').length`),1);
    await evaluate(`document.querySelector('#detail-tab-species').click()`);
    await waitFor(`!!document.querySelector('#entry-version')`);
    assert.match(await evaluate(`document.querySelector('#detail-panel-species').textContent`),/Mythical/);
    assert.match(await evaluate(`document.querySelector('#detail-panel-species').textContent`),/Not recorded/);
    await evaluate('dialog.close()');
  });
  await check('moves stay game-specific with historical stats, all filters, sorting and cached metadata',async()=>{
    await evaluate(`showDetails(state.pokemon.get(1))`);
    await evaluate(`document.querySelector('#detail-tab-moves').click()`);
    await waitFor(`!!document.querySelector('#moves-version') && document.querySelector('#moves-output')?.getAttribute('aria-busy')==='false'`);
    const set=async(id,value)=>{await evaluate(`document.querySelector('#${id}').value=${JSON.stringify(value)};document.querySelector('#${id}').dispatchEvent(new Event('${id==='move-search'?'input':'change'}',{bubbles:true}))`);await waitFor(`document.querySelector('#moves-output').getAttribute('aria-busy')==='false'`);};
    await set('moves-version','red-blue');
    const rows=await evaluate(`[...document.querySelectorAll('#moves-output tbody tr')].map(n=>[...n.children].map(c=>c.textContent))`);
    assert.equal(rows.find(r=>r[0]==='Tackle')[3],'35');assert.equal(rows.find(r=>r[0]==='Tackle')[4],'95%');
    assert.deepEqual(rows.map(r=>r[0].toLowerCase().replaceAll(' ','-')).sort(),encyclopedia.learnset(encyclopediaFixture.resources['pokemon/1'],'red-blue').map(r=>r.name).sort());
    await set('moves-version','black-2-white-2');
    assert.equal(await evaluate(`[...document.querySelectorAll('#moves-output tbody tr')].find(n=>n.children[0].textContent==='Tackle').children[3].textContent`),'50');
    await set('move-type','grass');
    assert.equal(await evaluate(`[...document.querySelectorAll('#moves-output tbody tr')].every(n=>n.children[1].textContent==='Grass')`),true);
    await set('move-type','all');await set('move-category','status');
    assert.equal(await evaluate(`[...document.querySelectorAll('#moves-output tbody tr')].every(n=>n.children[2].textContent==='Status'&&n.children[3].textContent==='—')`),true);
    await set('move-category','all');await set('move-method','level-up');await set('move-search','vine');
    assert.equal(await evaluate(`[...document.querySelectorAll('#moves-output tbody tr')].every(n=>n.children[0].textContent==='Vine Whip'&&n.children[6].textContent==='Level Up')`),true);
    await set('move-search','no-such-move');assert.match(await evaluate(`document.querySelector('#moves-output').textContent`),/No moves match/);
    await set('move-search','');await set('move-method','all');await set('move-sort','power');
    const powers=await evaluate(`[...document.querySelectorAll('#moves-output tbody tr')].map(n=>Number(n.children[3].textContent==='—'?-1:n.children[3].textContent))`);
    assert.deepEqual(powers,[...powers].sort((a,b)=>b-a));
    assert.equal(await evaluate(`window.qaResourceRequests['move/33']`),1);
    await evaluate('dialog.close()');
  });
  await check('modern dual-type matchup tables show quadruple weaknesses, resistances and immunities',async()=>{
    await evaluate(`if(dialog.open)dialog.close();showDetails(state.pokemon.get(6))`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Charizard' && !!document.querySelector('#detail-tab-matchups')`);
    await evaluate(`document.querySelector('#detail-tab-matchups').click()`);
    await waitFor(`document.querySelectorAll('#detail-panel-matchups table').length===3`);
    const defense=await evaluate(`Object.fromEntries([...document.querySelector('#detail-panel-matchups table').querySelectorAll('tbody tr')].map(n=>[n.children[0].textContent,n.children[1].textContent]))`);
    assert.equal(defense.Rock,'4×');assert.equal(defense.Ground,'0×');assert.equal(defense.Grass,'0.25×');
    assert.match(await evaluate(`document.querySelector('#detail-panel-matchups').textContent`),/not coverage of its actual moveset/);
    await evaluate('dialog.close()');
  });
  await check('encyclopedia failures retry and stale species responses cannot replace a newer selection',async()=>{
    await evaluate(`window.qaResourceFailures=['pokemon-species/152'];showDetails(state.pokemon.get(152))`);
    await waitFor(`!!document.querySelector('#detail-tab-species')`);
    await evaluate(`document.querySelector('#detail-tab-species').click()`);
    await waitFor(`document.querySelector('#detail-panel-species').textContent.includes('could not be loaded')`);
    await evaluate(`window.qaResourceFailures=[];document.querySelector('#detail-panel-species button').click()`);
    await waitFor(`!!document.querySelector('#entry-version')`);
    for(const id of [252,387,494]){
      await evaluate(`showDetails(state.pokemon.get(${id}))`);await evaluate(`document.querySelector('#detail-tab-species').click()`);
      await waitFor(`!!document.querySelector('#entry-version')`);
      assert.match(await evaluate(`document.querySelector('#detail-panel-species').textContent`),new RegExp(id===252?'Hoenn':id===387?'Sinnoh':'Unova'));
    }
    await evaluate(`showDetails(state.pokemon.get(236))`);await evaluate(`window.qaResourceDelay['pokemon-species/236']=400;document.querySelector('#detail-tab-species').click();showDetails(state.pokemon.get(649))`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Genesect'`);await sleep(450);
    assert.equal(await evaluate(`document.querySelector('#detail-name').textContent`),'Genesect');
    assert.equal(await evaluate(`document.querySelector('#detail-panel-overview').hidden`),false);
    await evaluate('dialog.close()');assert.deepEqual(exceptions,[]);
  });
  await check('encyclopedia sections fit mobile/desktop in both themes with keyboard navigation',async()=>{
    await evaluate(`showDetails(state.pokemon.get(1))`);
    for(const theme of ['light','dark']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        for(const name of ['overview','stats','evolutions','moves','matchups','species']){
          await evaluate(`document.querySelector('#detail-tab-${name}').click()`);await sleep(30);
          assert.equal(await evaluate(`dialog.scrollWidth<=dialog.clientWidth`),true,`${theme} ${width} ${name}`);
        }
      }
    }
    await evaluate(`document.querySelector('#detail-tab-overview').focus()`);await key('End','End');
    assert.equal(await evaluate('document.activeElement.id'),'detail-tab-species');
    await key('Home','Home');assert.equal(await evaluate('document.activeElement.id'),'detail-tab-overview');
    if(process.env.QA_SCREENSHOT_DIR){
      await evaluate(`document.querySelector('#detail-tab-evolutions').click();dialog.scrollTop=0`);await sleep(80);
      fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'encyclopedia-desktop.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await command('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:false});
      await evaluate(`document.querySelector('#detail-tab-moves').click();dialog.scrollTop=0`);await sleep(80);
      fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'encyclopedia-mobile.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    }
    await key('Escape','Escape');assert.equal(await evaluate('dialog.open'),false);assert.deepEqual(exceptions,[]);
  });
  let communityTeamId,communityShareId;
  await check('private analysis handles unsaved changes, six slots, exact dual-type coverage and interactive charts',async()=>{
    await command('Page.navigate',{url:origin+'/trainers.html#view=teams'});
    await waitFor(`document.querySelector('#logout-button')?.hidden===false`);
    const created=await evaluate(`(async()=>{const s=await(await fetch('/api/auth/session')).json();const headers={'Content-Type':'application/json','X-CSRF-Token':s.csrfToken};const team=(await(await fetch('/api/teams',{method:'POST',headers,body:JSON.stringify({name:'Community QA Team'})})).json()).team;await fetch('/api/teams/'+team.id,{method:'PUT',headers,body:JSON.stringify({name:team.name,pokemonIds:[6,81]})});return team.id;})()`);communityTeamId=created;
    await command('Page.reload');await waitFor(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .team-slot [role="combobox"]')`);
    await evaluate(`[...document.querySelector('.team-editor[data-team-id="${communityTeamId}"]').querySelectorAll('button')].find(b=>b.textContent==='Analyze Team').click()`);
    await waitFor(`document.querySelector('#team-analysis-${communityTeamId} .analytics-table')`);
    assert.equal(await evaluate(`document.querySelector('#team-analysis-${communityTeamId}').dataset.memberCount`),'2');
    assert.match(await evaluate(`document.querySelector('#team-analysis-${communityTeamId}').textContent`),/4×/);
    assert.equal(await evaluate(`document.querySelectorAll('#team-analysis-${communityTeamId} table').length`),4);
    assert.equal(await evaluate(`Chart.getChart(document.querySelector('#team-analysis-${communityTeamId} canvas')).data.labels.length`),18);
    await evaluate(`(()=>{const s=document.querySelector('#team-analysis-${communityTeamId} select');s.value='immune';s.dispatchEvent(new Event('change'));})()`);
    assert.match(await evaluate(`Chart.getChart(document.querySelector('#team-analysis-${communityTeamId} canvas')).data.datasets[0].label`),/Immunities/);
    await evaluate(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .selector-clear').click()`);
    await waitFor(`document.querySelector('#team-analysis-${communityTeamId}').dataset.memberCount==='1'`);
    assert.equal(await evaluate(`(async()=>{const teams=(await(await fetch('/api/teams')).json()).teams;return teams.find(t=>t.id===${communityTeamId}).pokemonIds.length;})()`),2,'analysis must not save the draft');
    await evaluate(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"]').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team saved.'`);
    await command('Page.reload');await waitFor(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"]')`);
  });
  await check('public profile settings start private; saved preview safely renders approved fields and featured Pokémon',async()=>{
    await evaluate(`document.querySelector('[data-view="/profile"]').click()`);
    await waitFor(`document.querySelector('.community-settings form')`);
    assert.equal(await evaluate(`document.querySelectorAll('textarea[name="bio"]').length`),1);
    assert.equal(await evaluate(`document.querySelector('[name="publicBio"]')`),null);
    assert.equal(await evaluate(`Boolean(document.querySelector('input[name="avatar"]').compareDocumentPosition(document.querySelector('textarea[name="bio"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`),true);
    assert.equal(await evaluate(`document.querySelector('.community-settings [name="enabled"]').checked`),false);
    await evaluate(`(()=>{const input=document.querySelector('.community-settings [role="combobox"]');input.focus();input.value='#6';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await key('Enter','Enter');
    await evaluate(`(()=>{const bio=document.querySelector('textarea[name="bio"]');bio.value='<img src=x onerror=alert(1)> Trainer story';bio.closest('form').requestSubmit();})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Trainer info saved.'`);
    await evaluate(`(()=>{const f=document.querySelector('.community-settings form');f.querySelector('[name="shareBio"]').checked=true;f.querySelector('[name="enabled"]').checked=true;f.querySelector('[name="shareFavorites"]').checked=true;f.querySelector('[name="shareProgress"]').checked=true;f.querySelector('[name="shareAchievements"]').checked=true;f.querySelector('[name="shareAvatar"]').checked=true;f.requestSubmit();})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Public profile settings saved.'`);
    await evaluate(`[...document.querySelectorAll('.community-settings button')].find(b=>b.textContent==='Preview saved public profile').click()`);
    await waitFor(`document.querySelector('.public-preview .public-identity')`);
    assert.match(await evaluate(`document.querySelector('.public-preview .profile-biography').textContent`),/<img/);
    assert.equal(await evaluate(`document.querySelector('.public-preview .profile-biography img')`),null);
    assert.equal(await evaluate(`document.querySelector('.public-preview').textContent.includes('browser@example.test')`),false);
    const profile=await evaluate(`(async()=>await(await fetch('/api/public/trainers/browser_trainer',{credentials:'omit'})).json())()`);
    assert.equal(profile.profile.username,'browser_trainer');assert.ok(profile.profile.statistics);assert.ok(Array.isArray(profile.profile.achievements));assert.ok(!('email'in profile.profile));
    assert.equal(profile.profile.featuredPokemonId,6);
    assert.match(await evaluate(`document.querySelector('.public-preview .shared-roster').textContent`),/Charizard/);
    assert.ok(!profile.profile.teams.some(t=>t.name==='Community QA Team'));
  });
  await check('team visibility publishes a stable link; logged-out public team shows six slots and read-only analysis',async()=>{
    await evaluate(`document.querySelector('[data-view="/teams"]').click()`);
    await waitFor(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .team-sharing select')`);
    await evaluate(`(()=>{const f=document.querySelector('.team-editor[data-team-id="${communityTeamId}"]');f.querySelector('.team-sharing select').value='public';[...f.querySelectorAll('button')].find(b=>b.textContent==='Save visibility').click();})()`);
    await waitFor(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .share-link-row input')`);
    communityShareId=(await evaluate(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .share-link-row input').value`)).split('/').pop();
    await evaluate(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .share-link-row button').click()`);
    await waitFor(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .share-link-row [role="status"]').textContent.length>0`);
    await evaluate(`document.querySelector('#logout-button').click()`);await waitFor(`document.querySelector('#guest-actions').hidden===false`);
    await command('Page.navigate',{url:origin+'/team/'+communityShareId});
    await waitFor(`document.querySelector('#community-content .team-analysis .analytics-table')`);
    assert.equal(await evaluate(`document.querySelectorAll('.shared-roster>.shared-pokemon').length`),6);
    assert.equal(await evaluate(`document.querySelectorAll('.shared-roster>.empty-public-slot').length`),5);
    assert.equal(await evaluate(`document.querySelector('.team-analysis').dataset.memberCount`),'1');
    assert.equal(await evaluate(`document.querySelector('.team-editor')`),null);
    assert.equal(await evaluate(`document.querySelector('#header-profile').hidden`),true);
    await evaluate(`document.querySelector('.shared-roster a').click()`);
    await waitFor(`document.querySelector('#detail-name')?.textContent==='Magnemite'`);
    await command('Page.navigate',{url:origin+'/trainer/browser_trainer'});
    await waitFor(`document.querySelector('.public-identity')`);
    assert.match(await evaluate(`document.querySelector('#community-content').textContent`),/Community QA Team/);
    assert.equal(await evaluate(`document.querySelector('.public-identity img').getAttribute('src')`),'/api/public/trainers/browser_trainer/avatar');
  });
  await check('public profiles, team charts and exact-value matrix fit both themes and keyboard access on mobile',async()=>{
    await command('Page.navigate',{url:origin+'/team/'+communityShareId});await waitFor(`document.querySelector('.team-analysis .analytics-table')`);
    for(const theme of ['dark','light']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`${theme} ${width}px`);
        assert.equal(await evaluate(`document.querySelectorAll('.team-analysis table tbody tr').length`),60);
      }
      assert.equal(await evaluate(`Chart.getChart(document.querySelector('.team-analysis canvas')).options.scales.x.ticks.color`),await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--text').trim()`));
    }
    await evaluate(`document.querySelector('.analysis-table-wrap').focus()`);assert.equal(await evaluate(`document.activeElement.getAttribute('role')`),'region');
    await key('ArrowRight','ArrowRight');
    if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'community-team.png'),Buffer.from(shot.data,'base64'));}
    await command('Page.navigate',{url:origin+'/trainer/browser_trainer'});await waitFor(`document.querySelector('.public-identity')`);
    for(const width of [320,375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  });
  await check('chart-library failure preserves team tables; revoking profile and team immediately closes public links',async()=>{
    await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*','*vendor/chart.umd.js*']});
    await command('Page.navigate',{url:origin+'/team/'+communityShareId});await waitFor(`document.querySelector('.team-analysis .analytics-table')`);
    assert.match(await evaluate(`document.querySelector('.team-analysis').textContent`),/Charts are unavailable/);
    assert.equal(await evaluate(`document.querySelectorAll('.team-analysis table').length`),4);
    await command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*raw.githubusercontent.com*']});
    await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='browser@example.test';document.querySelector('#auth-password').value='browser test password 123';document.querySelector('#auth-form').requestSubmit()`);
    await waitFor(`document.querySelector('#logout-button').hidden===false`);
    await command('Page.navigate',{url:origin+'/trainers.html#view=profile'});await waitFor(`document.querySelector('.community-settings form')`);
    await evaluate(`(()=>{const f=document.querySelector('.community-settings form');f.querySelector('[name="enabled"]').checked=false;f.requestSubmit();})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Public profile settings saved.'`);
    await evaluate(`document.querySelector('[data-view="/teams"]').click()`);await waitFor(`document.querySelector('.team-editor[data-team-id="${communityTeamId}"] .team-sharing select')`);
    await evaluate(`(()=>{const f=document.querySelector('.team-editor[data-team-id="${communityTeamId}"]');f.querySelector('.team-sharing select').value='private';[...f.querySelectorAll('button')].find(b=>b.textContent==='Save visibility').click();})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Team visibility saved.'`);
    await command('Page.navigate',{url:origin+'/team/'+communityShareId});await waitFor(`document.querySelector('#community-content h2')?.textContent==='Shared content unavailable'`);
    await command('Page.navigate',{url:origin+'/trainer/browser_trainer'});await waitFor(`document.querySelector('#community-content h2')?.textContent==='Shared content unavailable'`);
    await command('Page.navigate',{url:origin+'/community.html'});await waitFor(`document.querySelector('.community-directory')`);
    assert.equal(await evaluate(`document.querySelector('.community-directory').textContent.includes('browser_trainer')`),false);
    assert.deepEqual(exceptions,[]);
  });
  await check('expanded achievement vault filters all 102 medals and supports categories and earned status',async()=>{
    await command('Page.navigate',{url:origin+'/trainers.html#view=achievements'});
    await waitFor(`document.querySelectorAll('.achievement-card').length===102`);
    assert.equal(await evaluate(`document.querySelectorAll('.achievement-card[data-rarity="legendary"]').length>0`),true);
    await evaluate(`document.querySelector('[data-achievement-filter="types"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.achievement-card').length`),57);
    await evaluate(`document.querySelector('[data-achievement-filter="unlocked"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.achievement-card:not(.unlocked)').length`),0);
    await evaluate(`document.querySelector('[data-achievement-filter="all"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.achievement-card').length`),102);
    for(const theme of ['light','dark']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
    }
  });
  await check('decoration studio previews, resets, saves and persists curated cards and earned badge pins',async()=>{
    await evaluate(`document.querySelector('[data-view="/profile"]').click()`);
    await waitFor(`document.querySelector('.decoration-form')`);
    await evaluate(`(()=>{const f=document.querySelector('.decoration-form');f.querySelector('[name="palette"][value="violet"]').click();f.querySelector('[name="pattern"][value="constellation"]').click();f.querySelector('[name="frame"][value="halo"]').click();f.querySelector('[name="effect"][value="shimmer"]').click();const title=f.querySelector('[name="title"]');title.value='<b>Master of little legends</b>';title.dispatchEvent(new Event('input'));const motto=f.querySelector('[name="motto"]');motto.value='Every adventure starts with a first catch.';motto.dispatchEvent(new Event('input'));f.querySelector('[name="pinnedBadges"][value="first-catch"]').click();})()`);
    assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.palette`),'violet');
    assert.equal(await evaluate(`document.querySelector('.decoration-preview .trainer-title-ribbon b')`),null);
    assert.match(await evaluate(`document.querySelector('.decoration-preview .trainer-title-ribbon').textContent`),/<b>/);
    await evaluate(`document.querySelector('.decoration-form').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Trainer decorations saved.'`);
    await command('Page.reload');await waitFor(`document.querySelector('.decoration-form')`);
    assert.equal(await evaluate(`document.querySelector('.profile-panel').dataset.palette`),'violet');
    assert.match(await evaluate(`document.querySelector('.profile-panel .showcase-badge').textContent`),/First Catch/);
    await evaluate(`document.querySelector('.decoration-form [name="palette"][value="ocean"]').click();[...document.querySelectorAll('.decoration-form button')].find(b=>b.textContent==='Reset preview').click()`);
    assert.equal(await evaluate(`document.querySelector('.decoration-preview').dataset.palette`),'violet');
    await evaluate(`(()=>{const f=document.querySelector('.community-settings form');f.querySelector('[name="enabled"]').checked=true;f.querySelector('[name="shareAchievements"]').checked=true;f.requestSubmit();})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Public profile settings saved.'`);
    await command('Page.navigate',{url:origin+'/trainer/browser_trainer'});await waitFor(`document.querySelector('.public-identity')?.dataset.palette==='violet'`);
    assert.match(await evaluate(`document.querySelector('.public-identity .showcase-badge').textContent`),/First Catch/);
    assert.equal(await evaluate(`parseFloat(getComputedStyle(document.querySelector('.public-identity')).paddingTop)`),110);
    for(const theme of ['dark','light']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
    }
    if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,'decorated-trainer.png'),Buffer.from(shot.data,'base64'));}
    await command('Page.navigate',{url:origin+'/trainers.html#view=profile'});await waitFor(`document.querySelector('.decoration-form')`);
    for(const width of [320,375,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
    assert.deepEqual(exceptions,[]);
  });
  await check('community discovery shows rich public cards, real partners/teams, global search and pagination without self-links',async()=>{
    const privacy=require('../server/community'),cosmetics=require('../server/decorations');
    const existing=fixtureRepo.users.find(u=>u.username==='browser_trainer');await fixtureRepo.updateBio(existing.id,'Collecting little legends, one discovery at a time.');await fixtureRepo.community.saveSettings(existing.id,{...await fixtureRepo.community.settings(existing.id),shareBio:true});await fixtureRepo.community.saveDecoration(existing.id,{...cosmetics.defaults(),palette:'violet',pattern:'constellation',frame:'halo',title:'Little legends collector'});
    const sharp=require('sharp'),crypto=require('node:crypto');
    for(const [username,palette,partner,name,ids,bio]of [['mira_ocean','ocean',7,'Tide runners',[7,25,133],'Water teams, coastal journeys and a soft spot for Squirtle.'],['ember_roamer','sunset',4,'Campfire crew',[4,1,25,6],'Exploring Kanto with a team that feels like home.']]){
      const u=await fixtureRepo.createUser({username,email:`${username}@example.test`},'directory-fixture-only');const filename=crypto.randomUUID()+'.webp';fs.writeFileSync(path.join(uploadDir,filename),await sharp({create:{width:128,height:128,channels:3,background:palette==='ocean'?'#327fb8':'#c57548'}}).webp().toBuffer());await fixtureRepo.updateAvatar(u.id,filename);
      await fixtureRepo.updateBio(u.id,bio);const t=await fixtureRepo.createTeam(u.id,name);await fixtureRepo.saveTeam(u.id,t.id,{name,pokemonIds:ids});await fixtureRepo.community.share(u.id,t.id,'public');await fixtureRepo.community.saveSettings(u.id,{...privacy.defaults(),enabled:true,shareAvatar:true,shareBio:true,featuredPokemonId:partner,featuredTeamId:t.id});await fixtureRepo.community.saveDecoration(u.id,{...cosmetics.defaults(),palette,pattern:palette==='ocean'?'waves':'constellation',frame:'halo',title:palette==='ocean'?'A heart for Water types':'A little fire, a lot of heart'});
    }
    const hidden=await fixtureRepo.createUser({username:'hidden_trainer',email:'hidden@example.test'},'directory-fixture-only');await fixtureRepo.updateBio(hidden.id,'PRIVATE DIRECTORY TEST');
    for(let i=0;i<25;i++){const u=await fixtureRepo.createUser({username:`traveler_${String(i).padStart(2,'0')}`,email:`traveler${i}@example.test`},'directory-fixture-only');await fixtureRepo.community.saveSettings(u.id,{...privacy.defaults(),enabled:true});}
    await command('Page.navigate',{url:origin+'/community.html'});await waitFor(`document.querySelectorAll('.trainer-directory-card').length===24 && document.querySelector('.community-directory').getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate(`document.querySelector('#community-intro a[href="community.html"]')`),null);
    assert.equal(await evaluate(`document.querySelectorAll('[data-trainer="hidden_trainer"]').length`),0);
    assert.equal(await evaluate(`document.querySelector('[data-trainer="mira_ocean"] .directory-avatar img').getAttribute('src')`),'/api/public/trainers/mira_ocean/avatar');
    await waitFor(`document.querySelector('[data-trainer="mira_ocean"] [data-public-pokemon-name="7"]')?.textContent.includes('Squirtle')`);
    assert.match(await evaluate(`document.querySelector('[data-trainer="mira_ocean"]').textContent`),/Tide runners/);
    assert.equal(await evaluate(`document.querySelectorAll('[data-trainer="mira_ocean"] .directory-mini-roster>*').length`),6);
    assert.equal(await evaluate(`document.querySelector('.community-directory').textContent.includes('PRIVATE DIRECTORY TEST')`),false);
    await evaluate(`document.querySelector('.community-load-more').click()`);await waitFor(`document.querySelectorAll('.trainer-directory-card').length===28`);
    assert.equal(await evaluate(`document.querySelector('.community-load-more').hidden`),true);
    for(const theme of ['dark','light']){
      if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`document.querySelector('#theme-toggle').click()`);
      for(const width of [320,375,768,1280]){await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(80);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`${theme} community ${width}px ${await evaluate('document.documentElement.scrollWidth')}`);}
      if(process.env.QA_SCREENSHOT_DIR){fs.mkdirSync(process.env.QA_SCREENSHOT_DIR,{recursive:true});await sleep(300);await evaluate(`document.querySelector('.community-directory-heading').scrollIntoView({block:'start',behavior:'instant'})`);const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.QA_SCREENSHOT_DIR,`community-directory-${theme}.png`),Buffer.from(shot.data,'base64'));}
    }
    await evaluate(`document.querySelector('#community-search').value='mira';document.querySelector('.community-search').requestSubmit()`);await waitFor(`document.querySelectorAll('.trainer-directory-card').length===1 && document.querySelector('.trainer-directory-card').dataset.trainer==='mira_ocean'`);
    assert.match(await evaluate(`document.querySelector('.community-directory-info').textContent`),/1 of 1/);
    await evaluate(`document.querySelector('#community-search').value='nobody_here';document.querySelector('.community-search').requestSubmit()`);await waitFor(`document.querySelector('.community-message h3')?.textContent==='No trainer found. Yet.'`);
    await evaluate(`document.querySelector('.community-message button').click()`);await waitFor(`document.querySelectorAll('.trainer-directory-card').length===24`);
    await evaluate(`document.querySelector('[data-trainer="mira_ocean"] .directory-card-actions a').click()`);await waitFor(`document.querySelector('.public-profile-name')?.textContent==='mira_ocean'`);
    assert.equal(await evaluate(`document.querySelector('#community-intro').hidden`),true);assert.equal(await evaluate(`document.querySelector('.public-profile-hero .trainer-avatar').getBoundingClientRect().width>=112`),true);
    await evaluate(`document.querySelector('.community-back-link').click()`);await waitFor(`document.querySelector('.community-directory[aria-busy="false"]')`);
    assert.deepEqual(exceptions,[]);
  });
  await require('./support/studio-expansion.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo,uploadDir,spriteFailures,spriteRequests});
  await require('./support/profile-refresh.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});
  await require('./support/admin-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});
  await require('./support/community-polish.cjs').run({check,origin,evaluate,command,waitFor,repo:fixtureRepo,uploadDir});
  await require('./support/v070-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});
  await require('./support/v071-browser.cjs')({check,evaluate,command,waitFor,origin,repo:fixtureRepo});
  await check('static community preview gives a clear backend-required state without exposing private data',async()=>{
    await command('Page.navigate',{url:origin+'/preview/Pokedex-Website/community.html'});
    await waitFor(`document.querySelector('.community-error')`);
    assert.match(await evaluate(`document.querySelector('#community-content').textContent`),/Express backend|Static preview/);
    assert.equal(await evaluate(`document.querySelector('#header-profile').hidden`),true);
    assert.deepEqual(exceptions,[]);
  });
  await check('GitHub Pages project-path preview: no backend, correct brand/hero, generations, details and hash navigation',async()=>{
    await command('Page.navigate',{url:origin+'/preview/Pokedex-Website/'});
    await waitFor(`!!document.querySelector('.hero-art img')`);
    assert.match(await evaluate('document.title'),/^Dexhaven — /);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.brand')].map(n=>n.textContent)`),['dexhaven.','dexhaven.']);
    assert.equal(await evaluate('window.qaRequests'),0);
    assert.equal(await evaluate(`document.querySelector('.hero-art img').getAttribute('src')`),'./images/group-picture.png');
    await evaluate(`document.querySelector('.explore-link').click()`);
    await waitFor(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate(`document.querySelectorAll('.pokemon-card').length`),649);
    assert.equal(await evaluate('location.pathname'),'/preview/Pokedex-Website/pokemon.html');
    await evaluate(`document.querySelector('#generation').value='5';document.querySelector('#generation').dispatchEvent(new Event('change'));document.querySelector('#search').value='#649';document.querySelector('#search').dispatchEvent(new Event('input'))`);
    assert.deepEqual(await evaluate(`[...grid.children].map(n=>Number(n.dataset.id))`),[649]);
    await evaluate(`grid.querySelector('.pokemon-card').click()`);
    await waitFor(`document.querySelectorAll('#detail-content .stat').length===6`);
    assert.equal(await evaluate(`document.querySelector('#detail-name').textContent`),'Genesect');
    await evaluate(`dialog.close()`);
    await command('Page.navigate',{url:origin+'/preview/Pokedex-Website/pokemon.html#view=teams'});
    await waitFor(`document.querySelector('#trainer-invitation')?.hidden===false`);
    assert.equal(await evaluate('location.pathname'),'/preview/Pokedex-Website/trainers.html');
    assert.equal(await evaluate('location.hash'),'#view=teams');
    await command('Page.reload');
    await waitFor(`document.querySelector('#trainer-heading')?.textContent==='My Teams'`);
    await evaluate(`document.querySelector('[data-page="pokemon"]').click()`);
    await waitFor(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate('location.pathname'),'/preview/Pokedex-Website/pokemon.html');
    assert.equal(await evaluate(`document.querySelector('#collection').hidden`),false);
    await evaluate(`document.querySelector('[data-page="dashboard"]').click()`);
    await waitFor(`document.querySelector('#dashboard-content')?.hidden===false`);
    assert.equal(await evaluate('location.pathname'),'/preview/Pokedex-Website/dashboard.html');
    assert.equal(await evaluate(`document.querySelector('#metric-total').textContent`),'649');
    assert.equal(await evaluate('window.qaRequests'),0);
    assert.equal(await evaluate(`Chart.getChart('type-chart').data.labels.length`),18);
    await waitFor(`document.querySelector('#guest-actions').hidden===false`);
    assert.equal(await evaluate(`document.querySelector('#header-profile').hidden`),true);
    assert.deepEqual(exceptions,[]);
  });
  console.log(`\n${results.filter(r=>r.passed).length}/${results.length} browser checks passed (fixture data; not live PokéAPI).`);
  if (results.some(r=>!r.passed)) process.exitCode = 1;
}

main().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),sleep(3000)]); }
  server.close();
  // This is only the unique temporary Chrome profile created above.
  try {
    if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('pokedex-browser-qa-')) throw Error('Unexpected temporary profile path');
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
  } catch { console.log(`Temporary browser profile retained: ${profile}`); }
});
