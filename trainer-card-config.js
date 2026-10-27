// One configuration shared by the API, Studio and public card renderer.
(() => {
  'use strict';
  const choices={
    palette:['mint','ocean','sunset','violet','rose','gold','ember','arctic','forest','cobalt','copper','monochrome'],
    pattern:['aurora','constellation','grid','waves','petals','plain','nebula','depths','ember','forest','royal'],
    frame:['classic','halo','double','laurel','hexagon','orbit','rounded','diamond','neon','minimal','champion'],
    effect:['none','sparkles','shimmer','starfield','holographic','glow','electric','particles'],
    borderStyle:['solid','double','dashed','etched'], titleStyle:['ribbon','pill','minimal']
  };
  const defaults=()=>({palette:'mint',pattern:'aurora',frame:'classic',effect:'none',title:'',motto:'',pinnedBadges:[],accentColor:null,borderColor:null,frameColor:null,borderStyle:'solid',titleStyle:'ribbon'});
  const labels={classic:'Circle',halo:'Halo',double:'Double ring',laurel:'Laurel',hexagon:'Hexagon',orbit:'Orbit',rounded:'Rounded square',diamond:'Diamond',neon:'Neon ring',minimal:'Minimal border',champion:'Champion',grid:'Cyber grid',waves:'Coastal waves',plain:'Minimal',depths:'Ocean depths',holographic:'Holographic shine',glow:'Subtle glow',electric:'Electric accents',particles:'Floating particles'};
  const presets={
    'Dexhaven original':{palette:'mint',pattern:'aurora',frame:'classic',effect:'none'},
    'Night explorer':{palette:'violet',pattern:'nebula',frame:'hexagon',effect:'starfield',borderStyle:'etched',titleStyle:'pill'},
    'Ocean companion':{palette:'ocean',pattern:'depths',frame:'double',effect:'shimmer',titleStyle:'minimal'},
    'Champion circuit':{palette:'gold',pattern:'royal',frame:'champion',effect:'sparkles',borderStyle:'double'},
    'Neon journey':{palette:'cobalt',pattern:'grid',frame:'neon',effect:'electric',titleStyle:'pill'},
    'Forest wanderer':{palette:'forest',pattern:'forest',frame:'rounded',effect:'particles'}
  };
  const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
  function normalize(value={}) {
    const result=defaults(); if(!value||typeof value!=='object')return result;
    for(const [key,options]of Object.entries(choices))if(options.includes(value[key]))result[key]=value[key];
    for(const key of ['accentColor','borderColor','frameColor'])result[key]=color(value[key]);
    for(const [key,max]of [['title',40],['motto',120]])if(typeof value[key]==='string')result[key]=value[key].slice(0,max);
    if(Array.isArray(value.pinnedBadges))result.pinnedBadges=[...new Set(value.pinnedBadges.filter(k=>typeof k==='string'&&/^[a-z0-9-]{1,64}$/.test(k)))].slice(0,3);
    return result;
  }
  const api={choices,defaults,labels,presets,color,normalize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.TrainerCardConfig=api;
})();
