'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),v=require('./validation');
// Existing filenames explicitly approved by the owner; never rename or modify the ROMs.
const games=Object.freeze([
 {id:'firered',title:'Pokémon FireRed',region:'Rediscover Kanto',description:'A familiar journey, a fresh beginning.',file:'Pokémon - FireRed Version.gba',color:'fire'},
 {id:'leafgreen',title:'Pokémon LeafGreen',region:'Return to Kanto',description:'Choose your partner and explore the Sevii Islands.',file:'Pokémon - LeafGreen Version.gba',color:'grass'},
 {id:'ruby',title:'Pokémon Ruby',region:'Adventure in Hoenn',description:'Follow the land and a new generation of discoveries.',file:'Pokemon - Ruby Version.gba',color:'ruby'},
 {id:'sapphire',title:'Pokémon Sapphire',region:'Explore Hoenn',description:'Set out across a region shaped by the sea.',file:'Pokémon - Sapphire Version.gba',color:'water'},
 {id:'emerald',title:'Pokémon Emerald',region:'A different side of Hoenn',description:'A third chapter with the Battle Frontier ahead.',file:'Pokémon - Emerald Version.gba',color:'emerald'},
 {id:'lightplatinum',title:'Pokémon Light Platinum',region:'A fan-made Ruby adventure',description:'The distinct GBA ROM hack associated with WesleyFG.',file:'Pokémon - Light Platinum Version.gba',color:'platinum'}
]);
const safeId=id=>games.find(g=>g.id===id);
function local(req,config){
 const socket=req.socket.remoteAddress||'',loopback=socket==='::1'||/^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(socket);
 const origin=new URL(config.origin),allowed=new Set(['localhost','127.0.0.1'].map(h=>h+(origin.port?':'+origin.port:'')));
 return config.gbaEnabled===true&&!config.production&&config.host==='127.0.0.1'&&!config.trustProxy&&loopback&&allowed.has(req.get('host')?.toLowerCase())&&(!req.get('origin')||req.get('origin')===config.origin)&&req.get('sec-fetch-site')!=='cross-site';
}
async function romFile(config,id){
 const game=safeId(id);if(!game)throw new v.HttpError(404,'Unknown game.');
 if(!config.gbaRomsDir)throw new v.HttpError(503,'The private ROM directory is not configured.');
 try{
  const dir=await fs.realpath(config.gbaRomsDir),file=await fs.realpath(path.join(dir,game.file)),relative=path.relative(dir,file);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new v.HttpError(403,'ROM unavailable.');
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size<192||stat.size>32*1024*1024)throw new v.HttpError(422,'The local ROM is not a supported GBA file.');
  return{game,file,stat};
 }catch(e){if(e.status)throw e;throw new v.HttpError(404,game.title+' is unavailable because its local ROM file could not be found.');}
}
function routes(app,{config,root}){
 const guard=(req,res,next)=>{if(!local(req,config))return next(new v.HttpError(404,'Private games are unavailable on this installation.'));if(req.staff?.role!=='owner'||req.staff.restriction)return next(new v.HttpError(403,'The local Owner account is required to play.'));next();};
 app.use('/api/local/gba',guard);
 app.get('/api/local/gba/games',async(req,res)=>{
  const items=[];for(const game of games){try{const rom=await romFile(config,game.id),fingerprint=crypto.createHash('sha256').update(await fs.readFile(rom.file)).digest('hex');items.push({id:game.id,available:true,fingerprint});}catch(e){items.push({id:game.id,available:false,message:e.status?e.message:'The local game is unavailable.'});}}res.json({games:items});
 });
 app.get('/api/local/gba/launch/:id',async(req,res)=>{
  if(Object.keys(req.query).length)v.fail('Unexpected game options.');const rom=await romFile(config,req.params.id);
  const fingerprint=crypto.createHash('sha256').update(await fs.readFile(rom.file)).digest('hex');
  try{await fs.access(path.join(root,'vendor/emulatorjs/4.2.3/data/loader.js'));}catch{throw new v.HttpError(503,'Install the emulator runtime with npm run vendor:emulator.');}
  res.json({id:rom.game.id,title:rom.game.title,fingerprint,romUrl:'/api/local/gba/rom/'+rom.game.id+'?revision='+fingerprint,playerUrl:'/api/local/gba/player?game='+rom.game.id,version:'4.2.3'});
 });
 app.get('/api/local/gba/rom/:id',async(req,res)=>{if(Object.keys(req.query).some(k=>k!=='revision')||req.query.revision!==undefined&&(typeof req.query.revision!=='string'||!/^[a-f0-9]{64}$/.test(req.query.revision)))v.fail('Unexpected ROM options.');const rom=await romFile(config,req.params.id),bytes=await fs.readFile(rom.file);if(req.query.revision&&crypto.createHash('sha256').update(bytes).digest('hex')!==req.query.revision)throw new v.HttpError(409,'The ROM revision changed. Reopen the game from the library.');res.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'inline','Cross-Origin-Resource-Policy':'same-origin','Content-Length':String(bytes.length)});res.end(bytes);});
 app.get('/api/local/gba/player',(req,res)=>{
  if(!safeId(req.query.game)||Object.keys(req.query).some(k=>k!=='game'))throw new v.HttpError(404,'Unknown game.');
  // Pinned mGBA's Emscripten bootstrap requires dynamic JS. This exception is confined
  // to the authenticated, local Owner player document; the main site's CSP is unchanged.
  res.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  res.sendFile(path.join(root,'gba-player.html'));
 });
 // Only pinned emulator runtime files are served. No ROM directory is ever mounted.
 app.get('/api/local/gba/runtime/*asset',async(req,res)=>{
  const segments=req.params.asset;if(!Array.isArray(segments)||segments.some(s=>!/^[A-Za-z0-9_.-]+$/.test(s)||s.startsWith('.')))throw new v.HttpError(404,'Runtime file unavailable.');
  const file=path.resolve(root,'vendor/emulatorjs/4.2.3/data',...segments),dir=path.resolve(root,'vendor/emulatorjs/4.2.3/data');
  if(!file.startsWith(dir+path.sep)||!['.js','.css','.data','.wasm','.json','.png','.svg','.woff2'].includes(path.extname(file)))throw new v.HttpError(404,'Runtime file unavailable.');
  res.sendFile(file,error=>{if(error&&!res.headersSent)res.status(404).json({error:'Runtime file unavailable. Run npm run vendor:emulator.'});});
 });
}
module.exports={games,local,romFile,routes};
