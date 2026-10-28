# Dexhaven v0.7.2 — Game Library & Community Shoutbox

Implementation report, 28 October 2026. Independent personal software project.
Prepared for owner review; no commit, push, tag, release or deployment occurred.

## 1. Implementation summary

Both requested features are implemented in the existing vanilla HTML/CSS/JS,
Express and MySQL architecture:

- Games has six native cards, automatic private ROM selection, an embedded
  EmulatorJS/mGBA player, native browser-local saves, and validated import/export.
- The existing homepage has a Community Shoutbox with a MySQL repository, public
  reading, authenticated posting, polling, spam controls and audited moderation.

The initial audit found branch `feature/v0.7.2`, a clean working tree, the homepage
at `index.html`, explicit Express asset allowlists, session/CSRF middleware,
privacy-aware public forum authors, and live administration permissions. Those
components were reused. No framework or new npm dependency was introduced.

The real Shoutbox table is absent. Its SQL is prepared but deliberately not run.
The six existing ROMs were already tracked in Git at the audit. Their bytes and
filenames remain unchanged; this is a blocker to any public push/release.

## 2. Changed files

### Created

| Files | Purpose |
| --- | --- |
| `games.html`, `games.css`, `games.js` | Native Games page, six cards, availability, launch/exit and account states |
| `gba-emulator.js` | Iframe lifecycle, source/origin-checked messages, safe switching and cleanup |
| `gba-player.html`, `gba-player.js` | Private player document and pinned native runtime configuration |
| `gba-saves.js` | Game/revision identity, IndexedDB export backups, storage probe, raw-save validation/download |
| `server/gba.js` | Fixed filename map, local Owner guards, read-only SHA-256 launch and private ROM/runtime routes |
| `shoutbox.js`, `shoutbox.css` | Homepage messages, composer, polling, history, privacy-aware identities and moderation dialog |
| `server/shoutbox.js` | Business rules, parameterized MySQL adapter and public/protected routes |
| `database/migrations/v0.7.2-shoutbox.sql` | Additive, manual-only Shoutbox table |
| `database/MIGRATION_v0.7.2.md` | Exact Workbench backup, migration, verification and recovery instructions |
| `scripts/vendor-emulator.cjs` | Explicit official runtime installer with SHA-256 verification |
| `vendor/emulatorjs-4.2.3.manifest.json` | Pinned upstream runtime byte hashes |
| `scripts/build-static-preview.cjs`, `_config.yml` | Public preview selection and Jekyll exclusions |
| `tests/v072.test.cjs` | New API, authorization, SQL, configuration, schema and save tests |
| `tests/support/memory-shoutbox.cjs` | Isolated transactional test repository |
| `tests/support/v072-browser.cjs` | Real Chrome UI, history, storage, lifecycle, responsive and optional actual-ROM checks |
| `GAME_LIBRARY.md` | Installation, exact approved filenames, saving, security/licensing and manual checklist |
| `RELEASE_v0.7.2.md` | Unpublished release draft |
| `IMPLEMENTATION_v0.7.2.md` | This detailed report |

### Modified

| Files | Purpose |
| --- | --- |
| `index.html` | Homepage Shoutbox section/assets and Games navigation |
| `about.html`, `admin.html`, `battle-history.html`, `battle.html`, `community.html`, `dashboard.html`, `forums.html`, `pokemon.html`, `settings.html`, `staff.html`, `trainers.html` | Games link in the existing main navigation |
| `server/app.js` | Register new routes at the correct public/protected middleware positions and allow new public assets |
| `server/repository.js` | Production Shoutbox repository wiring |
| `server/config.js`, `.env.example` | Explicit development-only GBA settings and safe disabled example |
| `.gitignore` | Private ROM/save/runtime/generated-preview exclusions |
| `database/schema.sql` | Identical additive Shoutbox DDL for fresh installations |
| `package.json`, `package-lock.json` | Version 0.7.2 and explicit runtime/preview scripts; dependencies unchanged |
| `README.md`, `WINDOWS_SETUP.md`, `RELEASE_NOTES.md`, `server/API.md`, `QA_REPORT.md` | Setup, API, release, verification and blocker documentation |
| `tests/support/app-fixture.cjs`, `tests/support/memory-repository.cjs` | Isolated configuration/local-origin overrides and Shoutbox fixture wiring |
| `tests/browser-qa.cjs` | Focused v0.7.2 entry point, preview assets and useful error diagnostics |
| `tests/admin-schema.test.cjs`, `tests/trainer-card.test.cjs`, `tests/upgrade.test.cjs`, `tests/enhancement-schema.test.cjs` | Current version metadata; allow later additive DDL; refresh a stale group-image baseline to the already committed image, without changing the image |

