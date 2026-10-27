// Isolated community adapter used only by tests; production always uses MySQL.
const crypto = require('node:crypto');
const { defaults } = require('../../server/community');
const { HttpError } = require('../../server/validation');
const logic = require('../../server/progression');
class MemoryCommunity {
  constructor(repo) { this.repo=repo;this.saved=new Map();this.shares=new Map(); }
  async settings(id) { const s={...(this.saved.get(id)||defaults())};if(s.featuredTeamId&&!this.repo.savedTeams.some(t=>t.id===s.featuredTeamId))s.featuredTeamId=null;return s; }
  async saveSettings(id,value) {if(value.featuredTeamId!==null&&!this.repo.savedTeams.some(t=>t.id===value.featuredTeamId&&t.userId===id))throw new HttpError(404,'Featured team not found.');this.saved.set(id,{...value});return {...value};}
  async findTrainer(name) {const u=this.repo.users.find(u=>u.username.toLowerCase()===name.toLowerCase());return u&&(await this.settings(u.id)).enabled?{...u}:null;}
  async directory(after,limit=24) {const rows=[];for(const u of this.repo.users)if(u.id>after&&(await this.settings(u.id)).enabled)rows.push(u);rows.sort((a,b)=>a.id-b.id);return {trainers:rows.slice(0,limit).map(u=>({username:u.username})),next:rows.length>limit?rows[limit-1].id:null};}
  owned(userId,id) {const t=this.repo.savedTeams.find(t=>t.id===id&&t.userId===userId);if(!t)throw new HttpError(404,'Team not found.');return t;}
  async teamSettings(userId,id){this.owned(userId,id);return {...(this.shares.get(id)||{visibility:'private',shareId:null})};}
  async share(userId,id,visibility){this.owned(userId,id);const result={visibility,shareId:this.shares.get(id)?.shareId||crypto.randomUUID()};this.shares.set(id,result);return {...result};}
  async publicTeams(id){return (await this.repo.teams(id)).filter(t=>this.shares.get(t.id)?.visibility==='public').map(t=>({...t,shareId:this.shares.get(t.id).shareId}));}
  async publicTeam(shareId){const team=this.repo.savedTeams.find(t=>this.shares.get(t.id)?.shareId===shareId&&this.shares.get(t.id)?.visibility==='public');if(!team)throw new HttpError(404,'Shared team unavailable.');const u=await this.repo.user(team.userId);return {name:team.name,username:u.username,profileAvailable:(await this.settings(u.id)).enabled,shareId,pokemonIds:[...team.pokemonIds]};}
  async publicProgress(id){const collection=[...(this.repo.collections.get(id)?.values()||[])],statistics=logic.statistics(collection);const saved=this.repo.awards.get(id)||new Map();return {statistics,achievements:logic.achievements(statistics,[],[...saved].map(([key,unlockedAt])=>({key,unlockedAt})))};}
}
module.exports={MemoryCommunity};
