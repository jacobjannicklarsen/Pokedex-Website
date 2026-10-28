'use strict';
const v = require('./validation');
const defaults = () => ({ enabled: false, shareBio: false, featuredPokemonId: null, featuredTeamId: null, shareAvatar: false, shareFavorites: false, shareProgress: false, shareAchievements: false });
const flags = ['enabled', 'shareBio', 'shareAvatar', 'shareFavorites', 'shareProgress', 'shareAchievements'];
function settings(body) {
  v.object(body);
  const allowed = Object.keys(defaults());
  if (Object.keys(body).some(k => !allowed.includes(k)) || allowed.some(k => !(k in body))) v.fail('Send only the complete public profile settings.');
  for (const key of flags) if (typeof body[key] !== 'boolean') v.fail('Visibility settings must be true or false.');
  return { ...Object.fromEntries(flags.map(k => [k, body[k]])),
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
function directoryCard(user,settings,decoration,publicTeamCount,showcaseTeam=null) {
  // Directory cards are an explicit public projection, never a user/settings row.
  const card={ username:user.username,bio:settings.shareBio ? user.bio || '' : '',createdAt:user.created_at,
    avatarUrl:settings.shareAvatar&&user.avatar_filename?`/api/public/trainers/${encodeURIComponent(user.username)}/avatar`:null,
    featuredPokemonId:settings.featuredPokemonId,
    decoration:{...require('./decorations').normalize(decoration),pinnedBadges:[]},
    publicTeamCount:Number(publicTeamCount),
    showcaseTeam:showcaseTeam?{name:showcaseTeam.name,shareId:showcaseTeam.shareId,pokemonIds:[...showcaseTeam.pokemonIds]}:null };
  if(settings.shareProgress&&Number.isInteger(user.caughtCount))card.rank=require('./trainer-ranks').calculate(user.caughtCount);
  if(['owner','administrator','moderator'].includes(user.staffRole))card.staffRole=user.staffRole;
  return card;
}
// Explicit projection: never spread a user, settings row, or private bundle into public JSON.
async function profile(repo, user, settings, preview = false) {
  if (!preview && !settings.enabled) throw new v.HttpError(404, 'Trainer profile unavailable.');
  const publicTeams = await repo.community.publicTeams(user.id);
  const result = { username: user.username, bio: settings.shareBio ? user.bio || '' : '', createdAt: user.created_at,
    avatarUrl: settings.shareAvatar && user.avatar_filename ? `/api/public/trainers/${encodeURIComponent(user.username)}/avatar` : null,
    featuredPokemonId: settings.featuredPokemonId,
    featuredTeamId: publicTeams.some(t => t.id === settings.featuredTeamId) ? settings.featuredTeamId : null,
    teams: publicTeams.map(team => ({ name: team.name, shareId: team.shareId, pokemonIds: team.pokemonIds, featured: team.id === settings.featuredTeamId })) };
  const decoration=await repo.community.decoration(user.id);
  const publicRole=(await repo.community.publicRoles([user.id])).get(user.id);
  if(publicRole)result.staffRole=publicRole;
  result.decoration={...decoration,pinnedBadges:[]};
  result.pinnedBadges=[];
  if (preview && settings.shareAvatar && user.avatar_filename) result.avatarUrl = `/media/avatars/${user.avatar_filename}`;
  if (settings.shareFavorites) result.favorites = await repo.favorites(user.id);
  if (settings.shareProgress || settings.shareAchievements) {
    // Read-only public statistics: never reconcile or expose raw collection records.
    const progress = await repo.community.publicProgress(user.id);
    if (settings.shareProgress) {result.statistics = { national: progress.statistics.national, generations: progress.statistics.generations };result.rank=require('./trainer-ranks').calculate(progress.statistics.national.caught);}
    if (settings.shareAchievements) {
      result.achievements = progress.achievements.filter(a => a.unlockedAt).map(a => ({ key: a.key, name: a.name, description: a.description, icon:a.icon, rarity:a.rarity, category:a.category, unlockedAt: a.unlockedAt }));
      result.pinnedBadges=decoration.pinnedBadges.map(key=>result.achievements.find(a=>a.key===key)).filter(Boolean);
      result.decoration.pinnedBadges=result.pinnedBadges.map(a=>a.key);
    }
  }
  return result;
}
module.exports = { defaults, settings, visibility, username, shareId, profile, directoryCard };
