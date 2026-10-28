# Dexhaven v0.7.2.1 — Pokémon Soundtrack Player

Implementation report for owner review, 28 October 2026.

## 1. Implementation summary

Implemented the private site-wide soundtrack feature in the existing vanilla
HTML/CSS/JavaScript and Express application. It discovers the owner's collection,
streams authorized audio, supplies real playback controls, restores small local
preferences across full page loads and coordinates with the GBA player and other
tabs. No npm dependency, database migration or MySQL operation was added or run.

The audit inspected existing pages/header/footer/themes, account/session/Owner
checks, explicit asset routes, environment handling, the real v0.7.2 GBA
lifecycle, preview builder and automated fixtures. Initial working changes were
the owner's `/Dexhaven-Music/` ignore entry; that entry was preserved. The actual
collection contains nine root-level MP3s, already tracked in Git. Those files
were read for discovery/playback checks and left unchanged.

The human release label is **v0.7.2.1**. npm stays valid SemVer **0.7.2**;
`package.json.dexhavenRelease` separately records `0.7.2.1`. Four-part npm metadata
was not introduced, and `package-lock.json` remains unchanged.

## 2. Files changed

### Created

| Files | Purpose |
| --- | --- |
| `server/music.js` | Recursive catalog/cache, bounded MP3 metadata reader, track IDs, contained file access and ranged streaming |
| `server/private-local.js` | Shared private-media loopback/Host/Origin/environment boundary |
| `music-library.js` | Validated browser storage snapshot, playlist queue, shuffle and repeat behavior |
| `music-player.js` | Native Audio instance, shared compact/expanded UI, controls, restoration, tab lease and GBA events |
| `music-player.css` | Theme-aware responsive panel, controls, focus/motion/dialog behavior |
| `tests/music.test.cjs` | Configuration/discovery/metadata/security/range/queue/storage tests |
| `tests/support/music-browser.cjs` | Generated WAV fixtures and focused Chrome playback/restoration/integration checks, with opt-in real MP3s |
| `SOUNDTRACK.md` | Exact Windows setup, controls, privacy, troubleshooting and owner checklist |
| `RELEASE_v0.7.2.1.md` | Unpublished release draft |
| `IMPLEMENTATION_v0.7.2.1.md` | This report |

### Modified

| Files | Purpose |
| --- | --- |
| `index.html`, `pokemon.html`, `trainers.html`, `dashboard.html`, `community.html`, `forums.html`, `games.html`, `about.html`, `admin.html`, `battle.html`, `battle-history.html`, `settings.html`, `staff.html` | Load the three shared music assets on all thirteen main pages; private GBA document excluded |
| `server/app.js` | Protected music route registration and explicit public JS/CSS allowlist |
| `server/config.js`, `.env.example` | Independent private music enablement/directory settings and safe disabled example |
| `server/gba.js` | Delegate the existing private-local predicate to the shared helper without changing its policy |
| `gba-emulator.js` | Publish explicit active/inactive lifecycle events; preserve existing core/ROM/save implementation |
| `.gitignore` | Preserve and annotate the owner's existing music exclusion |
| `_config.yml` | Exclude private music from Jekyll output |
| `scripts/build-static-preview.cjs` | Mark generated HTML to prevent private music initialization; audio folders remain outside the public selection |
| `package.json` | Add human release metadata while preserving npm version/dependencies |
| `tests/browser-qa.cjs` | Music fixture configuration, public preview assets, focused entry point and diagnostics |
| `tests/support/app-fixture.cjs` | Expose the isolated test config for fail-closed deployment checks |
| `README.md`, `WINDOWS_SETUP.md`, `RELEASE_NOTES.md`, `server/API.md`, `QA_REPORT.md` | Setup, version decision, API, verification results and release blockers |

The ignored `.env` received only missing `DEXHAVEN_ENABLE_MUSIC` and
`DEXHAVEN_MUSIC_DIR` entries. Existing variables/secrets were preserved. No audio,
ROM or database file differs from HEAD. Generated `preview-dist` remains ignored.

## 3. Music discovery

The configured existing directory is resolved server-side. Recursive scans accept
MP3, OGG, WAV, M4A and FLAC, omit symlinks/junctions/empty or unsupported files,
bound traversal to 20,000 entries and never return absolute paths. The catalog
contains stable relative-name SHA-256 IDs, readable title, filename, top-level
folder playlist, format/MIME and nullable duration. MP3 ID3v2.3/2.4 titles are
preferred when reliably decoded within a 64KiB read; filename word splitting is
the fallback. Browser metadata supplies actual selected-track duration.

The collection scan found:

