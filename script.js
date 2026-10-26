'use strict';

const API = 'https://pokeapi.co/api/v2/pokemon/';
const TOTAL = 649;
const CONCURRENCY = 4;
// Retain the old detail-cache namespace so returning trainers can reuse it.
const CACHE_PREFIX = 'kanto-pokedex-v1-';
const INDEX_PREFIX = 'dexhaven-index-v2-';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const GENERATIONS = [
  { id: 'all', label: 'National Pokédex', region: 'National', start: 1, end: 649 },
  { id: '1', label: 'Generation I — Kanto', region: 'Kanto', start: 1, end: 151 },
  { id: '2', label: 'Generation II — Johto', region: 'Johto', start: 152, end: 251 },
  { id: '3', label: 'Generation III — Hoenn', region: 'Hoenn', start: 252, end: 386 },
  { id: '4', label: 'Generation IV — Sinnoh', region: 'Sinnoh', start: 387, end: 493 },
  { id: '5', label: 'Generation V — Unova', region: 'Unova', start: 494, end: 649 }
];
const TYPE_COLORS = {
  normal: '#bdbaa7', fire: '#ff9a66', water: '#78baff', electric: '#f1d76b',
  grass: '#8bd394', ice: '#8addde', fighting: '#e98a7d', poison: '#c399dd',
  ground: '#d6b782', flying: '#a6b5ef', psychic: '#f495b9', bug: '#becd71',
  rock: '#cbb880', ghost: '#a79ace', dragon: '#ab9bf5', dark: '#c0aa98',
  steel: '#a6c5ce', fairy: '#eab1d8'
};
const state = { pokemon: new Map(), query: '', type: 'all', generation: 'all', sort: 'number', loading: false, typesLoaded: new Set(), statRanges: {}, statData: null };
const detailRequests = new Map();
let detailRevision = 0;
const $ = (selector) => document.querySelector(selector);
const grid = $('#pokemon-grid');
const dialog = $('#pokemon-dialog');
const prettyName = (name) => ({ 'nidoran-f': 'Nidoran ♀', 'nidoran-m': 'Nidoran ♂', 'mr-mime': 'Mr. Mime', farfetchd: 'Farfetch’d' })[name]
  || name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const number = (id) => `#${String(id).padStart(3, '0')}`;
const normalizeName = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}♀♂]/gu, '');
const STAT_NAMES = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

// API values are inserted as text, never parsed as HTML.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badges(types) {
  const container = element('span', 'badges');
  types.forEach((type) => {
    const badge = element('span', 'type-badge', prettyName(type));
    badge.style.setProperty('--type-color', TYPE_COLORS[type] || '#bdbaa7');
    container.append(badge);
  });
  return container;
}

function artwork(pokemon, lazy = true) {
  const img = document.createElement('img');
  img.alt = prettyName(pokemon.name);
  img.width = 220;
  img.height = 220;
  img.loading = lazy ? 'lazy' : 'eager';
  img.decoding = 'async';
  img.src = pokemon.artwork || pokemon.sprite || 'artwork-fallback.svg';
  img.addEventListener('error', () => {
    if (img.dataset.fallback === 'done') return;
    if (!img.dataset.fallback && pokemon.sprite && img.getAttribute('src') !== pokemon.sprite) {
      img.dataset.fallback = 'sprite';
      img.src = pokemon.sprite;
    } else {
      img.dataset.fallback = 'done';
      img.src = 'artwork-fallback.svg';
      img.alt = `${prettyName(pokemon.name)} — artwork unavailable`;
    }
  });
  return img;
}

function createCard(pokemon) {
  const card = element('button', 'pokemon-card');
  card.type = 'button';
  card.dataset.id = pokemon.id;
  card.style.setProperty('--type-color', TYPE_COLORS[pokemon.types[0]] || '#bdbaa7');
  card.setAttribute('aria-label', `View ${prettyName(pokemon.name)}, ${number(pokemon.id)}, ${pokemon.types.map(prettyName).join(' / ')}`);
  card.setAttribute('aria-haspopup', 'dialog');
  const top = element('span', 'card-top');
  top.append(element('span', 'card-number', number(pokemon.id)), element('span', 'card-arrow', '↗'));
  top.lastChild.setAttribute('aria-hidden', 'true');
  const art = element('span', 'card-art');
  art.append(artwork(pokemon));
  const typeBadges = badges(pokemon.types);
  card.append(top, art, element('span', 'card-name', prettyName(pokemon.name)), typeBadges);
  // Keep the detail button and favourite button as siblings, never nested buttons.
  const tile = element('article', 'pokemon-tile');
  tile.dataset.id = pokemon.id;
  tile.cardParts = { card, typeBadges };
  tile.dataset.types = pokemon.types.join(',');
  tile.append(card);
  globalThis.PokedexAccounts?.decorateCard(tile, pokemon);
  return tile;
}

