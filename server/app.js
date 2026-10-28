'use strict';
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const argon2 = require('argon2');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const v = require('./validation');
const { TTL } = require('./session-store');
const community = require('./community');
const speciesData = require('../data/pokemon-summary.json').pokemon;
const typeChart = require('../data/type-chart.json');
const teamAnalysis = require('../team-analysis-data');
const decorations = require('./decorations');

const publicUser = (user,staff) => ({
  id: user.id, username: user.username, email: user.email, bio: user.bio,...(user.bio_format==='limited'?{bioFormat:'limited'}:{}),
  avatarUrl: user.avatar_filename ? `/media/avatars/${user.avatar_filename}` : null,
  createdAt: user.created_at,
  ...(staff?{staff:{available:staff.available,role:staff.role,permissions:staff.permissions,roleVersion:staff.roleVersion}}:{})
});
const sessionCall = (req, method) => new Promise((resolve, reject) => req.session[method](error => error ? reject(error) : resolve()));
const avatarPattern = /^[0-9a-f-]{36}\.webp$/;

async function createApp({ repo, store, config, authLimit = 30 }) {
  const app = express();
  if(!repo.administration)throw Error('Repository must provide the administration adapter.');
  const staffFor=async user=>({id:user.id,...await repo.administration.access(user.id)});
  const restricted=staff=>{const error=new v.HttpError(403,`Account suspended until ${staff.restriction.expiresAt}. ${staff.restriction.reason}`);error.code='ACCOUNT_RESTRICTED';error.restriction={expiresAt:staff.restriction.expiresAt,reason:staff.restriction.reason};return error;};
  const root = path.join(__dirname, '..');
  await fs.mkdir(config.uploadDir, { recursive: true });
  const dummyHash = await argon2.hash(crypto.randomBytes(32), { type: argon2.argon2id });
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https://raw.githubusercontent.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'https://pokeapi.co'], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.production ? [] : null
    } },
    strictTransportSecurity: config.production ? undefined : false
  }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', express.json({ limit: '16kb', strict: true }));
  app.use(['/api', '/media/avatars','/media/banners'], session({
    name: 'pokedex.sid', store, secret: config.secret,
    resave: false, saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: TTL, path: '/' }
  }));
  app.use(['/api','/media/avatars','/media/banners'],async(req,res,next)=>{if(req.session?.userId&&repo.enhancements){const version=await repo.enhancements.securityVersion(req.session.userId);if(version!==Number(req.session.securityVersion||0))delete req.session.userId;}next();});
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authLimit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
  const uploadLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many uploads. Please wait a minute.' } });

  app.get('/api/auth/session', async (req, res) => {
    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
    const user = req.session.userId ? await repo.user(req.session.userId) : null;
    if (!user) delete req.session.userId;
    const staff=user?await staffFor(user):null;
    if(staff?.restriction){delete req.session.userId;await sessionCall(req,'save');return res.json({user:null,csrfToken:req.session.csrf,code:'ACCOUNT_RESTRICTED',error:restricted(staff).message});}
    // Save before responding, so a subsequent write sees the initialized session.
    await sessionCall(req, 'save');
    res.json({ user: user ? publicUser(user,staff) : null, csrfToken: req.session.csrf });
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== config.origin) return next(new v.HttpError(403, 'Request origin is not allowed.'));
    if (req.get('sec-fetch-site') === 'cross-site') return next(new v.HttpError(403, 'Cross-site requests are not allowed.'));
    const token = req.get('x-csrf-token');
    if (!req.session.csrf || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))) return next(new v.HttpError(403, 'Session expired. Refresh the page and try again.'));
    next();
  });
  async function signIn(req, user) {
    const staff=await staffFor(user);if(staff.restriction)throw restricted(staff);
    await sessionCall(req, 'regenerate');
    req.session.userId = user.id;
    req.session.securityVersion=repo.enhancements?await repo.enhancements.securityVersion(user.id):0;
    req.session.csrf = crypto.randomBytes(32).toString('hex');
    await sessionCall(req, 'save');
    return { user: publicUser(user,staff), csrfToken: req.session.csrf };
  }
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const data = v.registration(req.body);
    const hash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await repo.createUser(data, hash);
    res.status(201).json(await signIn(req, user));
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { identifier, password } = v.login(req.body);
    const found = await repo.findLogin(identifier);
    const matches = await argon2.verify(found?.password_hash || dummyHash, password);
    if (!found || !matches) throw new v.HttpError(401, 'Invalid username/email or password.');
    const user = await repo.user(found.id);
    if (!user) throw new v.HttpError(401, 'Invalid username/email or password.');
    res.json(await signIn(req, user));
  });
  app.post('/api/auth/logout', async (req, res) => {
    await sessionCall(req, 'destroy');
    res.clearCookie('pokedex.sid', { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' });
    res.status(204).end();
  });
  const communityOperation = operation => async (req, res) => {
    try { res.json(await operation(req)); }
    catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') throw new v.HttpError(503, 'Community sharing is unavailable. Review the manual v0.6.0 migration in MySQL Workbench.');
      throw error;
    }
  };
  const communityLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many community requests. Please wait a minute.' } });
  app.use('/api/public', communityLimiter);
  app.get('/api/public/trainers', communityOperation(req => repo.community.directory(req.query.after === undefined ? 0 : v.id(req.query.after),v.text(req.query.q??'','Trainer search',0,64))));
  async function publicTrainer(req) {
    const user = await repo.community.findTrainer(community.username(req.params.username));
    if (!user) throw new v.HttpError(404, 'Trainer profile unavailable.');
    const settings = await repo.community.settings(user.id);
    if (!settings.enabled) throw new v.HttpError(404, 'Trainer profile unavailable.');
    return { user, settings };
  }
  app.get('/api/public/trainers/:username', communityOperation(async req => {
    const { user, settings } = await publicTrainer(req);
    return { profile: await community.profile(repo, user, settings) };
  }));
  app.get('/api/public/trainers/:username/teams', communityOperation(async req => {
    const { user, settings } = await publicTrainer(req);
    return { teams: (await community.profile(repo, user, { ...settings, shareProgress: false, shareAchievements: false, shareFavorites: false })).teams };
  }));
  app.get('/api/public/trainers/:username/avatar', async (req, res) => {
    const { user, settings } = await publicTrainer(req);
    if (!settings.shareAvatar || !avatarPattern.test(user.avatar_filename || '')) throw new v.HttpError(404, 'Image not found.');
    res.sendFile(path.join(config.uploadDir, user.avatar_filename));
  });
  app.get('/api/public/teams/:shareId', communityOperation(async req => {
    const team = await repo.community.publicTeam(community.shareId(req.params.shareId));
    return { team, analysis: teamAnalysis.analyze(team.pokemonIds, speciesData, typeChart.resources) };
  }));
  require('./shoutbox').routes(app,repo,true);
  require('./forum-routes').routes(app,repo,true);
  require('./enhancement-routes').routes(app,repo,{config,publicOnly:true});
  app.use('/api', async (req, res, next) => {
    const user = req.session.userId ? await repo.user(req.session.userId) : null;
    if (!user) return next(new v.HttpError(401, 'Please log in to continue.'));
    req.staff=await staffFor(user);
    if(req.staff.restriction){delete req.session.userId;await sessionCall(req,'save');throw restricted(req.staff);}
    req.user = user;
    next();
  });
  require('./shoutbox').routes(app,repo);
  require('./gba').routes(app,{config,root});
  require('./music').routes(app,{config});
  require('./admin-routes').routes(app,repo);
  require('./forum-routes').routes(app,repo);
  require('./enhancement-routes').routes(app,repo,{config});
  app.get('/api/profile', (req, res) => res.json({ user: publicUser(req.user,req.staff) }));
  app.get('/api/profile/decorations', communityOperation(async req => {
    await repo.progression.snapshot(req.user.id);
    return { decoration:await repo.community.decoration(req.user.id), choices:decorations.choices, badges:await repo.community.earnedBadges(req.user.id) };
  }));
  app.put('/api/profile/decorations', communityOperation(async req => ({ decoration:await repo.community.saveDecoration(req.user.id,decorations.validate(req.body)) })));
  app.get('/api/community/settings', communityOperation(async req => ({ settings: await repo.community.settings(req.user.id) })));
  app.put('/api/community/settings', communityOperation(async req => ({ settings: await repo.community.saveSettings(req.user.id, community.settings(req.body)) })));
  app.get('/api/community/preview', communityOperation(async req => ({ profile: await community.profile(repo, req.user, await repo.community.settings(req.user.id), true) })));
  app.get('/api/teams/:id/visibility', communityOperation(req => repo.community.teamSettings(req.user.id, v.id(req.params.id))));
  app.put('/api/teams/:id/visibility', communityOperation(req => repo.community.share(req.user.id, v.id(req.params.id), community.visibility(req.body))));
  app.get('/api/teams/:id/analysis', async (req, res) => {
    const team = (await repo.teams(req.user.id)).find(t => t.id === v.id(req.params.id));
    if (!team) throw new v.HttpError(404, 'Team not found.');
    res.json({ analysis: teamAnalysis.analyze(team.pokemonIds, speciesData, typeChart.resources) });
  });
  app.patch('/api/profile', async (req, res) => {
    v.object(req.body);
    const bio=v.text(req.body.bio,'Biography',0,500),format=req.body.format||'plain';if(!['plain','limited'].includes(format))v.fail('Choose a supported biography format.');if(format==='limited')try{require('../rich-biography').parse(bio);}catch(e){v.fail(e.message);}
    const user = await repo.updateBio(req.user.id,bio,format);
    res.json({ user: publicUser(user,req.staff) });
  });
  const upload = multer({
    storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 1024 },
    fileFilter(req, file, callback) {
      callback(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? null : new v.HttpError(400, 'Upload a JPEG, PNG or WebP image.'), true);
    }
  });
  app.post('/api/profile/avatar', uploadLimiter, upload.single('avatar'), async (req, res) => {
    if (!req.file) throw new v.HttpError(400, 'Select a profile picture.');
    if(Object.keys(req.body||{}).some(key=>key!=='crop'))throw new v.HttpError(400,'Only the picture and crop coordinates may be uploaded.');
    let bytes;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 16_000_000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw Error('Unsupported image');
      // Crop coordinates refer to the upright image, after EXIF orientation is applied.
      const {data,info}=await image.rotate().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
      const crop=v.avatarCrop(req.body?.crop,info.width,info.height);
      let output=sharp(data,{raw:{width:info.width,height:info.height,channels:info.channels}});
      if(crop)output=output.extract(crop);
      bytes=await output.resize(256,256,{fit:'cover'}).webp({quality:85}).toBuffer();
    } catch(error) { if(error instanceof v.HttpError)throw error;throw new v.HttpError(400, 'Invalid image. Use a nonanimated JPEG, PNG or WebP under 2 MB and 16 megapixels.'); }
    const filename = `${crypto.randomUUID()}.webp`;
    const target = path.join(config.uploadDir, filename);
    await fs.writeFile(target, bytes, { flag: 'wx' });
    let old;
    try { old = await repo.updateAvatar(req.user.id, filename); }
    catch (error) { await fs.unlink(target).catch(() => {}); throw error; }
    if (old && avatarPattern.test(old)) await fs.unlink(path.join(config.uploadDir, old)).catch(() => {});
    res.json({ user: publicUser(await repo.user(req.user.id),req.staff) });
  });
  app.get('/api/teams', async (req, res) => res.json({ teams: await repo.teams(req.user.id) }));
  app.post('/api/teams', async (req, res) => res.status(201).json({ team: await repo.createTeam(req.user.id, v.team(req.body, false).name) }));
  app.put('/api/teams/:id', async (req, res) => res.json({ team: await repo.saveTeam(req.user.id, v.id(req.params.id), v.team(req.body)) }));
  app.delete('/api/teams/:id', async (req, res) => {
    await repo.deleteTeam(req.user.id, v.id(req.params.id)); res.status(204).end();
  });
  app.get('/api/favorites', async (req, res) => res.json({ pokemonIds: await repo.favorites(req.user.id) }));
  app.put('/api/favorites/:id', async (req, res) => {
    await repo.favorite(req.user.id, v.id(req.params.id, 649), true); res.status(204).end();
  });
  app.delete('/api/favorites/:id', async (req, res) => {
    await repo.favorite(req.user.id, v.id(req.params.id, 649), false); res.status(204).end();
  });
  const progression = operation => async (req, res) => {
    try { res.json(await operation(req)); }
    catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') throw new v.HttpError(503, 'Trainer progression is unavailable. Apply the manual v0.5.0 migration in MySQL Workbench; existing trainer features are still available.');
      throw error;
    }
  };
  app.get('/api/pokedex', progression(req => repo.progression.snapshot(req.user.id)));
  app.get('/api/pokedex/:id', progression(async req => {
    const id = v.id(req.params.id, 649);
    const bundle = await repo.progression.snapshot(req.user.id);
    return bundle.collection.find(row => row.pokemonId === id) || { pokemonId: id, status: 'not-registered', seenAt: null, caughtAt: null, updatedAt: null };
  }));
  app.put('/api/pokedex/:id', progression(req => repo.progression.set(req.user.id, v.id(req.params.id, 649), v.collectionStatus(req.body))));
  app.delete('/api/pokedex/:id', progression(req => repo.progression.remove(req.user.id, v.id(req.params.id, 649))));
  app.get('/api/progression', progression(async req => ({ statistics: (await repo.progression.snapshot(req.user.id)).statistics })));
  app.get('/api/achievements', progression(async req => ({ achievements: (await repo.progression.snapshot(req.user.id)).achievements })));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

  // Explicit allowlist: never expose .env, SQL, source, tests or node_modules.
  for (const asset of ['music-library.js','music-player.js','music-player.css','shoutbox.js','shoutbox.css','games.js','games.css','gba-saves.js','gba-emulator.js','gba-player.js','community-expansion.css','settings.js','member-cards.js','staff.js','profile-extras.js','rich-biography.js','forum-discovery.js','forum-polls.js','battle-recording.js','battle-history.js','forums.css','forums.js','forum-admin.js','forum-notifications.js','battle.css','battle.js','battle-data.js','battle-calculations.js','battle-engine.js','battle-engine-legacy.js','battle-simulator.js','vendor/battle-simulator.js','battle-runner.js','styles.css', 'trainer-hub.css', 'community.css', 'trainer-names.js', 'interactions.css', 'admin.css', 'admin.js', 'trainer-ranks.js', 'trainer-cards.css', 'script.js', 'theme.js', 'pokemon-selector.js', 'account.js', 'avatar-cropper.js', 'pokemon-data.js', 'advanced-filters.js', 'dashboard.js', 'encyclopedia-data.js', 'encyclopedia.js', 'trainer-progress.js', 'team-analysis-data.js', 'team-analysis.js', 'community.js', 'profile-decorations.js', 'trainer-card-config.js', 'sprite-availability.js', 'pokemon-sprites.js', 'artwork-fallback.svg']) {
    app.get(`/${asset}`, (req, res) => res.sendFile(path.join(root, asset)));
  }
  app.get('/images/group-picture.png', (req, res) => res.sendFile(path.join(root, 'images/group-picture.png')));
  app.get('/images/prof_nicklas.png', (req, res) => res.sendFile(path.join(root, 'images/prof_nicklas.png')));
  app.get('/images/prof_nicklas-cutout.png', (req, res) => res.sendFile(path.join(root, 'images/prof_nicklas-cutout.png')));
  app.get('/images/patrick.png', (req, res) => res.sendFile(path.join(root, 'images/patrick.png')));
  for (const image of ['analyst_jannick.png', 'lucas.png', 'oscar.png']) {
    app.get(`/images/${image}`, (req, res) => res.sendFile(path.join(root, 'images', image)));
  }
  app.get('/media/banners/:filename',async(req,res)=>{if(!require('./enhancement-routes').safeFile.test(req.params.filename)||!req.session.userId)throw new v.HttpError(404,'Banner unavailable.');const owner=await repo.user(req.session.userId);if(!owner)throw new v.HttpError(404,'Banner unavailable.');const staff=await staffFor(owner);if(staff.restriction)throw restricted(staff);const row=await repo.enhancements.settings.row(req.session.userId);if(row.bannerFilename!==req.params.filename)throw new v.HttpError(404,'Banner unavailable.');res.set('Cache-Control','no-store').sendFile(path.join(config.uploadDir,req.params.filename));});
  app.get('/media/avatars/:filename', async (req, res, next) => {
    if (!avatarPattern.test(req.params.filename)) return next(new v.HttpError(404, 'Image not found.'));
    // Existing avatar URLs are owner-only. Public pictures use a revocable profile route.
    const owner = req.session.userId ? await repo.user(req.session.userId) : null;
    if (!owner || owner.avatar_filename !== req.params.filename) throw new v.HttpError(404, 'Image not found.');
    const staff=await staffFor(owner);if(staff.restriction)throw restricted(staff);
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(config.uploadDir, req.params.filename));
  });
  for(const page of ['forums.html','battle.html','staff.html','settings.html','battle-history.html'])app.get('/'+page,(req,res)=>res.sendFile(path.join(root,page)));
  app.get('/data/battle-v5.json',(req,res)=>res.sendFile(path.join(root,'data/battle-v5.json')));
  app.get('/pokemon.html', (req, res) => res.sendFile(path.join(root, 'pokemon.html')));
  app.get('/dashboard.html', (req, res) => res.sendFile(path.join(root, 'dashboard.html')));
  app.get('/data/pokemon-summary.json', (req, res) => res.sendFile(path.join(root, 'data/pokemon-summary.json')));
  app.get('/data/type-chart.json', (req, res) => res.sendFile(path.join(root, 'data/type-chart.json')));
  app.get('/vendor/chart.umd.js', (req, res) => res.sendFile(path.join(root, 'vendor/chart.umd.js')));
  app.get('/games.html',(req,res)=>res.sendFile(path.join(root,'games.html')));
  app.get('/trainers.html', (req, res) => res.sendFile(path.join(root, 'trainers.html')));
  app.get('/community.html', (req, res) => res.sendFile(path.join(root, 'community.html')));
  app.get('/admin.html', (req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(root,'admin.html')));
  app.get('/about.html', (req, res) => res.sendFile(path.join(root, 'about.html')));
  for (const route of ['/trainer/:username', '/team/:shareId']) app.get(route, async (req, res) => {
    // Relative assets still work in a static subpath; clean backend URLs use the root.
    const html = await fs.readFile(path.join(root, 'community.html'), 'utf8');
    res.set('Cache-Control', 'no-store').type('html').send(html.replace('<head>', '<head>\n    <base href="/">'));
  });
  for (const view of ['profile', 'teams', 'favorites']) app.get(`/${view}`, (req, res) => res.redirect(302, `trainers.html#view=${view}`));
  for (const page of ['/', '/index.html']) app.get(page, (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.use((req, res) => res.status(404).json({ error: 'Page not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    let message = error.message;
    if (error instanceof multer.MulterError) { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; message = 'Upload one JPEG, PNG or WebP image, no larger than 2 MB.'; }
    if (error.code === 'ER_DUP_ENTRY') { status = 409; message = 'That username or email is already registered, or that Pokémon is already on the team.'; }
    if ((error.code?.startsWith('ER_') && error.code !== 'ER_DUP_ENTRY') || ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) { status = 503; message = 'Database unavailable. Please try again later.'; }
    if (status >= 500) { console.error('Request failed:', error.code || error.name); message = status === 503 ? message : 'Something went wrong. Please try again.'; }
    if (error.type === 'entity.parse.failed') message = 'Request body must be valid JSON.';
    res.status(status).json({ error: message, ...(error.code==='ACCOUNT_RESTRICTED'?{code:error.code,restriction:error.restriction}:{}) });
  });
  return app;
}
module.exports = { createApp };
