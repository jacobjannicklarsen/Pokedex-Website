(() => {
 'use strict';
 const games=['firered','leafgreen','ruby','sapphire','emerald','lightplatinum'];
 async function identity(game,fingerprint){
  if(!games.includes(game)||!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('Invalid game save identity.');
  const key=game+'-'+fingerprint,digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
  const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return{key,game,fingerprint,numeric:parseInt(hex.slice(0,12),16)};
 }
 function validate(buffer,name,identity){
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(!/\.sav$/i.test(name)||![512,8192,32768,65536,131072].some(n=>bytes.length>=n&&bytes.length<=n+16))throw Error('Use a raw GBA .sav file of a supported SRAM/Flash size, not an emulator save state.');
  const known=name.match(/^([a-z]+)-([a-f0-9]{64})\.sav$/i);
  if(known&&(known[1]!==identity.game||known[2]!==identity.fingerprint))throw Error('This backup belongs to another game or ROM revision.');
  return bytes;
 }
 function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('dexhaven-gba-backups',1);r.onupgradeneeded=()=>r.result.createObjectStore('saves',{keyPath:'key'});r.onerror=()=>reject(Error('Browser storage is unavailable. Export a save backup before leaving.'));r.onsuccess=()=>resolve(r.result);});}
 async function put(id,bytes){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put({...id,data:bytes,updatedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(Error('The local backup could not be saved.'));};});}
 async function get(key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('saves'),r=tx.objectStore('saves').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(Error('Save metadata is unavailable.'));tx.oncomplete=()=>db.close();});}
 async function checkStorage(){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite'),store=tx.objectStore('saves');store.put({key:'__storage_probe__',data:new Uint8Array(16)});store.delete('__storage_probe__');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(Error('Persistent browser storage is unavailable. Enable IndexedDB before playing.'));};});}
 function download(bytes,name){const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const api={identity,validate,put,get,checkStorage,download};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.GBASaves=api;
})();