function updateCardTypes(tile, pokemon) {
  if (!tile.cardParts || tile.dataset.types === pokemon.types.join(',')) return;
  const parts = tile.cardParts;
  parts.card.style.setProperty('--type-color', TYPE_COLORS[pokemon.types[0]] || '#bdbaa7');
  parts.card.setAttribute('aria-label', `View ${prettyName(pokemon.name)}, ${number(pokemon.id)}, ${pokemon.types.map(prettyName).join(' / ')}`);
  parts.typeBadges.replaceChildren(...badges(pokemon.types).children);
  tile.dataset.types = pokemon.types.join(',');
}

function matches(pokemon) {
  const query = state.query.trim().toLowerCase();
  const numeric = query.replace(/^#/, '');
  const normalized = normalizeName(query);
  const nameMatch = normalized.length > 0 && (normalizeName(pokemon.name).includes(normalized) || normalizeName(prettyName(pokemon.name)).includes(normalized));
  const queryMatch = /^\d+$/.test(numeric) ? pokemon.id === Number(numeric) : nameMatch;
  const generation = GENERATIONS.find(g => g.id === state.generation) || GENERATIONS[0];
  return pokemon.id >= generation.start && pokemon.id <= generation.end
    && (!query || queryMatch) && (state.type === 'all' || pokemon.types.includes(state.type))
    && (!Object.keys(state.statRanges).length || (state.statData?.has(pokemon.id) && globalThis.PokemonData.matches(state.statData.get(pokemon.id), state.statRanges)));
}

function render() {
  if (!grid) { globalThis.PokedexAccounts?.onPokemonUpdate(); return; }
  const visible = [...state.pokemon.values()].filter(matches).sort((a, b) => {
    if (state.sort === 'name') return prettyName(a.name).localeCompare(prettyName(b.name));
    if (state.sort.startsWith('stat:') && state.statData) {
      const [, key, direction] = state.sort.split(':');
      return globalThis.PokemonData.compare(key, direction === 'asc')(state.statData.get(a.id), state.statData.get(b.id));
    }
    return state.sort === 'reverse' ? b.id - a.id : a.id - b.id;
  });
  // Reuse cards during progressive loading to preserve focus and image requests.
  const existing = new Map([...grid.children].map((card) => [Number(card.dataset.id), card]));
  const wanted = new Set(visible.map((pokemon) => pokemon.id));
  for (const [id, card] of existing) if (!wanted.has(id)) card.remove();
  visible.forEach((pokemon, index) => {
    const card = existing.get(pokemon.id) || createCard(pokemon);
    updateCardTypes(card, pokemon);
    if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null);
  });
  const generation = GENERATIONS.find(g => g.id === state.generation) || GENERATIONS[0];
  const count = generation.end - generation.start + 1;
  $('#collection-title').textContent = generation.id === 'all' ? 'The National Pokédex' : `The ${generation.region} collection`;
  $('#collection-title').append(element('span', '', '.'));
  $('.collection-total').textContent = `${String(generation.start).padStart(3, '0')} — ${generation.end}`;
  $('#result-count').textContent = `Showing ${visible.length} of ${count} Pokémon${state.loading ? ' · updating index…' : ''}`;
  $('#empty-state').hidden = visible.length > 0 || state.loading || state.pokemon.size === 0;
  $('#reset').hidden = !state.query && state.type === 'all' && state.generation === 'all' && !Object.keys(state.statRanges).length && state.sort === 'number';
  $('#collection-end').hidden = state.pokemon.size !== TOTAL || visible.length !== TOTAL;
  document.querySelectorAll('.filter-chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.type === state.type)));
  globalThis.PokedexAccounts?.onPokemonUpdate();
}

function resetFilters() {
  state.query = '';
  state.type = 'all';
  state.generation = 'all';
  state.sort = 'number';
  state.statRanges = {};
  $('#sort').value = 'number';
  globalThis.PokedexAdvanced?.reset();
  $('#generation').value = 'all';
  $('#search').value = '';
  render();
  // Reset buttons disappear after activation; keep keyboard focus in the search flow.
  $('#search').focus();
}

function renderDetails(pokemon) {
  const content = $('#detail-content');
  content.replaceChildren();
  content.style.setProperty('--type-color', TYPE_COLORS[pokemon.types[0]] || '#bdbaa7');
  const hero = element('div', 'detail-hero');
  hero.append(element('p', 'card-number', `NATIONAL POKÉDEX / ${number(pokemon.id)}`), artwork(pokemon, false));
  const title = element('h2', '', prettyName(pokemon.name));
  title.id = 'detail-name';
  hero.append(title, badges(pokemon.types));
  const body = element('div', 'detail-body');
  const measures = element('dl', 'measurements');
  [['Height', `${pokemon.height / 10} m`], ['Weight', `${pokemon.weight / 10} kg`]].forEach(([label, value]) => {
    const group = element('div');
    group.append(element('dt', '', label), element('dd', '', value));
    measures.append(group);
  });
  const abilities = element('div', 'ability-list');
  pokemon.abilities.forEach((ability) => {
    const item = element('span', 'ability', prettyName(ability.name));
    if (ability.hidden) item.append(element('small', '', 'Hidden ability'));
    abilities.append(item);
  });
  body.append(measures, element('h3', '', 'Abilities'), abilities, element('h3', '', 'Base stats'));
  const statLabels = { hp: 'HP', attack: 'Attack', defense: 'Defense', 'special-attack': 'Sp. Attack', 'special-defense': 'Sp. Defense', speed: 'Speed' };
  pokemon.stats.forEach((stat) => {
    const row = element('div', 'stat');
    const track = element('div', 'stat-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span', 'stat-fill');
    fill.style.width = `${Math.min(stat.value / 255 * 100, 100)}%`;
    track.append(fill);
    row.append(element('span', 'stat-label', statLabels[stat.name] || prettyName(stat.name)), element('span', '', stat.value), track);
    body.append(row);
  });
  const total = element('div', 'stat-total');
  total.append(element('span', '', 'Total'), element('span', '', pokemon.stats.reduce((sum, stat) => sum + stat.value, 0)));
  body.append(total);
  content.append(hero, body);
  globalThis.PokedexAccounts?.decorateDetails(content, pokemon);
  dialog.scrollTop = 0;
}

async function showDetails(pokemon) {
  if (!pokemon || !Number.isInteger(pokemon.id) || pokemon.id < 1 || pokemon.id > TOTAL) return;
  const revision = ++detailRevision;
  const content = $('#detail-content');
  content.replaceChildren();
  const title = element('h2', '', prettyName(pokemon.name)); title.id = 'detail-name';
  const loading = element('div', 'detail-loading');
  loading.append(title, element('p', '', 'Loading Pokémon details…')); loading.setAttribute('role', 'status');
  content.append(loading);
  if (!dialog.open) dialog.showModal();
  content.setAttribute('aria-busy', 'true');
  try {
    const details = await ensureDetails(pokemon.id);
    if (revision !== detailRevision || !dialog.open) return;
    renderDetails(details);
  } catch {
    if (revision !== detailRevision || !dialog.open) return;
    loading.lastChild.textContent = 'Details couldn’t be loaded. Check your connection and try again.';
    const retry = element('button', 'action-button', 'Retry details'); retry.type = 'button';
    retry.addEventListener('click', () => showDetails(pokemon)); loading.append(retry);
  } finally { if (revision === detailRevision) content.setAttribute('aria-busy', 'false'); }
}

function ensureDetails(id) {
  if (!Number.isInteger(id) || id < 1 || id > TOTAL) return Promise.reject(new Error('Invalid Pokémon number'));
  const current = state.pokemon.get(id);
  if (validRecord(current, id)) return Promise.resolve(current);
  const cached = readCache(id);
  if (cached) return Promise.resolve({ ...cached, name: current?.name || cached.name });
  if (!detailRequests.has(id)) {
    detailRequests.set(id, fetchPokemon(id).then(details => {
      details.name = state.pokemon.get(id)?.name || details.name;
      state.pokemon.set(id, details);
      return details;
    }).finally(() => detailRequests.delete(id)));
  }
  return detailRequests.get(id);
}

function validRecord(record, id) {
  return record && record.id === id && typeof record.name === 'string'
    && Array.isArray(record.types) && record.types.length > 0 && record.types.every((type) => typeof type === 'string')
    && Number.isFinite(record.height) && record.height >= 0 && Number.isFinite(record.weight) && record.weight >= 0
    && Array.isArray(record.abilities) && record.abilities.length > 0 && record.abilities.every((a) => a && typeof a.name === 'string' && typeof a.hidden === 'boolean')
    && Array.isArray(record.stats) && record.stats.length === 6
    && new Set(record.stats.map((s) => s?.name)).size === 6
    && record.stats.every((s) => s && STAT_NAMES.includes(s.name) && Number.isInteger(s.value) && s.value >= 0 && s.value <= 255);
}

function readCache(id) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + id));
    const age = cached && Date.now() - cached.timestamp;
    if (cached && Number.isFinite(cached.timestamp) && age >= 0 && age < CACHE_TTL && validRecord(cached.data, id)) return cached.data;
  } catch { /* Storage may be blocked or contain an outdated record. */ }
  return null;
}

