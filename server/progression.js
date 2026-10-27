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
const pretty = value => value[0].toUpperCase() + value.slice(1);
const add = (key, name, description, icon, goal, metric, category, rarity) => definitions.push({key,name,description,icon,goal,metric,category,rarity});
for (const [goal,name,rarity] of [[10,'Curious Explorer','bronze'],[50,'Field Researcher','silver'],[100,'Seasoned Explorer','silver'],[250,'World Wanderer','gold'],[500,'Living Encyclopedia','gold'],[649,'Seen It All','legendary']]) add(`seen-${goal}`,name,`Register ${goal} different Pokémon as Seen or Caught.`,'◎',goal,s=>s.national.seen,'exploration',rarity);
for (const [goal,name,rarity] of [[10,'A Promising Start','bronze'],[50,'Half Century','silver'],[150,'Collector’s Vault','gold'],[250,'Grand Collection','gold'],[500,'Legend in the Making','legendary']]) add(`caught-${goal}`,name,`Have ${goal} different Pokémon marked Caught.`,'◒',goal,s=>s.national.caught,'collection',rarity);
for (const g of pokemon.generations) {
  add(`region-${g.id}-trailblazer`,`${g.name} Trailblazer`,`Catch 10 species introduced in ${g.name}.`,'✧',10,s=>s.generations.find(row=>row.id===g.id).caught,'regions','silver');
  if(g.id!==1) add(`region-${g.id}-complete`,`${g.name} Completionist`,`Catch all ${g.end-g.start+1} species introduced in ${g.name}.`,'♜',g.end-g.start+1,s=>s.generations.find(row=>row.id===g.id).caught,'regions','gold');
}
for (const type of pokemon.types) {
  const total=snapshot.pokemon.filter(p=>p.types.includes(type)).length;
  for(const [suffix,goal,title,rarity] of [['scout',5,'Scout','bronze'],['specialist',15,'Specialist','silver'],['master',total,'Master','gold']]) add(`type-${type}-${suffix}`,`${pretty(type)} ${title}`,`Have ${goal}${suffix==='master'?' (all)':''} ${pretty(type)}-type species marked Caught. Dual types count toward both types.`,'✦',goal,s=>s.types.find(row=>row.type===type).caught,'types',rarity);
}
for(const [goal,name,rarity] of [[1,'A Favourite Found','bronze'],[10,'Fan Club','bronze'],[25,'Heart Collector','silver'],[50,'Full of Favourites','gold'],[100,'One Hundred Hearts','legendary']]) add(`favorites-${goal}`,name,`Save ${goal} favourite Pokémon.`,'♥',goal,s=>s.favorites,'favourites',rarity);
for(const [goal,name,rarity] of [[1,'First Lineup','bronze'],[3,'Team Tactician','silver'],[5,'Roster Architect','gold']]) add(`teams-${goal}`,name,`Own ${goal} saved Pokémon teams.`,'⬡',goal,s=>s.teams,'teams',rarity);
for(const [goal,name,rarity] of [[3,'Across the Regions','silver'],[4,'Four Horizons','gold'],[5,'Five-Region Explorer','legendary']]) add(`regions-visited-${goal}`,name,`Register a species from ${goal} different introduction regions.`,'✥',goal,s=>s.generations.filter(g=>g.seen>0).length,'exploration',rarity);
for(const [goal,name,rarity] of [[6,'Elemental Apprentice','bronze'],[12,'Elemental Adept','silver'],[18,'Every Element','legendary']]) add(`type-diversity-${goal}`,name,`Catch species representing ${goal} different types.`,'❖',goal,s=>s.types.filter(t=>t.caught>0).length,'types',rarity);
definitions.forEach(d=>{d.category ||= d.key==='team-builder'?'teams':d.key.includes('completionist')||d.key==='regional-master'?'regions':'collection';d.rarity ||= d.key==='national-pokedex-master'?'legendary':['first-encounter','first-catch'].includes(d.key)?'bronze':d.key==='pokemon-collector'?'silver':'gold';});
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
