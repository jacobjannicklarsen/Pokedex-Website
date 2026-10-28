'use strict';
// SQL identifiers come only from this fixed map. All values are bound parameters.
const definitions={
 categories:'id name description announcements active position',
 threads:'id categoryId authorId title locked pinned visibility version createdAt updatedAt',
 posts:'id threadId authorId body teamShareId quotePostId visibility version createdAt editedAt',
 reactions:'id postId userId createdAt',subscriptions:'id threadId userId createdAt',
 reports:'id threadId postId reporterId reason status resolvedBy resolution createdAt resolvedAt',
 audit:'id actorId targetUserId threadId postId action reason metadata createdAt',
 notifications:'id userId threadId postId eventKey kind readAt createdAt'
};
const tables={notifications:'user_notifications',audit:'forum_audit_logs',...Object.fromEntries(Object.keys(definitions).filter(k=>!['notifications','audit'].includes(k)).map(k=>[k,'forum_'+k]))};
const snake=s=>s.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
const column=(t,k)=>{if(!definitions[t]?.split(' ').includes(k))throw Error('Invalid internal forum column');return '`'+snake(k)+'`';};
class ForumStore{
 constructor(pool,repo,connection=null){this.pool=pool;this.repo=repo;this.connection=connection;}
 get db(){return this.connection||this.pool;}
 async ready(){const [rows]=await this.db.execute('SELECT schema_version FROM forum_state WHERE id = 1');if(rows[0]?.schema_version!==1)throw new(require('./validation').HttpError)(503,'Forums require the complete manual v0.7.0 migration.');}
 async atomic(fn){const c=await this.pool.getConnection();try{await c.beginTransaction();await this.ready();if(!await this.repo.administration.ready(c,true))throw new(require('./validation').HttpError)(503,'Forums require the manual v0.6.2 administration migration.');const store=new ForumStore(this.pool,this.repo,c);const result=await fn(store);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
 async access(id){return{id,...await this.repo.administration.access(id,this.db,true)};}
 where(t,where){const params=[];const sql=Object.entries(where).map(([k,value])=>{const col=column(t,k);if(Array.isArray(value)){if(!value.length)return'0=1';params.push(...value);return`${col} IN (${value.map(()=>'?').join(',')})`;}if(value===null)return`${col} IS NULL`;params.push(value);return`${col} = ?`;}).join(' AND ')||'1=1';return{sql,params};}
 async rows(t,where={},options={}){const {sql,params}=this.where(t,where);const order=options.order||'id',direction=options.desc?'DESC':'ASC',limit=Math.min(options.limit||30,2000),offset=options.offset||0;const [rows]=await this.db.execute(`SELECT ${definitions[t].split(' ').map(k=>`${column(t,k)} AS \`${k}\``).join(', ')} FROM ${tables[t]} WHERE ${sql} ORDER BY ${column(t,order)} ${direction} LIMIT ? OFFSET ?${this.connection&&options.lock?' FOR UPDATE':''}`,[...params,limit,offset]);return rows;}
 async get(t,id){return(await this.rows(t,{id},{limit:1,lock:true}))[0]||null;}
 async count(t,where={}){const {sql,params}=this.where(t,where);const [rows]=await this.db.execute(`SELECT COUNT(*) AS total FROM ${tables[t]} WHERE ${sql}`,params);return Number(rows[0].total);}
 async postPage(threadId,postId){const [rows]=await this.db.execute('SELECT COUNT(*) AS total FROM forum_posts WHERE thread_id = ? AND id <= ?',[threadId,postId]);return Math.max(1,Math.ceil(Number(rows[0].total)/20));}
 async insert(t,value,ignore=false){const keys=Object.keys(value),[r]=await this.db.execute(`INSERT ${ignore?'IGNORE ':''}INTO ${tables[t]} (${keys.map(k=>column(t,k)).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,keys.map(k=>k==='metadata'?JSON.stringify(value[k]):value[k]));return r.insertId;}
 async update(t,id,value){const keys=Object.keys(value);await this.db.execute(`UPDATE ${tables[t]} SET ${keys.map(k=>column(t,k)+' = ?').join(',')} WHERE id = ?`,[...keys.map(k=>value[k]),id]);}
 async remove(t,where){if(!['reactions','subscriptions'].includes(t))throw Error('Forum content is retained');const{sql,params}=this.where(t,where);await this.db.execute(`DELETE FROM ${tables[t]} WHERE ${sql}`,params);}
 async threads({page,sort,q,categoryId}){const pattern='%'+q.replace(/[=%_]/g,'=$&')+'%',params=[pattern,...(categoryId?[categoryId]:[])],where="t.visibility = 'visible' AND t.title LIKE ? ESCAPE '='"+(categoryId?' AND t.category_id = ?':'');const [count]=await this.db.execute(`SELECT COUNT(*) AS total FROM forum_threads t WHERE ${where}`,params);const orders={activity:'activity DESC, t.id DESC',newest:'t.id DESC',replies:'replies DESC, t.id DESC'};
 const [rows]=await this.db.execute(`SELECT t.id, (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id AND p.visibility = 'visible') AS posts, (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' AND p.id <> (SELECT MIN(first.id) FROM forum_posts first WHERE first.thread_id = t.id)) AS replies, GREATEST(t.updated_at, COALESCE((SELECT MAX(p.created_at) FROM forum_posts p WHERE p.thread_id = t.id AND p.visibility = 'visible'),t.created_at)) AS activity FROM forum_threads t WHERE ${where} ORDER BY t.pinned DESC, ${orders[sort]} LIMIT 21 OFFSET ?`,[...params,(page-1)*20]);return{items:rows.slice(0,20),next:rows.length>20?page+1:null,total:Number(count[0].total)};}
 async categoryStats(){const[rows]=await this.db.execute("SELECT c.id, COUNT(DISTINCT t.id) AS threads, COUNT(p.id) AS posts, COALESCE(SUM(CASE WHEN p.id <> (SELECT MIN(first.id) FROM forum_posts first WHERE first.thread_id = t.id) THEN 1 ELSE 0 END),0) AS replies, MAX(p.created_at) AS activity FROM forum_categories c LEFT JOIN forum_threads t ON t.category_id=c.id AND t.visibility='visible' LEFT JOIN forum_posts p ON p.thread_id=t.id AND p.visibility='visible' GROUP BY c.id");return rows;}
 async notify(threadId,postId,actorId,mentions){await this.db.execute(`INSERT IGNORE INTO user_notifications (user_id,thread_id,post_id,event_key,kind) SELECT u.id, ?, ?, ?, CASE WHEN u.username IN (${mentions.length?mentions.map(()=>'?').join(','):"''"}) THEN 'mention' ELSE 'reply' END FROM users u WHERE u.id <> ? AND (u.id = (SELECT author_id FROM forum_threads WHERE id = ?) OR u.id IN (SELECT user_id FROM forum_subscriptions WHERE thread_id = ?)${mentions.length?` OR u.username IN (${mentions.map(()=>'?').join(',')})`:''})`,[threadId,postId,'post:'+postId,...mentions,actorId,threadId,threadId,...mentions]);}
}
module.exports={ForumStore,definitions};
