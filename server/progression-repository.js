'use strict';
const { HttpError } = require('./validation');
const logic = require('./progression');
// All collection writes and award reconciliation serialize on the authenticated user's row.
class ProgressionRepository {
  constructor(pool) { this.pool = pool; }
  async collection(connection, userId) {
    const [rows] = await connection.execute("SELECT pokemon_id AS pokemonId, DATE_FORMAT(seen_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS seenAt, DATE_FORMAT(caught_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS caughtAt, DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS updatedAt FROM user_pokedex WHERE user_id = ? ORDER BY pokemon_id", [userId]);
    return rows.map(logic.entry);
  }
  async bundle(connection, userId) {
    const collection = await this.collection(connection, userId);
    const [teamRows] = await connection.execute('SELECT t.id, COUNT(tp.slot) AS members FROM teams t LEFT JOIN team_pokemon tp ON tp.team_id = t.id WHERE t.user_id = ? GROUP BY t.id ORDER BY t.id', [userId]);
    const teams = teamRows.map(t => ({ id: t.id, memberCount: Number(t.members) }));
    const [favoriteRows] = await connection.execute('SELECT pokemon_id FROM favorites WHERE user_id = ?', [userId]);
    const statistics = logic.statistics(collection, teams, favoriteRows);
    const awardQuery = "SELECT achievement_key AS `key`, DATE_FORMAT(unlocked_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS unlockedAt FROM user_achievements WHERE user_id = ? ORDER BY achievement_key";
    let [awards] = await connection.execute(awardQuery, [userId]);
    const saved = new Set(awards.map(a=>a.key)), missing = logic.eligible(statistics,teams).filter(key=>!saved.has(key));
    for (const key of missing) await logic.award(connection, userId, key);
    if(missing.length) [awards] = await connection.execute(awardQuery, [userId]);
    return { collection, statistics, achievements: logic.achievements(statistics, teams, awards) };
  }
  async transaction(userId, mutation) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [users] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
      if (!users.length) throw new HttpError(401, 'Please log in again.');
      if (mutation) await mutation(connection);
      const result = await this.bundle(connection, userId);
      await connection.commit(); return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async snapshot(userId) { return this.transaction(userId); }
  async set(userId, pokemonId, status) {
    return this.transaction(userId, async connection => {
      const caught = status === 'caught';
      await connection.execute(caught
        ? 'INSERT INTO user_pokedex (user_id, pokemon_id, seen_at, caught_at, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE updated_at = IF(caught_at IS NULL, UTC_TIMESTAMP(3), updated_at), caught_at = COALESCE(caught_at, UTC_TIMESTAMP(3))'
        : 'INSERT INTO user_pokedex (user_id, pokemon_id, seen_at, caught_at, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3), NULL, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE updated_at = IF(caught_at IS NOT NULL, UTC_TIMESTAMP(3), updated_at), caught_at = NULL', [userId, pokemonId]);
    });
  }
  async remove(userId, pokemonId) { return this.transaction(userId, connection => connection.execute('DELETE FROM user_pokedex WHERE user_id = ? AND pokemon_id = ?', [userId, pokemonId])); }
}
module.exports = { ProgressionRepository };
