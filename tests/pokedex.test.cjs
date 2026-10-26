// Dependency-free logic tests with a small DOM stand-in; visual QA is manual.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor() {
    this.children = []; this.dataset = {}; this.attributes = {};
    this.style = { setProperty() {} }; this.textContent = ''; this.hidden = false;
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  get lastChild() { return this.children.at(-1); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key] ?? this[key]; }
  addEventListener(type, callback) { (this.listeners ??= {})[type] = callback; }
  focus() { this.focused = true; }
  insertBefore(node, reference) {
    node.remove(); node.parent = this;
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    this.children.splice(index, 0, node);
  }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  showModal() { this.open = true; }
}

function setup({ failures = new Set(), blockedStorage = false, mode = 'ok' } = {}) {
  const nodes = new Map();
  const storage = new Map();
  let active = 0, maxActive = 0, calls = 0;
  const document = {
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); },
    querySelectorAll() { return nodes.get('#type-filters')?.children || []; },
    createElement() { return new Node(); }, createTextNode(text) { const node = new Node(); node.textContent = text; return node; },
    addEventListener() {}
  };
  const context = vm.createContext({
    document, AbortController, setTimeout: (fn, ms) => setTimeout(fn, ms === 12000 && mode === 'timeout' ? 1 : ms), clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('Blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw Error('Blocked'); storage.set(key, value); }
    },
    fetch: async (url, options) => {
      calls++; active++; maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      const id = Number(url.split('/').filter(Boolean).at(-1));
      if (mode === 'network') throw new TypeError('Failed to fetch');
      if (mode === 'timeout') {
        if (options.signal.aborted) throw new Error('Aborted');
        await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
      }
      if (failures.has(id)) return { ok: false, status: 503 };
      if (mode === 'json') return { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } };
      if (mode === 'malformed') return { ok: true, json: async () => ({ id }) };
      return { ok: true, json: async () => ({
        id, name: ({1:'bulbasaur',25:'pikachu',29:'nidoran-f',83:'farfetchd',122:'mr-mime',151:'mew'})[id] || `pokemon-${id}`, height: 7, weight: 69,
        types: [{ type: { name: id === 25 ? 'electric' : 'grass' } }],
        sprites: { front_default: 'sprite.png', other: { 'official-artwork': { front_default: 'art.png' } } },
        abilities: [{ ability: { name: 'overgrow' }, is_hidden: false }],
        stats: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((name) => ({ stat: { name }, base_stat: 45 }))
      }) };
    }
  });
  // Capture initialization's promise without changing the production script.
  const source = readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
  vm.runInContext(source.replace(/loadPokemon\(\);\s*$/, 'globalThis.ready = loadPokemon();'), context);
  return { context, nodes, storage, run: (code) => vm.runInContext(code, context), metrics: () => ({ calls, maxActive }) };
}

test('loads all 151, caps concurrency at six, caches and renders details', async () => {
  const app = setup(); await app.context.ready;
  assert.equal(app.run('state.pokemon.size'), 151);
  assert.equal(app.nodes.get('#pokemon-grid').children.length, 151);
  assert.equal(app.metrics().maxActive, 6);
  assert.equal(app.storage.size, 151);
  app.run("state.query = '#025'; render()");
  assert.equal(app.nodes.get('#pokemon-grid').children.length, 1);
  assert.equal(app.nodes.get('#pokemon-grid').children[0].dataset.id, 25);
  app.run("state.type = 'grass'; render()");
  assert.equal(app.nodes.get('#pokemon-grid').children.length, 0);
  assert.equal(app.nodes.get('#empty-state').hidden, false);
  app.run("resetFilters(); state.sort = 'reverse'; render()");
  assert.equal(app.nodes.get('#pokemon-grid').children[0].dataset.id, 151);
  app.run('showDetails(state.pokemon.get(25))');
  assert.equal(app.nodes.get('#pokemon-dialog').open, true);
  assert.equal(app.nodes.get('#detail-content').children.length, 2);
  app.run('state.pokemon.clear()'); await app.run('loadPokemon()');
  assert.equal(app.metrics().calls, 151, 'cached reload should make no requests');
});

test('search accepts punctuation, case, whitespace, and padded numbers', async () => {
  const app = setup(); await app.context.ready;
  for (const [query, id] of [[' PIKA ',25], ['25',25], ['025',25], ['#025',25], ["Farfetch'd",83], ['Farfetch’d',83], ['mr mime',122], ['nidoran f',29]]) {
    app.run(`state.query = ${JSON.stringify(query)}; render()`);
    assert.deepEqual(app.nodes.get('#pokemon-grid').children.map(c=>Number(c.dataset.id)), [id], query);
  }
});

