// Trainer-only game sprites. The National Pokédex keeps its official artwork.
(() => {
  'use strict';
  const assets=typeof module!=='undefined'&&module.exports?require('./sprite-availability'):globalThis.DexhavenSpriteAssets;
  const root=typeof document==='undefined'?null:new URL('.',document.currentScript.src);
  const base=`https://raw.githubusercontent.com/PokeAPI/sprites/${assets.revision}/sprites/pokemon/`;
  const valid=id=>Number.isInteger(id)&&id>=1&&id<=649;
  function sources(id,{kind='battle',reducedMotion=false,pokemon}={}) {
    if(!valid(id))throw new RangeError('Choose a Pokémon ID from 1 to 649.');
    if(!['battle','party','static'].includes(kind))throw new TypeError('Unknown sprite kind.');
    // Shinies are never inferred from a trainer, species, preference or URL.
    const shiny=pokemon?.id===id&&pokemon.isShiny===true;
    const list=[],add=(key,path)=>{if(assets.available[key]?.includes(id))list.push(base+path);};
    if(kind==='party')add('party',`versions/generation-v/icons/${id}.png`);
    if(kind==='battle'&&!reducedMotion)add(shiny?'shinyAnimated':'animated',`versions/generation-v/black-white/animated/${shiny?'shiny/':''}${id}.gif`);
    add(shiny?'shinyStatic':'static',`versions/generation-v/black-white/${shiny?'shiny/':''}${id}.png`);
    list.push(`${base}${shiny?'shiny/':''}${id}.png`);
    // A local icon is the last fallback. No global artwork handlers are involved.
    list.push(root?new URL('artwork-fallback.svg',root).href:'artwork-fallback.svg');
    return [...new Set(list)];
  }
  function create(id,{name,kind='battle',pokemon}={}) {
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const img=document.createElement('img');img.className=`pokemon-sprite sprite-${kind}`;
    img.alt=`${name||`Pokémon #${String(id).padStart(3,'0')}`} ${kind==='party'?'party icon':'battle sprite'}`;
    img.width=kind==='party'?40:96;img.height=kind==='party'?32:96;
    img.loading='lazy';img.decoding='async';img.dataset.spriteId=id;
    let chain,index,terminal=false,visible=true;
    function load(){chain=sources(id,{kind,pokemon,reducedMotion:media.matches||!visible});index=0;terminal=false;img.dataset.spriteState='loading';img.src=chain[index];}
    img.addEventListener('error',()=>{if(terminal)return;if(++index<chain.length){img.dataset.spriteState='fallback';img.src=chain[index];}else{terminal=true;img.dataset.spriteState='unavailable';}});
    img.addEventListener('load',()=>{img.dataset.spriteState=index===chain.length-1?'placeholder':'loaded';});
    // Shared media listener below avoids one persistent listener per sprite.
    live.set(img,{load,setVisible(next){if(next!==visible){visible=next;load();}}});load();observe(img);return img;
  }
  const live=new Map();let observer,media;
  function observe(img){
    if(!observer){
      observer=new IntersectionObserver(entries=>{for(const entry of entries){const node=entry.target;if(!node.isConnected)continue;live.get(node)?.setVisible(entry.isIntersecting);}}, {rootMargin:'100px'});
      media=matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',()=>{for(const [node,entry]of live){if(!node.isConnected){live.delete(node);observer.unobserve(node);}else entry.load();}});
      // Removing a card releases its image references; no detached-node accumulation.
      new MutationObserver(()=>{for(const [node]of live)if(!node.isConnected){live.delete(node);observer.unobserve(node);}}).observe(document.documentElement,{childList:true,subtree:true});
    }
    observer.observe(img);
  }
  const api={valid,sources,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.PokemonSprites=api;
})();