| Discovered title | Playlist |
| --- | --- |
| Azalea Town Blackthorn City | All Tracks |
| Goldenrod City | All Tracks |
| Lilycove Art Museum | All Tracks |
| Littleroot Town | All Tracks |
| National Park | All Tracks |
| New Bark Town | All Tracks |
| Pallet Town | All Tracks |
| Sootopolis City | All Tracks |
| Violet City Olivine City | All Tracks |

No manual track registry exists. The index caches for 30 seconds; Refresh library
forces a rescan for additions/removals. A renamed/moved file receives a new ID.

## 4. Music player

The compact bottom-right player shows an icon, truncated title with full title
tooltip, actual playing/paused state, Play/Pause, Next and Expand. The expanded
panel provides title, playlist, previous/next, shuffle, repeat all/one/off,
volume/mute, native progress/seeking, elapsed/total duration, playlist selection,
direct tracks, Refresh library and Turn music off. Buttons have accessible
labels; range/select controls retain native keyboard interaction.

Default volume is 35%; mute preserves the chosen value. Seek stays disabled until
duration and seekable ranges exist. First playback requires user interaction.
Rejected autoplay displays a Play-to-resume message and never reports false
actual playback. Missing/unsupported tracks skip within a bounded queue and stop
with feedback when no playable candidates remain. Empty/missing collections do
not break the rest of the site. Only the private Owner sees the player/catalog.

One Audio instance exists per main page. A singleton guard prevents duplicate
initialization. Page exit saves/pauses/releases ownership; explicit disposal also
aborts listeners, cancels timers, closes BroadcastChannel and releases media.
The panel supports both themes, reduced motion, narrow screens and long lists,
adds bottom space to the page and yields to open site dialogs.

## 5. Playlist system

All Tracks always exists. Only populated recognized folder categories appear;
the current flat collection therefore has no invented Kanto/Johto/Hoenn grouping.
Future top-level region folders become playlists without source changes.

Sequential playback follows catalog order. Shuffle maintains a queue and previous
history within that queue, preserves queue/current state across navigation and
avoids immediately repeating the last song when wrapping with alternatives.
Repeat All wraps, Repeat One handles the current track's ending, and Repeat Off
stops at the end. Manual Next advances even with Repeat One selected. Previous
restarts after three seconds or moves backward near the track's beginning.

## 6. Cross-page persistence

`dexhaven.music.v1` stores enabled/intended playback, playlist/track, queue order,
position, volume, mute, shuffle and repeat. Snapshots are small and namespaced;
no audio is stored in localStorage or uploaded. Position saves periodically and
on visibility/user/page-exit events. Invalid/blocked storage has safe defaults and
in-memory fallback.

Full HTML navigation destroys the Audio element. The new document restores the
track and approximate timestamp after metadata, then attempts playback if it was
enabled/intended. **There is an interruption, and autoplay may need another Play
gesture.** No SPA conversion or gapless cross-document claim is made.

An eight-second expiring localStorage lease plus BroadcastChannel coordinates
tabs. A new document yields to existing playback; explicit Play takes over and
pauses the other tab. Lease renewal occurs only during playback. Coordination is
best-effort if the browser blocks both storage and BroadcastChannel.

## 7. Emulator integration

The existing GBAPlayer emits `dexhaven:gba-state` at open/start, startup failure
and destroy/exit. The soundtrack pauses before game loading while keeping intent,
track and position. Closing waits 250ms before resumption; an immediate new game
cancels that timer. Manually paused/disabled music stays paused. Startup error can
release the pause; a later successful start pauses music again. Page navigation
restores state in the next document. Browser policy can still require Play.

ROM mapping/serving, core saves, input, fullscreen and emulator volume were not
changed. The integration uses explicit lifecycle events rather than DOM selectors
or undocumented emulator internals. Native child exit/outer cleanup is handled;
an unrecoverable post-start core fault may still require Exit / Back to Games.
Physical listening and unexpected device/core faults remain manual checks.

## 8. Backend security

Both catalog and stream routes run after existing authenticated session middleware
and live Owner authorization. An independent explicit music flag enables only
development with loopback binding/socket, accepted local Host/Origin, no proxy and
non-cross-site requests. Production/public deployments cannot serve audio.

Track IDs are validated 64-character hashes mapped server-side; no arbitrary path
or query is accepted. Discovery skips symlinks and stream opens recheck realpath
containment. Escaping directory-junction replacement after indexing is tested.
File-handle streams avoid whole-song server memory buffering. GET/HEAD include
correct MIME, lengths, no-store and byte-range semantics, with safe 404/416 errors.
No CORS exception, public static mount, CDN or upload/download API was introduced.
Existing CSP, CSRF, cookie and session behavior remain in force.

