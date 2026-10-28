# Express API

## v0.7.1 community settings and saved simulations

Requires the complete [manual v0.7.1 migration](../database/MIGRATION_v0.7.1.md).
All private routes use the existing session cookie, fresh account restrictions,
ownership and CSRF/origin checks. No request accepts an owner ID, staff role,
earned rank, award or authoritative battle outcome. Missing/partial upgrades
return an actionable 503. See older sections for unchanged v0.7.0 endpoints.

| Method | Endpoint | Contract |
| --- | --- | --- |
| GET | `/api/settings` | Owner's profile/privacy/notification/preferences objects and private banner URL |
| GET | `/api/settings/preferences` | Theme and default battle difficulty |
| PUT | `/api/settings/profile` | Complete `{birthday,location,website,gender,genderText,occupation,social}` |
| PUT | `/api/settings/privacy` | Complete `{birthday,location,gender,occupation,website,social,banner,activity,presence,followers,acceptFollowers}` |
| PUT | `/api/settings/notifications` | Complete booleans `{replies,watched,mentions,followers,announcements,moderation}` |
| PUT | `/api/settings/preferences` | `{theme:system/dark/light,battleDifficulty:easy/normal/hard}` |
| POST | `/api/settings/activity` | Update presence only when already opted in |
| PATCH | `/api/profile` | Existing `{bio}` stays plain; optional `format:limited` validates limited markup |
| POST | `/api/profile/avatar` | Existing avatar multipart upload/crop |
| DELETE | `/api/settings/avatar` | Remove owner's avatar and revoke old image URL |
| POST | `/api/settings/banner` | Multipart `banner` and JSON `crop:{x,y,width,height}` in oriented source pixels |
| DELETE | `/api/settings/banner` | Restore default, revoke image URL, remove previous owned file |
| POST | `/api/settings/password` | `{currentPassword,newPassword}`; Argon2id, rotate current session and invalidate others |
| POST | `/api/settings/revoke-sessions` | `{currentPassword}`; rotate current session and invalidate others |
| GET | `/api/public/staff?after=id` | Live Owner/Administrator/Moderator directory, 25 entries, cursor `next` |
| GET | `/api/public/members?after=id` | Opted-in public member directory, same pagination |
| GET | `/api/public/members/:username` | Privacy-safe preview; blocked viewer/target returns 404 |
| GET | `/api/public/trainers/:username/banner` | Current published banner only; no-store, 404 after revocation |
| GET | `/api/community/discovery` | Groups/categories, latest/trending, public totals, optional 24-hour presence |
| GET | `/api/community/latest?page=n` | Visible public posts and safe author projections |
| GET | `/api/community/me/activity?page=n` | Owner's visible posts and statistics |
| GET | `/api/community/me/reactions?page=n` | Owner's visible posts receiving reactions |
| GET | `/api/social/following` or `/api/social/blocked` | Owner's paginated list, `?page=n` |
| PUT/DELETE | `/api/social/following/:username` | Follow/unfollow; self-follow and blocked pairs prohibited |
| PUT/DELETE | `/api/social/blocked/:username` | Block/unblock; blocking removes follows both ways |
| GET | `/api/bookmarks?page=n` | Owner's saved, still-visible discussions |
| PUT/DELETE | `/api/bookmarks/:threadId` | Save/remove bookmark, separate from watched discussions |
| GET | `/api/forums/watched?page=n` | Existing discussion subscriptions |
| GET | `/api/forums/new-posts?page=n` | Posts newer than owner's read cursor/account creation |
| POST | `/api/forums/read` | Advance owner's forum read cursor |
| PUT | `/api/notifications/read-all` | Mark owner's notifications read |
| GET | `/api/forums/threads/:id/poll` | Poll/options/tallies, own selected option, closed state |
| POST | `/api/polls/:id/vote` | `{optionId}`, one immutable choice per user/poll |
| POST | `/api/polls/:id/close` | `{reason}`, author or authorized staff with hierarchy checks/audit |
| PUT | `/api/admin/forums/layout/:categoryId` | `{groupName,parentId:null/id}`, one-level same-group subforums |
| POST | `/api/battles/start` | `{configuration,mode,difficulty}` => server seed, token, ruleset |
| POST | `/api/battles/:token/complete` | `{actions}` => server-reconstructed completed simulation ID/qualification |
| POST | `/api/battles/import` | `{configuration,mode,difficulty,seed,actions}`, always unqualified local import |
| GET | `/api/battles` | Owner history: `page`, `pokemon`, `outcome:all/win/loss/draw/auto`, `sort:newest/oldest/turns` |
| GET | `/api/battles/statistics` | Owner's saved-visible totals, outcomes, modes and selected/opponent species |
| GET | `/api/battles/:id` | Owner-only summary and integrity-checked exact versioned replay |
| DELETE | `/api/battles/:id` | Remove from owner's history/statistics; retain qualification evidence |

