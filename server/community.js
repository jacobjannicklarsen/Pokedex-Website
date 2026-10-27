'use strict';
const v = require('./validation');
const defaults = () => ({ enabled: false, publicBio: '', featuredPokemonId: null, featuredTeamId: null, shareAvatar: false, shareFavorites: false, shareProgress: false, shareAchievements: false });
const flags = ['enabled', 'shareAvatar', 'shareFavorites', 'shareProgress', 'shareAchievements'];
function settings(body) {
  v.object(body);
  const allowed = Object.keys(defaults());
  if (Object.keys(body).some(k => !allowed.includes(k)) || allowed.some(k => !(k in body))) v.fail('Send only the complete public profile settings.');
  for (const key of flags) if (typeof body[key] !== 'boolean') v.fail('Visibility settings must be true or false.');
  return { ...Object.fromEntries(flags.map(k => [k, body[k]])), publicBio: v.text(body.publicBio, 'Public biography', 0, 500),
    featuredPokemonId: body.featuredPokemonId === null ? null : v.id(body.featuredPokemonId, 649),
    featuredTeamId: body.featuredTeamId === null ? null : v.id(body.featuredTeamId) };
}
function visibility(body) {
  v.object(body);
  if (Object.keys(body).length !== 1 || !['private','public'].includes(body.visibility)) v.fail('Choose private or public visibility.');
  return body.visibility;
}
function username(value) {
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(value)) v.fail('Invalid trainer username.');
  return value;
}
function shareId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) v.fail('Invalid team link.');
  return value;
}
// Explicit projection: never spread a user, settings row, or private bundle into public JSON.
async function profile(repo, user, settings, preview = false) {
  if (!preview && !settings.enabled) throw new v.HttpError(404, 'Trainer profile unavailable.');
  const publicTeams = await repo.community.publicTeams(user.id);
  const result = { username: user.username, bio: settings.publicBio, createdAt: user.created_at,
    avatarUrl: settings.shareAvatar && user.avatar_filename ? `/api/public/trainers/${encodeURIComponent(user.username)}/avatar` : null,
    featuredPokemonId: settings.featuredPokemonId,
    featuredTeamId: publicTeams.some(t => t.id === settings.featuredTeamId) ? settings.featuredTeamId : null,
    teams: publicTeams.map(team => ({ name: team.name, shareId: team.shareId, pokemonIds: team.pokemonIds, featured: team.id === settings.featuredTeamId })) };
  if (preview && settings.shareAvatar && user.avatar_filename) result.avatarUrl = `/media/avatars/${user.avatar_filename}`;
  if (settings.shareFavorites) result.favorites = await repo.favorites(user.id);
  if (settings.shareProgress || settings.shareAchievements) {
    // Read-only public statistics: never reconcile or expose raw collection records.
    const progress = await repo.community.publicProgress(user.id);
    if (settings.shareProgress) result.statistics = { national: progress.statistics.national, generations: progress.statistics.generations };
    if (settings.shareAchievements) result.achievements = progress.achievements.filter(a => a.unlockedAt).map(a => ({ key: a.key, name: a.name, description: a.description, unlockedAt: a.unlockedAt }));
  }
  return result;
}
module.exports = { defaults, settings, visibility, username, shareId, profile };
