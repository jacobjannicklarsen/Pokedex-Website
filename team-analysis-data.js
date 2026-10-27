// Shared deterministic analysis. Uses the Encyclopedia's modern type rules.
(() => {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const data = node ? require('./pokemon-data') : globalThis.PokemonData;
  const encyclopedia = node ? require('./encyclopedia-data') : globalThis.PokemonEncyclopediaData;
  function analyze(ids, records, resources) {
    if (!Array.isArray(ids) || ids.length > 6 || new Set(ids).size !== ids.length || ids.some(id => !Number.isInteger(id) || id < 1 || id > 649)) throw Error('Choose up to six unique Pokémon.');
    if (resources.length !== 18 || new Set(resources.map(r => r.name)).size !== 18 || !resources.every(r => data.types.includes(r.name) && encyclopedia.valid('type', r))) throw Error('Complete type data is required.');
    const members = ids.map(id => {
      const pokemon = records.find(p => p.id === id);
      if (!pokemon) throw Error(`Pokémon #${id} is unavailable.`);
      return { pokemon, ...encyclopedia.matchups(pokemon.types, resources, data.types) };
    });
    const defensive = data.types.map(type => {
      const multipliers = members.map(m => m.defense[type]);
      return { type, multipliers, weak: multipliers.filter(n => n > 1).length, resistant: multipliers.filter(n => n > 0 && n < 1).length, immune: multipliers.filter(n => n === 0).length, neutral: multipliers.filter(n => n === 1).length };
    });
    const ownTypes = data.types.filter(t => members.some(m => m.pokemon.types.includes(t)));
    const offensive = data.types.map(type => ({ type, attackers: ownTypes.filter(own => members.some(m => m.offense[own]?.[type] === 2)) }));
    const averages = data.stats.map(key => ({ key, value: members.length ? members.reduce((sum,m) => sum + data.value(m.pokemon,key),0) / members.length : null }));
    return { count: members.length, emptySlots: 6 - members.length, members, defensive, offensive, ownTypes, averages, total: members.reduce((sum,m) => sum + data.value(m.pokemon,'total'),0) };
  }
  const api = { analyze };
  if (node) module.exports = api; else globalThis.TeamAnalysisData = api;
})();
