# Dexhaven v0.6.0 — Trainer Community & Advanced Team Analysis

The website remains **Dexhaven**, the development project remains **Pokédex Website**, and the database remains **pokedex_app**. Implementation is on `dev/v0.6.0`; the existing uncommitted homepage artwork styling was carried forward. No migration, live database write, deployment, release, implementation commit or push was performed.

## Start and navigate

Existing databases need the reviewed [manual Workbench migration](database/MIGRATION_v0.6.0.md) after the v0.5.0 schema. No runtime migration/backfill occurs. New installations use `database/schema.sql`. Start Express normally with `npm.cmd start`.

| View | URL |
| --- | --- |
| Private profile and sharing settings | `/trainers.html#view=profile` |
| Private team builder, analysis and visibility | `/trainers.html#view=teams` |
| Opt-in trainer directory | `/community.html` |
| Public trainer | `/trainer/username` |
| Public team | `/team/UUIDv4` |

Clean URLs serve the shared community shell with a root base for local assets. The shell also supports `community.html?trainer=username` and `community.html?team=UUIDv4`. All four existing pages remain and navigation adds Community. The top-right avatar still opens the private hub. Public Pokémon cards link to the existing deep-linked Encyclopedia.

GitHub Pages/static previews can display the shell and existing public Pokémon tools, but cannot supply trainer data, authentication or clean Express routes. The community shell explicitly explains when its backend is unavailable. Configure a deployed same-origin Express backend before using public trainer links. No hosting or deployment configuration is changed automatically.

## Privacy model

- Every existing account and team stays private: absence of a settings row means disabled. Nothing is published by migration, registration, team save, analysis or preview.
- Enabling a public profile lists its username in the directory and authorizes username, joining date, single Biography only when Show biography publicly is enabled and an optional featured Pokémon. Biography is hidden until explicitly shared; there is no separate public editor. Username/email editing remains unsupported; existing validated usernames are unique and stable. Duplicate registration retains the existing 409 handling. Unknown/obsolete names return unavailable; links resolve a current username rather than guessing a renamed account.
- Picture, favourites, completion totals and unlocked achievements each have a separate unchecked-by-default switch. Public statistics contain National/generation aggregates only, without recent activity, individual collection records, team/favourite counts or private filters. Public achievement entries contain definition and unlock date, without current private metrics.
- Individual teams have separate Private/Public controls. Public means its saved name, lineup, analysis and trainer username can be read by anyone with its UUID link, even if the trainer keeps their profile private. Disabling a profile removes its page and directory entry; **it does not revoke separately shared teams**. The settings UI states this explicitly. Set each team private to revoke its link. A private or deleted team returns 404 for everyone, including its owner through the public endpoint. The owner still manages it through private APIs.
- Featured teams must belong to the authenticated owner and appear only while independently public. Public profile queries select shared teams only. Sharing does not duplicate a team. UUID links are stable across visibility changes; republishing re-enables the same link. A UUID is an identifier, not authorization: the server always checks visibility.
- Existing `/media/avatars/UUID.webp` URLs now require the matching authenticated owner. Public profile images use `/api/public/trainers/username/avatar`, which checks profile and picture sharing on every request. Both use `no-store`, preventing new public cache retention after revocation. Existing uploads are preserved; disabling sharing does not delete them. Downloaded copies or content cached before this update cannot be remotely withdrawn.
- Preview is authenticated and uses the same explicit public projection, even while the profile is private. It previews saved settings and uses an owner-only avatar URL. It never publishes anything.

## Storage and authorization

`trainer_public_settings` owns one optional row per user: disabled flag, explicit biography sharing flag, nullable featured species/team, and optional sharing flags. `team_sharing` owns one optional row per existing team, with a unique UUIDv4 and disabled public flag. See the [community migration guide](database/MIGRATION_v0.6.0.md) and subsequent [single-biography migration](database/MIGRATION_single-biography.md). Old `public_bio` text is archived in place and no longer edited or published.

Protected endpoints continue to derive ownership exclusively from `req.user.id`. Sharing updates lock an owned team, and settings updates lock the owner plus the featured team before writing, in transactions with rollback on error. All values are bound parameters. Visitors get read-only projections, never private user/settings rows. Authentication, HTTP-only sessions, password hashing and CSRF/origin checks are retained. Public read endpoints have a per-process limit of 120 requests per minute per IP; directory pages use a bounded 24-item cursor query. API errors hide internal SQL details, and missing new tables return a migration instruction.

