// One in-memory, authenticated collection store per page. Private records never enter localStorage.
(() => {
  'use strict';
  const SIGNAL = 'dexhaven-progress-change';
  let userId = null, authReady = false, ready = false, loading = false, mutating = false, error = '', bundle = null, config = {}, ticket = 0, again = false, lastSignal = '';
  let records = new Map(), channel;
  try { channel = new BroadcastChannel('dexhaven-trainer-progress'); } catch { /* Storage events still synchronize supported browsers. */ }
  const statusOf = id => records.get(id)?.status || 'not-registered';
  const option = (value, label) => { const node = element('option', '', label); node.value = value; return node; };
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
    document.querySelectorAll('[data-collection-id]').forEach(group => {
      group.hidden = !userId;
      group.setAttribute('aria-busy', String(loading || mutating));
      const tile = group.closest('.pokemon-tile'); tile?.classList.toggle('has-collection', Boolean(userId));
      const select = group.querySelector('select');
      select.disabled = !ready || loading || mutating;
      select.querySelector('option[value=""]').textContent = error ? 'Tracking unavailable' : 'Loading collection…';
      select.value = ready ? statusOf(Number(group.dataset.collectionId)) : '';
      group.dataset.status = ready ? statusOf(Number(group.dataset.collectionId)) : 'loading';
    });
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
    bundle = value; records = new Map(value.collection.map(row => [row.pokemonId, row])); ready = true; error = '';
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
    const label = element('label', 'collection-control'); label.dataset.collectionId = pokemon.id;
    label.append(element('span', '', 'Your Pokédex'));
    const select = element('select'); select.setAttribute('aria-label', `Collection status for ${prettyName(pokemon.name)}, ${number(pokemon.id)}`);
    const pending = option('', 'Loading collection…'); pending.disabled = true;
    select.append(pending, option('not-registered', 'Not registered'), option('seen', 'Seen'), option('caught', 'Caught'));
    select.addEventListener('change', () => update(pokemon.id, select.value)); label.append(select); container.append(label);
    label.hidden = !userId; select.disabled = !ready || loading || mutating; select.value = ready ? statusOf(pokemon.id) : '';
    label.dataset.status = ready ? statusOf(pokemon.id) : 'loading';
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
  function renderProgress(target) {
    if (pendingView(target)) return;
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
    const grid = element('div', 'achievement-grid');
    bundle.achievements.forEach(award => {
      const card = element('article', `trainer-panel achievement-card${award.unlockedAt ? ' unlocked' : ''}`); card.dataset.achievement = award.key;
      const icon = element('span', 'achievement-icon', award.icon); icon.setAttribute('aria-hidden', 'true');
      card.append(icon, element('h3', '', award.name), element('p', 'form-help', award.description), element('strong', '', award.unlockedAt ? 'Unlocked' : 'Locked'));
      if (award.unlockedAt) { const date = element('time', 'form-help', new Date(award.unlockedAt).toLocaleString()); date.dateTime = award.unlockedAt; card.append(date); }
      const label = element('label', 'personal-progress', `Current: ${award.unit === '%' ? award.current.toFixed(2) : award.current}${award.unit || ''} / ${award.goal}${award.unit || ''}`);
      const bar = element('progress'); bar.max = award.goal; bar.value = Math.min(award.current, award.goal); label.append(bar); card.append(label); grid.append(card);
    }); target.append(grid);
  }
  $('#collection-filter')?.addEventListener('change', event => { state.collectionFilter = event.target.value; render(); });
  $('#collection-login')?.addEventListener('click', () => config.login?.());
  $('#collection-retry')?.addEventListener('click', refresh);
  globalThis.TrainerProgress = { setUser, refresh, update, decorate, matches, renderProgress, renderAchievements };
})();
