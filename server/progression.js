'use strict';
const pokemon = require('../pokemon-data');
const snapshot = pokemon.validateSnapshot(require('../data/pokemon-summary.json'));
const byId = new Map(snapshot.pokemon.map(p => [p.id, p]));
const percent = (count, total) => count * 100 / total;
const iso = value => value ? new Date(value).toISOString() : null;
function entry(row) {
  return { pokemonId: Number(row.pokemonId ?? row.pokemon_id), status: row.caughtAt || row.caught_at ? 'caught' : 'seen',
    seenAt: iso(row.seenAt ?? row.seen_at), caughtAt: iso(row.caughtAt ?? row.caught_at), updatedAt: iso(row.updatedAt ?? row.updated_at) };
}
function statistics(collection, teams = [], favorites = []) {
  if (new Set(collection.map(row => row.pokemonId)).size !== collection.length || collection.some(row => !Number.isInteger(row.pokemonId) || !byId.has(row.pokemonId) || !['seen', 'caught'].includes(row.status))) throw Error('Invalid collection records.');
  const counts = records => {
    const seen = records.length, caught = records.filter(row => row.status === 'caught').length;
    return { seen, caught };
  };
  const completion = (records, total) => { const result = counts(records); return { total, ...result, notSeen: total - result.seen, notCaught: total - result.caught, seenPercentage: percent(result.seen, total), caughtPercentage: percent(result.caught, total) }; };
  return {
    national: completion(collection, snapshot.pokemon.length),
    generations: pokemon.generations.map(g => ({ ...g, ...completion(collection.filter(row => row.pokemonId >= g.start && row.pokemonId <= g.end), g.end - g.start + 1) })),
    types: pokemon.types.map(type => ({ type, ...completion(collection.filter(row => byId.get(row.pokemonId).types.includes(type)), snapshot.pokemon.filter(p => p.types.includes(type)).length) })),
    teams: teams.length, favorites: favorites.length,
    recent: [...collection].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.pokemonId - b.pokemonId).slice(0, 10)
  };
}
const definitions = [
  { key: 'first-encounter', name: 'First Encounter', description: 'Mark your first Pokémon as Seen (Caught also counts).', icon: '◉', goal: 1, metric: s => s.national.seen },
  { key: 'first-catch', name: 'First Catch', description: 'Catch your first Pokémon.', icon: '◒', goal: 1, metric: s => s.national.caught },
  { key: 'pokemon-collector', name: 'Pokémon Collector', description: 'Have 25 Pokémon marked Caught.', icon: '✦', goal: 25, metric: s => s.national.caught },
  { key: 'dedicated-collector', name: 'Dedicated Collector', description: 'Have 100 Pokémon marked Caught.', icon: '✧', goal: 100, metric: s => s.national.caught },
  { key: 'kanto-completionist', name: 'Kanto Completionist', description: 'Catch all 151 species introduced in Generation I.', icon: 'Ⅰ', goal: 151, metric: s => s.generations[0].caught },
  { key: 'regional-master', name: 'Regional Master', description: 'Complete any one generation’s introduced-species collection.', icon: '★', goal: 100, metric: s => Math.max(...s.generations.map(g => g.caughtPercentage)), unit: '%' },
  { key: 'national-pokedex-master', name: 'National Pokédex Master', description: 'Catch all 649 National Pokédex species.', icon: '♛', goal: 649, metric: s => s.national.caught },
  { key: 'team-builder', name: 'Team Builder', description: 'Save a full team containing six Pokémon.', icon: '⬡', goal: 6, metric: (s, teams) => Math.max(0, ...teams.map(t => t.pokemonIds?.length ?? t.memberCount ?? 0)) }
];
function achievements(stats, teams, saved = []) {
  const unlocked = new Map(saved.map(row => [row.key ?? row.achievement_key, iso(row.unlockedAt ?? row.unlocked_at)]));
  return definitions.map(({ metric, ...definition }) => ({ ...definition, current: metric(stats, teams), unlockedAt: unlocked.get(definition.key) || null }));
}
function eligible(stats, teams) { return definitions.filter(d => d.metric(stats, teams) >= d.goal).map(d => d.key); }
// Also used by the existing team transaction. A pre-migration database keeps team editing working.
async function awardTeamBuilder(connection, userId) {
  try { await award(connection, userId, 'team-builder'); }
  catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
}
async function award(connection, userId, key) {
  await connection.execute('INSERT INTO user_achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE achievement_key = user_achievements.achievement_key', [userId, key]);
}
module.exports = { entry, statistics, definitions, achievements, eligible, awardTeamBuilder, award };