async function fetchPokemon(id) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API}${id}/`, { signal: controller.signal });
    if (!response.ok) throw new Error(`PokéAPI returned ${response.status}`);
    const data = await response.json();
    const pokemon = {
      id: data.id, name: data.species?.name || data.name, height: data.height, weight: data.weight,
      types: data.types.map((entry) => entry.type.name),
      artwork: data.sprites.other?.['official-artwork']?.front_default,
      sprite: data.sprites.front_default,
      abilities: data.abilities.map((entry) => ({ name: entry.ability.name, hidden: entry.is_hidden })),
      stats: data.stats.map((entry) => ({ name: entry.stat.name, value: entry.base_stat }))
    };
    if (!validRecord(pokemon, id)) throw new Error('Unexpected Pokémon data');
    try { localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ timestamp: Date.now(), data: pokemon })); } catch { /* Continue without persistent storage. */ }
    return pokemon;
  } finally {
    clearTimeout(timeout);
  }
}

let catalogueRequest;
function loadPokemon() {
  // The collection and trainer tools share one in-flight catalogue request.
  if (catalogueRequest) return catalogueRequest;
  if (state.pokemon.size === TOTAL && state.typesLoaded.size === Object.keys(TYPE_COLORS).length) return Promise.resolve();
  catalogueRequest = loadCatalogue().finally(() => { catalogueRequest = null; });
  return catalogueRequest;
}
async function loadCatalogue() {
  state.loading = true;
  if (grid) {
    $('#error-state').hidden = true;
    $('#load-status').hidden = false;
    $('#load-message').textContent = 'Loading the National Pokédex index…';
    grid.setAttribute('aria-busy', 'true');
  }
  render();
  let failed = false;
  try {
    if (state.pokemon.size !== TOTAL) {
      state.typesLoaded.clear();
      const species = await indexResource('species', 'https://pokeapi.co/api/v2/pokemon-species/?limit=649', data => {
        if (!Array.isArray(data.results)) throw Error('Invalid species index');
        return data.results.map(item => ({ id: resourceId(item.url), name: item.name }));
      }, validSpeciesIndex);
      species.forEach(({ id, name }) => {
        if (!state.pokemon.has(id)) state.pokemon.set(id, {
          id, name, types: [], typeSlots: {},
          artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
          sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
        });
      });
      render(); // All species can be searched before type indices finish.
    }
    const pending = Object.keys(TYPE_COLORS).filter(type => !state.typesLoaded.has(type));
    let cursor = 0, consecutiveFailures = 0, stop = false, scheduled = false;
    function scheduleRender() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; render(); });
    }
    async function worker() {
      while (cursor < pending.length && !stop) {
        const type = pending[cursor++];
        try {
          const members = await indexResource(`type-${type}`, `https://pokeapi.co/api/v2/type/${type}/`, data => {
            if (!Array.isArray(data.pokemon)) throw Error('Invalid type index');
            return data.pokemon.map(entry => [resourceId(entry.pokemon?.url), entry.slot]).filter(([id]) => id >= 1 && id <= TOTAL);
          }, validTypeIndex);
          members.forEach(([id, slot]) => {
            const pokemon = state.pokemon.get(id);
            if (validRecord(pokemon, id)) return;
            pokemon.typeSlots ||= {};
            pokemon.typeSlots[slot] = type;
            pokemon.types = Object.entries(pokemon.typeSlots).sort(([a], [b]) => Number(a) - Number(b)).map(([, name]) => name);
          });
          state.typesLoaded.add(type); consecutiveFailures = 0;
        } catch { failed = true; if (++consecutiveFailures >= CONCURRENCY) stop = true; }
        if (grid) $('#load-message').textContent = `Indexing Pokémon types… ${state.typesLoaded.size} / ${Object.keys(TYPE_COLORS).length}`;
        scheduleRender();
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  } catch { failed = true;
  } finally {
    state.loading = false;
    if (grid) {
      $('#load-status').hidden = true;
      grid.setAttribute('aria-busy', 'false');
      if (failed || state.typesLoaded.size !== Object.keys(TYPE_COLORS).length) {
        $('#error-state').hidden = false;
        $('#error-message').textContent = state.pokemon.size ? 'Some type data couldn’t be loaded. Name, number and generation search still work; type matches may be incomplete. Retry to finish the index.' : 'The Pokémon index couldn’t be loaded. Check your connection and try again.';
      }
    }
    render();
  }
}

