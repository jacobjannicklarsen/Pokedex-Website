# Dexhaven v0.7.2.1 — Pokémon Soundtrack Player

Private background music for the existing multi-page Dexhaven installation.
The human release label is **v0.7.2.1**; npm remains valid SemVer **0.7.2** and
`package.json.dexhavenRelease` records `0.7.2.1`. No database is used or migrated.

## Windows / VS Code setup

1. Open the existing project in VS Code, then **Terminal → New Terminal** and
   select PowerShell. Work in:

   ```powershell
   Set-Location -LiteralPath 'E:\EK - IT-Arkitektur\Pokedex Website'
   ```

2. The ignored local `.env` now has the new settings below. Existing variables
   were preserved. Keep the private server configuration:

   ```dotenv
   NODE_ENV=development
   HOST=127.0.0.1
   APP_ORIGIN=http://localhost:3000
   TRUST_PROXY=false
   DEXHAVEN_ENABLE_MUSIC=true
   DEXHAVEN_MUSIC_DIR="E:/EK - IT-Arkitektur/Pokedex Website/Dexhaven-Music"
   ```

   `.env.example` has a disabled default and safe `./private-music` placeholder.
   Music enablement is independent of GBA enablement.

3. Keep the existing audio files where they are. They need no renaming or manual
   registration. No new dependency installation or database command is needed.
4. Stop your existing Dexhaven terminal with **Ctrl+C**, then run
   `npm.cmd start` once. Do not run a second copy on port 3000. This update did
   not start a background server or stop your terminal process.
5. Open `http://localhost:3000/` and log in with the existing **Owner** account.
   The compact player appears at the bottom right. Guests and other ranks do not
   receive the catalog or audio. Public previews do not initialize private music.
6. Press **Play music**. The first audible playback needs a real browser gesture.
   Expand the player using its arrow to see the library and detailed controls.

## Discovery and playlists

The configured directory is scanned recursively. MP3, OGG, WAV, M4A and FLAC are
indexed with matching MIME types; actual codec support depends on the browser.
Unsupported extensions, empty files and symlinks/junctions are omitted. The UI
filters formats using native `canPlayType`; decoding failures skip safely when
playing, with a bounded number of attempts.

A bounded ID3v2.3/2.4 title reader handles supported MP3 text encodings. Unknown
or unsupported tags fall back to readable filenames: `LittlerootTown.mp3`
becomes **Littleroot Town**. No title or region is fetched from an external API.
Duration is read by the browser when the selected audio's metadata loads; the
catalog does not invent durations for unprobed files.

The actual collection inspected for this release has **nine MP3s directly in
Dexhaven-Music**, without region folders. They appear under **All Tracks**.
Kanto/Johto/Hoenn categories are not invented from uncertain metadata. Existing
top-level subfolder names become populated playlists automatically, so a future
`Kanto` folder will appear without source changes. All Tracks always exists.
No current audio was reorganized.

The server caches its index for 30 seconds. **Refresh library** forces a safe
rescan after adding/removing files. Track IDs hash relative filenames, so adding
another file does not renumber existing tracks. Renaming/moving a file creates
a new ID and may reset its last-track selection. Absolute paths stay on the server.

## Controls

- Compact player: track title, Play/Pause, Next and Expand/Collapse.
- Expanded panel: Previous/Next, direct track selection, Shuffle, Repeat,
  playlist selector, volume/mute, elapsed/total time and a seek slider.
- Volume starts at **35%** and persists. Mute does not discard that setting.
- Shuffle uses a queue, visits each track before repeating, and provides Previous
  within that queue. Wrapping avoids immediately repeating the last track where
  another track exists.
- Repeat cycles **All → One → Off**. Repeat One loops the current track when it
  ends; manual Next still advances. Repeat Off stops at the queue's end.
- Previous restarts the current track after three seconds; pressing it near the
  start selects the preceding track. Direct selection starts the chosen track.
- **Turn music off** clears enabled/playing intent. Play enables it again.

Controls have accessible names, keyboard focus, native range/select interaction,
reduced-motion support and light/dark layouts. The panel scrolls on short screens;
collapse it to recover space. It yields visually to open site dialogs and does
not enter or modify the emulator's fullscreen view.

## Playback restoration and browser restrictions

Small settings in `dexhaven.music.v1` remember enabled/intended playback, track,
playlist, queue order, shuffle, repeat, volume, mute and approximate position.
Position is saved about every five seconds, on visibility changes, user changes
and page exit. No audio file is stored in localStorage or uploaded to Express.

Full HTML navigation destroys the old Audio element. The next page creates one
new instance, loads the saved track, restores position after metadata and attempts
playback only when enabled and intended. There is a **brief interruption**; this
is not gapless audio and the site remains multi-page. The browser may require a
fresh **Play** gesture after navigation/reload. Rejected autoplay is reported and
the UI does not claim playback is running. Clearing storage, changing origins or
private mode can remove preferences. Storage failure falls back to in-memory use.

