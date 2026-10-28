# Dexhaven v0.7.0 — Community Forums & Battle Arena

The repository remains **Pokédex Website**; the public name remains **Dexhaven**.
Version metadata is `0.7.0`. No framework, database migration, deployment, push,
tag or release was introduced/executed automatically. Existing local changes
from earlier development were retained.

## Delivered

Forums have MySQL-backed categories, discussion search/sorting/pagination,
thread/post ownership, title/post editing, quoting, soft removal, one-per-user
reactions, follows, reports and owner-only notifications. Pokémon references use
safe encyclopedia links; the composer lazily offers local name/number
suggestions. Existing public teams embed without duplication and disappear
when revoked. Staff badges and opted-in caught ranks remain independent.

The existing Admin Panel has a Forum Moderation tab for reports, discussion
inspection, retained post restoration, visibility, locks, pins, history and
authorized category configuration. Fresh permissions/restrictions, hierarchy,
optimistic versions, reason capture and audit rollback are enforced in Express
and transaction logic, not merely hidden UI controls.

The Arena provides all 649 standard species, independent levels 1–100, legal
Black/White movesets, integer battle stats, historical types/move values, PP,
priority, accuracy, criticals, status/stage effects, player/CPU and auto modes.
The exact supported set is **201 of 559 historical moves**, with explicit reasons
for unsupported choices and a safe Struggle route for every species. Pause,
resume, speed and restart share cancellable scheduling. Completed local
simulations can be copied or explicitly offered as a new forum draft. They award
no progression, achievements or competitive records.

## Architecture and reuse

No existing trainer, authentication or sharing system was rebuilt. Reused the
session/CSRF transport, live account restrictions, staff capability model,
administration guard, public-team service, public-avatar consent, progression
calculator, staff-name rendering, Pokémon selector, shared header/footer and
theme infrastructure. Public-team reads now combine current visibility and
membership in one SQL statement to avoid a separate stale membership read.

Forum details: [FORUMS.md](FORUMS.md). Historical data, supported mechanics and
intentional deviations: [BATTLE_ARENA.md](BATTLE_ARENA.md). API contract:
[server/API.md](server/API.md). Manual MySQL steps:
[database/MIGRATION_v0.7.0.md](database/MIGRATION_v0.7.0.md).

## Files added

| Area | Files |
| --- | --- |
| Forums UI | `forums.html`, `forums.js`, `forums.css`, `forum-admin.js`, `forum-notifications.js` |
| Forums backend | `server/forum-validation.js`, `server/forum-store.js`, `server/forums.js`, `server/forum-routes.js` |
| Arena UI | `battle.html`, `battle.js`, `battle.css` |
| Independent battle modules | `battle-calculations.js`, `battle-data.js`, `battle-engine.js`, `battle-runner.js`, `battle-move-support.js` |
| Historical data | `data/battle-v5.json`, `scripts/update-battle-data.cjs` |
| Manual migration | `database/migrations/v0.7.0-community-forums.sql`, `database/MIGRATION_v0.7.0.md` |
| Tests | `tests/forums.test.cjs`, `tests/battle.test.cjs`, `tests/support/memory-forums.cjs`, `tests/support/v070-browser.cjs` |
| Guides | `FORUMS.md`, `BATTLE_ARENA.md`, this report |

## Existing files modified in this phase

Shared navigation/script/style loading in `index.html`, `pokemon.html`,
`trainers.html`, `community.html`, `dashboard.html`, `about.html` and `admin.html`;
Admin tab integration in `admin.js`; server integration in `server/app.js`,
`server/repository.js`, `server/authorization.js` and
`server/community-repository.js`; fresh schema, package/lock metadata, README,
release notes, API/QA/community/Windows guides; fixture integration in
`tests/support/memory-repository.cjs`, Chromium and Firefox harnesses; version
assertions in the three existing metadata/schema tests. Existing test assertions
and founder art/checksum were preserved; version assertions follow the new
requested version.

## Verification performed

- `npm.cmd test`: **131 passed**, one opt-in live-MySQL test skipped and **one
  pre-existing founder-art checksum failure**. It expects the previous image
  digest; the user's current image and the checksum assertion were not changed.
- New API/storage/engine tests: **19/19 passed** (9 forum, 10 battle). This includes
  649 species at both level boundaries, historical data examples, ownership,
  CSRF, restrictions, staff hierarchy, stale versions, retained restoration,
  private-team revocation, notification isolation, literal search, pagination,
  uniqueness, rate limits, atomic audit failure and cancellation.
- Full Chromium regression: **89/89 passed**. Covered the existing Pokédex,
  encyclopedia, analytics, profiles, avatar cropping, teams, privacy, progression,
  decorations and staff UI plus the new forum and battle scenarios. Focused
  follow-up additionally exercised name suggestions, author removal and final
  mobile header/selector styling with scrollbar-aware width assertions.
- Firefox: **37/37 passed**, including existing profile/community/admin checks,
  new list/discussion/Arena geometry in both themes, and manual/auto controls.
- Reviewed desktop/mobile screenshots. Chromium new-page geometry was checked at
  320, 390 and 1280px; Firefox at 375 and 1280px. Reduced-motion, keyboard focus,
  shared navigation, loading failure and retry were exercised.

Browser fixtures use a temporary server, an in-memory storage adapter and
intercepted artwork/API resources. Battle calculations use the actual bundled
historical snapshot. These checks do not prove a live MySQL migration, actual
database restart persistence/concurrency, production deployment or availability
of every upstream sprite. The known image-digest assertion keeps the aggregate
test command nonzero; this is not reported as an all-green release.

## Required manual verification and remaining scope

Apply the reviewed forum migration only after explicit approval/backup, then
check live MySQL persistence after restart, report/audit transactions, constraints
and team/privacy revocation. Restart Express to load the new routes/capabilities.
Without that migration, forum pages show upgrade guidance while the local Arena
and existing tools remain separate.

The simulator intentionally omits advanced moves/interactions and cartridge
rounding edge cases. Forums initially use plain text, title-only literal search,
offset pagination, shared-IP limits, refresh/poll notifications and a serialized
write guard. Future work may add richer sanitized formatting, relevance search,
finer-grained write locking, anti-spam controls and more verified move effects.
Ranked multiplayer and persistent battle history are outside this release.
