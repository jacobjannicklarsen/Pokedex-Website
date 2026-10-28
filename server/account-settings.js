'use strict';
const v=require('./validation'),rules=require('./settings-validation');
const decode=(v,fallback)=>{if(typeof v==='string'){try{return JSON.parse(v);}catch{return fallback;}}return v??fallback;};
const defaults=()=>({id:null,profile:rules.profileDefaults(),privacy:rules.privacyDefaults(),notifications:rules.notificationDefaults(),preferences:{theme:'system',battleDifficulty:'normal'},bannerFilename:null,securityVersion:0,lastActiveAt:null});
class AccountSettings{
 constructor(repo,store){this.repo=repo;this.store=store;}
 normalize(row){const d=defaults();if(!row)return d;return{...d,...row,...Object.fromEntries(['profile','privacy','notifications','preferences'].map(k=>[k,{...d[k],...decode(row[k],{})}]))};}
 async row(id,s=this.store){if(!await s.available())return defaults();return this.normalize((await s.rows('settings',{userId:id},{limit:1}))[0]);}
 async securityVersion(id){try{return Number((await this.store.rows('settings',{userId:id},{limit:1}))[0]?.securityVersion||0);}catch(e){if(e.code!=='ER_NO_SUCH_TABLE')throw e;if(await this.store.available())throw e;return 0;}}
 async owned(s,id){let row=await this.row(id,s);if(!row.id){const{profile,privacy,notifications,preferences}=defaults();const key=await s.insert('settings',{userId:id,profile,privacy,notifications,preferences,securityVersion:0});row={...row,id:key,userId:id};}return row;}
 async view(id){const r=await this.row(id);return{profile:r.profile,privacy:r.privacy,notifications:r.notifications,preferences:r.preferences,bannerUrl:r.bannerFilename?'/media/banners/'+r.bannerFilename:null};}
 async save(id,key,value){return this.store.atomic(async s=>{await this.repo.forums.actor(s,id);const r=await this.owned(s,id);await s.update('settings',r.id,{[key]:value,updatedAt:new Date()});if(key==='privacy'&&!value.presence)await s.update('settings',r.id,{lastActiveAt:null});if(key==='privacy'&&!value.acceptFollowers){/* Existing followers remain; new follows are denied. */}return{saved:true};});}
 async banner(id,filename){return this.store.atomic(async s=>{await this.repo.forums.actor(s,id);const r=await this.owned(s,id);await s.update('settings',r.id,{bannerFilename:filename,updatedAt:new Date()});return r.bannerFilename;});}
 async activity(id){return this.store.atomic(async s=>{await this.repo.forums.actor(s,id);const r=await this.row(id,s);if(r.id&&r.privacy.presence)await s.update('settings',r.id,{lastActiveAt:new Date()});return{tracked:r.privacy.presence};});}
 async credentials(id,expected,newHash=null){return this.store.atomic(async s=>{await this.repo.forums.actor(s,id);const r=await this.owned(s,id);if(newHash)await s.credential(id,expected,newHash);else{const current=await this.repo.findLogin((await this.repo.user(id)).username);if(current.password_hash!==expected)throw new v.HttpError(409,'Credentials changed. Please try again.');}const version=Number(r.securityVersion)+1;await s.update('settings',r.id,{securityVersion:version});return version;});}
 async publicFields(userId,publicSettings){if(!publicSettings.enabled)return{};const row=await this.row(userId),p=row.profile,a=row.privacy,details={};
  if(p.birthday&&a.birthday!=='hidden'){details.birthday=a.birthday==='full'?p.birthday:p.birthday.slice(5);details.birthdayVisibility=a.birthday;if(a.birthday==='full'){const now=new Date(),birth=new Date(p.birthday+'T00:00:00Z');details.age=now.getUTCFullYear()-birth.getUTCFullYear()-((now.getUTCMonth()*100+now.getUTCDate())<(birth.getUTCMonth()*100+birth.getUTCDate())?1:0);}}
  for(const k of ['location','occupation','website'])if(a[k]&&p[k])details[k]=p[k];
  if(a.gender&&p.gender!=='unspecified')details.gender=p.gender==='self-describe'?p.genderText:p.gender;
  if(a.social&&p.social?.length)details.social=p.social.map(({label,url})=>({label,url}));
  const result={};if(Object.keys(details).length)result.details=details;
  if(a.banner&&row.bannerFilename)result.bannerUrl=`/api/public/trainers/${encodeURIComponent((await this.repo.user(userId)).username)}/banner`;
  if(a.activity){result.activity=await this.store.activity(userId);result.recentDiscussions=(await this.store.latest(1,{userId,limit:3})).items.map(p=>({threadId:p.threadId,title:p.title,createdAt:p.createdAt}));}
  if(a.followers)result.followerCount=await this.store.count('follows',{targetId:userId});return result;
 }
}
module.exports={AccountSettings,defaults};
