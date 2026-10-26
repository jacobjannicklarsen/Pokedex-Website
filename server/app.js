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

const publicUser = user => ({
  id: user.id, username: user.username, email: user.email, bio: user.bio,
  avatarUrl: user.avatar_filename ? `/media/avatars/${user.avatar_filename}` : null,
  createdAt: user.created_at
});
const sessionCall = (req, method) => new Promise((resolve, reject) => req.session[method](error => error ? reject(error) : resolve()));
const avatarPattern = /^[0-9a-f-]{36}\.webp$/;

async function createApp({ repo, store, config, authLimit = 30 }) {
  const app = express();
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
  app.use('/api', session({
    name: 'pokedex.sid', store, secret: config.secret,
    resave: false, saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: TTL, path: '/' }
  }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authLimit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
  const uploadLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many uploads. Please wait a minute.' } });

  app.get('/api/auth/session', async (req, res) => {
    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
    const user = req.session.userId ? await repo.user(req.session.userId) : null;
    if (!user) delete req.session.userId;
    // Save before responding, so a subsequent write sees the initialized session.
    await sessionCall(req, 'save');
    res.json({ user: user ? publicUser(user) : null, csrfToken: req.session.csrf });
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
    await sessionCall(req, 'regenerate');
    req.session.userId = user.id;
    req.session.csrf = crypto.randomBytes(32).toString('hex');
    await sessionCall(req, 'save');
    return { user: publicUser(user), csrfToken: req.session.csrf };
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
  app.use('/api', async (req, res, next) => {
    const user = req.session.userId ? await repo.user(req.session.userId) : null;
    if (!user) return next(new v.HttpError(401, 'Please log in to continue.'));
    req.user = user;
    next();
  });
  app.get('/api/profile', (req, res) => res.json({ user: publicUser(req.user) }));
  app.patch('/api/profile', async (req, res) => {
    v.object(req.body);
    const user = await repo.updateBio(req.user.id, v.text(req.body.bio, 'Trainer bio', 0, 500));
    res.json({ user: publicUser(user) });
  });
  const upload = multer({
    storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter(req, file, callback) {
      callback(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? null : new v.HttpError(400, 'Upload a JPEG, PNG or WebP image.'), true);
    }
  });
  app.post('/api/profile/avatar', uploadLimiter, upload.single('avatar'), async (req, res) => {
    if (!req.file) throw new v.HttpError(400, 'Select a profile picture.');
    let bytes;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 16_000_000, animated: false });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw Error('Unsupported image');
      bytes = await image.rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
    } catch { throw new v.HttpError(400, 'Invalid image. Use a nonanimated JPEG, PNG or WebP under 2 MB and 16 megapixels.'); }
    const filename = `${crypto.randomUUID()}.webp`;
    const target = path.join(config.uploadDir, filename);
    await fs.writeFile(target, bytes, { flag: 'wx' });
    let old;
    try { old = await repo.updateAvatar(req.user.id, filename); }
    catch (error) { await fs.unlink(target).catch(() => {}); throw error; }
    if (old && avatarPattern.test(old)) await fs.unlink(path.join(config.uploadDir, old)).catch(() => {});
    res.json({ user: publicUser(await repo.user(req.user.id)) });
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
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

  // Explicit allowlist: never expose .env, SQL, source, tests or node_modules.
  for (const asset of ['styles.css', 'script.js', 'theme.js', 'pokemon-selector.js', 'account.js', 'pokemon-data.js', 'advanced-filters.js', 'dashboard.js', 'artwork-fallback.svg']) {
    app.get(`/${asset}`, (req, res) => res.sendFile(path.join(root, asset)));
  }
  app.get('/images/group-picture.png', (req, res) => res.sendFile(path.join(root, 'images/group-picture.png')));
  app.get('/media/avatars/:filename', (req, res, next) => {
    if (!avatarPattern.test(req.params.filename)) return next(new v.HttpError(404, 'Image not found.'));
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(config.uploadDir, req.params.filename));
  });
  app.get('/pokemon.html', (req, res) => res.sendFile(path.join(root, 'pokemon.html')));
  app.get('/dashboard.html', (req, res) => res.sendFile(path.join(root, 'dashboard.html')));
  app.get('/data/pokemon-summary.json', (req, res) => res.sendFile(path.join(root, 'data/pokemon-summary.json')));
  app.get('/vendor/chart.umd.js', (req, res) => res.sendFile(path.join(root, 'vendor/chart.umd.js')));
  app.get('/trainers.html', (req, res) => res.sendFile(path.join(root, 'trainers.html')));
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
    res.status(status).json({ error: message });
  });
  return app;
}
module.exports = { createApp };
