// Optional, read-only live contract check: exactly three PokéAPI GET requests.
const assert = require('node:assert/strict');
async function get(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.ok,true,`${url}: ${response.status}`);
  return response.json();
}
async function main(){
  const species=await get('https://pokeapi.co/api/v2/pokemon-species/?limit=649');
  assert.equal(species.results.length,649);
  assert.equal(species.results[0].name,'bulbasaur');assert.equal(species.results.at(-1).name,'genesect');
  const ids=species.results.map(p=>Number(p.url.match(/\/(\d+)\/$/)[1]));assert.deepEqual(ids,Array.from({length:649},(_,i)=>i+1));
  const dragon=await get('https://pokeapi.co/api/v2/type/dragon/');
  assert.ok(dragon.pokemon.some(p=>p.pokemon.name==='gible'&&p.slot===1));
  const genesect=await get('https://pokeapi.co/api/v2/pokemon/649/');
  assert.equal(genesect.id,649);assert.equal(genesect.name,'genesect');assert.equal(genesect.stats.length,6);
  assert.ok(genesect.sprites.other['official-artwork'].front_default);assert.ok(genesect.abilities.length);
  console.log('Live PokéAPI contract passed: 649-species index, Dragon membership/slots, and Genesect details/artwork (3 GETs).');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