The generated public preview contains no audio/private directory/runtime and each
HTML page disables private music initialization. Jekyll exclusions add protection.
**Nine audio files were already tracked in Git before this task.** The ignore
rule does not undo that. Owner-reviewed tracking/history/artifact remediation is
documented in [SOUNDTRACK.md](SOUNDTRACK.md#privacy-and-release-preparation); no
index/history changes were performed. Existing ROM release blockers are unchanged.

## 9. Testing

| Executed command/check | Final result |
| --- | --- |
| `node --test tests/music.test.cjs` | **9 passed, 0 failed, 0 skipped** |
| `npm.cmd test` | **184 tests: 182 passed, 0 failed, 2 existing skips** |
| `QA_MUSIC_ONLY=1 node tests/browser-qa.cjs` | **12/12 groups passed** using generated WAVs, including populated folder playlists, native controls/endings, restoration, GBA lifecycle and preview behavior |
| `QA_MUSIC_ONLY=1 QA_MUSIC_REAL_FILES=1 node tests/browser-qa.cjs` | **13/13 focused Chrome groups passed**, including native decoding/playback clocks for all nine unchanged MP3s |
| `QA_V072_ONLY=1 QA_V072_REAL_ROMS=1 node tests/browser-qa.cjs` | **6/6 regression groups passed**: Shoutbox, history, Games, browser backup isolation, cleanup, themes and all six real GBA startups/video/exit switching |
| `npm.cmd run build:preview` and recursive output scan | **90 public files**, all **13 HTML pages** disable private music; no audio/ROM/save/environment/private backend assets |
| Git integrity and syntax/diff checks | Music, ROMs and database files unchanged; new JS parses; no whitespace errors |

Use PowerShell environment syntax, for example:

```powershell
$env:QA_MUSIC_ONLY='1'
$env:QA_MUSIC_REAL_FILES='1'
node tests/browser-qa.cjs
```

Backend tests cover private configuration, recursive formats/caching/titles,
missing directory/file/ID, traversal, post-index junction escape, unauthorized
and disabled/production/proxied access, MIME/HEAD/ranges, safe catalog, queues and
storage failures. Tests create temporary synthetic data and fixture accounts;
they never use the real MySQL database.

Chrome checks use actual native Audio for generated WAVs and opt-in existing MP3s.
They verify seek/volume/mute, next/previous, shuffle/repeat buttons and native
endings, direct selection, populated folder playlists (generated fixtures),
reload/multi-page restoration, truthful autoplay rejection/recovery, two-tab
handoff, one Audio instance, bounded native media-error recovery, empty catalog,
GBA lifecycle conditions, 320/375/768/1280px themes, dialog behavior and logout.
Public-preview mode is checked to make zero private music requests. Media-error
branches use deterministic native error-event injection to avoid browser media
cache obscuring simulated network failures; missing files/ranges are also tested
through the real Express routes. Actual speaker output is not inferred from a
headless playback clock.

Intermediate test-harness selector/readiness/context races were corrected; the
final commands above pass. Reviewed screenshots are temporarily available in
`%TEMP%/dexhaven-music-review/`. Browser tests run isolated localhost fixture
servers, not the owner's existing port-3000 process. No database was queried or
modified, no migration executed and no background application server was started.

## 10. Manual verification

Follow [SOUNDTRACK.md](SOUNDTRACK.md#owner-manual-verification). In particular:
restart the existing Express terminal once, sign in as Owner, press Play and
listen; try all controls and page restoration; add/remove your own temporary
folder/track and refresh; verify second-tab takeover; launch/exit/switch actual
GBA games while listening and repeat with music manually paused; check saves,
controller/input/fullscreen and existing community/profile/privacy functionality.

No migration or database action is needed for this release. Do not start a second
server while port 3000 is already in use.

## 11. Known limitations

- Full document navigation interrupts audio briefly and may require a new gesture.
- Current flat files supply All Tracks only. No files were moved to create regions.
- Detailed tag variants beyond the bounded supported ID3 title reader use filenames;
  durations appear after selected-track browser metadata loads.
- Native codec/seek support varies. Existing MP3s and generated WAVs were exercised
  in Chrome; OGG/M4A/FLAC decoding, Firefox/Safari/mobile hardware and audible output
  were not verified in this environment.
- Browser-local storage can be cleared/blocked; there is no cloud/account sync.
- Multiple-tab arbitration is best-effort when required browser primitives fail.
- Physical audio balance, post-start core/device failure and full GBA in-game
  save/restore cycles remain owner validation items; existing implementation/tests
  are preserved, not represented as new hardware verification.
- Nine tracked soundtrack recordings remain a public-release blocker, along with
  any unresolved prior ROM tracking/history/artifact issues.

## 12. Release readiness

**Implemented and automatically tested; ready for owner manual review and release
preparation.** Private discovery/playback, UI, restoration and GBA cooperation are
present, with tests, Windows setup, troubleshooting and draft release notes.

**Not cleared for public release.** Resolve tracked private media/history and
complete listening/device/browser checks first. No commit, push, tag, publication,
deployment, database operation or audio-file modification was performed.
