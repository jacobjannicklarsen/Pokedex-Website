const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {MusicLibrary,byteRange,titleFromFile}=require('../server/music'),setup=require('./support/app-fixture.cjs'),lib=require('../music-library'),{configFromEnv}=require('../server/config');
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dexhaven-music-test-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));await fs.rm(dir,{recursive:true,force:true});});return dir;}
test('music configuration is independently enabled only for explicit private development',()=>{
 const env={NODE_ENV:'development',DB_USER:'fixture',SESSION_SECRET:'x'.repeat(60),DEXHAVEN_ENABLE_MUSIC:'true',DEXHAVEN_MUSIC_DIR:'./private-music'};
 const c=configFromEnv(env);assert.equal(c.musicEnabled,true);assert.equal(c.gbaEnabled,false);assert.equal(c.musicDir,path.resolve('private-music'));
 for(const extra of [{NODE_ENV:'production',APP_ORIGIN:'https://example.test'},{HOST:'0.0.0.0'},{TRUST_PROXY:'true'},{DEXHAVEN_ENABLE_MUSIC:'false'},{APP_ORIGIN:'http://example.test:3000'},{NODE_ENV:'test'}])assert.equal(configFromEnv({...env,...extra}).musicEnabled,false);
});
test('recursive music discovery filters formats, derives titles/playlists, caches/rescans and omits paths',async t=>{
 const dir=await directory(t);await fs.mkdir(path.join(dir,'Kanto'));await fs.mkdir(path.join(dir,'Johto'));for(const f of ['Kanto/PalletTown.mp3','Johto/New_Bark_Town.ogg','Other-Track.FLAC','Sample.m4a','Sample.wav','ignored.exe'])await fs.writeFile(path.join(dir,f),Buffer.alloc(100));
 const library=new MusicLibrary(dir),a=await library.scan();assert.equal(a.tracks.length,5);assert.deepEqual(a.playlists,['Johto','Kanto']);assert.equal(a.tracks.find(t=>t.filename==='PalletTown.mp3').title,'Pallet Town');assert.ok(!JSON.stringify(a).includes(dir));assert.ok(a.tracks.every(t=>/^[a-f0-9]{64}$/.test(t.id)));assert.equal(titleFromFile('Littleroot_Town.mp3'),'Littleroot Town');
 await fs.writeFile(path.join(dir,'Fresh.wav'),Buffer.alloc(100));assert.equal((await library.scan()).tracks.length,5);const b=await library.scan(true);assert.equal(b.tracks.length,6);assert.equal(a.tracks[0].id,b.tracks.find(t=>t.filename===a.tracks[0].filename).id);
 await assert.rejects(new MusicLibrary(null).scan(),e=>e.status===503);await assert.rejects(new MusicLibrary(path.join(dir,'missing')).scan(),e=>e.status===503&&!e.message.includes(dir));await assert.rejects(library.open('../.env'),e=>e.status===404);
});
test('bounded ID3 titles take precedence over filenames without changing audio bytes',async t=>{
 const dir=await directory(t),body=Buffer.from('\x03An embedded title\x00'),frame=Buffer.alloc(10);frame.write('TIT2');frame.writeUInt32BE(body.length,4);const header=Buffer.from([73,68,51,3,0,0,0,0,0,0]);header[9]=frame.length+body.length;const original=Buffer.concat([header,frame,body,Buffer.alloc(128)]),file=path.join(dir,'FileName.mp3');await fs.writeFile(file,original);assert.equal((await new MusicLibrary(dir).scan()).tracks[0].title,'An embedded title');assert.deepEqual(await fs.readFile(file),original);
});
test('music range parsing supports bounded/open/suffix ranges and rejects malformed or unsatisfiable requests',()=>{
 assert.equal(byteRange(undefined,100),null);assert.deepEqual(byteRange('bytes=0-9',100),{start:0,end:9});assert.deepEqual(byteRange('bytes=80-',100),{start:80,end:99});assert.deepEqual(byteRange('bytes=-20',100),{start:80,end:99});assert.deepEqual(byteRange('bytes=0-999',100),{start:0,end:99});
 for(const r of ['bytes=100-','bytes=20-10','bytes=-0','bytes=0-1,5-6','bytes=-','garbage','bytes=9007199254740993-'])assert.throws(()=>byteRange(r,100),e=>e.status===416);
});
test('music routes allow signed-in trainers and enforce local origin, safe metadata, MIME, length, HEAD and byte ranges',async t=>{
 const dir=await directory(t),bytes=Buffer.from(Array.from({length:256},(_,i)=>i));await fs.writeFile(path.join(dir,'Sample.mp3'),bytes);
 const s=await setup(t,{host:'127.0.0.1',musicEnabled:true,musicDir:dir,fixtureLocalOrigin:true}),owner=await s.register('music_owner'),trainer=await s.register('music_trainer');await s.repo.administration.bootstrapOwner(owner.user.id);
 assert.equal((await s.client().call('/api/local/music/tracks')).status,401);assert.equal((await trainer.c.call('/api/local/music/tracks')).status,200);
 const catalog=await owner.c.call('/api/local/music/tracks');assert.equal(catalog.status,200);assert.ok(!JSON.stringify(catalog.data).includes(dir));const id=catalog.data.tracks[0].id;
 assert.equal((await trainer.c.call('/api/local/music/stream/'+id,{headers:{Range:'bytes=12-21'},raw:true})).status,206);
 assert.equal((await s.client().call('/api/local/music/stream/'+id,{raw:true})).status,401);
 assert.equal((await owner.c.call('/api/local/music/tracks',{headers:{Origin:'https://evil.test'}})).status,404);
 assert.equal((await owner.c.call('/api/local/music/stream/'+id+'?path=.env')).status,400);assert.equal((await owner.c.call('/api/local/music/stream/bad')).status,404);assert.equal((await owner.c.call('/Dexhaven-Music/Sample.mp3',{raw:true})).status,404);
 // Obtain the fixture session cookie without bypassing the real session/CSRF stack.
 const login=await fetch(s.base+'/api/auth/session'),initial=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];const response=await fetch(s.base+'/api/auth/login',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':initial.csrfToken},body:JSON.stringify({identifier:'music_owner',password:'staff security test password'})});const auth=response.headers.get('set-cookie').split(';')[0];
 const url=s.base+'/api/local/music/stream/'+id,headers={Cookie:auth};let r=await fetch(url,{headers:{...headers,Range:'bytes=12-21'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'audio/mpeg');assert.equal(r.headers.get('content-length'),'10');assert.equal(r.headers.get('content-range'),'bytes 12-21/256');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(12,22));
 r=await fetch(url,{method:'HEAD',headers});assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),'256');assert.equal((await r.arrayBuffer()).byteLength,0);
 r=await fetch(url,{headers:{...headers,Range:'bytes=999-'}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */256');await r.arrayBuffer();
 await fs.unlink(path.join(dir,'Sample.mp3'));assert.equal((await owner.c.call('/api/local/music/stream/'+id,{raw:true})).status,404);
});
test('music endpoints fail closed on disabled/production/proxied deployments without affecting public pages',async t=>{
 for(const extra of [{musicEnabled:false},{production:true},{trustProxy:true},{host:'0.0.0.0'}]){const s=await setup(t,{host:'127.0.0.1',musicEnabled:true,fixtureLocalOrigin:true}),owner=await s.register('disabled_music');await s.repo.administration.bootstrapOwner(owner.user.id);Object.assign(s.config,extra);assert.equal((await owner.c.call('/api/local/music/tracks')).status,404);assert.equal((await owner.c.call('/',{raw:true})).status,200);}
});
test('music discovery and streaming reject symlink escapes including replacements after indexing',async t=>{
 const dir=await directory(t),outside=await directory(t);await fs.writeFile(path.join(outside,'secret.mp3'),Buffer.alloc(100));
 try{await fs.symlink(outside,path.join(dir,'escape'),'junction');}catch(e){if(e.code==='EPERM'){t.skip('This Windows account cannot create symlinks/junctions.');return;}throw e;}
 const library=new MusicLibrary(dir);assert.equal((await library.scan()).tracks.length,0);await fs.mkdir(path.join(dir,'safe'));await fs.writeFile(path.join(dir,'safe','secret.mp3'),Buffer.alloc(100));const id=(await library.scan(true)).tracks[0].id;await fs.unlink(path.join(dir,'safe','secret.mp3'));await fs.rmdir(path.join(dir,'safe'));
 await fs.symlink(outside,path.join(dir,'safe'),'junction');await assert.rejects(library.open(id),e=>e.status===404);
});
test('queue modes preserve order/history, repeat correctly and avoid immediate shuffle repeats',()=>{
 const ids=['a','b','c'],q=new lib.Queue(ids,{repeat:'off'});assert.equal(q.current,'a');assert.equal(q.advance(),'b');assert.equal(q.advance(-1),'a');q.select('c');assert.equal(q.advance(),null);q.repeat='one';assert.equal(q.advance(1,true),'c');assert.equal(q.advance(),null);q.repeat='all';assert.equal(q.advance(),'a');q.setShuffle(true);assert.equal(q.current,'a');const seen=new Set([q.current,q.advance(),q.advance()]);assert.equal(seen.size,3);const last=q.current;assert.notEqual(q.advance(),last);const next=q.current;q.advance();assert.equal(q.advance(-1),next);assert.equal(new lib.Queue([]).advance(),null);
});
test('music preferences validate values and tolerate missing, blocked or corrupt browser storage',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};assert.equal(lib.read(storage).volume,.35);const state={enabled:true,playing:true,volume:.7,muted:true,playlist:'Kanto',track:'a'.repeat(64),position:23,repeat:'one',shuffle:true,order:['a'.repeat(64)]};assert.equal(lib.write(storage,state),true);assert.deepEqual(lib.read(storage),lib.normalize(state));memory.set(lib.KEY,'broken');assert.equal(lib.read(storage).enabled,false);assert.equal(lib.write(undefined,state),false);assert.equal(lib.read(undefined).volume,.35);assert.equal(lib.normalize({volume:5,repeat:'bad',position:-4}).volume,1);assert.equal(lib.normalize({repeat:'bad'}).repeat,'all');
});
