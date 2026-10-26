# Express API

The frontend pages are `/` (Home), `/pokemon.html` (National Pokédex), `/trainers.html` (Trainer Hub) and `/dashboard.html` (public Pokémon Analytics). Hub sections use `#view=profile`, `#view=teams` and `#view=favorites`. Existing `/profile`, `/teams` and `/favorites` page URLs redirect to the matching hub section; API URLs and authorization are unchanged. Analytics reads the allowlisted public `/data/pokemon-summary.json` file and does not query private trainer records. Shared analytics scripts and the local `/vendor/chart.umd.js` bundle are explicitly allowlisted; maintenance scripts and `node_modules` remain inaccessible.

All API responses use JSON except successful 204 responses. Errors use `{ "error": "message" }`. The frontend and API share the same origin; permissive CORS is not enabled. Static files are explicitly allowlisted; server files, credentials, SQL, tests and dependencies are not served.

First call `GET /api/auth/session` with cookies enabled. It returns `{ user, csrfToken }` and initializes an HTTP-only session cookie. Include `X-CSRF-Token` on every POST/PATCH/PUT/DELETE, including login/register/logout and multipart uploads. Login and registration rotate the session ID and token; use the returned token thereafter. Session responses and private API data are `Cache-Control: no-store`.

| Method | Endpoint | Body / result |
| --- | --- | --- |
| GET | `/api/auth/session` | `{user:null|profile,csrfToken}` |
| POST | `/api/auth/register` | `{username,email,password}` → 201 `{user,csrfToken}`; signs in |
| POST | `/api/auth/login` | `{identifier,password}` → `{user,csrfToken}`; identifier is username or email |
| POST | `/api/auth/logout` | 204; destroys session and clears cookie |
| GET | `/api/profile` | Current user's profile; never another user's private data |
| PATCH | `/api/profile` | `{bio}` (0–500 characters) → `{user}` |
| POST | `/api/profile/avatar` | Multipart `avatar`; one JPEG/PNG/WebP, ≤2 MB and ≤16 MP → `{user}` |
| GET | `/api/teams` | `{teams:[{id,name,created_at,pokemonIds}]}` owned by current user |
| POST | `/api/teams` | `{name}` (1–60 characters) → 201 `{team}` |
| PUT | `/api/teams/:id` | `{name,pokemonIds:[1,25]}` → `{team}`; atomically replaces name and complete roster |
| DELETE | `/api/teams/:id` | 204; own team only |
| GET | `/api/favorites` | `{pokemonIds:[...]}` belonging to current user |
| PUT | `/api/favorites/:id` | Idempotently save Pokémon #001–649 → 204 |
| DELETE | `/api/favorites/:id` | Idempotently remove favourite → 204 |

All profile/team/favourite endpoints require authentication. Team member IDs are integers 1–649, at most six, without duplicates. #650 is rejected. PUT supports adding, removing and replacing members in one transaction. Ownership is selected with the authenticated session's user ID; client-supplied user IDs are never used. A team row lock serializes concurrent writes; CHECK/unique/foreign-key constraints reinforce invariants. Concurrent saves use last-completed-save semantics. Existing databases need the manual v0.2.0 CHECK migration; startup never runs it.

Statuses: 400 invalid data; 401 unauthenticated/invalid login; 403 missing or invalid CSRF/disallowed origin; 404 absent or unowned team; 409 conflicting username/email; 413 upload/request too large; 429 rate limited; 503 unavailable database; 500 unexpected server error. Password hashes, SQL errors and secrets are never returned.

Sessions persist in the `sessions` MySQL table with a seven-day rolling TTL. Expired sessions are ignored and pruned at startup/hourly. Passwords use Argon2id through node-argon2. Uploads are decoded with a pixel limit, rotated, stripped of input metadata, resized to 256×256 and re-encoded as WebP with a random server-generated filename. Old avatar files are removed after the database update succeeds. Avatar image URLs are publicly readable, unguessable resource URLs, not private profile-data endpoints; do not upload sensitive pictures.