The ignored local `.env` received only the two new GBA entries. Existing secrets
and settings were preserved. Generated `vendor/emulatorjs/4.2.3/` and
`preview-dist/` are ignored local artifacts. No ROM or proprietary BIOS was added.

## 3. Game Library

FireRed, LeafGreen, Ruby, Sapphire, Emerald and Light Platinum each have a styled
fallback illustration, title, platform/region, description, availability and Play
button. Light Platinum is a distinct game and save identity. The page reuses the
existing branding, themes, account controls, navigation and footer. Games is in
the main navigation; Battle Arena remains in the main navigation only.

The local Owner clicks Play and the matching server-mapped ROM starts without a
file picker. Missing files disable their own card. Public previews show an
unavailable explanation. An export-backup indicator reports only a backup that
Dexhaven can reliably detect, not an inferred native in-game save.

## 4. Emulator

Pinned **EmulatorJS 4.2.3**, GBA core using its mGBA legacy WebAssembly build.
The explicit `npm.cmd run vendor:emulator` installer downloads six hash-verified
runtime files from the official versioned CDN and includes the GPL license.
Startup does not download dependencies. No external Nintendo BIOS is configured.

Configuration uses the documented `EJS_gameUrl`, `EJS_gameName`, numeric
`EJS_gameID`, local `EJS_pathtodata`, `EJS_Buttons`, `EJS_defaultOptions`,
`EJS_onGameStart` and `EJS_onSaveSave`. No private emulator/gameManager/FS method
is called by application code. The native toolbar supplies keyboard/controller
settings, pause/resume, restart, volume, fullscreen, import/export and exit.
Save-state, cheat and netplay controls are hidden.

Only the private player CSP permits the dynamic JavaScript required by the
pinned Emscripten bootstrap. Main-site CSP stays unchanged. Stable 4.2.3 performs
an optional hardcoded remote version check on localhost without handling fetch
rejection. The private frame answers exactly that fetch with its installed
version metadata, keeping runtime loading local and leaving all other fetches
and CSP restrictions intact. Vendored upstream runtime files remain unmodified.

