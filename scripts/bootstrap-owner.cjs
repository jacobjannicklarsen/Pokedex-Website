// Explicit local action only. Never imported by startup, setup-db or the web API.
const {id}=require('../server/validation');
function parse(args){
 if(args.length!==4||args[0]!=='--user-id'||args[2]!=='--confirm-owner')throw Error('Usage: npm.cmd run admin:bootstrap -- --user-id 123 --confirm-owner 123');
 const selected=id(args[1]);if(String(selected)!==args[3])throw Error('The confirmation must repeat the selected existing account ID.');return selected;
}
async function main(){
 const userId=parse(process.argv.slice(2));
 const pool=require('mysql2/promise').createPool(require('../server/config').configFromEnv().db);
 try{const result=await new(require('../server/admin-repository').AdminRepository)(pool).bootstrapOwner(userId);console.log(`Protected Owner assigned to existing account #${result.id} (${result.username}). Audit record committed.`);}finally{await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error('Owner bootstrap failed:',error.message);process.exitCode=1;});
module.exports={parse};
