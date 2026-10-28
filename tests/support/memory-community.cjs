// Isolated community adapter used only by tests; production always uses MySQL.
const crypto = require('node:crypto');
const { defaults } = require('../../server/community');
const { HttpError } = require('../../server/validation');
const logic = require('../../server/progression');
class MemoryCommunity {
  constructor(repo) { this.repo=repo;this.saved=new Map();this.shares=new Map();this.decorations=new Map(); }
  async decoration(id){return structuredClone(this.decorations.get(id)||require('../../server/decorations').defaults());}
  async earnedBadges(id){const keys=this.repo.awards.get(id)||new Map();return logic.definitions.filter(d=>keys.has(d.key)).map(({key,name,description,icon,rarity,category})=>({key,name,description,icon,rarity,category}));}
  async saveDecoration(id,value){const earned=new Set((await this.earnedBadges(id)).map(b=>b.key));if(value.pinnedBadges.some(key=>!earned.has(key)))throw new HttpError(400,'Only your earned achievements can be pinned.');this.decorations.set(id,structuredClone(value));return structuredClone(value);}
  async settings(id) { const s={...(this.saved.get(id)||defaults())};if(s.featuredTeamId&&!this.repo.savedTeams.some(t=>t.id===s.featuredTeamId))s.featuredTeamId=null;return s; }
  async saveSettings(id,value) {if(value.featuredTeamId!==null&&!this.repo.savedTeams.some(t=>t.id===value.featuredTeamId&&t.userId===id))throw new HttpError(404,'Featured team not found.');this.saved.set(id,{...value});return {...value};}
  async publicRoles(ids){const roles=new Map();for(const id of ids){if(!(await this.settings(id)).enabled)continue;const role=(await this.repo.administration.access(id)).role;if(['owner','administrator','moderator'].includes(role))roles.set(id,role);}return roles;}
  async findTrainer(name) {const u=this.repo.users.find(u=>u.username.toLowerCase()===name.toLowerCase());return u&&(await this.settings(u.id)).enabled?{...u}:null;}
  async directory(after,query='') {const all=[];for(const u of this.repo.users)if((await this.settings(u.id)).enabled&&u.username.toLowerCase().includes(query.toLowerCase()))all.push(u);all.sort((a,b)=>a.id-b.id);const rows=all.filter(u=>u.id>after),trainers=[],roles=await this.publicRoles(rows.slice(0,24).map(u=>u.id));for(const u of rows.slice(0,24)){const settings=await this.settings(u.id),teams=await this.publicTeams(u.id),featured=teams.find(t=>t.id===settings.featuredTeamId)||teams[0];trainers.push(require('../../server/community').directoryCard({...u,staffRole:roles.get(u.id),caughtCount:[...(this.repo.collections.get(u.id)?.values()||[])].filter(r=>r.status==='caught').length},settings,await this.decoration(u.id),teams.length,featured));}return {trainers,next:rows.length>24?rows[23].id:null,total:all.length};}
  owned(userId,id) {const t=this.repo.savedTeams.find(t=>t.id===id&&t.userId===userId);if(!t)throw new HttpError(404,'Team not found.');return t;}
  async teamSettings(userId,id){this.owned(userId,id);return {...(this.shares.get(id)||{visibility:'private',shareId:null})};}
  async share(userId,id,visibility){this.owned(userId,id);const result={visibility,shareId:this.shares.get(id)?.shareId||crypto.randomUUID()};this.shares.set(id,result);return {...result};}
  async publicTeams(id){return (await this.repo.teams(id)).filter(t=>this.shares.get(t.id)?.visibility==='public').map(t=>({...t,shareId:this.shares.get(t.id).shareId}));}
  async publicTeam(shareId){const team=this.repo.savedTeams.find(t=>this.shares.get(t.id)?.shareId===shareId&&this.shares.get(t.id)?.visibility==='public');if(!team)throw new HttpError(404,'Shared team unavailable.');const u=await this.repo.user(team.userId);return {name:team.name,username:u.username,profileAvailable:(await this.settings(u.id)).enabled,shareId,pokemonIds:[...team.pokemonIds]};}
  async publicProgress(id){const collection=[...(this.repo.collections.get(id)?.values()||[])],statistics=logic.statistics(collection);const saved=this.repo.awards.get(id)||new Map();return {statistics,achievements:logic.achievements(statistics,[],[...saved].map(([key,unlockedAt])=>({key,unlockedAt})))};}
}
module.exports={MemoryCommunity};
