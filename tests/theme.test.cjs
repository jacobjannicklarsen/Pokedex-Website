const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../theme.js'), 'utf8');

function setup({ saved = null, dark = false, blocked = false } = {}) {
  const events = {}, systemEvents = {}, documentEvents = {}, buttonEvents = {};
  const storage = new Map(saved === null ? [] : [['pokedex-theme', saved]]);
  const root = { dataset: {}, classList: { add(name) { root.ready = name; } } };
  const button = { hidden: true, attributes: {}, setAttribute(key,value) { this.attributes[key] = value; }, addEventListener(type,fn) { buttonEvents[type] = fn; } };
  const system = { matches: dark, addEventListener(type,fn) { systemEvents[type] = fn; } };
  const meta = {};
  vm.runInNewContext(source, {
    document: { documentElement: root, querySelector: () => meta, getElementById: () => button, addEventListener(type,fn) { documentEvents[type] = fn; } },
    window: { matchMedia: () => system, addEventListener(type,fn) { events[type] = fn; } },
    localStorage: {
      getItem(key) { if (blocked) throw Error('Blocked'); return storage.get(key) ?? null; },
      setItem(key,value) { if (blocked) throw Error('Blocked'); storage.set(key,value); }
    },
    requestAnimationFrame: (callback) => callback()
  });
  return { root, button, meta, storage, ready: documentEvents.DOMContentLoaded,
    click: () => buttonEvents.click(), systemChange(value) { system.matches = value; systemEvents.change(); },
    storageChange(key='pokedex-theme') { events.storage({ key }); } };
}

test('resolves theme before DOM readiness; saved choice overrides the system', () => {
  for (const dark of [false,true]) {
    for (const saved of [null,'invalid','light','dark']) {
      const app = setup({dark,saved});
      const expected = ['light','dark'].includes(saved) ? saved : dark ? 'dark' : 'light';
      assert.equal(app.root.dataset.theme,expected);
      assert.equal(app.button.hidden,true);
      assert.equal(app.root.ready,undefined);
      assert.equal(app.meta.content,expected === 'dark' ? '#10171e' : '#f3f8f5');
    }
  }
});

test('toggle saves choice, updates accessible name, and leaves API cache alone', () => {
  const app = setup({dark:true}); app.storage.set('kanto-pokedex-v1-1','record'); app.ready();
  assert.equal(app.button.hidden,false);
  assert.equal(app.button.attributes['aria-label'],'Switch to light theme');
  app.click(); assert.equal(app.root.dataset.theme,'light');
  assert.equal(app.storage.get('pokedex-theme'),'light');
  assert.equal(app.button.attributes['aria-label'],'Switch to dark theme');
  assert.equal(app.meta.content,'#f3f8f5');
  app.systemChange(true); assert.equal(app.root.dataset.theme,'light');
  app.click(); assert.equal(app.root.dataset.theme,'dark');
  assert.equal(app.storage.get('kanto-pokedex-v1-1'),'record');
});

test('follows live system changes until an explicit selection is made', () => {
  const app = setup(); app.ready();
  app.systemChange(true); assert.equal(app.root.dataset.theme,'dark');
  app.systemChange(false); assert.equal(app.root.dataset.theme,'light');
  app.click(); app.systemChange(false); assert.equal(app.root.dataset.theme,'dark');
});

test('storage failure leaves toggle and system default functional', () => {
  const app = setup({blocked:true}); assert.equal(app.root.dataset.theme,'light');
  app.ready(); app.click(); assert.equal(app.root.dataset.theme,'dark');
  app.systemChange(false); assert.equal(app.root.dataset.theme,'dark');
});

test('other-tab updates and removing a saved preference synchronize the theme', () => {
  const app = setup({saved:'light',dark:true}); app.ready();
  app.storage.set('pokedex-theme','dark'); app.storageChange(); assert.equal(app.root.dataset.theme,'dark');
  app.storage.set('pokedex-theme','light'); app.storageChange('unrelated-key'); assert.equal(app.root.dataset.theme,'dark');
  app.storage.delete('pokedex-theme'); app.storageChange(); assert.equal(app.root.dataset.theme,'dark');
  app.systemChange(false); assert.equal(app.root.dataset.theme,'light');
});

test('theme setup blocks before the stylesheet, independent of the API script', () => {
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const bootstrap = html.indexOf('<script src="theme.js"></script>');
  assert.ok(bootstrap > 0 && bootstrap < html.indexOf('<link rel="stylesheet"'));
  assert.ok(bootstrap < html.indexOf('<body>'));
});
