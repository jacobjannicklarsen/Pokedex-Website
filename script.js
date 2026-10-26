'use strict';

const API = 'https://pokeapi.co/api/v2/pokemon/';
const TOTAL = 151;
const CONCURRENCY = 6;
const CACHE_PREFIX = 'kanto-pokedex-v1-';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const TYPE_COLORS = {
  normal: '#bdbaa7', fire: '#ff9a66', water: '#78baff', electric: '#f1d76b',
  grass: '#8bd394', ice: '#8addde', fighting: '#e98a7d', poison: '#c399dd',
  ground: '#d6b782', flying: '#a6b5ef', psychic: '#f495b9', bug: '#becd71',
  rock: '#cbb880', ghost: '#a79ace', dragon: '#ab9bf5', dark: '#c0aa98',
  steel: '#a6c5ce', fairy: '#eab1d8'
};
const state = { pokemon: new Map(), query: '', type: 'all', sort: 'number', loading: false };
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
  card.append(top, art, element('span', 'card-name', prettyName(pokemon.name)), badges(pokemon.types));
  // Keep the detail button and favourite button as siblings, never nested buttons.
  const tile = element('article', 'pokemon-tile');
  tile.dataset.id = pokemon.id;
  tile.append(card);
  globalThis.PokedexAccounts?.decorateCard(tile, pokemon);
  return tile;
}

function matches(pokemon) {
  const query = state.query.trim().toLowerCase();
  const numeric = query.replace(/^#/, '');
  const normalized = normalizeName(query);
  const nameMatch = normalized.length > 0 && (normalizeName(pokemon.name).includes(normalized) || normalizeName(prettyName(pokemon.name)).includes(normalized));
  const queryMatch = /^\d+$/.test(numeric) ? pokemon.id === Number(numeric) : nameMatch;
  return (!query || queryMatch) && (state.type === 'all' || pokemon.types.includes(state.type));
}

function render() {
  const visible = [...state.pokemon.values()].filter(matches).sort((a, b) => {
    if (state.sort === 'name') return prettyName(a.name).localeCompare(prettyName(b.name));
    return state.sort === 'reverse' ? b.id - a.id : a.id - b.id;
  });
  // Reuse cards during progressive loading to preserve focus and image requests.
  const existing = new Map([...grid.children].map((card) => [Number(card.dataset.id), card]));
  const wanted = new Set(visible.map((pokemon) => pokemon.id));
  for (const [id, card] of existing) if (!wanted.has(id)) card.remove();
  visible.forEach((pokemon, index) => {
    const card = existing.get(pokemon.id) || createCard(pokemon);
    if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null);
  });
  $('#result-count').textContent = `Showing ${visible.length} of ${TOTAL} Pokémon${state.loading ? ` · ${state.pokemon.size} loaded` : ''}`;
  $('#empty-state').hidden = visible.length > 0 || state.loading || state.pokemon.size === 0;
  $('#reset').hidden = !state.query && state.type === 'all';
  $('#collection-end').hidden = state.pokemon.size !== TOTAL || visible.length !== TOTAL;
  document.querySelectorAll('.filter-chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.type === state.type)));
  globalThis.PokedexAccounts?.onPokemonUpdate();
}

function resetFilters() {
  state.query = '';
  state.type = 'all';
  $('#search').value = '';
  render();
  // Reset buttons disappear after activation; keep keyboard focus in the search flow.
  $('#search').focus();
}

function showDetails(pokemon) {
  const content = $('#detail-content');
  content.replaceChildren();
  content.style.setProperty('--type-color', TYPE_COLORS[pokemon.types[0]] || '#bdbaa7');
  const hero = element('div', 'detail-hero');
  hero.append(element('p', 'card-number', `KANTO POKÉDEX / ${number(pokemon.id)}`), artwork(pokemon, false));
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
  dialog.showModal();
  dialog.scrollTop = 0;
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
      id: data.id, name: data.name, height: data.height, weight: data.weight,
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

async function loadPokemon() {
  if (state.loading) return;
  state.loading = true;
  $('#error-state').hidden = true;
  $('#load-status').hidden = false;
  $('#load-message').textContent = 'Loading Pokémon data…';
  grid.setAttribute('aria-busy', 'true');
  const pending = [];
  for (let id = 1; id <= TOTAL; id++) {
    if (state.pokemon.has(id)) continue;
    const cached = readCache(id);
    if (cached) state.pokemon.set(id, cached);
    else pending.push(id);
  }
  render();
  let cursor = 0;
  let consecutiveFailures = 0;
  let stopRequests = false;
  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; render(); });
  }
  async function worker() {
    while (cursor < pending.length && !stopRequests) {
      const id = pending[cursor++];
      try {
        state.pokemon.set(id, await fetchPokemon(id));
        consecutiveFailures = 0;
      } catch {
        // A sustained outage should not force users through 151 request timeouts.
        consecutiveFailures++;
        if (consecutiveFailures >= CONCURRENCY) stopRequests = true;
      }
      $('#load-message').textContent = `Discovering Kanto… ${state.pokemon.size} / ${TOTAL} Pokémon`;
      scheduleRender();
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  } finally {
    state.loading = false;
    $('#load-status').hidden = true;
    grid.setAttribute('aria-busy', 'false');
    const missing = TOTAL - state.pokemon.size;
    if (missing) {
      $('#error-state').hidden = false;
      $('#error-message').textContent = `${missing} Pokémon couldn’t be loaded. Check your connection and try again. Your loaded Pokémon are still available.`;
    }
    render();
  }
}

// Include current typings, including types introduced after Generation I.
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
$('#reset').addEventListener('click', resetFilters);
$('#empty-reset').addEventListener('click', resetFilters);
$('#retry').addEventListener('click', loadPokemon);
grid.addEventListener('click', (event) => {
  const card = event.target.closest('button[data-id]');
  if (card) showDetails(state.pokemon.get(Number(card.dataset.id)));
});
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !$('#collection').hidden && !event.target.closest('input, textarea, select, [contenteditable]')) {
    event.preventDefault();
    $('#search').focus();
  }
});
// Native dialog supplies Escape, focus trapping, and focus restoration.
const heroArtwork = document.querySelector('.hero-art img');
const fallbackHero = () => { heroArtwork.src = 'artwork-fallback.svg'; };
heroArtwork.addEventListener('error', fallbackHero, { once: true });
// The hero may have failed before this deferred script executed.
if (heroArtwork.complete && heroArtwork.naturalWidth === 0) fallbackHero();
loadPokemon();
