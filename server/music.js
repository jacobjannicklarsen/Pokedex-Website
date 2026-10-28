'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{pipeline}=require('node:stream/promises'),{HttpError}=require('./validation');
const formats={'.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.m4a':'audio/mp4','.flac':'audio/flac'};
const inside=(root,file)=>{const relative=path.relative(root,file);return Boolean(relative)&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
const titleFromFile=file=>path.basename(file,path.extname(file)).replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+/g,' ').trim()||'Untitled track';
// Bounded ID3v2.3/2.4 title reader. Unrecognized tags safely fall back to filenames.
async function embeddedTitle(file){
 let handle;try{handle=await fs.open(file,'r');const b=Buffer.alloc(65536),{bytesRead}=await handle.read(b,0,b.length,0);if(b.toString('ascii',0,3)!=='ID3'||![3,4].includes(b[3])||(b[5]&0xc0))return null;
  for(let at=10;at+10<bytesRead;){const name=b.toString('ascii',at,at+4),size=b[3]===4?((b[at+4]&127)*2097152+(b[at+5]&127)*16384+(b[at+6]&127)*128+(b[at+7]&127)):b.readUInt32BE(at+4);if(!/^[A-Z0-9]{4}$/.test(name)||size<1||at+10+size>bytesRead)break;
   if(name==='TIT2'&&b[at+8]===0&&b[at+9]===0){const raw=b.subarray(at+11,at+10+size);let text;if(b[at+10]===0)text=raw.toString('latin1');else if(b[at+10]===3)text=raw.toString('utf8');else if(b[at+10]===1&&raw[0]===255&&raw[1]===254)text=raw.subarray(2).toString('utf16le');if(text)return text.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,250)||null;}at+=10+size;
  }
 }catch{}finally{await handle?.close();}return null;
}
class MusicLibrary{
 constructor(directory){this.directory=directory;this.files=new Map();this.catalog=null;this.expires=0;this.pending=null;}
 async scan(force=false){
  if(this.pending)return this.pending;if(!force&&this.catalog&&Date.now()<this.expires)return this.catalog;
  this.pending=this.discover();try{return await this.pending;}finally{this.pending=null;}
 }
 async discover(){
  if(!this.directory)throw new HttpError(503,'The private music folder is not configured.');
  let root;try{root=await fs.realpath(this.directory);if(!(await fs.stat(root)).isDirectory())throw Error();}catch{throw new HttpError(503,'The private music folder is unavailable.');}
  const tracks=[],files=new Map();let visited=0;
  const walk=async(dir,relative='')=>{let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{throw new HttpError(503,'The music collection could not be read.');}
   for(const entry of entries){if(++visited>20000)throw new HttpError(503,'The music collection is too large to index.');if(entry.isSymbolicLink())continue;const name=path.join(relative,entry.name),file=path.join(root,name);if(entry.isDirectory()){await walk(file,name);continue;}const ext=path.extname(entry.name).toLowerCase();if(!entry.isFile()||!formats[ext])continue;
    try{const real=await fs.realpath(file);if(!inside(root,real))continue;const stat=await fs.stat(real);if(!stat.isFile()||stat.size===0)continue;const id=crypto.createHash('sha256').update(name.split(path.sep).join('/')).digest('hex');const folder=relative.split(path.sep)[0];
     tracks.push({id,title:ext==='.mp3'?await embeddedTitle(real)||titleFromFile(entry.name):titleFromFile(entry.name),filename:entry.name,playlist:folder||null,format:ext.slice(1),mime:formats[ext],duration:null});files.set(id,{relative:name});
    }catch(e){if(e.status)throw e;/* A file removed during discovery is omitted. */}
   }
  };
  await walk(root);tracks.sort((a,b)=>(a.playlist||'').localeCompare(b.playlist||'')||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  this.files=files;this.catalog={tracks,playlists:[...new Set(tracks.map(t=>t.playlist).filter(Boolean))].sort(),refreshedAt:new Date().toISOString()};this.expires=Date.now()+30000;return this.catalog;
 }
 async open(id){
  if(!/^[a-f0-9]{64}$/.test(id))throw new HttpError(404,'Track unavailable.');await this.scan();let entry=this.files.get(id);if(!entry){await this.scan(true);entry=this.files.get(id);}if(!entry)throw new HttpError(404,'Track unavailable. Refresh the music library.');
  let handle;try{const root=await fs.realpath(this.directory),file=await fs.realpath(path.join(root,entry.relative));if(!inside(root,file))throw new HttpError(404,'Track unavailable.');handle=await fs.open(file,'r');const stat=await handle.stat();if(!stat.isFile()||!stat.size)throw new HttpError(404,'Track unavailable.');return{handle,size:stat.size,mime:formats[path.extname(entry.relative).toLowerCase()]};}catch(e){await handle?.close();if(e.status)throw e;throw new HttpError(404,'Track unavailable. Refresh the music library.');}
 }
}
function byteRange(value,size){
 if(value===undefined)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||(!match[1]&&!match[2]))throw new HttpError(416,'Requested audio range is unavailable.');
 let start,end;if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new HttpError(416,'Requested audio range is unavailable.');start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)throw new HttpError(416,'Requested audio range is unavailable.');return{start,end};
}
function routes(app,{config}){
 const library=new MusicLibrary(config.musicDir);
 app.use('/api/local/music',(req,res,next)=>{if(!require('./private-local').local(req,config,config.musicEnabled))return next(new HttpError(404,'Private music is unavailable on this installation.'));if(req.staff?.role!=='owner'||req.staff.restriction)return next(new HttpError(403,'The local Owner account is required for music.'));next();});
 app.get('/api/local/music/tracks',async(req,res)=>{if(Object.keys(req.query).some(k=>k!=='refresh')||(req.query.refresh!==undefined&&req.query.refresh!=='1'))throw new HttpError(400,'Invalid music options.');res.json(await library.scan(req.query.refresh==='1'));});
 app.get('/api/local/music/stream/:id',async(req,res,next)=>{
  if(Object.keys(req.query).length)throw new HttpError(400,'Invalid music options.');const file=await library.open(req.params.id);let handedOff=false;
  try{res.set({'Content-Type':file.mime,'Accept-Ranges':'bytes','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'});let range;try{range=byteRange(req.get('range'),file.size);}catch(e){res.set('Content-Range','bytes */'+file.size);throw e;}
   const start=range?.start||0,end=range?.end??file.size-1;res.status(range?206:200).set('Content-Length',String(end-start+1));if(range)res.set('Content-Range',`bytes ${start}-${end}/${file.size}`);
   if(req.method==='HEAD'){res.end();return;}const stream=file.handle.createReadStream({start,end,autoClose:true});handedOff=true;try{await pipeline(stream,res);}catch(e){if(!res.destroyed)next(new HttpError(503,'Audio streaming was interrupted.'));}
  }finally{if(!handedOff)await file.handle.close();}
 });
 return library;
}
module.exports={MusicLibrary,byteRange,titleFromFile,routes,formats};