Sources reviewed: [configuration](https://emulatorjs.org/docs/options/),
[4.2.3 release](https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3),
[pinned loader](https://github.com/EmulatorJS/EmulatorJS/blob/v4.2.3/data/loader.js),
[runtime source](https://github.com/EmulatorJS/EmulatorJS/blob/v4.2.3/data/src/emulator.js)
and [save filesystem source](https://github.com/EmulatorJS/EmulatorJS/blob/v4.2.3/data/src/GameManager.js).

## 5. Private ROM loading

The local ignored `.env` enables `DEXHAVEN_ENABLE_GBA=true` and reads
`DEXHAVEN_GBA_ROMS_DIR=E:/EK - IT-Arkitektur/Pokedex Website/Dexhaven-GBA/ROMs`.
The absolute Windows directory is never sent to frontend JavaScript.

The owner explicitly approved using the existing filenames unchanged. The exact
six-file mapping is in [GAME_LIBRARY.md](GAME_LIBRARY.md). Node path/realpath
checks enforce containment; clients select only a fixed game ID. Launch computes
a full SHA-256 fingerprint. The ROM request carries that revision and rejects a
changed file rather than loading it into the previous revision's save identity.

All ROM, launch, catalog, private HTML and runtime routes require the current
authenticated Owner, explicit development enablement, loopback-bound server,
actual loopback socket, accepted Host/Origin and non-cross-site request. Proxy
and production configurations disable access. There is no ROM static mount,
path parameter, upload endpoint or directory listing. Responses are no-store;
errors omit private filesystem paths.

## 6. Save system

Normal game SRAM/Flash uses the pinned runtime's IndexedDB-backed IDBFS, with
automatic persistence and restoration. The configured System Save interval is
30 seconds. Exit invokes the runtime's normal beforeunload lifecycle and allows
1.4 seconds for native exit/save cleanup before the parent removes the iframe.
The parent has a bounded fallback and old exit timers cannot remove a new game.

The full game ID and SHA-256 fingerprint form the stable game name; a hash of
that identity supplies the numeric game ID. Ruby and Light Platinum, and
different revisions, receive distinct identities. A browser storage write probe
must succeed before starting. This cannot guarantee persistence against later
quota eviction, browser crashes or cleared storage; regular exports are needed.

The documented export callback downloads a raw `.sav` and attempts a separate
IndexedDB backup keyed by the full identity. Export still downloads if backup
storage fails. Native import is checked before its input handler: supported
SRAM/Flash sizes and small RTC trailers only, `.sav` extension, known backup
identity match and overwrite confirmation. Unknown raw saves cannot prove their
game identity. Save states are distinct and hidden. No saves go to Express,
MySQL or trainer accounts.

`EJS_onSaveUpdate` is newer than pinned stable 4.2.3 and is not used. The UI does
not claim to detect every native in-game save. Actual commercial-game
Save → Exit → Continue cycles and import compatibility remain owner checks.

## 7. Community Shoutbox

The homepage section reads public messages and uses existing privacy-aware forum
author projection: username, permitted avatar/profile and staff identity. It
exposes no email, credential or private account data. Messages use safe text DOM
nodes, with timestamps, scrollable history, character counter, guest login/
register prompts, loading/empty/retry states and confirmed staff removal.

GET retrieves recent messages and validated older cursors. Ten-second polling
deduplicates IDs, reconciles soft deletions and pauses while hidden or navigating
away. A bounded 200-message window supports older history beyond that window;
Latest messages returns to the live view. Submission is disabled while pending.

POST derives identity from the existing session, rejects forged fields and
blank/oversized messages, normalizes/trims text, and enforces 500 characters,
five-second cooldown, ten posts/minute/account and five-minute duplicate checks.
The persistent SQL checks remain effective across application restarts.

DELETE requires live `panel.access` and `forums.moderate`, current restrictions
and role hierarchy. A staff member cannot remove a higher/equal role's message
except their own staff post. Soft deletion, reason and existing forum audit
record commit together; audit failure rolls back deletion. Shared authority
locking serializes permission-sensitive writes and concurrent submissions.

## 8. Database migration

**Not run.** Read-only inspection confirmed the real `shoutbox_messages` table
does not yet exist. The running server returns a controlled HTTP 503 for this
feature without breaking the homepage or existing APIs.

Use [database/MIGRATION_v0.7.2.md](database/MIGRATION_v0.7.2.md) for exact MySQL
Workbench instructions: stop Express, back up schema/data, open
`database/migrations/v0.7.2-shoutbox.sql`, review and execute its single additive
CREATE TABLE against `pokedex_app`, inspect SHOW CREATE TABLE/indexes/foreign
keys, restart Express, post/remove test messages and verify message/audit rows.
Do not recreate the database or run fresh-install setup over existing data.

The new table contains author, plain-text message, timestamps and soft-deletion
metadata, with existing unsigned user foreign keys, a length CHECK and indexes.
It alters no existing table, account or permission. No game-save table exists.

## 9. Security and licensing

The existing session, CSRF, origin, body-size, password and authorization systems
remain in force. New SQL uses placeholders; frontend rendering is plain text.
Automated tests cover forged identities, unauthorized moderation, role changes,
audit rollback, duplicate races, local configuration, Host/Origin restrictions,
arbitrary paths, revision separation and private-file static isolation.

`.gitignore` now excludes ROMs/saves/private runtime; an allowlist preview build
does not visit the ROM directory. The generated public artifact was scanned:
87 files, with no ROMs, saves, `.env`, private runtime, private player HTML,
server/database source or node_modules. Jekyll exclusions add defense in depth.

**Pre-existing tracked ROMs remain a release blocker.** Ignore rules do not
remove tracked files or history. [GAME_LIBRARY.md](GAME_LIBRARY.md#security-licensing-and-static-preview)
provides an owner-reviewed `git rm --cached` procedure that keeps local files,
and separate history/artifact remediation if ROM commits were shared. No index
or history edits were made automatically. ROM changes against HEAD are empty.

EmulatorJS is GPL-3.0; the installed runtime includes its license and source
links. Review GPL source/notice obligations and core licensing before any
redistribution. No ROM, BIOS, emulator release or application was published.

## 10. Testing

| Executed check | Result and limits |
| --- | --- |
| `npm.cmd test` | 175 tests: **173 passed, 0 failed, 2 skipped**; includes nine passing new v0.7.2 test groups and an explicitly skipped real-MySQL check |
| `$env:QA_V072_ONLY='1'; $env:QA_V072_REAL_ROMS='1'; node tests/browser-qa.cjs` | **6/6 focused Chrome groups passed**, including real boot/video and exit/switch of all six authorized local ROMs |
| `npm.cmd run build:preview` and output scan | Passed; 87 public files; private data exclusions confirmed; nothing deployed |
| Live local route checks after restart | Games 200; Shoutbox 503 pending migration; guest ROM 401; `.env`, direct private player HTML and direct ROM path 404 |
| Git/ROM inspection | Six ROMs still tracked from baseline; no ROM differences; new ignore rule matches private path |

Chrome groups cover safe public Shoutbox rendering, authenticated posting and
moderation, paging through 241 visible fixture messages with a 200-row bound,
six cards and IndexedDB backup isolation/reload, player message/cleanup races,
320/768/1280px layouts in both themes, and actual ROM startups. Browser sessions
use isolated fixture users/repositories, never real account/database writes.
Actual ROM tests read the existing private files without modifying them.

Intermediate failures were corrected: later additive-schema expectations, a stale
existing image checksum/version assertion, the private mGBA CSP requirement and
the optional upstream update-check rejection. The final commands above passed.

Reviewed Chrome screenshots include homepage/Games layouts and real game
copyright/start screens. Temporary evidence is under
`%TEMP%/dexhaven-v072-review/`. Boot/video is verified; it does not establish
full-game compatibility or persistent progress. Firefox and physical hardware
were not checked for these new features.

## 11. Manual verification

Follow the twelve-step [owner checklist](GAME_LIBRARY.md#owner-manual-checklist).
It covers all six titles, filename/configuration checks, keyboard, physical
controller, sound, pause/restart/fullscreen/exit, RTC, normal Save/Continue after
closing game/browser, import/export, cross-game/revision isolation, missing-ROM
and authorization behavior, manual SQL, real persistence, two-browser polling,
spam/moderation/privacy and existing-feature regression checks.

The local server is running at `http://localhost:3000`; open Games and use the
existing Owner account. Do not start a second copy on port 3000. No real Owner
credential or role was changed for this implementation.

## 12. Known issues and pending work

| Status | Item |
| --- | --- |
| **Blocked until manual migration** | Real MySQL Shoutbox posting/persistence/moderation; code and SQL are implemented and fixture-tested |
| **Release blocked** | Six pre-existing tracked commercial ROMs; review tracking, shared history and artifacts before pushing |
| **Pending owner verification** | Physical controller, audible audio, full keyboard gameplay/fullscreen/restart behavior, RTC over time, all six normal in-game save/restore cycles and real compatible save imports |
| **Known browser limitation** | Storage eviction/clearing/private mode/crash/origin changes can remove or hide progress; exports remain necessary |
| **Pending distribution review** | GPL/core source and notice obligations for the intended distribution |
| **Excluded by scope** | Cloud/account saves, DS, emulator multiplayer/trading, save extraction and Pokédex synchronization |

## 13. Release readiness

Ready for **owner manual validation and release preparation**. Both feature
implementations, version metadata, migration instructions, tests and release
draft are present. Production/public ROM delivery remains disabled.

This is **not a fully validated public release**: the manual database migration,
real persistence/hardware/save-cycle checks, tracked-ROM remediation and license
review remain outstanding. No unverified item is marked passed and no deployment
or publishing operation has been performed.
