// Explicit maintenance command only. Runtime pages never run this or fetch 649 details.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateSnapshot, stats } = require('../pokemon-data');
const target = path.join(__dirname, '../data/pokemon-summary.json');
async function main() {
  const records = new Array(649);
  let cursor = 1, stopped = false;
  async function worker() {
    while (cursor <= 649 && !stopped) {
      const id = cursor++;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw Error(`PokéAPI returned ${response.status}`);
          const p = await response.json();
          if (p.id !== id || p.is_default !== true || Number(p.species.url.match(/\/(\d+)\/$/)?.[1]) !== id) throw Error(`Not standard species #${id}`);
          records[id - 1] = { id, name: p.species.name, types: [...p.types].sort((a, b) => a.slot - b.slot).map(t => t.type.name), height: p.height, weight: p.weight,
            abilities: [...p.abilities].sort((a, b) => a.slot - b.slot).map(a => ({ name: a.ability.name, hidden: a.is_hidden })),
            stats: stats.map(name => ({ name, value: p.stats.find(s => s.stat.name === name)?.base_stat })) };
          lastError = null; break;
        } catch (error) { lastError = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); }
      }
      if (lastError) { stopped = true; throw Error(`Could not fetch #${id}: ${lastError.message}`); }
      if (id % 100 === 0) console.log(`Fetched through #${id}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const snapshot = validateSnapshot({ schemaVersion: 1, source: { url: 'https://pokeapi.co/api/v2/pokemon/', retrievedAt: new Date().toISOString(), description: 'Current PokéAPI default forms for National species 001–649; heights in decimetres, weights in hectograms.' }, pokemon: records });
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(snapshot) + '\n'); await fs.rename(temporary, target); }
  finally { await fs.rm(temporary, { force: true }); }
  console.log(`Validated and saved ${records.length} real Pokémon to data/pokemon-summary.json`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