Optional poll on existing `POST /api/forums/threads` is
`poll:{question,options:[2..6 distinct labels],closesAt:null/ISO-date}`. The thread
and poll are inserted atomically. Closing date must be within 180 days. Hidden or
locked discussions cannot accept votes; neither can expired/closed polls.

Personal fields start private. Birthday is `hidden`, `month-day` or `full`; only
`full` exposes year/age. Gender is `unspecified`, `man`, `woman`, `self-describe`;
optional social links are at most five `{label,url}` pairs. Only HTTP(S) URLs
without embedded credentials are accepted. Public fields additionally require the
existing master public-profile switch. Public DTOs never contain email, security
versions, permissions or private timestamps. Limited biography responses carry
`bioFormat:limited`; old plain text remains literal. Rendering uses a strict AST,
not arbitrary HTML. Source is limited to 500 characters.

Banner uploads accept real JPEG/PNG/WebP, at most 2 MB and 16 MP; Sharp rotates
EXIF, validates the 3:1 crop, strips metadata and writes 1200x400 WebP under an
opaque filename. Avatar behavior is shared with the existing cropper. Owner media
uses authenticated routes; published routes recheck current sharing on every read.

Blocks stop follows, reactions, quotes and social notification delivery in both
directions; otherwise-public posts/profiles remain publicly readable. Follow
notifications are deduplicated per sender/recipient/day and link to a safe member
preview. Blocked sender identity is omitted from previously received notifications.

Battle configuration contains exactly two `{id,level,moves}` entries, validated
against the pinned Gen V data. Player actions are selected move IDs; auto actions
are null. At most 200 actions and 2 MB replay are accepted. Tickets expire after
24 hours and are single-use. No client-provided frames, winner, stats or awards
are trusted. Saved canonical SHA-256 digests prevent duplicate replay imports and
survive MySQL JSON key reordering. Playback uses saved frames, never the current
engine's randomness. Every record remains explicitly a simulation.

New private feature groups allow 120 requests/minute; credential actions 8/15
minutes, banners 10/minute, battle starts/imports 30/hour. Public discovery is
limited to 180/minute alongside existing public/forum limits. Limits are per
process. Current sessions survive reauthentication; other sessions are rejected
on their next API/private-media request via a server-owned security version.

Trainer cosmetics: authenticated `GET /api/profile/decorations` returns `{decoration,choices,badges}`; `PUT` accepts only the complete curated style/title/motto/pinned-badge object with existing CSRF/origin checks. Pins must be earned by the session owner. Public profiles expose styling, with pins only when achievement sharing is enabled. See [TRAINER_STYLE.md](../TRAINER_STYLE.md) for the full contract and unexecuted additive migration. Progression now returns 102 definitions (including six v0.7.1 community/battle awards) with rarity/category metadata while retaining existing award keys/dates.

## Trainer community (v0.6.0)

Requires the reviewed [manual community migration](../database/MIGRATION_v0.6.0.md) after v0.5.0. Missing rows mean private; every sharing flag defaults to false. Nothing is published automatically. See [COMMUNITY.md](../COMMUNITY.md) for complete JSON projections, settings validation, privacy rules and calculations.

| Method | Endpoint | Access / result |
| --- | --- | --- |
| GET | `/api/public/trainers?q=name&after=ID` | Public, bounded 24-profile opt-in directory with literal partial username search; `{trainers:[publicCard],next,total}` |
| GET | `/api/public/trainers/:username` | Public, enabled profile's approved projection only; `{profile}` |
| GET | `/api/public/trainers/:username/teams` | Public, enabled profile's shared teams only; `{teams}` |
| GET | `/api/public/trainers/:username/avatar` | Public WebP only while both profile/picture sharing are enabled |
| GET | `/api/public/teams/:shareId` | Public UUIDv4 team, only while explicitly public; `{team,analysis}` |
| GET | `/api/community/settings` | Authenticated owner's `{settings}` |
| PUT | `/api/community/settings` | Owner's complete validated settings → `{settings}` |
| GET | `/api/community/preview` | Owner-only saved public-profile projection; never publishes |
| GET | `/api/teams/:id/visibility` | Owned team → `{visibility,shareId}` |
| PUT | `/api/teams/:id/visibility` | Owned team, `{visibility:"private"\|"public"}` → authoritative visibility/link |
| GET | `/api/teams/:id/analysis` | Owned saved lineup → `{analysis}`; no publication required |