const resourceId = url => Number(typeof url === 'string' ? url.match(/\/(\d+)\/?$/)?.[1] : NaN);
function validSpeciesIndex(data) {
  return Array.isArray(data) && data.length === TOTAL && new Set(data.map(p => p?.id)).size === TOTAL
    && data.every(p => p && Number.isInteger(p.id) && p.id >= 1 && p.id <= TOTAL && typeof p.name === 'string' && p.name.length > 0);
}
function validTypeIndex(data) {
  return Array.isArray(data) && data.length > 0 && new Set(data.map(p => p?.[0])).size === data.length
    && data.every(p => Array.isArray(p) && Number.isInteger(p[0]) && p[0] >= 1 && p[0] <= TOTAL && [1, 2].includes(p[1]));
}
async function indexResource(key, url, compact, valid) {
  try {
    const cached = JSON.parse(localStorage.getItem(INDEX_PREFIX + key));
    const age = cached && Date.now() - cached.timestamp;
    if (cached && Number.isFinite(cached.timestamp) && age >= 0 && age < CACHE_TTL && valid(cached.data)) return cached.data;
  } catch { /* Malformed/blocked storage is safe to ignore. */ }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw Error('PokéAPI index request failed');
    const data = compact(await response.json());
    if (!valid(data)) throw Error('Unexpected PokéAPI index');
    try { localStorage.setItem(INDEX_PREFIX + key, JSON.stringify({ timestamp: Date.now(), data })); } catch { /* Memory-only use remains functional. */ }
    return data;
  } finally { clearTimeout(timeout); }
}

