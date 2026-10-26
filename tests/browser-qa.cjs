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
  const app = await createApp({repo:new MemoryRepository(),store:new session.MemoryStore(),config:{origin,uploadDir,production:false,trustProxy:false,secret:'browser-fixture-only-secret-'.repeat(4)}});
  server.on('request',(req,res)=>{
    const prefix='/preview/Pokedex-Website/';
    const pathname=new URL(req.url,origin).pathname;
    if(!pathname.startsWith(prefix))return app(req,res);
    const relative=pathname.slice(prefix.length)||'index.html';
    const allowed=['index.html','styles.css','script.js','theme.js','pokemon-selector.js','account.js','artwork-fallback.svg','images/group-picture.png'];
    if(!allowed.includes(relative)){res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Static preview: authenticated features require Express.'}));return;}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
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
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.javascriptDialogOpening') command('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
  });
  function command(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function check(name, fn) {
    try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, passed: false }); console.log(`FAIL ${name}: ${error.message}`); }
  }
  async function waitFor(expression) {
    for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50);}
    throw Error(`Timed out: ${expression}`);
  }
  async function key(key, code, extra = {}) {
    const windowsVirtualKeyCode = {Enter:13,Tab:9,Escape:27,ArrowDown:40,ArrowUp:38,'/':191}[key];
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r' } : {}), ...extra });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, ...extra });
  }
  async function searchSlot(slot,query) {
    await evaluate(`(()=>{const input=document.querySelectorAll('.team-slot [role="combobox"]')[${slot}];input.focus();input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  }
  async function selectSlot(slot,query) {await searchSlot(slot,query);await key('Enter','Enter');}
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  await command('Page.bringToFront');
  await command('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*raw.githubusercontent.com*'] });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.qaRequests = 0; window.qaDetailRequests = 0; window.qaMode = 'ok';
    const fixture = (${createPokeFixture.toString()})();
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      const requestPath = new URL(String(url),location.href).pathname;
      if(window.qaFailPrivateReads && ['/api/teams','/api/favorites'].includes(requestPath) && (!options?.method || options.method==='GET')) return {ok:false,status:503,json:async()=>({error:'Fixture private refresh failure'})};
      if(window.qaFailTeamDelete && requestPath.startsWith('/api/teams/') && options?.method==='DELETE') return {ok:false,status:503,json:async()=>({error:'Fixture delete failure'})};
      if(String(url).endsWith('/api/auth/session')){
        window.qaSessionPending=true;await new Promise(resolve=>setTimeout(resolve,500));
        try{return await originalFetch(url,options)}finally{window.qaSessionPending=false}
      }
      if (!String(url).startsWith('https://pokeapi.co/api/v2/')) return originalFetch(url, options);
      window.qaRequests++;
      if (fixture.key(url).startsWith('pokemon-')) window.qaDetailRequests++;
      await new Promise(resolve => setTimeout(resolve, 5));
      if (window.qaMode === 'offline') throw new TypeError('Failed to fetch');
      return {ok:true,json:async()=>fixture.response(url)};
    };` });
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await command('Page.navigate', { url: origin });
  await check('trainer navigation stays hidden while authentication is loading, then exposes Login/Register only',async()=>{
    await waitFor('window.qaSessionPending===true');
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    assert.equal(await evaluate(`document.querySelector('#guest-actions').hidden`),true);
    await waitFor(`!document.querySelector('#guest-actions').hidden`);
    assert.equal(await evaluate(`document.querySelector('#logout-button').hidden`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#register-button')).display!=='none'`),true);
  });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy') === 'false'`)) break; await sleep(50); }
  await check('649 real DOM cards; 19 index requests and no eager full details', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('.pokemon-card').length`), 649); assert.deepEqual(exceptions, []);
    assert.equal(await evaluate('window.qaRequests'),19);assert.equal(await evaluate('window.qaDetailRequests'),0);
  });
  await check('logged-out direct protected route shows a login prompt and Register opens registration',async()=>{
    await command('Page.navigate',{url:origin+'/teams'});
    await waitFor(`document.querySelector('#account-content')?.textContent.includes('Log in or create')`);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    await evaluate(`document.querySelector('#register-button').click()`);
    assert.equal(await evaluate(`document.querySelector('#auth-dialog').open`),true);
    assert.equal(await evaluate(`document.querySelector('#auth-title').textContent`),'Join Dexhaven');
    await evaluate(`document.querySelector('#close-auth').click();document.querySelector('[data-view="/"]').click()`);
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
    assert.equal(await evaluate(`document.querySelector('.hero-art img').getAttribute('src')`), './images/group-picture.png');
    assert.equal(await evaluate(`document.querySelector('.hero-art img').naturalWidth>0`),true);
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
      const selectors=['body','.pokemon-card','.type-badge','.search-box','#sort','.filter-chip','.action-button','dialog','.close-button','.hero-orbit','footer'];
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
      for(const s of ['.hero-description','h1>span','.text-button']) {const c=getComputedStyle(document.querySelector(s));values.push({name:s,ratio:contrast(rgba(c.color),[243,248,245])})}
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
    await evaluate(`document.querySelector('[data-view="/teams"]').click();document.querySelector('.team-create input').value='Browser Team';document.querySelector('.team-create').requestSubmit()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===1`);
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot').length`),6);
    assert.equal(await evaluate(`document.querySelectorAll('.team-slot select').length`),0);
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
    await evaluate(`document.querySelector('[data-view="/"]').click();document.querySelector('[data-view="/teams"]').click()`);
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
  await check('missing selector script cannot block create/rename/delete; mutation success survives unrelated refresh failures',async()=>{
    await evaluate(`delete globalThis.PokemonSelector;window.qaFailPrivateReads=true;document.querySelector('[data-view="/"]').click();document.querySelector('[data-view="/teams"]').click()`);
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
    await evaluate(`document.querySelector('[data-view="/"]').click();document.querySelector('#pokemon-grid [data-favorite="649"]').click()`);
    await waitFor(`document.querySelector('#pokemon-grid [data-favorite="649"]').getAttribute('aria-pressed')==='true'`);
    await evaluate(`document.querySelector('button[data-id="1"]').click()`);
    await waitFor(`!!document.querySelector('#detail-content [data-favorite="1"]')`);
    await evaluate(`document.querySelector('#detail-content [data-favorite="1"]').click()`);
    await waitFor(`document.querySelector('#detail-content [data-favorite="1"]').getAttribute('aria-pressed')==='true'`);
    await evaluate(`dialog.close();document.querySelector('[data-view="/favorites"]').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#favorite-grid .pokemon-card').length`),2);
    await evaluate(`document.querySelector('[data-view="/profile"]').click();const bio=document.querySelector('textarea[name="bio"]');bio.value='My browser-tested trainer bio';bio.closest('form').requestSubmit()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Trainer info saved.'`);
    const png=await require('sharp')({create:{width:4,height:4,channels:3,background:'#80e5b8'}}).png().toBuffer();
    await evaluate(`(()=>{const input=document.querySelector('input[type="file"]');const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob('${png.toString('base64')}'),c=>c.charCodeAt(0))],'avatar.png',{type:'image/png'}));input.files=data.files;input.closest('form').requestSubmit()})()`);
    await waitFor(`document.querySelector('#account-message').textContent==='Profile picture updated.'`);
    assert.match(await evaluate(`document.querySelector('img.trainer-avatar').getAttribute('src')`),/^\/media\/avatars\/[0-9a-f-]+\.webp$/);
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
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    await evaluate(`document.querySelector('#account-button').click();document.querySelector('#auth-identifier').value='browser@example.test';document.querySelector('#auth-password').value='browser test password 123';document.querySelector('#auth-form').requestSubmit()`);
    await waitFor(`!document.querySelector('#logout-button').hidden`);
    await evaluate(`document.querySelector('[data-view="/profile"]').click()`);
    assert.equal(await evaluate(`document.querySelector('textarea[name="bio"]').value`),'My browser-tested trainer bio');
    await command('Page.reload');
    await waitFor('window.qaSessionPending===true');
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-requires-auth]')].every(n=>n.hidden)`),true);
    await waitFor(`document.querySelector('textarea[name="bio"]')?.value==='My browser-tested trainer bio'`);
    await evaluate(`document.querySelector('[data-view="/teams"]').click()`);
    assert.equal(await evaluate(`document.querySelector('.team-editor input').value`),'Browser Team');
    await evaluate(`document.querySelector('.team-actions .text-button').click()`);
    await waitFor(`document.querySelectorAll('.team-editor').length===0`);
    await evaluate(`document.querySelector('[data-view="/favorites"]').click();document.querySelector('#favorite-grid [data-favorite="649"]').click()`);
    await waitFor(`document.querySelectorAll('#favorite-grid .pokemon-card').length===1`);
    assert.deepEqual(exceptions,[]);
  });
  await check('GitHub Pages project-path preview: no backend, correct brand/hero, generations, details and hash navigation',async()=>{
    await command('Page.navigate',{url:origin+'/preview/Pokedex-Website/'});
    await waitFor(`document.querySelector('#pokemon-grid')?.getAttribute('aria-busy')==='false'`);
    assert.match(await evaluate('document.title'),/^Dexhaven — /);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.brand')].map(n=>n.textContent)`),['dexhaven.','dexhaven.']);
    assert.equal(await evaluate(`document.querySelectorAll('.pokemon-card').length`),649);
    assert.equal(await evaluate(`document.querySelector('.hero-art img').getAttribute('src')`),'./images/group-picture.png');
    await evaluate(`document.querySelector('#generation').value='5';document.querySelector('#generation').dispatchEvent(new Event('change'));document.querySelector('#search').value='#649';document.querySelector('#search').dispatchEvent(new Event('input'))`);
    assert.deepEqual(await evaluate(`[...grid.children].map(n=>Number(n.dataset.id))`),[649]);
    await evaluate(`grid.querySelector('.pokemon-card').click()`);
    await waitFor(`document.querySelectorAll('#detail-content .stat').length===6`);
    assert.equal(await evaluate(`document.querySelector('#detail-name').textContent`),'Genesect');
    await evaluate(`dialog.close()`);
    await command('Page.navigate',{url:origin+'/preview/Pokedex-Website/#view=teams'});
    await waitFor(`document.querySelector('#account-content').textContent.includes('Log in or create')`);
    assert.equal(await evaluate('location.pathname'),'/preview/Pokedex-Website/');
    assert.equal(await evaluate('location.hash'),'#view=teams');
    await command('Page.reload');
    await waitFor(`document.querySelector('#trainer-heading')?.textContent==='My Teams'`);
    await evaluate(`document.querySelector('[data-view="/"]').click()`);
    assert.equal(await evaluate('location.pathname'),'/preview/Pokedex-Website/');
    assert.equal(await evaluate(`document.querySelector('#collection').hidden`),false);
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