All public/private API responses use `Cache-Control: no-store`; the browser never saves public profiles, sharing settings or trainer records in localStorage. Ordinary public Pokémon caches are unchanged. Biographies, names and errors are inserted as text, never HTML. Server source, migrations and tests remain outside the explicit static allowlist.

## API reference

Public GETs require no login. The trainer/team JSON is already visibility-filtered on Express:

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/public/trainers?q=name&after=ID` | `{trainers:[publicCard],next:null\|cursor,total}`; enabled profiles only, literal partial username search, 24 per page |
| GET | `/api/public/trainers/:username` | `{profile}` with approved fields only, otherwise 404 |
| GET | `/api/public/trainers/:username/teams` | `{teams}` containing only that enabled profile's shared teams |
| GET | `/api/public/trainers/:username/avatar` | WebP only if profile and picture sharing are enabled |
| GET | `/api/public/teams/:shareId` | `{team,analysis}` only while explicitly public |

`profile` has username, bio, createdAt, nullable avatarUrl/featuredPokemonId/featuredTeamId, public teams (`name,shareId,pokemonIds,featured`), approved card `decoration` and `pinnedBadges`. Badge pins stay empty unless achievement sharing is enabled; only earned badges can appear. Optional fields `favorites`, `statistics` and `achievements` are omitted unless approved. `team` has `name,username,profileAvailable,shareId,pokemonIds`; it never grants editing rights. Public analysis includes only the shared species' public data and derived matchup/stat totals. See [TRAINER_STYLE.md](TRAINER_STYLE.md) for the 96-achievement vault and decoration studio.

The refreshed directory renders large avatar/banner cards, public biographies/titles, featured partners, a public-team count and a six-slot showcase of the featured public team (otherwise one public team). `publicCard` allowlists `username,bio,createdAt,avatarUrl,featuredPokemonId,decoration,publicTeamCount,showcaseTeam`. Public avatars use the existing revocable opt-in route; the filename is never returned. Card decoration pins stay empty, and the directory never reads raw collection records, favourites, unshared biography, private teams or current achievement metrics. Counts/search include only enabled profiles. Search text is bounded to 64 characters and SQL escapes wildcard characters literally. Snapshot labels are optional; cards stay readable if species labels cannot load.

Page metadata now identifies the community correctly. The directory has username search, load-more navigation, result counts, clear-search and retry/empty states. Profile/team routes hide the discovery hero and have a useful back-link; the directory has no self-link labelled Public trainers. Existing theme, header account controls, crop uploads, public visibility checks and saved-team analysis remain. This refresh needs no database migration; existing v0.6.0 sharing tables are still prerequisites. Additional decoration data is batch-read when its optional table exists, with safe default styling otherwise.

Private APIs require the existing session. Every PUT requires the current `X-CSRF-Token` and same-origin request checks:

| Method | Endpoint | Body / result |
| --- | --- | --- |
| GET | `/api/community/settings` | `{settings}`; full private settings, disabled defaults if absent |
| PUT | `/api/community/settings` | Complete settings object below → `{settings}` |
| GET | `/api/community/preview` | `{profile}` with the same approved-field projection, visible only to owner |
| GET | `/api/teams/:id/visibility` | `{visibility:"private"\|"public",shareId:null\|UUID}` owned team only |
| PUT | `/api/teams/:id/visibility` | `{visibility:"private"\|"public"}` → authoritative visibility and stable UUID |
| GET | `/api/teams/:id/analysis` | `{analysis}` owned saved team only, without publication |

```json
{
  "enabled": false,
  "shareBio": false,
  "featuredPokemonId": null,
  "featuredTeamId": null,
  "shareAvatar": false,
  "shareFavorites": false,
  "shareProgress": false,
  "shareAchievements": false
}
```

Settings reject missing/extra fields, nonboolean flags, invalid species/team IDs (Biography is edited separately via PATCH /api/profile, maximum 500 characters). Visibility accepts only its single explicit field. Owner identifiers cannot be submitted. Unknown/private resources return 404, missing login 401, invalid CSRF/origin 403, malformed input 400, rate limit 429, and missing schema 503. Existing team CRUD still enforces ownership, six members and no duplicates.

## Team analysis calculations

`team-analysis-data.js` is shared by the frontend and Express and calls the Encyclopedia's existing `matchups` function. `data/type-chart.json` bundles all 18 official PokéAPI type resources with retrieval time and source. The 649-species summary supplies actual base stats and typings. Analysis does not depend on test fixtures, guessed moves or runtime network availability. The rules are the same **modern** chart as the Encyclopedia, including Fairy and modern Steel interactions, even for species introduced in Generations I–V.

For attacking type A and a member's defensive types D1/D2, multiply the two recorded effectiveness values (default 1). Thus dual typing gives 4×, 2×, 1×, 0.5×, 0.25× or 0×, with immunity taking precedence through multiplication. Per attacking type, count weak (>1), resistant (>0 and <1), immune (=0), and neutral (=1) members separately. Empty slots contribute nothing.

The six-slot matrix lists all 18 attacking types as rows and members/empty slots as columns, with explicit multipliers plus theme-aware colour. Scrollable regions are named and keyboard-focusable. Defensive charts switch between weakness/resistance/immunity counts. Stat charts show each category's arithmetic mean over present members; combined base stats sum the six categories over present members. Empty teams show no invented averages. Type diversity counts distinct team typings. Narrative summaries state actual counts and explicitly avoid competitive-viability claims.

Offensive **type-based potential coverage** unions the team's own types that are super-effective against each single defending type. It does not model actual assigned moves, STAB damage, opposing dual types, abilities, items, weather, levels, EVs/IVs or complete battle performance. The UI states these limits beside the results.

The private Analyze Team action recalculates current draft slots after every add/replace/remove without saving or publishing. Public analysis uses only the latest saved public lineup. No analysis table or saved record is created. Chart.js reuses the existing vendored bundle; chart instances are cleaned up on rerender/navigation and recoloured with theme changes. Exact tables remain available when Chart.js is blocked, with a warning; failed data loads have a retry action.

## Manual verification

After reviewing/applying the migration to your development database, use two distinct accounts A/B plus a logged-out browser:

1. Confirm existing profile/team URLs are unavailable publicly and the directory is empty for unshared accounts. Verify existing biography, uploads, teams, favourites, collection and awards are intact.
2. As A, edit Biography and enable Show biography publicly, choose a featured Pokémon/team, save and preview while private. Test harmless angle-bracket text to confirm it renders literally. Confirm email never appears, and turning biography sharing off hides the text.
3. Enable A's profile. Open `/trainer/A_username` logged out. Toggle each optional section individually and refresh the public view, including avatar requests. Confirm profile disable hides the page and directory entry.
4. Create incomplete/full teams. Open Analyze Team; add/replace/remove a draft member and confirm counts/averages change before save. Test duplicate/six-member protection. Charizard has Rock 4×, Grass 0.25× and Ground 0× under modern type-only rules. Magnemite is Poison-immune and neutral to Ghost under those rules.
5. Publish one team, copy the UUID link and open it logged out. Inspect all six slots, member artwork/numbers/types/base stats, deep links, charts and matrix. Keep another team private. Account B must not edit A's team, change its visibility, request its private analysis or feature it on B's profile.
6. Change/save A's public lineup, reload the public page and verify updated analysis. Set it private and refresh its old link: expect unavailable. Repeat with deletion. Disable A's profile while leaving a team public and confirm the documented independent team visibility.
7. Log out/in and restart Express with the same session secret; verify settings, saved teams, progress and uploads persist through MySQL. This live persistence check has not been run by the fixture suites.
8. Use keyboard controls, 320/375/768/1280px widths and both themes. Check charts/tooltips/table scrolling, no page overflow, missing Chart.js/data retry, and existing page navigation. Review with real touch and screen-reader users and Safari/Firefox separately.

## Verification and changed files

Verified: **73 automated tests passed, one opt-in live-MySQL test skipped; 58/58 Chrome browser checks passed**. Visually inspected the public team layout.

Run `npm.cmd test` for all calculation, API, security, schema and regression tests; run `npm.cmd run test:browser` for isolated real Chrome interactions. Test fixtures do not use your live MySQL database or uploaded files. SQL mocks/static checks verify intended statements, ownership predicates and rollback paths, but do not establish execution against an installed MySQL server. Live schema/constraint/persistence verification remains manual.

New files: `community.html`, `community.js`, `team-analysis.js`, `team-analysis-data.js`, `data/type-chart.json`, `server/community.js`, `server/community-repository.js`, `database/migrations/v0.6.0-trainer-community.sql`, `database/MIGRATION_v0.6.0.md`, `tests/community.test.cjs`, `tests/support/memory-community.cjs` and this guide.

Modified: shared navigation in `index.html`/`pokemon.html`/`trainers.html`/`dashboard.html`, hub script loading, `account.js`, `styles.css`, `server/app.js`, `server/repository.js`, `database/schema.sql`, package/lock versions, browser fixtures/tests, version/schema regression assertions, opt-in MySQL integration coverage, README, Windows setup, API reference, release notes and QA report. Custom homepage artwork and the existing user-requested hero effects are preserved.


## v0.6.1 shared card rendering and sprites

TrainerCardConfig normalizes the same safe choices in the API and Studio. TrainerDecorations.appearance applies palettes, backgrounds, avatar silhouettes, custom colours, title/border treatments and banner-contained effects to Studio previews, public profiles and directory cards. The directory projection includes approved cosmetic fields, never arbitrary CSS. Old saved choices remain supported.

Featured Partners use the selected species' verified Generation V battle sprites; compact teams use party icons in the stored slot order with the existing empty slots. Expanded shared teams keep statistics/analysis and use larger static battle sprites. No extra private data or shiny state is inferred. Reduced motion selects static sprites. The [sprite and Studio report](IMPLEMENTATION_v0.6.1.md) documents upstream checks, fallbacks and browser testing.

Expanded persistence requires the separate [v0.6.1 manual migration](database/MIGRATION_v0.6.1.md). Old decoration reads have a legacy/default fallback; writes report the missing upgrade rather than silently discarding new fields. All existing profile, avatar, biography, achievement and team visibility gates remain.


## v0.6.2 rank and staff privacy

Public profiles and directory cards may include a rank DTO only when the existing shareProgress option is enabled. It contains current caught/total, rank, next threshold, remaining species and interval progress, derived by the backend from the existing collection. No raw collection, private staff context or extra permissions are exposed. Directory counts use the indexed existing unique species rows and are not stored separately.

The new Administration workspace exposes only permitted basic account/role/restriction records, not emails, biographies, avatars, teams, favourites or caught history. Every staff role retains the existing private-content ownership rules and public-sharing gates. A temporary restriction blocks authentication/private tools; it does not silently publish, delete or unpublish already approved public content. See [ADMINISTRATION.md](ADMINISTRATION.md).


## Community hover and staff-name follow-up

Fixed the actual hover loop: the stretched profile-link pseudo-element covered a card body (about 372×575px in reproduction), but hover transforms/filter made its containing block shrink to the 117×44px button. This repeatedly changed the pointer target. Removed that overlay and the card's hover translation. Cards now highlight in place, with separate accessible avatar/name/profile/team links and independent rank controls.

Improved partner presentation, compact team spacing, aligned action rows, theme contrast, search clearing, loading placeholders, retry feedback and stale-response cancellation. Loading results are inert until the current request finishes. Long queries wrap on mobile. Existing card customization, privacy, team order and sprite fallbacks remain.

Published profiles/cards expose only a trusted staffRole label for Owner, Administrator and Moderator. It is batch-read from existing user_roles, joined to enabled public profiles; ordinary Trainers have no staffRole field. Owner names use gold/rose highlights, Administrators violet/blue and Moderators mint/cyan, with small pointer-transparent SVG glitter. Public profile names and the signed-in trainer's own name share this treatment. Reduced motion retains static decoration; forced colours keep solid readable text. No permission context, restriction metadata, private profile data or new authority is exposed. Missing staff tables gracefully use ordinary name styling. No new migration or account modification is required. Restart Express after updating backend code, then refresh the Community page.

## Profile structure and title styles

Trainer Hub uses a dedicated `trainer-hub.css` layout for the overview/rank/counts, picture and Biography forms, privacy controls, Studio and compact summaries. Picture editing remains first in DOM and mobile reading order. Settings shortcuts focus their section heading without replacing the current profile or losing unsaved edits. Teams and favourites retain their full dedicated views.

Directory cards and profile headers have separate username/motto and role/title rows. The motto sits on the right and may wrap on narrow screens. A biography appears below only when the backend approves it through **Show biography publicly**; the motto never replaces missing biography text. Both fields remain safe text content.

Eight title treatments share the existing renderer: Ribbon, Pill, Minimal, Outlined, Medallion, Ticket, Gradient and Champion. New choices require the [manual CHECK expansion](database/MIGRATION_trainer-title-styles.md) on existing databases. Until applied, saving a new style returns specific upgrade guidance; old options still work. Champion is a cosmetic treatment, separate from earned rank and staff role. No database migration was run for this update.

## v0.7.0 discussion and battle spaces

The trainer directory remains at `community.html`. Main navigation and Community
subnavigation now connect it to [Forums](FORUMS.md) and the [Battle Arena](BATTLE_ARENA.md).
Forums reuse current public identities, progression consent and team share links;
no second profile or sharing system was created. Staff moderation lives in the
existing Admin Panel. See the separate [manual migration](database/MIGRATION_v0.7.0.md).
The Arena is a local, unranked simulation; posting its summary requires an explicit
forum composer submission and never grants progression or competitive authority.
