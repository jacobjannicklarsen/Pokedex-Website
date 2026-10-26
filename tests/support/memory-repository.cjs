// Test fixture only. Production always constructs Repository + MySQLSessionStore.
const { HttpError } = require('../../server/validation');
class MemoryRepository {
  constructor() { this.users = []; this.savedTeams = []; this.savedFavorites = new Map(); this.sequence = 0; }
  async user(id) { const user = this.users.find(user => user.id === id); return user ? { ...user } : null; }
  async findLogin(identifier) { return this.users.find(user => [user.username,user.email].some(value => value.toLowerCase() === identifier.toLowerCase())) || null; }
  async createUser(data, hash) {
    if (this.users.some(user => user.username.toLowerCase() === data.username.toLowerCase() || user.email.toLowerCase() === data.email.toLowerCase())) { const error = Error('Duplicate'); error.code = 'ER_DUP_ENTRY'; throw error; }
    const user = { id: ++this.sequence, username: data.username, email: data.email, password_hash: hash, bio: '', avatar_filename: null, created_at: new Date().toISOString() };
    this.users.push(user); return { ...user };
  }
  async updateBio(id, bio) { this.users.find(u=>u.id===id).bio=bio; return this.user(id); }
  async updateAvatar(id, filename) { const user=this.users.find(u=>u.id===id);const old=user.avatar_filename;user.avatar_filename=filename;return old; }
  async teams(id) { return this.savedTeams.filter(t=>t.userId===id).map(t=>({...t,pokemonIds:[...t.pokemonIds]})); }
  async createTeam(userId,name) { const team={id:++this.sequence,userId,name,pokemonIds:[]};this.savedTeams.push(team);return {...team}; }
  async saveTeam(userId,id,data) { const team=this.savedTeams.find(t=>t.id===id && t.userId===userId);if(!team)throw new HttpError(404,'Team not found.');Object.assign(team,data);return {...team}; }
  async deleteTeam(userId,id) {const index=this.savedTeams.findIndex(t=>t.id===id&&t.userId===userId);if(index<0)throw new HttpError(404,'Team not found.');this.savedTeams.splice(index,1);}
  async favorites(id) {return [...(this.savedFavorites.get(id)||[])].sort((a,b)=>a-b);}
  async favorite(id,pokemonId,enabled){const set=this.savedFavorites.get(id)||new Set();enabled?set.add(pokemonId):set.delete(pokemonId);this.savedFavorites.set(id,set);}
}
module.exports={MemoryRepository};