// Include current typings, including types introduced after Generation I.
function initializeCollection() {
  if (!grid) return;
  const filters = $('#type-filters');
  ['all', ...Object.keys(TYPE_COLORS)].forEach((type) => {
    const chip = element('button', 'filter-chip');
    chip.type = 'button';
    chip.dataset.type = type;
    chip.setAttribute('aria-pressed', String(type === 'all'));
    if (type !== 'all') {
      chip.style.setProperty('--type-color', TYPE_COLORS[type]);
      const dot = element('span', 'type-dot');
      dot.setAttribute('aria-hidden', 'true');
      chip.append(dot);
    }
    chip.append(document.createTextNode(type === 'all' ? 'All types' : prettyName(type)));
    filters.append(chip);
  });
  filters.addEventListener('click', (event) => {
    const chip = event.target.closest('button[data-type]');
    if (!chip) return;
    state.type = chip.dataset.type;
    render();
  });
  $('#search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  $('#sort').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  $('#generation').addEventListener('change', (event) => {
    state.generation = GENERATIONS.some(g => g.id === event.target.value) ? event.target.value : 'all'; render();
  });
  $('#reset').addEventListener('click', resetFilters);
  $('#empty-reset').addEventListener('click', resetFilters);
  $('#retry').addEventListener('click', loadPokemon);
  grid.addEventListener('click', (event) => {
    const card = event.target.closest('button[data-id]');
    if (card) showDetails(state.pokemon.get(Number(card.dataset.id)));
  });
}

function initializeDetails() {
  if (!dialog) return;
  $('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { detailRevision++; });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('keydown', (event) => {
    if (grid && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !$('#collection').hidden && !event.target.closest('input, textarea, select, [contenteditable]')) {
      event.preventDefault();
      $('#search').focus();
    }
  });
}
// Native dialog supplies Escape, focus trapping, and focus restoration.
function initializeHero() {
  const heroArtwork = document.querySelector('.hero-art img');
  if (!heroArtwork) return;
  const fallbackHero = () => { heroArtwork.src = 'artwork-fallback.svg'; };
  heroArtwork.addEventListener('error', fallbackHero, { once: true });
  // The hero may have failed before this deferred script executed.
  if (heroArtwork.complete && heroArtwork.naturalWidth === 0) fallbackHero();
}
initializeCollection();
initializeDetails();
initializeHero();
if (grid) loadPokemon();