Public API reads precede private-auth middleware, use explicit field allowlists and visibility predicates, and are limited to 120 requests/minute/IP/process. Profile disable removes the profile/directory entry; independent public teams must be revoked separately. Disabling/deleting a team makes its old UUID URL return 404. UUIDs never confer editing rights. Settings/sharing writes use session-derived ownership, bound values, row locks/transactions and existing CSRF/origin checks. Unknown/private resources return 404, malformed inputs 400, missing auth 401, bad CSRF 403, throttling 429 and absent schema 503. Public and private responses remain `no-store`. Public statistics expose approved aggregates only, never raw collection records/recent activity or private settings.

Settings require exactly `{enabled,shareBio,featuredPokemonId,featuredTeamId,shareAvatar,shareFavorites,shareProgress,shareAchievements}` with actual boolean flags, nullable species ID 1–649 and nullable owned featured-team ID. Only independently public featured teams appear publicly. Biography comes from users.bio only when shareBio is true; email is never public. There is no publicBio input. PATCH /api/profile edits the single Biography (0–500 characters). Existing installations require the manual database/migrations/single-biography.sql migration; reads safely hide biography until it is applied. Existing usernames remain unique and immutable in the UI; invalid or obsolete profile names fail gracefully.

Pages `/community.html`, `/trainer/:username` and `/team/:shareId` serve the community shell; clean routes require Express. Static previews show a backend-required explanation. Analysis shares the existing Encyclopedia's modern multiplier logic and the bundled official type chart; draft analysis also works privately in the browser. See [COMMUNITY.md](../COMMUNITY.md#team-analysis-calculations).

## Trainer progression (v0.5.0)

Requires the reviewed, manually applied [v0.5.0 migration](../database/MIGRATION_v0.5.0.md). Existing trainer endpoints remain unchanged. All progression endpoints run after the normal authentication middleware and infer ownership exclusively from `req.user.id`; no owner ID is accepted from the client. API responses remain `Cache-Control: no-store`.

| Method | Endpoint | Body / result |
| --- | --- | --- |
| GET | `/api/pokedex` | `{collection, statistics, achievements}` consistent private bundle |
| GET | `/api/pokedex/:id` | `{pokemonId,status,seenAt,caughtAt,updatedAt}`; an absent registration returns `not-registered` with null dates |
| PUT | `/api/pokedex/:id` | `{status:"seen"}` or `{status:"caught"}` → updated private bundle |
| DELETE | `/api/pokedex/:id` | Remove the current user's registration → updated private bundle |
| GET | `/api/progression` | `{statistics}`: National/generation/type counts, percentages, recent registrations, team/favourite counts |
| GET | `/api/achievements` | `{achievements}`: definition/key/icon, `current`, `goal`, optional `unit` and historical `unlockedAt` |

IDs are integers 1–649; invalid IDs/statuses/extra PUT fields return 400. These endpoints never accept timestamps, owner identifiers or award claims. Guests receive 401 and bad CSRF/origin receives 403. Missing progression tables return 503 with the manual migration instruction; other SQL failures use the existing error protections. Mutations return 200 and a full authoritative bundle, and repeating an unchanged status or removing an absent record is idempotent.

Collection entries use UTC ISO timestamps. Caught always implies Seen: the row's `seen_at` is non-null, while `caught_at` is nullable. Caught → Seen clears only Caught; DELETE removes the collection row. The `(user_id,pokemon_id)` primary key prevents double counts. All calculations and achievement criteria use backend-owned records plus the complete local species dataset, never client-submitted totals.

Collection writes and award reconciliation lock the user row and commit in one transaction. Bundle/statistics/achievement GETs also reconcile qualifying awards, including pre-existing full teams. Saving six team members awards Team Builder within the existing team transaction. Awards have a unique `(user_id,achievement_key)` key and retain the first unlock date permanently after later collection/team removal. A missing pre-migration achievements table does not break existing team saves; genuine other errors still roll the team transaction back.

See [PROGRESSION.md](../PROGRESSION.md) for exact formulas, thresholds, timestamps, browser synchronization and schema limitations. The public analytics JSON/dashboard remains global Pokémon data and does not expose collection records.

