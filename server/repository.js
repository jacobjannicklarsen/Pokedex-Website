'use strict';
const { HttpError } = require('./validation');
const { ProgressionRepository } = require('./progression-repository');
const { awardTeamBuilder } = require('./progression');
const { CommunityRepository } = require('./community-repository');
class Repository {
  constructor(pool) { this.pool = pool; this.forums=new(require('./forums').Forums)(this,new(require('./forum-store').ForumStore)(pool,this)); this.administration = new(require('./admin-repository').AdminRepository)(pool); this.progression = new ProgressionRepository(pool); this.community = new CommunityRepository(pool, this); this.enhancements=new(require('./enhancements').Enhancements)(this); }
  async user(id) {
    let rows;try{[rows]=await this.pool.execute('SELECT id, username, email, bio, bio_format, avatar_filename, created_at FROM users WHERE id = ?',[id]);}catch(e){if(e.code!=='ER_BAD_FIELD_ERROR'||!e.message.includes('bio_format'))throw e;[rows]=await this.pool.execute('SELECT id, username, email, bio, avatar_filename, created_at FROM users WHERE id = ?',[id]);}return rows[0]||null;
  }
  async userByName(username){const [r]=await this.pool.execute('SELECT id, username, avatar_filename, created_at FROM users WHERE username=?',[username]);return r[0]||null;}
  async findLogin(identifier) {
    const [rows] = await this.pool.execute('SELECT id, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1', [identifier, identifier]);
    return rows[0] || null;
  }
  async createUser({ username, email }, hash) {
    const [result] = await this.pool.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash]);
    return this.user(result.insertId);
  }
  async updateBio(userId, bio, format='plain') {
    try{await this.pool.execute('UPDATE users SET bio = ?, bio_format = ? WHERE id = ?',[bio,format,userId]);}catch(e){if(e.code!=='ER_BAD_FIELD_ERROR'||!e.message.includes('bio_format'))throw e;if(format!=='plain')throw new HttpError(503,'Formatted biographies require the manual v0.7.1 migration.');await this.pool.execute('UPDATE users SET bio = ? WHERE id = ?',[bio,userId]);}
    return this.user(userId);
  }
  async updateAvatar(userId, filename) {
    // Serialize concurrent uploads; return exactly the previous file for safe cleanup.
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT avatar_filename FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (!rows.length) throw new HttpError(401, 'Please log in again.');
      await connection.execute('UPDATE users SET avatar_filename = ? WHERE id = ?', [filename, userId]);
      await connection.commit();
      return rows[0].avatar_filename;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async teams(userId) {
    const [teams] = await this.pool.execute('SELECT id, name, created_at FROM teams WHERE user_id = ? ORDER BY id DESC', [userId]);
    const [members] = await this.pool.execute('SELECT tp.team_id, tp.slot, tp.pokemon_id FROM team_pokemon tp JOIN teams t ON t.id = tp.team_id WHERE t.user_id = ? ORDER BY tp.slot', [userId]);
    return teams.map(team => ({ ...team, pokemonIds: members.filter(m => m.team_id === team.id).map(m => m.pokemon_id) }));
  }
  async createTeam(userId, name) {
    const [result] = await this.pool.execute('INSERT INTO teams (user_id, name) VALUES (?, ?)', [userId, name]);
    return { id: result.insertId, name, pokemonIds: [] };
  }
  async saveTeam(userId, teamId, { name, pokemonIds }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owned] = await connection.execute('SELECT id FROM teams WHERE id = ? AND user_id = ? FOR UPDATE', [teamId, userId]);
      if (!owned.length) throw new HttpError(404, 'Team not found.');
      await connection.execute('UPDATE teams SET name = ? WHERE id = ? AND user_id = ?', [name, teamId, userId]);
      await connection.execute('DELETE FROM team_pokemon WHERE team_id = ?', [teamId]);
      for (let slot = 0; slot < pokemonIds.length; slot++) {
        await connection.execute('INSERT INTO team_pokemon (team_id, slot, pokemon_id) VALUES (?, ?, ?)', [teamId, slot + 1, pokemonIds[slot]]);
      }
      if (pokemonIds.length === 6) await awardTeamBuilder(connection, userId);
      await connection.commit();
      return { id: teamId, name, pokemonIds };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async deleteTeam(userId, teamId) {
    const [result] = await this.pool.execute('DELETE FROM teams WHERE id = ? AND user_id = ?', [teamId, userId]);
    if (!result.affectedRows) throw new HttpError(404, 'Team not found.');
  }
  async favorites(userId) {
    const [rows] = await this.pool.execute('SELECT pokemon_id FROM favorites WHERE user_id = ? ORDER BY pokemon_id', [userId]);
    return rows.map(row => row.pokemon_id);
  }
  async favorite(userId, pokemonId, enabled) {
    if (enabled) await this.pool.execute('INSERT INTO favorites (user_id, pokemon_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE pokemon_id = VALUES(pokemon_id)', [userId, pokemonId]);
    else await this.pool.execute('DELETE FROM favorites WHERE user_id = ? AND pokemon_id = ?', [userId, pokemonId]);
  }
}
module.exports = { Repository };
