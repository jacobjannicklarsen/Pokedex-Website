// On-demand PokéAPI resources and DOM-independent encyclopedia calculations.
(() => {
  'use strict';
  const BASE = 'https://pokeapi.co/api/v2/';
  const PREFIX = 'dexhaven-encyclopedia-v1-';
  const TTL = 7 * 86400000;
  const pending = new Map(), memory = new Map(), queue = [];
  let active = 0;
  const named = value => value?.name || null;
  const pretty = text => String(text).split('-').map(s => s[0]?.toUpperCase() + s.slice(1)).join(' ');
  const versionGroups = [
    ['red-blue', 1, 1], ['yellow', 2, 1], ['gold-silver', 3, 2], ['crystal', 4, 2],
    ['ruby-sapphire', 5, 3], ['emerald', 6, 3], ['firered-leafgreen', 7, 3], ['colosseum', 12, 3], ['xd', 13, 3],
    ['diamond-pearl', 8, 4], ['platinum', 9, 4], ['heartgold-soulsilver', 10, 4], ['black-white', 11, 5], ['black-2-white-2', 14, 5]
  ].map(([name, id, generation]) => ({ name, id, generation, label: pretty(name) }));
  function resourceId(url, kind) {
    try { const u = new URL(url); return u.origin === 'https://pokeapi.co' ? Number(u.pathname.match(new RegExp(`^/api/v2/${kind}/(\\d+)/?$`))?.[1]) || null : null; } catch { return null; }
  }
  function valid(kind, p) {
    if (!p || !Number.isInteger(p.id) || p.id < 1) return false;
    if (kind === 'pokemon') return Array.isArray(p.moves) && p.moves.every(m => typeof m?.move?.name === 'string' && resourceId(m.move.url, 'move') && Array.isArray(m.version_group_details));
    if (kind === 'pokemon-species') return typeof p.name === 'string' && Array.isArray(p.flavor_text_entries) && Array.isArray(p.egg_groups) && (p.evolution_chain === null || Boolean(resourceId(p.evolution_chain?.url, 'evolution-chain')));
    if (kind === 'evolution-chain') {
      const walk = (node, depth = 0) => depth < 12 && resourceId(node?.species?.url, 'pokemon-species') && Array.isArray(node.evolution_details) && Array.isArray(node.evolves_to) && node.evolves_to.every(n => walk(n, depth + 1));
      return Boolean(walk(p.chain));
    }
    if (kind === 'move') return typeof p.name === 'string' && typeof p.type?.name === 'string' && ['physical', 'special', 'status'].includes(p.damage_class?.name) && Array.isArray(p.past_values) && ['power', 'accuracy', 'pp'].every(key => p[key] === null || Number.isInteger(p[key]) && p[key] >= 0 && (key !== 'accuracy' || p[key] <= 100));
    if (kind === 'type') return ['no_damage_from', 'half_damage_from', 'double_damage_from', 'no_damage_to', 'half_damage_to', 'double_damage_to'].every(key => Array.isArray(p.damage_relations?.[key]) && p.damage_relations[key].every(t => typeof t?.name === 'string'));
    return false;
  }
  function compact(kind, p) {
    if (kind === 'pokemon') return { id: p.id, base_experience: p.base_experience ?? null, moves: p.moves.map(m => ({ move: m.move, version_group_details: m.version_group_details.filter(d => versionGroups.some(g => g.name === d.version_group?.name)) })).filter(m => m.version_group_details.length) };
    if (kind === 'type') return { id: p.id, name: p.name, damage_relations: p.damage_relations };
    if (kind === 'move') return { id: p.id, name: p.name, type: p.type, damage_class: p.damage_class, power: p.power ?? null, accuracy: p.accuracy ?? null, pp: p.pp ?? null, past_values: p.past_values };
    if (kind === 'pokemon-species') return { ...Object.fromEntries(['id', 'name', 'generation', 'capture_rate', 'base_happiness', 'growth_rate', 'egg_groups', 'gender_rate', 'habitat', 'is_legendary', 'is_mythical', 'evolution_chain'].map(key => [key, p[key] ?? null])), genera: (p.genera || []).filter(g => g.language?.name === 'en'), flavor_text_entries: p.flavor_text_entries.filter(e => e.language?.name === 'en') };
    return p;
  }
  function remember(kind, id, value) {
    if (!valid(kind, value) || (/^\d+$/.test(String(id)) ? value.id !== Number(id) : value.name !== id)) return;
    const data = compact(kind, value), key = `${kind}-${id}`;
    memory.set(key, data);
    try { localStorage.setItem(PREFIX + key, JSON.stringify({ timestamp: Date.now(), data })); } catch { /* Storage failure must not block browsing. */ }
  }
  function schedule(task) {
    return new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); pump(); });
  }
  function pump() {
    while (active < 4 && queue.length) {
      const job = queue.shift(); active++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  }
  function get(kind, id) {
    if (!['pokemon', 'pokemon-species', 'evolution-chain', 'move', 'type'].includes(kind) || !/^[a-z0-9-]+$/.test(String(id))) return Promise.reject(Error('Unsupported PokéAPI resource.'));
    const key = `${kind}-${id}`;
    if (memory.has(key)) return Promise.resolve(memory.get(key));
    if (pending.has(key)) return pending.get(key);
    try {
      const cached = JSON.parse(localStorage.getItem(PREFIX + key));
      const age = Date.now() - cached?.timestamp;
      if (Number.isFinite(cached?.timestamp) && age >= 0 && age < TTL && valid(kind, cached.data) && (/^\d+$/.test(String(id)) ? cached.data.id === Number(id) : cached.data.name === id)) { memory.set(key, cached.data); return Promise.resolve(cached.data); }
    } catch { /* Ignore malformed or unavailable storage. */ }
    const request = schedule(async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${BASE}${kind}/${id}/`, { signal: controller.signal });
        if (!response.ok) throw Error(`PokéAPI returned ${response.status}.`);
        const value = await response.json();
        if (!valid(kind, value) || (/^\d+$/.test(String(id)) ? value.id !== Number(id) : value.name !== id)) throw Error('Incomplete PokéAPI response.');
        remember(kind, id, value); return memory.get(key);
      } finally { clearTimeout(timer); }
    }).finally(() => pending.delete(key));
    pending.set(key, request); return request;
  }
  function requirements(d) {
    const parts = [], used = new Set(['trigger', 'version_group', 'is_default']);
    if (d.trigger?.name) parts.push(pretty(d.trigger.name));
    const add = (key, label, format = v => typeof v === 'object' ? pretty(v.name || JSON.stringify(v)) : String(v)) => {
      used.add(key); if (d[key] !== null && d[key] !== undefined && d[key] !== '' && d[key] !== false) parts.push(`${label}${format(d[key])}`);
    };
    add('min_level', 'Level '); add('item', 'Use '); add('held_item', 'Hold ');
    add('min_happiness', 'Friendship ≥ '); add('min_beauty', 'Beauty ≥ '); add('min_affection', 'Affection ≥ ');
    add('time_of_day', 'Time: ', pretty); add('gender', '', v => ({ 1: 'Female', 2: 'Male' })[v] || `Gender requirement ${v}`);
    add('known_move', 'Knows '); add('known_move_type', 'Knows a move of type '); add('location', 'At ');
    add('party_species', 'With '); add('party_type', 'Party type: '); add('trade_species', 'Trade for ');
    add('relative_physical_stats', '', v => ({ '-1': 'Attack < Defense', 0: 'Attack = Defense', 1: 'Attack > Defense' })[v] || `Attack/Defense relation ${v}`);
    add('needs_overworld_rain', '', () => 'Overworld rain'); add('turn_upside_down', '', () => 'Device held upside down');
    add('needs_multiplayer', '', () => 'Multiplayer required'); add('near_special_rock', '', () => 'Near a special rock');
    add('region', 'Region: '); add('required_pokemon_form', 'Required form: '); add('evolved_pokemon_form', 'Resulting form: ');
    add('used_move', 'Use move: '); add('min_move_count', 'Move uses ≥ '); add('min_steps', 'Steps ≥ '); add('min_damage_taken', 'Damage taken ≥ ');
    Object.entries(d).forEach(([key, value]) => {
      if (used.has(key) || value === null || value === undefined || value === false || value === '' || (Array.isArray(value) && !value.length)) return;
      const format = v => typeof v === 'object' ? v.name ? pretty(v.name) : JSON.stringify(v) : String(v);
      parts.push(`${pretty(key.replaceAll('_', '-'))}: ${Array.isArray(value) ? value.map(format).join(', ') : format(value)}`);
    });
    return { text: parts.join(' · ') || 'Requirements not recorded', version: named(d.version_group) ? pretty(d.version_group.name) : null };
  }
  function learnset(pokemon, group) {
    const rows = [], seen = new Set();
    for (const entry of pokemon.moves || []) for (const detail of entry.version_group_details || []) {
      if (detail.version_group?.name !== group) continue;
      const method = detail.move_learn_method?.name;
      if (!method) continue;
      const row = { id: resourceId(entry.move.url, 'move'), name: entry.move.name, method, level: detail.level_learned_at ?? null };
      const key = `${row.id}:${method}:${row.level}`;
      if (row.id && !seen.has(key)) { seen.add(key); rows.push(row); }
    }
    return rows;
  }
  function moveValues(move, group) {
    const current = versionGroups.find(g => g.name === group);
    if (!current) throw Error('Choose a supported version group.');
    const result = { type: move.type.name, category: move.damage_class.name, power: move.power, accuracy: move.accuracy, pp: move.pp };
    // past_values describe the state BEFORE each change boundary. Apply newer changes backwards.
    // PokéAPI IDs are not chronological: Colosseum/XD and Japanese Gen I groups were added later.
    const order = (name, id) => ({ 'red-green-japan': 0.5, 'blue-japan': 0.75, colosseum: 5.25, 'firered-leafgreen': 6, emerald: 7, xd: 7.25 })[name] ?? id;
    const selectedOrder = order(current.name, current.id);
    const history = (move.past_values || []).map(p => ({ ...p, boundary: order(p.version_group?.name, resourceId(p.version_group?.url, 'version-group')) })).filter(p => p.boundary > selectedOrder).sort((a, b) => b.boundary - a.boundary);
    history.forEach(p => { for (const key of ['power', 'accuracy', 'pp']) if (p[key] !== null && p[key] !== undefined) result[key] = p[key]; if (p.type?.name) result.type = p.type.name; });
    if (current.generation <= 3 && result.category !== 'status') result.category = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel'].includes(result.type) ? 'physical' : 'special';
    return result;
  }
  function matchups(ownTypes, resources, types) {
    const defense = Object.fromEntries(types.map(t => [t, 1])), offense = {};
    ownTypes.forEach(type => {
      const relations = resources.find(r => r.name === type)?.damage_relations;
      if (!relations) throw Error(`Type data unavailable for ${type}.`);
      const attacks = Object.fromEntries(types.map(t => [t, 1]));
      for (const [prefix, multiplier] of [['no', 0], ['half', 0.5], ['double', 2]]) {
        relations[`${prefix}_damage_from`].forEach(t => { if (t.name in defense) defense[t.name] *= multiplier; });
        relations[`${prefix}_damage_to`].forEach(t => { if (t.name in attacks) attacks[t.name] = multiplier; });
      }
      offense[type] = attacks;
    });
    return { defense, offense };
  }
  const descriptions = species => (species.flavor_text_entries || []).filter(e => e.language?.name === 'en' && typeof e.flavor_text === 'string').map(e => ({ game: e.version?.name || 'unspecified', text: e.flavor_text.replace(/[\f\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() })).filter(e => e.text).filter((e, i, all) => all.findIndex(other => other.game === e.game && other.text === e.text) === i);
  const gender = rate => rate === -1 ? 'Genderless' : Number.isInteger(rate) && rate >= 0 && rate <= 8 ? `${(8 - rate) * 12.5}% male · ${rate * 12.5}% female` : 'Not recorded';
  const api = { versionGroups, resourceId, valid, get, remember, requirements, learnset, moveValues, matchups, descriptions, gender };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.PokemonEncyclopediaData = api;
})();