Version 0.4.0 expands the public detail dialog without adding trainer API endpoints. Shareable entries use `/pokemon.html?pokemon=1` through `?pokemon=649`. The allowlisted `encyclopedia-data.js` and `encyclopedia.js` fetch public PokéAPI resources on demand; species/evolution/move/type data does not enter MySQL. Existing session, CSRF, ownership and team/favourite bounds remain unchanged.

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
| POST | `/api/profile/avatar` | Multipart `avatar`; one JPEG/PNG/WebP, ≤2 MB and ≤16 MP; optional `crop` JSON `{x,y,size}` in upright source-image pixels → `{user}` |
| GET | `/api/teams` | `{teams:[{id,name,created_at,pokemonIds}]}` owned by current user |
| POST | `/api/teams` | `{name}` (1–60 characters) → 201 `{team}` |
| PUT | `/api/teams/:id` | `{name,pokemonIds:[1,25]}` → `{team}`; atomically replaces name and complete roster |
| DELETE | `/api/teams/:id` | 204; own team only |
| GET | `/api/favorites` | `{pokemonIds:[...]}` belonging to current user |
| PUT | `/api/favorites/:id` | Idempotently save Pokémon #001–649 → 204 |
| DELETE | `/api/favorites/:id` | Idempotently remove favourite → 204 |

All profile/team/favourite endpoints require authentication. Team member IDs are integers 1–649, at most six, without duplicates. #650 is rejected. PUT supports adding, removing and replacing members in one transaction. Ownership is selected with the authenticated session's user ID; client-supplied user IDs are never used. A team row lock serializes concurrent writes; CHECK/unique/foreign-key constraints reinforce invariants. Concurrent saves use last-completed-save semantics. Existing databases need the manual v0.2.0 CHECK migration; startup never runs it.

Statuses: 400 invalid data; 401 unauthenticated/invalid login; 403 missing or invalid CSRF/disallowed origin; 404 absent or unowned team; 409 conflicting username/email; 413 upload/request too large; 429 rate limited; 503 unavailable database; 500 unexpected server error. Password hashes, SQL errors and secrets are never returned.

Sessions persist in the `sessions` MySQL table with a seven-day rolling TTL. Expired sessions are ignored and pruned at startup/hourly. Passwords use Argon2id through node-argon2. Uploads are decoded with a pixel limit, rotated, stripped of input metadata, resized to 256×256 and re-encoded as WebP with a random server-generated filename. Old avatar files are removed after the database update succeeds. Since v0.6.0, original `/media/avatars/:filename` URLs require the matching authenticated owner and use `no-store`; optional public pictures use a separate revocable `/api/public/trainers/:username/avatar` route. No avatar files are replaced by the upgrade.


Avatar framing: the optional multipart `crop` field is a bounded JSON object `{x,y,size}` with integer square coordinates in the original picture after EXIF orientation is applied. Express rejects extra fields, malformed/out-of-bounds crops and invalid images before replacing the avatar. Omitting crop retains the legacy centre crop. The browser preview supports drag, zoom, arrows, reset/cancel; only an explicit upload changes the saved picture. The original file still has the existing 2 MB/16 MP limits, and the stored output remains a metadata-stripped 256 by 256 WebP. No schema migration is required.


## Trainer Card Studio v0.6.1

