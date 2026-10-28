# Dexhaven v0.7.1 - Community, Battles & Profile Customization

Implementation review for **Pokédex Website**, public name **Dexhaven**. Package
and lockfile metadata are 0.7.1, updated through npm without creating a Git tag.
The existing vanilla frontend, Express sessions/API and MySQL repository remain.
No SQL migration, live-data mutation, commit, push, deployment or release was run.

## 1. Features implemented

Dedicated Account Settings, profile/banner customization, explicit privacy,
credential/session security, forum discovery, Staff Directory, reusable member
previews, social controls, polls and private saved simulation history/replays.
Existing accounts, teams, favourites, Pokédex, analytics, public sharing, sprites,
Card Studio and Administration are retained and covered by regression checks.

## 2. Files created

- Frontend: `settings.html`, `settings.js`, `staff.html`, `staff.js`,
  `member-cards.js`, `profile-extras.js`, `rich-biography.js`, `forum-discovery.js`,
  `forum-polls.js`, `community-expansion.css`, `battle-recording.js`,
  `battle-history.html`, `battle-history.js`.
- Server: `server/enhancements.js`, `server/enhancement-routes.js`,
  `server/extension-store.js`, `server/account-settings.js`,
  `server/settings-validation.js`, `server/social.js`, `server/community-discovery.js`,
  `server/forum-polls.js`, `server/saved-battles.js`, `server/extension-metrics.js`.
- Storage/docs: `database/migrations/v0.7.1-community-settings-battles.sql`,
  `database/MIGRATION_v0.7.1.md`, this report.
- Tests: `tests/settings-social.test.cjs`, `tests/community-expansion.test.cjs`,
  `tests/battle-history.test.cjs`, `tests/enhancement-schema.test.cjs`,
  `tests/support/memory-extensions.cjs`, `tests/support/v071-browser.cjs`.

## 3. Files modified

Shared navigation/script/style integration in `index.html`, `pokemon.html`,
`trainers.html`, `dashboard.html`, `community.html`, `about.html`, `admin.html`,
`forums.html`, `battle.html`; existing `account.js`, `avatar-cropper.js`,
`community.js`, `theme.js`, `trainer-names.js`, `trainer-progress.js`, `forums.js`,
`forum-admin.js`, `battle.js`, `battle-engine.js` extend their established roles.

Server integration: `server/app.js`, `repository.js`, `community-repository.js`,
`community.js`, `forum-store.js`, `forum-validation.js`, `forums.js`,
`progression-repository.js`, `progression.js`. Schema/reference metadata:
`database/schema.sql`, `package.json`, `package-lock.json`.

Tests/fixtures extend browser, Firefox, progression, version/upgrade and
memory-repository/forum/community harnesses. Documentation updates include README,
release notes, API, Forums, Community, Battle Arena, Windows setup and QA report.
Earlier local work and custom founder artwork were preserved.

## 4. Database schema changes

Eleven additive tables cover settings, follows, blocks, bookmarks, read cursor,
category layout, polls/options/votes, saved runs and schema readiness. Two ALTERs
add biography-format metadata and extend existing notifications. Existing data
is not rewritten. Unique/composite foreign keys reinforce vote ownership, valid
poll-option membership and replay deduplication. No separate account/achievement
system was added. Settings JSON objects are validated through fixed allowlists.

## 5. Manual migration instructions

Follow [database/MIGRATION_v0.7.1.md](database/MIGRATION_v0.7.1.md): back up database
and uploads, complete earlier upgrades, stop Express, manually review/run the SQL,
then restart and perform two-account persistence/privacy checks. DDL commits
implicitly; interrupted ALTERs need inspection, not blind reruns. Readiness is
published last. Startup never applies migration SQL. Live migration is untested.

## 6. New and modified API endpoints