A short localStorage lease and BroadcastChannel coordinate tabs. A new tab yields
to existing playback; explicitly pressing Play takes over and pauses the other
tab. A crashed tab's lease expires after eight seconds. Browser restrictions,
unavailable storage/BroadcastChannel and simultaneous gestures can limit this
coordination; gapless cross-tab/device synchronization is not provided.

## GBA cooperation

`GBAPlayer` publishes `dexhaven:gba-state` from its existing open, started,
startup-error and destroy/exit lifecycle. Soundtrack playback pauses before the
iframe starts, preserving its track, position and intended playback. On close it
waits 250ms before resuming, so immediate game switches cancel the resumption.
Manually paused or disabled music stays paused. Autoplay restrictions still apply.

Startup failure can release the music pause; a subsequently successful emulator
start pauses it again. Navigating away saves music intent and the next full page
can restore it. ROM loading, saves, emulator volume/input and core configuration
are unchanged. No undocumented emulator property or DOM lookup drives the music
integration. Audible game/music balance on actual hardware remains a manual check.

## Privacy and release preparation

The catalog and streaming routes require the live authenticated Owner, explicit
development enablement, loopback binding/socket, accepted Host/Origin, no proxy
and non-cross-site requests. Production disables access. There is no music static
mount, arbitrary path input, public CDN, audio download service or directory list.
Realpath containment is checked during discovery and every stream open. Streaming
uses file handles rather than buffering whole songs, with correct MIME, byte
length, HEAD, 206 ranges and 416 errors. Existing CSP/CSRF/session controls remain.

The preview builder copies only public source/assets, excludes audio directories
and marks generated HTML so the player does not request private music. `_config.yml`
also excludes Dexhaven-Music for Jekyll builds. Public deployment stays disabled.

**Release blocker:** all nine MP3s were already tracked in Git at the audit.
The owner's existing `/Dexhaven-Music/` ignore rule was preserved and annotated,
but ignore rules do not remove tracked files or old commits. Before any public
push, back up the collection outside Git and review:

```powershell
git ls-files -- 'Dexhaven-Music'
# Owner-reviewed tracking removal only; keeps local files:
git rm -r --cached -- 'Dexhaven-Music'
```

Review/commit that change yourself. If audio-containing commits were shared,
coordinate separate history and release/Pages artifact cleanup; a current-file
deletion alone does not remove past audio. No index/history rewrite, commit, push,
tag, release or deployment was performed. No copyrighted audio was downloaded,
copied to a public artifact, re-encoded or modified by this implementation.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| No player | Log in as the local Owner; verify the new scripts loaded and the page is not a static preview |
| Private music unavailable | Check the enable flag, development/loopback/no-proxy settings, directory and restart Express once |
| No tracks | Verify supported extensions and readable files; Refresh library; browser codecs may differ |
| Playback paused after navigation | Press Play; the browser may block audible autoplay on the new document |
| No sound | Check Play status, mute, volume, browser/OS audio and whether a game/another tab owns audio |
| Seek disabled | Wait for metadata/seekable ranges; some codecs/files cannot seek in the current browser |
| Track missing or corrupt | Refresh the library or choose another track; failed playback attempts are bounded |
| Preferences reset | Use the same localhost origin/port/browser and permit localStorage; no cloud sync exists |
| EADDRINUSE | Stop the existing Dexhaven terminal with Ctrl+C before running npm.cmd start again |

## Owner manual verification

1. Restart your existing terminal once, sign in as Owner and verify the nine titles.
2. Play a track and listen through your actual speakers/headphones; check pause,
   next/previous, volume, mute, seek and direct selection.
3. Try shuffle and all repeat modes; verify track endings and queue history.
4. Add a supported test file/subfolder privately and Refresh library. Confirm its
   category appears, then remove your own test file and refresh. No renaming of
   the existing collection is required.
5. Navigate Home → Pokédex → Trainer Hub → Analytics → Forums → Games. Confirm
   the same selected track/volume/position restore, using Play if prompted.
6. Open a second tab: existing playback should retain ownership until Play is
   explicitly pressed in the other tab. Confirm only one is audible.
7. While music plays, launch an actual GBA title. Music should pause and game audio
   remain normal. Exit and check resumption. Repeat after manually pausing music;
   it should stay paused. Switch games and check for no short music burst.
8. Verify GBA save/restore/input/fullscreen, Shoutbox, notifications, login/logout,
   privacy, teams, forums, Staff and both themes on your normal browser/devices.
9. Review tracked music/history and existing ROM release blockers before any push.

See [IMPLEMENTATION_v0.7.2.1.md](IMPLEMENTATION_v0.7.2.1.md) for executed commands,
exact test results and the distinction between automated and pending manual checks.