Authenticated GET /api/profile/decorations returns {decoration,choices,badges}; PUT saves a complete validated decoration to the session owner. Legacy bodies with the original seven keys remain accepted and gain defaults. New optional fields: accentColor/borderColor/frameColor (null or #RRGGBB), borderStyle (solid/double/dashed/etched), titleStyle (ribbon/pill/minimal). See trainer-card-config.js for the exact curated palettes, backgrounds, frames and effects. Arbitrary CSS/HTML/URLs and extra fields are rejected, and pins still require earned owner awards.

Public decoration projections expose these cosmetic values only through already enabled public profiles/cards. They cannot publish hidden content. No changes to authentication, uploads, teams or collection APIs. Pre-upgrade reads normalize old rows; expanded writes require database/migrations/v0.6.1-trainer-studio.sql and return 503 with guidance if fields/checks are missing. The migration is manual only.

Sprites are client image assets selected from existing species IDs; the utility adds no API endpoints and no private data fields. The Express allowlist explicitly serves trainer-card-config.js, trainer-cards.css, sprite-availability.js and pokemon-sprites.js. Development scripts, manifests under tests, SQL and server source remain private.


## Ranks & Administration v0.6.2

All eight administrative endpoints, bodies, capability names, policies and status codes are specified in [ADMINISTRATION.md](../ADMINISTRATION.md#api-contract). Every administrative call needs current panel.access plus its specific capability; mutations also retain the existing session CSRF/origin checks. Owner bootstrap is a separate explicitly invoked local command, never an HTTP route.

GET /api/auth/session and private profile results include the caller's own staff context (available/role/permissions/roleVersion). No client role claim is trusted. Restrictions are checked at login, session refresh, private API access and private avatar reads; denied active sessions are cleared. Administrative role changes re-read authority under a serialized guard and require an expected target version. Audit insertion is in the same transaction. Private content ownership is unchanged for staff.

Private progression bundles include a server-calculated rank. Existing shareProgress controls whether public profile/directory projections include it; private staff permission context is not added publicly. Published profiles/cards may include only an allowlisted staffRole label for Owner/Administrator/Moderator name styling; no permissions, revisions or restriction data. No stored rank/count or new Pokémon API requests. Exact tiers: Rookie 0-24, Bronze 25-99, Silver 100-249, Gold 250-449, Diamond 450-648, Champion 649.

The additive v0.6.2 tables and readiness behavior are documented in [the manual migration guide](../database/MIGRATION_v0.6.2.md). Complete absence leaves base Trainer use available with no staff privileges; a partial administrative installation fails closed. No migration is performed at startup.

## v0.7.0 forums and notifications

See [FORUMS.md](../FORUMS.md) for identity/privacy, moderation hierarchy and limits.
All responses inherit `/api` no-store behavior. Public reads are unauthenticated;
all writes and notification/staff reads reuse authenticated sessions. Every write
requires the existing CSRF token and allowed origin. Forum schema failures return
503 with manual upgrade guidance; other trainer APIs remain separate.

| Method | Path | Request / behavior |
| --- | --- | --- |
| GET | `/api/forums/categories` | Database categories, flags, thread/reply totals and latest activity |
| GET | `/api/forums/threads` | `category`, literal title `q`, `sort=activity/newest/replies`, `page` (20/thread page) |
| GET | `/api/forums/threads/:id` | `page`; optional `post` resolves that post's page; visible posts/quotes/current public team DTOs and signed-in ownership/reaction/follow state |
| POST | `/api/forums/threads` | `categoryId,title,body`; optional `teamShareId,quotePostId` (a new thread has no existing quote source) |
| PATCH | `/api/forums/threads/:id` | Own unlocked thread: `title,version` |
| POST | `/api/forums/threads/:id/posts` | `body`; optional owned-public `teamShareId` and visible same-thread `quotePostId`; returns post ID/page |
| PATCH | `/api/forums/posts/:id` | Own unlocked post: `body,version`; optional `teamShareId,quotePostId`; original quote identity cannot change |
| DELETE | `/api/forums/posts/:id` | Own unlocked post: `version`; retains the row and audit |
| PUT / DELETE | `/api/forums/posts/:id/reaction` | Add/remove own unique reaction |
| PUT / DELETE | `/api/forums/threads/:id/follow` | Add/remove own unique subscription |
| POST | `/api/forums/threads/:id/reports` | `reason`; optional `postId`; duplicate pending reports rejected |
| GET | `/api/notifications` | Own notifications, unread count and `page` (30 per page); no post body/private/removed previews |
| PUT | `/api/notifications/:id/read` | Mark only an owned notification read |
| GET | `/api/admin/forums/reports` | Pending reports within current staff authority; `page` (25 per page) |
| GET | `/api/admin/forums/history` | Owner: all forum actions; other staff: own actions; `page` |
| GET | `/api/admin/forums/threads/:id` | Inspect current/retained thread/post content within authority; `page` (20 posts) |
| POST | `/api/admin/forums/moderate` | `threadId,action,version,reason`; optional `postId,reportId`; boolean `value` required for `lock`/`pin`; actions `hide,remove,restore,lock,pin,resolve` (resolve requires report) |
| POST | `/api/admin/forums/categories` | `name,description,announcements,active,position`; configuration permission |
| PUT | `/api/admin/forums/categories/:id` | Same complete fields; archive with `active:false`, preserving discussions |

State changes return committed JSON only. Unknown fields, malformed IDs/choices,
forged authors and stale versions are rejected. HTTP 400 validation, 401 login,
403 permission/CSRF/restriction, 404 unavailable/foreign content, 409 conflict,
429 rate limit and 503 missing schema are meaningful failure states. The existing
16 KB JSON limit applies. New capabilities are `forums.moderate` and
`forums.configure`, each also requiring `panel.access`.

The Battle Arena has no result-writing API or battle tables. `GET
/data/battle-v5.json` serves its pinned public snapshot through the static
allowlist; summaries are untrusted forum text only.