[server/API.md](server/API.md#v071-community-settings-and-saved-simulations) lists
complete methods, payloads, pagination, limits and authorization. New groups are
settings, public staff/members, community discovery/activity, social, bookmarks,
polls and battles. Existing profile/thread/notifications/progression contracts
are extended compatibly. Owner IDs, permissions, awards and outcomes never come
from submitted editable fields. Legacy notification reads tolerate the absent
new actor column, and legacy plain biographies remain readable before upgrade.

## 7. Account Settings functionality

Eleven functional sections: Account details; Profile customization; Password &
security; Privacy; Notifications; Preferences; Following; Blocked trainers;
Bookmarks; Reactions received; Forum activity. Header links open the dedicated
page, and Trainer Hub links to it without duplicating teams or favourites.

Email/username are read-only. Current-password verified actions use Argon2id,
rotate the current SID/CSRF and bump a server-owned security version. Other
sessions become unauthorized on their next protected API/private-media request.
Role/restriction checks remain live. Theme and AI-default preferences persist.
No account export/deletion or email-change placeholder actions are exposed.

## 8. Profile customization changes

One existing biography gains optional limited formatting: bold, italic,
paragraphs, lists and HTTP(S) links. A shared strict AST renderer creates safe DOM,
never arbitrary HTML. Existing text is `plain`; only explicit formatted saves
set `limited`. Saved profile format is preserved by the old Trainer Hub editor.

Existing square avatar cropper is generalized for 3:1 banners with pan/zoom,
keyboard movement, preview/cancel and removal/default restore. Server image
sniffing/EXIF rotation/bounds/ratio/size/pixel checks precede stripped 1200x400
WebP output. Opaque filenames, owner media routes, live publication checks and
old-file cleanup preserve ownership and immediate revocation.

Optional birthday/location/website/gender/occupation/social fields start private.
Birthday choices: Hidden; day/month only; full date and age. Every public field
requires the master public profile gate plus its own switch. Existing Card Studio,
colors, decorations, titles, earned badge pins and uploaded avatars are reused.

## 9. Forum enhancements

Grouped collapsible categories, one-level subforums and authorized category
organization preserve discussion IDs/assignments. Navigation provides all/new/
search/watched/bookmarked feeds and a private read cursor. Visible latest posts,
actual totals, privacy-gated activity and opted-in 24-hour presence replace dummy
statistics. Trending weights distinct other contributors and capped distinct
reactors over seven days with age decay; self/restricted signals do not count.

Polls are inserted with discussions atomically, use 2-6 distinct options, one
immutable vote per account, optional closing dates and author/staff close actions
with audit. Hidden/locked/expired/closed discussions reject votes. Existing
moderation, reports, retained content, permissions and hierarchy still apply.

## 10. Staff Directory implementation

`staff.html` groups current Owner/Administrator/Moderator roles from the server.
It never derives staff status from a cosmetic title. Disabled public profiles
show only minimal public staff identity; optional fields, avatar, activity, rank
and achievements retain their individual sharing gates. Email, private teams,
permissions and security metadata are excluded. Pagination and retry are real.

## 11. Social features

Follows are unique, prohibit self-follow and honor accepting-followers controls.
Two-way blocks remove existing follows and prohibit follow/reaction/quote/social
notification interactions. They do not hide otherwise public content from the
internet. Bookmarks remain private and independent of watched discussions.
Notifications honor category preferences, have owner-only read-all and daily
follow deduplication. Follow links open a safe member preview; sender identity is
omitted after blocking. Previously existing notifications retain IDs/read states.

## 12. Battle History and Replay implementation

Owner-only history supports species/outcome/order filters, pagination, statistics,
removal and readonly play/pause/restart/speed replay controls. Existing simulator
configuration is reused; no multiplayer, competitive ladder or fabricated records.

Server tickets provide a seed, configuration/mode/difficulty lock, expiry and
single-use completion. The server reconstructs actions through the pinned engine,
validates legality/completion/limits, stores versioned initial metadata and every
turn/event, and hashes canonical JSON. Client outcomes/frames are never trusted.
Stored playback uses exact frames and no RNG or newer-engine re-simulation.
Local completed simulations can be imported for history but never activity awards.
Duplicate digests are rejected, including previously removed records.

## 13. AI and achievement improvements

Easy/Normal/Hard change legal move selection only; HP/stats/damage rules remain
identical. Existing default scoring is preserved. Hard considers HP/KO/priority,
PP, supported status/stages and recoil; Easy randomizes supported choices.

Six additions make 102 achievement definitions: First Steps (one substantive
visible discussion), Conversationalist (25 distinct substantive foreign-discussion
replies), Community Favourite (100 distinct valid other reactors), First Battle
(one qualified run), Battle Veteran (50) and Strategist (10 qualified Normal/Hard
player-vs-CPU wins). All 96 original keys/thresholds/historical timestamps and the
caught-only trainer ranks remain unchanged.

Qualification requires a server-prepared recording, different species at level
50, three moves per side, three turns, five seconds, at most three per day and
one ordered pairing/day. Community awards use current qualifying visible content;
a disqualified award remains audited but cannot be displayed/pinned as earned.
History removal excludes statistics while retaining validated anti-abuse evidence.
These constraints reduce simple farming; they cannot prove a human played a
single-player deterministic simulation. Awards are activity, never competitive rank.

## 14. Shoutbox feasibility decision

Deferred intentionally. Safe live chat needs moderation workflows, abuse/retention
policies and shared rate limits/transport operations beyond the current polling
forums. No incomplete widget or dead control is exposed.

## 15. UI and accessibility enhancements

Shared typography, mint accents, responsive header/footer and both themes remain.
Settings use responsive sidebar navigation and explicit field labels/status/errors.
Save failures preserve draft input. Member previews have delayed pointer opening,
stable pointer transition, focus/Arrow Down activation, Escape dismissal/focus
return and explicit touch Preview controls. Focused previews resist incidental
pointer events. Motion reduction and viewport-bounded overlays are supported.

## 16. Automated test results

`npm.cmd test`: **148 total: 146 passed, one skipped, one pre-existing failure**.
The skipped test requires explicit live MySQL configuration. The failure is the
existing founder-art checksum mismatch in `tests/upgrade.test.cjs`: expected
`2d2aa845789f32e5b7188dcf0ef7b71b74eef671f0ffb9987cfe1869db14138f`, actual
`6b7ce3aabd0a41bb928e71c34efde853b78d57f16947613a7f6389bcda0d8bc6`.
The assertion and custom artwork were preserved; this is not a green unit suite.

Fifteen new tests cover private settings, birthday projection, safe formatting,
credential/session revocation, image validation/ownership/revocation, follow/block/
bookmark/notification policy, visible discovery, category cycles, immutable polls,
revocable community awards, seeded reconstruction, history ownership/integrity,
qualification, additive schema and legacy SQL projection/parameterization.

## 17. Browser test results

Chromium: **97/97 full regression checks passed**; see [QA_REPORT.md](QA_REPORT.md).
Focused v0.7.1 checks cover registration, biography/profile fields, actual file
input and crop uploads, public birthday/banner privacy, staff previews, group
persistence, polls, social controls/bookmarks, local simulation saving, exact
replay playback with RNG disabled, failed-save drafts and reduced motion.

Firefox BiDi: **55/55 checks**, including existing community/Admin/Forum/Arena
behavior and new settings/privacy/staff/replay layouts in both themes at 375 and
1280 px, keyboard preview activation/dismissal and playback with RNG disabled.
Chromium additionally checks 320/768/1280 px and pointer/touch flows. All browser
runs use temporary accounts/uploads and in-memory storage, not production MySQL.
Screenshots remain in the QA temporary output directories, outside the repository.

## 18. Known limitations

Real MySQL import, enforced constraints, restart persistence and production
concurrency are not verified here. File cleanup spans database/filesystem rather
than one atomic storage system; monitor orphan files after process/storage failure.
Session revocation is checked on next protected request, not a real-time browser
push. Presence is opt-in and approximate. Limits are per-process and require a
shared store before multiple production instances. Replay JSON is bounded but
long-term retention/storage capacity needs an operational policy.

The simulator retains the documented supported subset of Black/White mechanics
and moves. Saved replays require supported versioned frame readers. Completed old
records replay without a newer engine; unfinished tickets from older rules expire
instead of silently using changed mechanics. Modern Pokédex information remains
separate from historical battle data.

## 19. Deferred functionality

Shoutbox, verified outbound email/changes/recovery, username changes, account
export/deletion, multiplayer/team battles, competitive rankings, and additional
unsupported Gen V mechanics are not implemented or advertised as working controls.
Browser tests validate a representative interaction matrix, not every possible
image, assistive technology, device or notification preference combination.

## 20. Recommended follow-up work

Review/apply the manual migration on a backed-up development database, run live
MySQL integration and restart/two-account checks, and review the existing founder
art checksum expectation with the owner. Validate assistive technology and real
mobile touch, inspect storage retention, then perform the normal release review.
Do not publish before these manual gates pass. Email/live chat should be scoped
separately with verified infrastructure and operational ownership.
