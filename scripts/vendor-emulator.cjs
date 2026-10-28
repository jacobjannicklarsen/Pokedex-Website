'use strict';
// Explicit setup command only. Never runs during startup or copies private ROMs.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const version='4.2.3',base=`https://cdn.emulatorjs.org/${version}/data/`;
const files=['loader.js','emulator.min.js','emulator.min.css','cores/mgba-legacy-wasm.data','cores/reports/mgba.json','compression/extract7z.js'];
async function main(){
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'vendor/emulatorjs',version,'data'),manifestPath=path.join(root,'vendor/emulatorjs-4.2.3.manifest.json');
 let expected=null;try{expected=JSON.parse(await fs.readFile(manifestPath,'utf8'));}catch(e){if(!process.argv.includes('--record-manifest'))throw Error('The pinned emulator manifest is missing.');}
 const hashes={};for(const file of files){const r=await fetch(base+file,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Could not download pinned runtime: '+file+' ('+r.status+')');const bytes=Buffer.from(await r.arrayBuffer()),hash=crypto.createHash('sha256').update(bytes).digest('hex');if(expected&&expected.files[file]!==hash)throw Error('Pinned runtime integrity mismatch: '+file);const target=path.join(dir,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);hashes[file]=hash;console.log('Verified runtime asset:',file);}
 const response=await fetch('https://raw.githubusercontent.com/EmulatorJS/EmulatorJS/v4.2.3/LICENSE',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Could not download the pinned GPL license.');const license=await response.text();if(!license.includes('GNU GENERAL PUBLIC LICENSE'))throw Error('Unexpected emulator license response.');await fs.writeFile(path.join(dir,'LICENSE.txt'),license);
 if(!expected)await fs.writeFile(manifestPath,JSON.stringify({version,base,files:hashes},null,2)+'\n');
 console.log('Installed EmulatorJS '+version+' and mGBA; no ROMs or BIOS were downloaded.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