test('alphabetic sorting, reset focus, detail content, and image fallback', async () => {
  const app = setup(); await app.context.ready;
  app.run("state.sort = 'name'; render()");
  const names = app.nodes.get('#pokemon-grid').children.map(c=>c.children[0].children[2].textContent);
  assert.deepEqual(names, [...names].sort((a,b)=>a.localeCompare(b)));
  app.run('resetFilters()'); assert.equal(app.nodes.get('#search').focused, true);
  app.run('showDetails(state.pokemon.get(1))');
  const [hero, body] = app.nodes.get('#detail-content').children;
  assert.equal(hero.children[2].textContent, 'Bulbasaur');
  assert.equal(body.children[0].children[0].children[1].textContent, '0.7 m');
  assert.equal(body.children[0].children[1].children[1].textContent, '6.9 kg');
  assert.equal(body.children.at(-1).children[1].textContent, 270);
  const image = hero.children[1];
  image.listeners.error(); assert.equal(image.src,'sprite.png');
  image.listeners.error(); assert.equal(image.src,'artwork-fallback.svg');
  image.listeners.error(); assert.equal(image.src,'artwork-fallback.svg');
});

test('expired, future-dated, malformed and invalid cached data is refetched', async () => {
  const app = setup(); await app.context.ready;
  const cache = app.storage;
  const edit = (id, change) => {
    const key = 'kanto-pokedex-v1-' + id;
    const record = JSON.parse(cache.get(key)); change(record); cache.set(key, JSON.stringify(record));
  };
  edit(1, r=>r.timestamp=0);
  edit(2, r=>r.timestamp=Date.now()+86400000);
  edit(3, r=>r.data.stats[0].value=-1);
  edit(4, r=>r.data.stats[1].name='hp');
  cache.set('kanto-pokedex-v1-5','{broken json');
  edit(6, r=>r.data.abilities=[null]);
  app.run('state.pokemon.clear()'); await app.run('loadPokemon()');
  assert.equal(app.metrics().calls,157);
  assert.equal(app.run('state.pokemon.size'),151);
});

for (const mode of ['network','timeout','json','malformed']) {
  test(`${mode} outage stops early and clears loading state`, async () => {
    const app = setup({ mode }); await app.context.ready;
    assert.equal(app.run('state.pokemon.size'),0);
    assert.ok(app.metrics().calls <= 12, 'a full outage should not attempt all 151 requests');
    assert.equal(app.nodes.get('#load-status').hidden,true);
    assert.equal(app.nodes.get('#error-state').hidden,false);
    assert.match(app.nodes.get('#error-message').textContent,/151/);
    assert.equal(app.nodes.get('#pokemon-grid').attributes['aria-busy'],'false');
  });
}

test('partial failures show error and retry requests only missing records', async () => {
  const failures = new Set([25, 151]);
  const app = setup({ failures }); await app.context.ready;
  assert.equal(app.run('state.pokemon.size'), 149);
  assert.equal(app.nodes.get('#error-state').hidden, false);
  failures.clear(); await app.run('loadPokemon()');
  assert.equal(app.metrics().calls, 153);
  assert.equal(app.run('state.pokemon.size'), 151);
  assert.equal(app.nodes.get('#error-state').hidden, true);
});

test('blocked localStorage does not prevent loading', async () => {
  const app = setup({ blockedStorage: true }); await app.context.ready;
  assert.equal(app.run('state.pokemon.size'), 151);
  assert.equal(app.nodes.get('#pokemon-grid').attributes['aria-busy'], 'false');
});

test('active loading state and duplicate-load guard', async () => {
  const app = setup();
  assert.equal(app.run('state.loading'), true);
  assert.equal(app.nodes.get('#load-status').hidden, false);
  assert.equal(app.nodes.get('#pokemon-grid').attributes['aria-busy'], 'true');
  assert.equal(app.nodes.get('#error-state').hidden, true);
  await app.run('loadPokemon()');
  await app.context.ready;
  assert.equal(app.metrics().calls, 151);
  assert.equal(app.run('state.loading'), false);
});

test('sustained HTTP failure stops early without discarding retryable records', async () => {
  const failures = new Set(Array.from({length:151},(_,i)=>i+1));
  const app = setup({ failures }); await app.context.ready;
  assert.ok(app.metrics().calls <= 12);
  assert.match(app.nodes.get('#error-message').textContent, /151/);
  failures.clear(); await app.run('loadPokemon()');
  assert.equal(app.run('state.pokemon.size'),151);
});
