// Serializable fixture shared by Node and Chrome. No live PokéAPI requests.
function createPokeFixture(encyclopedia = {}) {
  const names = { 1:'bulbasaur',4:'charmander',7:'squirtle',25:'pikachu',29:'nidoran-f',83:'farfetchd',122:'mr-mime',151:'mew',152:'chikorita',197:'umbreon',251:'celebi',252:'treecko',386:'deoxys',387:'turtwig',443:'gible',445:'garchomp',493:'arceus',494:'victini',643:'reshiram',649:'genesect' };
  const types = {1:['grass','poison'],4:['fire'],7:['water'],10:['bug'],16:['normal','flying'],23:['poison'],25:['electric'],27:['ground'],35:['fairy'],66:['fighting'],74:['rock','ground'],81:['electric','steel'],92:['ghost','poison'],96:['psychic'],124:['ice','psychic'],147:['dragon'],151:['psychic'],152:['grass'],197:['dark'],251:['psychic','grass'],252:['grass'],386:['psychic'],387:['grass'],443:['dragon','ground'],445:['dragon','ground'],493:['normal'],494:['psychic','fire'],643:['dragon','fire'],649:['bug','steel']};
  Object.assign(names,{2:'ivysaur',3:'venusaur',6:'charizard',133:'eevee',134:'vaporeon',135:'jolteon',136:'flareon',236:'tyrogue'});
  Object.assign(types,{6:['fire','flying'],133:['normal'],134:['water'],135:['electric'],136:['fire']});
  const nameOf = id => names[id] || `pokemon-${id}`;
  const typesOf = id => types[id] || ['normal'];
  function key(url) {
    const path = new URL(String(url)).pathname;
    if (path.includes('/pokemon-species/')) return 'species';
    const type = path.match(/\/type\/([^/]+)/); if(type)return `type-${type[1]}`;
    return `pokemon-${Number(path.match(/\/pokemon\/(\d+)/)?.[1])}`;
  }
  function response(url) {
    const request = key(url);
    const resourcePath = new URL(String(url)).pathname.replace('/api/v2/','').replace(/\/$/,'');
    if (!resourcePath.startsWith('pokemon/') && encyclopedia[resourcePath] && !resourcePath.startsWith('type/')) return encyclopedia[resourcePath];
    if (request==='species') return {results:Array.from({length:649},(_,i)=>({name:nameOf(i+1),url:`https://pokeapi.co/api/v2/pokemon-species/${i+1}/`}))};
    if (request.startsWith('type-')) {
      const type=request.slice(5);
      return {...(encyclopedia[resourcePath]||{}),pokemon:Array.from({length:649},(_,i)=>i+1).filter(id=>typesOf(id).includes(type)).map(id=>({slot:typesOf(id).indexOf(type)+1,pokemon:{name:nameOf(id),url:`https://pokeapi.co/api/v2/pokemon/${id}/`}})).concat([{slot:1,pokemon:{name:'alternate-form',url:'https://pokeapi.co/api/v2/pokemon/10001/'}}])};
    }
    const id=Number(request.slice(8));
    return {id,name:id===386?'deoxys-normal':nameOf(id),height:7,weight:69,moves:[],base_experience:null,...(encyclopedia[resourcePath]||{}),
      types:typesOf(id).map((name,i)=>({slot:i+1,type:{name}})),
      sprites:{front_default:'/missing-sprite.png',other:{'official-artwork':{front_default:'/missing-art.png'}}},
      abilities:[{ability:{name:'overgrow'},is_hidden:false},{ability:{name:'chlorophyll'},is_hidden:true}],
      stats:['hp','attack','defense','special-attack','special-defense','speed'].map((name,i)=>({stat:{name},base_stat:[45,49,49,65,65,45][i]}))};
  }
  return {key,response};
}
module.exports={createPokeFixture};
