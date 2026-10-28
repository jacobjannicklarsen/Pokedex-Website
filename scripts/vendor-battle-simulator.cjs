'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
async function main(){
 const root=path.resolve(__dirname,'..');
 await require('esbuild').build({entryPoints:[path.join(__dirname,'battle-simulator-entry.mjs')],outfile:path.join(root,'vendor/battle-simulator.js'),bundle:true,minify:true,keepNames:true,format:'iife',globalName:'DexhavenSimulator',platform:'browser',target:['es2022'],legalComments:'eof'});
 const license=path.join(path.dirname(require.resolve('@pkmn/sim')),'../../../LICENSE');
 // The package's built source contains attribution; retain the upstream MIT notice too.
 await fs.copyFile(license,path.join(root,'vendor/battle-simulator.LICENSE'));
 console.log('Built pinned, offline-capable Generation V simulator.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
