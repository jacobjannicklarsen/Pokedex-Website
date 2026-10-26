// Shared, DOM-independent data validation and analytics. Also used by the snapshot updater/tests.
(() => {
  'use strict';
  const stats = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
  const labels = ['HP', 'Attack', 'Defense', 'Special Attack', 'Special Defense', 'Speed'];
  const types = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  const generations = [
    { id: 1, name: 'Kanto', start: 1, end: 151 }, { id: 2, name: 'Johto', start: 152, end: 251 },
    { id: 3, name: 'Hoenn', start: 252, end: 386 }, { id: 4, name: 'Sinnoh', start: 387, end: 493 },
    { id: 5, name: 'Unova', start: 494, end: 649 }
  ];
  const generation = id => generations.find(g => id >= g.start && id <= g.end);
  const value = (pokemon, key) => key === 'total' ? pokemon.stats.reduce((sum, s) => sum + s.value, 0) : pokemon.stats.find(s => s.name === key)?.value;
  function validateRecords(records) {
    if (!Array.isArray(records) || records.length !== 649 || new Set(records.map(p => p?.id)).size !== 649 || new Set(records.map(p => p?.name)).size !== 649) throw Error('The dataset must contain all 649 unique standard species.');
    for (const p of records) {
      if (!p || !Number.isInteger(p.id) || p.id < 1 || p.id > 649 || typeof p.name !== 'string' || !/^[a-z0-9-]+$/.test(p.name)
        || !Array.isArray(p.types) || p.types.length < 1 || p.types.length > 2 || new Set(p.types).size !== p.types.length || !p.types.every(t => types.includes(t))
        || !Number.isInteger(p.height) || p.height < 0 || !Number.isInteger(p.weight) || p.weight < 0
        || !Array.isArray(p.stats) || p.stats.length !== 6 || new Set(p.stats.map(s => s?.name)).size !== 6 || !p.stats.every(s => s && stats.includes(s.name) && Number.isInteger(s.value) && s.value > 0 && s.value <= 255)
        || !Array.isArray(p.abilities) || !p.abilities.length || !p.abilities.every(a => a && typeof a.name === 'string' && /^[a-z0-9-]+$/.test(a.name) && typeof a.hidden === 'boolean')) throw Error(`Incomplete or invalid Pokémon data for #${p?.id ?? '?'}.`);
    }
    return records;
  }
  function validateSnapshot(snapshot) {
    if (snapshot?.schemaVersion !== 1 || snapshot.source?.url !== 'https://pokeapi.co/api/v2/pokemon/' || !Number.isFinite(Date.parse(snapshot.source.retrievedAt))) throw Error('Unrecognized Pokémon snapshot.');
    validateRecords(snapshot.pokemon);
    return snapshot;
  }
  const compare = (key = 'total', ascending = false) => (a, b) => (value(a, key) - value(b, key)) * (ascending ? 1 : -1) || a.id - b.id;
  function summarize(records) {
    validateRecords(records); // Never silently aggregate an incomplete collection.
    const groups = generations.map(g => {
      const members = records.filter(p => generation(p.id).id === g.id);
      return { ...g, count: members.length, averages: stats.map(key => members.reduce((sum, p) => sum + value(p, key), 0) / members.length) };
    });
    const counts = Object.fromEntries(types.map(t => [t, 0]));
    records.forEach(p => p.types.forEach(t => counts[t]++));
    return { total: records.length, generationCount: groups.filter(g => g.count).length, typeCount: Object.values(counts).filter(Boolean).length,
      averageTotal: records.reduce((sum, p) => sum + value(p, 'total'), 0) / records.length, groups, types: counts };
  }
  function parseRanges(raw) {
    const ranges = {};
    for (const key of [...stats, 'total']) {
      const pair = raw[key] || {};
      const maxValue = key === 'total' ? 1530 : 255;
      const bounds = {};
      for (const bound of ['min', 'max']) {
        const text = String(pair[bound] ?? '').trim();
        if (!text) continue;
        if (!/^\d+$/.test(text) || Number(text) > maxValue) return { error: `${key === 'total' ? 'Total Base Stats' : labels[stats.indexOf(key)]}: use whole numbers from 0 to ${maxValue}.`, key };
        bounds[bound] = Number(text);
      }
      if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) return { error: `${key === 'total' ? 'Total Base Stats' : labels[stats.indexOf(key)]}: minimum must not exceed maximum.`, key };
      if (Object.keys(bounds).length) ranges[key] = bounds;
    }
    return { ranges };
  }
  const matches = (p, ranges) => Object.entries(ranges).every(([key, bounds]) => (bounds.min === undefined || value(p, key) >= bounds.min) && (bounds.max === undefined || value(p, key) <= bounds.max));
  let pending;
  function load() {
    if (!pending) pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('data/pokemon-summary.json', { signal: controller.signal });
        if (!response.ok) throw Error('The Pokémon dataset could not be loaded.');
        return validateSnapshot(await response.json());
      } finally { clearTimeout(timer); }
    })().catch(error => { pending = undefined; throw error; });
    return pending;
  }
  const api = { stats, labels, types, generations, generation, value, validateRecords, validateSnapshot, compare, summarize, parseRanges, matches, load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.PokemonData = api;
})();
