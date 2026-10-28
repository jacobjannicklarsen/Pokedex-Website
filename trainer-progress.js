// One in-memory, authenticated collection store per page. Private records never enter localStorage.
(() => {
  'use strict';
  const SIGNAL = 'dexhaven-progress-change';
  let userId = null, authReady = false, ready = false, loading = false, mutating = false, error = '', bundle = null, config = {}, ticket = 0, again = false, lastSignal = '';
  let records = new Map(), channel;
  let toastTimer;
  function celebrate(awards) {
    document.querySelector('.achievement-toast')?.remove(); clearTimeout(toastTimer);
    const toast=element('aside','achievement-toast');toast.setAttribute('role','status');
    const close=element('button','text-button','×');close.type='button';close.setAttribute('aria-label','Dismiss achievement celebration');close.onclick=()=>toast.remove();
    toast.append(element('span','achievement-icon',awards[0].icon),element('p','eyebrow',`${awards.length===1?'ACHIEVEMENT UNLOCKED':`${awards.length} ACHIEVEMENTS UNLOCKED`}`),element('strong','',awards.slice(0,3).map(a=>a.name).join(' · ')),close);document.body.append(toast);toastTimer=setTimeout(()=>toast.remove(),8000);
  }
  try { channel = new BroadcastChannel('dexhaven-trainer-progress'); } catch { /* Storage events still synchronize supported browsers. */ }
  const statusOf = id => records.get(id)?.status || 'not-registered';
  function statusIcon(status) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const shapes = status === 'seen' ? [['path',{d:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z'}],['circle',{cx:12,cy:12,r:3}]] : [['circle',{cx:12,cy:12,r:9}],['path',{d:status === 'caught' ? 'M3 12h6m6 0h6' : 'M8 12h8'}],...(status === 'caught' ? [['circle',{cx:12,cy:12,r:3}]] : [])];
    shapes.forEach(([tag,attrs]) => { const shape = document.createElementNS('http://www.w3.org/2000/svg',tag); Object.entries(attrs).forEach(([key,value])=>shape.setAttribute(key,value)); svg.append(shape); });
    return svg;
  }
  function statusControl(group) {
    group.hidden = !userId;
    group.setAttribute('aria-busy', String(loading || mutating));
    const tile = group.closest('.pokemon-tile'); tile?.classList.toggle('has-collection', Boolean(userId));
    const current = ready ? statusOf(Number(group.dataset.collectionId)) : 'loading';
    group.dataset.status = current;
    group.querySelectorAll('[data-collection-status]').forEach(button => {
      button.disabled = !ready || loading || mutating;
      button.setAttribute('aria-pressed', String(button.dataset.collectionStatus === current));
    });
    group.querySelector('.collection-control-state').textContent = error ? 'Tracking unavailable' : loading || !ready ? 'Loading collection…' : mutating ? 'Saving collection…' : current === 'caught' ? 'Caught' : current === 'seen' ? 'Seen' : 'Not registered';
  }
  function announce() {
    const id = `${Date.now()}-${Math.random()}`; lastSignal = id;
    try { localStorage.setItem(SIGNAL, id); } catch { /* Keep private state in memory. */ }
    try { channel?.postMessage(id); } catch { /* Cross-tab sync is best effort; navigation always reloads from the API. */ }
  }
  function external(id) {
    if (typeof id !== 'string' || !id || id === lastSignal) return;
    lastSignal = id;
    Promise.resolve(config.onExternal?.()).catch(() => {});
  }
  if (channel) channel.onmessage = event => external(event.data);
  window.addEventListener('storage', event => { if (event.key === SIGNAL) external(event.newValue); });
  function controls() {
    document.querySelectorAll('[data-collection-id]').forEach(statusControl);
    const filter = $('#collection-filter');
    if (filter) {
      filter.disabled = !ready || loading || mutating;
      if (!ready) { state.collectionFilter = 'all'; filter.value = 'all'; }
      $('#collection-login').hidden = !authReady || Boolean(userId);
      $('#collection-retry').hidden = !userId || !error;
      $('#collection-filter-help').textContent = !authReady ? 'Checking your trainer session…' : !userId ? 'Log in to track your collection. Private tracking requires the Express backend.' : loading ? 'Loading your private collection…' : mutating ? 'Saving your collection…' : error || 'Seen includes Caught. These filters use your personal collection.';
    }
  }
  function changed() { controls(); config.onChange?.(); }
  function accept(value) {
    if (!Array.isArray(value?.collection) || !Array.isArray(value.achievements) || value.statistics?.national?.total !== TOTAL || new Set(value.collection.map(row => row.pokemonId)).size !== value.collection.length || value.collection.some(row => !Number.isInteger(row.pokemonId) || row.pokemonId < 1 || row.pokemonId > TOTAL || !['seen', 'caught'].includes(row.status))) throw Error('The collection response was incomplete. Please retry.');
    const previous=bundle?new Set(bundle.achievements.filter(a=>a.unlockedAt).map(a=>a.key)):null;
    bundle = value; records = new Map(value.collection.map(row => [row.pokemonId, row])); ready = true; error = '';
    const fresh=previous?value.achievements.filter(a=>a.unlockedAt&&!previous.has(a.key)):[];if(fresh.length)celebrate(fresh);
  }
  async function refresh() {
    if (!userId || !config.request) return false;
    if (loading || mutating) { again = true; return false; }
    const request = ++ticket; loading = true; error = ''; controls();
    try {
      const response = await config.request('/pokedex');
      if (request !== ticket || !userId) return false;
      accept(response); return true;
    } catch (failure) {
      if (request === ticket && userId) { error = failure.message; ready = false; }
      return false;
    } finally {
      if (request === ticket) { loading = false; changed(); if (again) { again = false; refresh(); } }
    }
  }
  function setUser(user, options) {
    config = options; authReady = options.authReady;
    const next = user?.id || null;
    if (next === userId) { controls(); return; }
    userId = next; ticket++; loading = false; mutating = false; again = false; ready = false; error = ''; bundle = null; records = new Map();
    document.querySelector('.achievement-toast')?.remove();clearTimeout(toastTimer);
    changed(); announce(); if (userId) refresh();
  }
  async function update(id, status) {
    if (!userId || !ready || loading || mutating || !Number.isInteger(id) || id < 1 || id > TOTAL) { controls(); return; }
    const request = ++ticket; mutating = true; controls(); config.notice?.('Saving collection…');
    try {
      const response = await config.request(`/pokedex/${id}`, status === 'not-registered' ? { method: 'DELETE' } : { method: 'PUT', body: { status } });
      if (request !== ticket || !userId) return;
      accept(response); config.notice?.(status === 'not-registered' ? 'Collection registration removed.' : `Marked ${prettyName(state.pokemon.get(id)?.name || `Pokémon ${id}`)} as ${status === 'caught' ? 'Caught' : 'Seen'}.`);
      announce();
    } catch (failure) { if (request === ticket && userId) config.notice?.(failure.message, true); }
    finally { if (request === ticket) { mutating = false; changed(); if (again) { again = false; refresh(); } } }
  }
  function decorate(container, pokemon) {
    if (container.querySelector('[data-collection-id]')) return;
    const group = element('div', 'collection-control'); group.dataset.collectionId = pokemon.id;
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Collection status for ${prettyName(pokemon.name)}, ${number(pokemon.id)}`);
    group.append(element('span', '', 'Your Pokédex'));
    const toggles = element('div', 'collection-toggles');
    for (const [status, name] of [['not-registered','Not registered'],['seen','Seen'],['caught','Caught']]) {
      const button = element('button', 'collection-toggle'); button.type = 'button'; button.dataset.collectionStatus = status;
      button.title = name; button.setAttribute('aria-label', `${name} · ${prettyName(pokemon.name)}`);
      button.append(statusIcon(status));
      button.addEventListener('click', () => { if (statusOf(pokemon.id) !== status) update(pokemon.id, status); }); toggles.append(button);
    }
    const feedback = element('span', 'collection-control-state sr-only');
    group.append(toggles, feedback); container.append(group); statusControl(group);
    container.classList.toggle('has-collection', Boolean(userId) && container.classList.contains('pokemon-tile'));
  }
  function matches(id, filter = 'all') {
    if (filter === 'all' || !userId || !ready) return true;
    const status = statusOf(id);
    return filter === 'seen' ? status !== 'not-registered' : filter === 'caught' ? status === 'caught' : filter === 'not-seen' ? status === 'not-registered' : filter === 'not-caught' ? status !== 'caught' : true;
  }
  function pendingView(target) {
    if (ready && bundle) return false;
    const message = element('p', error ? 'notice' : 'form-help', error || 'Loading your private collection progress…'); message.setAttribute('role', error ? 'alert' : 'status');
    target.append(message);
    if (error) { const retry = element('button', 'action-button', 'Retry progression'); retry.type = 'button'; retry.addEventListener('click', refresh); target.append(retry); }
    return true;
  }
  function progress(label, count, total) {
    const wrapper = element('label', 'personal-progress');
    const percent = total ? count * 100 / total : 0;
    wrapper.append(element('span', '', `${label}: ${count} / ${total} (${percent.toFixed(2)}%)`));
    const bar = element('progress'); bar.max = total; bar.value = count; bar.textContent = `${percent.toFixed(2)}%`; wrapper.append(bar); return wrapper;
  }
  function renderRank(target){target.replaceChildren();if(ready&&bundle?.rank)globalThis.TrainerRanks?.render(target,bundle.rank);else target.append(element('span','form-help',error||'Loading trainer rank…'));}
  function renderProgress(target) {
    if (pendingView(target)) return;
    const rank=element('div');rank.dataset.trainerRank='';renderRank(rank);target.append(rank);
    const stats = bundle.statistics, national = stats.national;
    target.append(element('p', 'form-help', 'Your private collection, not global Pokémon statistics. Caught Pokémon also count as Seen. Percentages reflect current registrations.'));
    const cards = element('div', 'overview-grid');
    for (const [label, value] of [['Pokémon Seen', national.seen], ['Pokémon Caught', national.caught], ['Not Seen', national.notSeen], ['Not Caught', national.notCaught], ['Seen completion', `${national.seenPercentage.toFixed(2)}%`], ['Caught completion', `${national.caughtPercentage.toFixed(2)}%`], ['Saved teams', stats.teams], ['Favourites', stats.favorites]]) {
      const card = element('article', 'overview-card'); card.append(element('p', '', label), element('strong', '', value)); cards.append(card);
    }
    target.append(cards, element('h3', 'account-subheading', 'National Pokédex completion'), progress('Seen', national.seen, national.total), progress('Caught', national.caught, national.total), element('h3', 'account-subheading', 'Progress by generation'));
    target.append(element('p', 'form-help', 'Regions use generation of introduction (Kanto through Unova), not the different regional Pokédex lists found in individual games.'));
    const regions = element('div', 'region-progress-grid');
    stats.generations.forEach(region => { const card = element('article', 'trainer-panel'); card.dataset.progressGeneration = region.id; card.append(element('h4', '', `${region.name} · Generation ${region.id}`), progress('Seen', region.seen, region.total), progress('Caught', region.caught, region.total)); regions.append(card); }); target.append(regions);
    target.append(element('h3', 'account-subheading', 'Collection by type'), element('p', 'form-help', 'Current Pokémon typings from Dexhaven’s complete dataset. A dual-type species contributes to both types; memberships overlap.'));
    const table = element('table', 'analytics-table'); table.append(element('caption', 'sr-only', 'Your personal Seen and Caught counts by Pokémon type'));
    const header = element('tr'); ['Type', 'Seen', 'Caught', 'Species available', 'Caught completion'].forEach(label => { const th = element('th', '', label); th.scope = 'col'; header.append(th); });
    const head = element('thead'); head.append(header); table.append(head); const body = element('tbody');
    stats.types.forEach(type => { const row = element('tr'); const th = element('th'); th.scope = 'row'; th.append(badges([type.type])); row.append(th, element('td', '', type.seen), element('td', '', type.caught), element('td', '', type.total), element('td', '', `${type.caughtPercentage.toFixed(2)}%`)); body.append(row); }); table.append(body);
    const scroll = element('div', 'table-scroll'); scroll.tabIndex = 0; scroll.append(table); target.append(scroll, element('h3', 'account-subheading', 'Recently registered Pokémon'), element('p', 'form-help', 'Current registrations ordered by their most recent status change. Removed registrations no longer appear here.'));
    const recent = element('div', 'recent-registrations');
    if (!stats.recent.length) recent.append(element('p', 'form-help', 'Your collection starts with your first Seen or Caught Pokémon.'));
    stats.recent.forEach(record => {
      const pokemon = state.pokemon.get(record.pokemonId) || { id: record.pokemonId, name: `Pokémon ${record.pokemonId}`, artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${record.pokemonId}.png` };
      const card = element('button', 'recent-registration'); card.type = 'button';
      const name = element('span', '', `${number(pokemon.id)} ${prettyName(pokemon.name)}`); name.dataset.pokemonName = pokemon.id;
      const date = element('time', 'form-help', new Date(record.updatedAt).toLocaleString()); date.dateTime = record.updatedAt;
      card.append(artwork(pokemon), name, element('strong', '', record.status === 'caught' ? 'Caught' : 'Seen'), date); card.addEventListener('click', () => showDetails(pokemon)); recent.append(card);
    }); target.append(recent);
  }
  function renderAchievements(target) {
    if (pendingView(target)) return;
    target.append(element('p', 'form-help', 'Achievements are awarded by the server and stay unlocked after collection changes or team deletion. Unlock dates record when Dexhaven first verified the condition; progress bars describe your current collection or teams.'));
    const awards=bundle.achievements,unlocked=awards.filter(a=>a.unlockedAt);
    const hero=element('div','achievement-vault');hero.append(element('p','eyebrow','YOUR HALL OF FAME'),element('h3','',`${unlocked.length} / ${awards.length} earned`),element('p','',`${awards.filter(a=>!a.unlockedAt&&a.current/a.goal>=.5).length} achievements are at least halfway within reach. Keep exploring, catching and building.`));target.append(hero);
    const toolbar=element('div','achievement-filters');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Filter achievements');
    let selected='all';
    const options=[['all','All badges'],['unlocked','Earned'],['locked','Locked'],['near','Nearly there'],...['collection','exploration','regions','types','teams','favourites'].map(key=>[key,prettyName(key)])];
    options.forEach(([key,label])=>{const button=element('button','achievement-filter',label);button.type='button';button.dataset.achievementFilter=key;button.setAttribute('aria-pressed',String(key==='all'));button.onclick=()=>{selected=key;toolbar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw();};toolbar.append(button);});target.append(toolbar);
    const count=element('p','form-help');count.setAttribute('role','status');target.append(count);
    const grid = element('div', 'achievement-grid');
    function draw(){grid.replaceChildren();const visible=awards.filter(a=>selected==='all'||selected==='unlocked'&&a.unlockedAt||selected==='locked'&&!a.unlockedAt||selected==='near'&&!a.unlockedAt&&a.current/a.goal>=.5||a.category===selected);count.textContent=`${visible.length} ${visible.length===1?'achievement':'achievements'} shown`;
    visible.forEach(award => {
      const card = element('article', `trainer-panel achievement-card${award.unlockedAt ? ' unlocked' : ''}`); card.dataset.achievement = award.key;
      card.dataset.rarity=award.rarity||'bronze';
      const icon = element('span', 'achievement-icon', award.icon); icon.setAttribute('aria-hidden', 'true');
      const meta=element('div','achievement-meta');meta.append(element('span','rarity-label',prettyName(award.rarity||'bronze')),element('span','',prettyName(award.category||'collection')));
      card.append(meta,icon, element('h3', '', award.name), element('p', 'form-help', award.description), element('strong', 'achievement-state', award.unlockedAt ? '✦ Unlocked' : '◇ Locked'));
      if (award.unlockedAt) { const date = element('time', 'form-help', new Date(award.unlockedAt).toLocaleString()); date.dateTime = award.unlockedAt; card.append(date); }
      const label = element('label', 'personal-progress', `Current: ${award.unit === '%' ? award.current.toFixed(2) : award.current}${award.unit || ''} / ${award.goal}${award.unit || ''}`);
      const bar = element('progress'); bar.max = award.goal; bar.value = Math.min(award.current, award.goal); label.append(bar); card.append(label); grid.append(card);
    });if(!visible.length)grid.append(element('p','form-help','No achievements match this view yet.'));}target.append(grid);draw();
  }
  $('#collection-filter')?.addEventListener('change', event => { state.collectionFilter = event.target.value; render(); });
  $('#collection-login')?.addEventListener('click', () => config.login?.());
  $('#collection-retry')?.addEventListener('click', refresh);
  globalThis.TrainerProgress = { caughtState: () => ({ ready: Boolean(userId && ready), loading, error, ids: new Set([...records].filter(([, row]) => row.status === 'caught').map(([id]) => id)) }), renderRank, setUser, refresh, update, decorate, matches, renderProgress, renderAchievements };
})();
