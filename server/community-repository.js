'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('./validation');
const { defaults } = require('./community');
const logic = require('./progression');
const columns = { enabled:'enabled', publicBio:'public_bio', featuredPokemonId:'featured_pokemon_id', featuredTeamId:'featured_team_id', shareAvatar:'share_avatar', shareFavorites:'share_favorites', shareProgress:'share_progress', shareAchievements:'share_achievements' };
const select = Object.entries(columns).map(([key, column]) => `${column} AS ${key}`).join(', ');
class CommunityRepository {
  constructor(pool, repo) { this.pool = pool; this.repo = repo; }
  async settings(userId) {
    const [rows] = await this.pool.execute(`SELECT ${select} FROM trainer_public_settings WHERE user_id = ?`, [userId]);
    if (!rows.length) return defaults();
    const row = rows[0];
    for (const key of ['enabled','shareAvatar','shareFavorites','shareProgress','shareAchievements']) row[key] = Boolean(row[key]);
    return row;
  }
  async saveSettings(userId, value) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (value.featuredTeamId !== null) {
        const [owned] = await connection.execute('SELECT id FROM teams WHERE id = ? AND user_id = ? FOR UPDATE', [value.featuredTeamId, userId]);
        if (!owned.length) throw new HttpError(404, 'Featured team not found.');
      }
      const names = Object.values(columns), values = Object.keys(columns).map(k => value[k]);
      await connection.execute(`INSERT INTO trainer_public_settings (user_id, ${names.join(', ')}) VALUES (?, ${names.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${names.map(n => `${n} = VALUES(${n})`).join(', ')}`, [userId, ...values]);
      await connection.commit();
      return value;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async findTrainer(username) {
    const [rows] = await this.pool.execute('SELECT u.id, u.username, u.avatar_filename, u.created_at FROM users u JOIN trainer_public_settings s ON s.user_id = u.id AND s.enabled = 1 WHERE u.username = ?', [username]);
    return rows[0] || null;
  }
  async directory(after) {
    const limit = 24;
    const [rows] = await this.pool.execute('SELECT u.id, u.username FROM users u JOIN trainer_public_settings s ON s.user_id = u.id AND s.enabled = 1 WHERE u.id > ? ORDER BY u.id LIMIT 25', [after]);
    return { trainers: rows.slice(0,limit).map(u => ({ username: u.username })), next: rows.length > limit ? rows[limit - 1].id : null };
  }
  async teamSettings(userId, teamId) {
    const [rows] = await this.pool.execute('SELECT t.id, s.share_id AS shareId, COALESCE(s.is_public, 0) AS isPublic FROM teams t LEFT JOIN team_sharing s ON s.team_id = t.id WHERE t.id = ? AND t.user_id = ?', [teamId,userId]);
    if (!rows.length) throw new HttpError(404, 'Team not found.');
    return { visibility: rows[0].isPublic ? 'public' : 'private', shareId: rows[0].shareId || null };
  }
  async share(userId, teamId, visibility) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owned] = await connection.execute('SELECT id FROM teams WHERE id = ? AND user_id = ? FOR UPDATE', [teamId,userId]);
      if (!owned.length) throw new HttpError(404, 'Team not found.');
      await connection.execute('INSERT INTO team_sharing (team_id, share_id, is_public) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_public = VALUES(is_public)', [teamId,crypto.randomUUID(),visibility === 'public']);
      const [rows] = await connection.execute('SELECT share_id AS shareId FROM team_sharing WHERE team_id = ?', [teamId]);
      await connection.commit();
      return { visibility, shareId: rows[0].shareId };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async publicTeams(userId) {
    const [rows] = await this.pool.execute('SELECT t.id, t.name, s.share_id AS shareId FROM teams t JOIN team_sharing s ON s.team_id = t.id AND s.is_public = 1 WHERE t.user_id = ? ORDER BY t.id DESC', [userId]);
    if (!rows.length) return [];
    const [members] = await this.pool.execute('SELECT tp.team_id, tp.pokemon_id FROM team_pokemon tp JOIN teams t ON t.id = tp.team_id JOIN team_sharing s ON s.team_id = t.id AND s.is_public = 1 WHERE t.user_id = ? ORDER BY tp.slot', [userId]);
    return rows.map(row => ({ ...row, pokemonIds: members.filter(m => m.team_id === row.id).map(m => m.pokemon_id) }));
  }
  async publicTeam(shareId) {
    const [rows] = await this.pool.execute('SELECT t.id, t.user_id, t.name, u.username, s.share_id AS shareId FROM teams t JOIN users u ON u.id = t.user_id JOIN team_sharing s ON s.team_id = t.id AND s.is_public = 1 WHERE s.share_id = ?', [shareId]);
    if (!rows.length) throw new HttpError(404, 'Shared team unavailable.');
    const row = rows[0];
    const [members] = await this.pool.execute('SELECT pokemon_id FROM team_pokemon WHERE team_id = ? ORDER BY slot', [row.id]);
    const settings = await this.settings(row.user_id);
    return { name: row.name, username: row.username, profileAvailable: settings.enabled, shareId: row.shareId, pokemonIds: members.map(m => m.pokemon_id) };
  }
  async publicProgress(userId) {
    const collection = await this.repo.progression.collection(this.pool, userId);
    const [unlocks] = await this.pool.execute('SELECT achievement_key AS `key`, unlocked_at AS unlockedAt FROM user_achievements WHERE user_id = ?', [userId]);
    const statistics = logic.statistics(collection);
    return { statistics, achievements: logic.achievements(statistics, [], unlocks) };
  }
}
module.exports = { CommunityRepository };
