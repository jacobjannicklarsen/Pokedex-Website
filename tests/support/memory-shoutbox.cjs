const {Shoutbox}=require('../../server/shoutbox');
class MemoryShoutboxStore {
 constructor(repo){this.repo=repo;this.rows=[];this.sequence=0;this.available=true;}
 async list(before,limit){if(!this.available)throw Object.assign(Error('Missing table'),{code:'ER_NO_SUCH_TABLE'});return structuredClone(this.rows.filter(r=>!r.deletedAt&&r.id<before).sort((a,b)=>b.id-a.id).slice(0,limit));}
 async deleted(ids){return this.rows.filter(r=>r.deletedAt&&ids.includes(r.id)).map(r=>r.id);}
 async atomic(fn){return this.repo.administration.atomic(async()=>{const old=structuredClone({rows:this.rows,sequence:this.sequence,audit:this.repo.forums.store.data.audit});try{if(!this.available)throw Object.assign(Error('Missing table'),{code:'ER_NO_SUCH_TABLE'});return await fn(this);}catch(e){this.rows=old.rows;this.sequence=old.sequence;this.repo.forums.store.data.audit=old.audit;throw e;}});}
 access(id){return this.repo.administration.access(id);}
 async recent(id){return this.rows.filter(r=>r.userId===id&&Date.now()-+new Date(r.createdAt)<300000);}
 async insert(userId,message){const id=++this.sequence;this.rows.push({id,userId,message,createdAt:new Date().toISOString(),deletedAt:null});return id;}
 async get(id){return this.rows.find(r=>r.id===id);}
 async remove(id,actor){const row=await this.get(id);row.deletedAt=new Date().toISOString();row.deletedBy=actor;}
 async record(actor,target,id,reason){return this.repo.forums.store.insert('audit',{actorId:actor,targetUserId:target,action:'shoutbox.remove',reason,metadata:{messageId:id}});}
}
module.exports={MemoryShoutboxStore};
