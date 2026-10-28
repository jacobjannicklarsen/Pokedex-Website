'use strict';
// Manual build only: explicitly selects public source/assets, never visits the ROM folder.
const fs=require('node:fs/promises'),path=require('node:path');
async function build(root=path.resolve(__dirname,'..')){
 const out=path.resolve(root,'preview-dist');
 if(path.dirname(out)!==root||path.basename(out)!=='preview-dist')throw Error('Unexpected preview target.');
 try{await fs.access(out);if((await fs.lstat(out)).isSymbolicLink()||path.relative(await fs.realpath(root),await fs.realpath(out))!=='preview-dist')throw Error('Preview target is outside the intended workspace.');await fs.access(path.join(out,'.dexhaven-preview'));await fs.rm(out,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;try{await fs.access(out);throw Error('Existing preview directory has no build marker; move it manually.');}catch(check){if(check.code!=='ENOENT')throw check;}}
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'.dexhaven-preview'),'Generated public files only. No ROMs.\n');
 const copy=async file=>{const target=path.join(out,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,file),target);};
 for(const file of await fs.readdir(root))if(/\.(?:html|css|js)$/.test(file)&&file!=='gba-player.html')await copy(file);
 for(const file of ['data/pokemon-summary.json','data/type-chart.json','data/battle-v5.json','data/sprite-availability.json','vendor/chart.umd.js','vendor/battle-simulator.js','vendor/battle-simulator.LICENSE','artwork-fallback.svg'])await copy(file);
 for(const file of await fs.readdir(path.join(root,'images')))if(/\.(?:png|svg|webp|jpg|gif)$/i.test(file))await copy('images/'+file);
 console.log('Prepared preview-dist using a public file allowlist. No deployment was performed.');return out;
}
if(require.main===module)build().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={build};
