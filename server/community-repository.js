'use strict';
const crypto = require('node:crypto');
const { HttpError } = require('./validation');
const { defaults, directoryCard } = require('./community');
const logic = require('./progression');
const decorations = require('./decorations');
const columns = { enabled:'enabled', shareBio:'share_bio', featuredPokemonId:'featured_pokemon_id', featuredTeamId:'featured_team_id', shareAvatar:'share_avatar', shareFavorites:'share_favorites', shareProgress:'share_progress', shareAchievements:'share_achievements' };
const select = Object.entries(columns).map(([key, column]) => `${column} AS ${key}`).join(', ');
const decorationColumns={"palette":"palette","pattern":"pattern","frame":"frame","effect":"effect","title":"title","motto":"motto","pinnedBadges":"pinned_badges","accentColor":"accent_color","borderColor":"border_color","frameColor":"frame_color","borderStyle":"border_style","titleStyle":"title_style"};
const decorationSelect="palette AS palette, pattern AS pattern, frame AS frame, effect AS effect, title AS title, motto AS motto, pinned_badges AS pinnedBadges, accent_color AS accentColor, border_color AS borderColor, frame_color AS frameColor, border_style AS borderStyle, title_style AS titleStyle";
const legacyDecorationSelect="palette, pattern, frame, effect, title, motto, pinned_badges AS pinnedBadges";
const missingDecorationColumns=error=>error.code==='ER_BAD_FIELD_ERROR'&&/accent_color|border_color|frame_color|border_style|title_style/.test(error.message);
class CommunityRepository {
  constructor(pool, repo) { this.pool = pool; this.repo = repo; }
  async publicRoles(userIds){
    if(!userIds.length)return new Map();
    try{
      const [rows]=await this.pool.execute(`SELECT r.user_id AS userId, r.role FROM user_roles r JOIN trainer_public_settings s ON s.user_id = r.user_id AND s.enabled = 1 WHERE r.user_id IN (${userIds.map(()=>'?').join(',')}) AND r.role IN ('owner','administrator','moderator')`,userIds);
      return new Map(rows.filter(r=>['owner','administrator','moderator'].includes(r.role)).map(r=>[r.userId,r.role]));
    }catch(error){if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code))return new Map();throw error;}
  }
  async decoration(userId) {
    try {
      let rows;
      try { [rows]=await this.pool.execute(`SELECT ${decorationSelect} FROM trainer_decorations WHERE user_id = ?`,[userId]); }
      catch(error){if(!missingDecorationColumns(error))throw error;[rows]=await this.pool.execute(`SELECT ${legacyDecorationSelect} FROM trainer_decorations WHERE user_id = ?`,[userId]);}
      if(!rows.length)return decorations.defaults();
      const row=rows[0];if(typeof row.pinnedBadges==='string')row.pinnedBadges=JSON.parse(row.pinnedBadges);
      return decorations.normalize(row);
    } catch(error){if(error.code==='ER_NO_SUCH_TABLE')return decorations.defaults();throw error;}
  }
  async earnedBadges(userId) {
    const [rows]=await this.pool.execute('SELECT achievement_key AS `key` FROM user_achievements WHERE user_id = ?', [userId]);
    const keys=new Set(rows.map(r=>r.key));return logic.definitions.filter(d=>keys.has(d.key)).map(({key,name,description,icon,rarity,category})=>({key,name,description,icon,rarity,category}));
  }
  async saveDecoration(userId,value) {
    const earned=new Set((await this.earnedBadges(userId)).map(b=>b.key));
    if(value.pinnedBadges.some(key=>!earned.has(key)))throw new HttpError(400,'Only your earned achievements can be pinned.');
    try{
      const names=Object.values(decorationColumns),values=Object.keys(decorationColumns).map(key=>key==='pinnedBadges'?JSON.stringify(value[key]):value[key]);
      await this.pool.execute(`INSERT INTO trainer_decorations (user_id, ${names.join(', ')}) VALUES (?, ${names.map(()=>'?').join(', ')}) ON DUPLICATE KEY UPDATE ${names.map(n=>n+' = VALUES('+n+')').join(', ')}`,[userId,...values]);
    }catch(error){if(error.code==='ER_CHECK_CONSTRAINT_VIOLATED'&&error.message.includes('ck_decoration_title_style'))throw new HttpError(503,'Saving this title style requires the manual database/migrations/trainer-title-styles.sql upgrade.');if(missingDecorationColumns(error)||error.code==='ER_CHECK_CONSTRAINT_VIOLATED')throw new HttpError(503,'Expanded card settings require the manual database/migrations/v0.6.1-trainer-studio.sql migration.');if(error.code==='ER_NO_SUCH_TABLE')throw new HttpError(503,'Saving decorations requires the manual database/migrations/profile-decorations.sql migration.');throw error;}
    return value;
  }
  async settings(userId) {
    let rows;
    try { [rows] = await this.pool.execute(`SELECT ${select} FROM trainer_public_settings WHERE user_id = ?`, [userId]); }
    catch (error) {
      if (error.code !== 'ER_BAD_FIELD_ERROR' || !error.message.includes('share_bio')) throw error;
      [rows] = await this.pool.execute(`SELECT ${select.replace('share_bio AS shareBio', '0 AS shareBio')} FROM trainer_public_settings WHERE user_id = ?`, [userId]);
    }
    if (!rows.length) return defaults();
    const row = rows[0];
    for (const key of ['enabled','shareBio','shareAvatar','shareFavorites','shareProgress','shareAchievements']) row[key] = Boolean(row[key]);
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
    } catch (error) { await connection.rollback(); if(error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('share_bio')) throw new HttpError(503,'Apply database/migrations/single-biography.sql before saving biography visibility settings.'); throw error; }
    finally { connection.release(); }
  }
  async findTrainer(username) {
    const [rows] = await this.pool.execute('SELECT u.id, u.username, u.bio, u.avatar_filename, u.created_at FROM users u JOIN trainer_public_settings s ON s.user_id = u.id AND s.enabled = 1 WHERE u.username = ?', [username]);
    return rows[0] || null;
  }
  async directory(after,query='') {
    const limit=24,pattern=`%${query.replace(/[=%_]/g,'=$&')}%`;
    const [totals]=await this.pool.execute("SELECT COUNT(*) AS total FROM users u JOIN trainer_public_settings s ON s.user_id = u.id AND s.enabled = 1 WHERE u.username LIKE ? ESCAPE '='",[pattern]);
    const directorySql="SELECT u.id, u.username, u.bio, u.avatar_filename, u.created_at, s.share_bio AS shareBio, s.share_avatar AS shareAvatar, s.share_progress AS shareProgress, CASE WHEN s.share_progress = 1 THEN (SELECT COUNT(*) FROM user_pokedex up WHERE up.user_id = u.id AND up.caught_at IS NOT NULL) ELSE NULL END AS caughtCount, s.featured_pokemon_id AS featuredPokemonId, (SELECT COUNT(*) FROM teams t JOIN team_sharing ts ON ts.team_id = t.id AND ts.is_public = 1 WHERE t.user_id = u.id) AS publicTeamCount, (SELECT t.id FROM teams t JOIN team_sharing ts ON ts.team_id = t.id AND ts.is_public = 1 WHERE t.user_id = u.id ORDER BY (t.id = s.featured_team_id) DESC, t.id DESC LIMIT 1) AS showcaseTeamId FROM users u JOIN trainer_public_settings s ON s.user_id = u.id AND s.enabled = 1 WHERE u.id > ? AND u.username LIKE ? ESCAPE '=' ORDER BY u.id LIMIT 25";
    let rows;
    try { [rows]=await this.pool.execute(directorySql,[after,pattern]); }
    catch(error) {
      if(error.code!=='ER_BAD_FIELD_ERROR'||!error.message.includes('share_bio'))throw error;
      [rows]=await this.pool.execute(directorySql.replace('s.share_bio AS shareBio','0 AS shareBio'),[after,pattern]);
    }
    const page=rows.slice(0,limit),styles=new Map(),teams=new Map();
    if(page.length){
      const placeholders=page.map(()=>'?').join(','),ids=page.map(u=>u.id);
      try{
        let saved;
        try{[saved]=await this.pool.execute(`SELECT user_id, ${decorationSelect} FROM trainer_decorations WHERE user_id IN (${placeholders})`,ids);}
        catch(error){if(!missingDecorationColumns(error))throw error;[saved]=await this.pool.execute(`SELECT user_id, ${legacyDecorationSelect} FROM trainer_decorations WHERE user_id IN (${placeholders})`,ids);}
        for(const row of saved){const {user_id,...value}=row;if(typeof value.pinnedBadges==='string')value.pinnedBadges=JSON.parse(value.pinnedBadges);styles.set(user_id,decorations.normalize(value));}
      }catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
      const teamIds=page.map(u=>u.showcaseTeamId).filter(Boolean);
      if(teamIds.length){
        const [members]=await this.pool.execute(`SELECT t.id, t.user_id, t.name, ts.share_id AS shareId, tp.pokemon_id FROM teams t JOIN team_sharing ts ON ts.team_id = t.id AND ts.is_public = 1 JOIN trainer_public_settings ps ON ps.user_id = t.user_id AND ps.enabled = 1 LEFT JOIN team_pokemon tp ON tp.team_id = t.id WHERE t.id IN (${teamIds.map(()=>'?').join(',')}) ORDER BY t.id, tp.slot`,teamIds);
        for(const row of members){if(!teams.has(row.id))teams.set(row.id,{ownerId:row.user_id,name:row.name,shareId:row.shareId,pokemonIds:[]});if(row.pokemon_id)teams.get(row.id).pokemonIds.push(row.pokemon_id);}
      }
    }
    const publicRoles=await this.publicRoles(page.map(u=>u.id));
    return {trainers:page.map(u=>{const team=teams.get(u.showcaseTeamId);if(u.caughtCount!==null&&u.caughtCount!==undefined)u.caughtCount=Number(u.caughtCount);return directoryCard({...u,staffRole:publicRoles.get(u.id)},u,styles.get(u.id)||decorations.defaults(),u.publicTeamCount,team?.ownerId===u.id?team:null);}),next:rows.length>limit?page.at(-1).id:null,total:Number(totals[0].total)};
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
    const [rows] = await this.pool.execute('SELECT t.id, t.user_id, t.name, u.username, s.share_id AS shareId, tp.pokemon_id FROM teams t JOIN users u ON u.id = t.user_id JOIN team_sharing s ON s.team_id = t.id AND s.is_public = 1 LEFT JOIN team_pokemon tp ON tp.team_id = t.id WHERE s.share_id = ? ORDER BY tp.slot', [shareId]);
    if (!rows.length) throw new HttpError(404, 'Shared team unavailable.');
    const row = rows[0];
    const settings = await this.settings(row.user_id);
    return { name: row.name, username: row.username, profileAvailable: settings.enabled, shareId: row.shareId, pokemonIds: rows.filter(m=>m.pokemon_id!==null&&m.pokemon_id!==undefined).map(m=>m.pokemon_id) };
  }
  async publicProgress(userId) {
    const collection = await this.repo.progression.collection(this.pool, userId);
    const [unlocks] = await this.pool.execute('SELECT achievement_key AS `key`, unlocked_at AS unlockedAt FROM user_achievements WHERE user_id = ?', [userId]);
    const statistics = logic.statistics(collection);
    return { statistics, achievements: logic.achievements(statistics, [], unlocks) };
  }
}
module.exports = { CommunityRepository };
