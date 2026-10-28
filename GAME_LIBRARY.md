# Dexhaven v0.7.2 — local games and homepage Shoutbox

This is an independent personal software project. No ROM, BIOS, cloud save or
account-linked game progress is distributed by this feature.

## Private installation on Windows

Use VS Code → Terminal → New Terminal → PowerShell. Work in the existing project:

```powershell
Set-Location -LiteralPath 'E:\EK - IT-Arkitektur\Pokedex Website'
npm.cmd install
npm.cmd run vendor:emulator
```

The installer fetches only hash-pinned EmulatorJS **4.2.3** runtime files and the
mGBA legacy WebAssembly core from the official versioned CDN. It downloads no ROM
or proprietary BIOS and runs only when explicitly requested, not at server startup.
The core supports GBA operation without an externally bundled Nintendo BIOS.

The local untracked `.env` has these new entries; existing variables are preserved:

```dotenv
DEXHAVEN_ENABLE_GBA=true
DEXHAVEN_GBA_ROMS_DIR=E:/EK - IT-Arkitektur/Pokedex Website/Dexhaven-GBA/ROMs
```

Also keep `NODE_ENV=development`, `HOST=127.0.0.1`,
`APP_ORIGIN=http://localhost:3000` and `TRUST_PROXY=false` for this private setup.
Public/production deployments must leave GBA disabled. `.env.example` uses a safe
relative placeholder and disabled default.

The owner explicitly approved using the existing filenames unchanged:

| ID | Local filename |
| --- | --- |
| firered | Pokémon - FireRed Version.gba |
| leafgreen | Pokémon - LeafGreen Version.gba |
| ruby | Pokemon - Ruby Version.gba |
| sapphire | Pokémon - Sapphire Version.gba |
| emerald | Pokémon - Emerald Version.gba |
| lightplatinum | Pokémon - Light Platinum Version.gba |

These are fixed server-side mappings, not arbitrary paths supplied by clients.
The files were not renamed, moved, patched or overwritten. Light Platinum has a
distinct identity from Ruby. Missing files disable only their own card.

Start once with `npm.cmd start`; if port 3000 is already occupied by Dexhaven,
stop its existing terminal process with Ctrl+C before starting a second copy.
Visit `http://localhost:3000/games.html` and log in with the existing **Owner**.
Click Play: the ROM is fetched automatically without a ROM picker. The player
toolbar exposes pause/resume, restart, audio, controller settings, fullscreen,
Export save, Import save and Exit. The outer Exit / Back to Games also closes the
player. Switching destroys the previous iframe and its listeners/timers.

## Saves and revision isolation

Use each game's normal in-game Save menu. EmulatorJS persists SRAM/Flash in its
own IndexedDB storage and restores it when the same game identity starts again.
The configured System Save interval is 30 seconds. Exit dispatches the runtime's
normal exit lifecycle and allows its save flush to finish before removing the
iframe. Avoid force-killing the browser during a save; export backups regularly.

The server computes a SHA-256 ROM fingerprint read-only. Save names use the full
game ID plus fingerprint; the documented numeric EJS_gameID is derived from a
hash of that identity. Games and revisions have distinct identifiers, including
Ruby and Light Platinum. Do not swap hack revisions and expect compatible saves.

Export save uses documented EJS_onSaveSave to download a raw `.sav` and store a
separate Dexhaven IndexedDB backup keyed by the full identity. Its indicator means
**an export backup exists**, not that an in-game save was detected. Stable 4.2.3
does not expose the newer EJS_onSaveUpdate hook, so no such detection is claimed.
Import save uses the native toolbar, checks supported GBA SRAM/Flash byte sizes
(including small RTC trailers), rejects known mismatching game/revision backup
names, and asks before overwriting. Unknown raw saves cannot prove their game
identity; only import a compatible save from the exact ROM revision. Save states
are different and are hidden in this release. No save is uploaded to Express or
stored in MySQL. Clearing browser storage, private browsing or changing origins
(localhost vs 127.0.0.1/ports) can hide or remove progress.

## Security, licensing and static preview

ROM/player/runtime routes are enabled only for development on a loopback-bound,
non-proxied installation, with loopback socket, accepted Host/Origin, same-site
request and live authenticated Owner checks. Production disables them. Realpath
containment rejects escaping symlinks; fixed IDs reject traversal and arbitrary
paths. ROM responses are no-store and no directory is mounted by express.static.
Paths and file lists are not returned to the browser. Normal site CSP is retained;
only the private player document has the dynamic-JS permission required by mGBA's
Emscripten bootstrap. It can embed no frames and fetches its runtime locally.
The pinned runtime's optional remote version check is answered inside this frame
with the installed version metadata, avoiding an upstream unhandled offline
fetch rejection. Other fetches retain their normal behavior and CSP restrictions.

EmulatorJS is GPL-3.0. The installed runtime includes its license; the manifest
pins exact downloaded bytes. Source: https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3
and https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3 . Review GPL source
and notice obligations before redistributing the emulator/runtime or a combined
application. mGBA/core upstream source and build information:
https://github.com/EmulatorJS/EmulatorJS#cores and
https://github.com/EmulatorJS/build . Local testing does not publish anything.

**Release blocker found during audit:** all six commercial ROMs were already
tracked in Git before this task. `.gitignore` does not untrack existing files or
remove them from old commits. No Git index or history was changed by Codex.
Before any push/release, back up the private collection outside Git and inspect:

```powershell
git ls-files -- 'Dexhaven-GBA/ROMs'
# Owner-reviewed remediation: removes tracking only; keeps working files.
git rm -r --cached -- 'Dexhaven-GBA'
```

Review and commit that tracking removal yourself. If any prior commit containing
ROMs was pushed/shared, deleting current tracking is insufficient: coordinate a
separate history cleanup (such as git-filter-repo), protected-branch/clone cleanup,
and removal of existing release/Pages artifacts. Do not force-push casually.
This implementation did not rewrite history, commit, push, tag, release or deploy.

For a public preview, run `npm.cmd run build:preview`. The allowlist-built
`preview-dist` excludes ROMs, private runtime, `.env`, server/database sources and
the private player HTML. `_config.yml` additionally excludes private paths for
Jekyll builds. Deploy only the reviewed public output, never the repository root
with its currently tracked ROM history. Static Games/Shoutbox show unavailable
states when the private Express backend cannot be reached.

## Owner manual checklist

1. Verify all six exact filenames above exist in the private E: folder.
2. Confirm `.env`, loopback binding, the official pinned runtime installation and
   existing Owner login. Start one local server and open Games.
3. Launch FireRed, LeafGreen, Ruby, Sapphire, Emerald and Light Platinum one by one.
   Confirm title/gameplay screens, correct colors/aspect ratio, keyboard directions,
   A/B/Start/Select, audible sound, mute/volume, pause, restart and fullscreen.
4. Connect a real controller, configure it in the toolbar and verify buttons. Test
   Ruby/Sapphire/Emerald RTC over time, and the actual Light Platinum revision's
   events/save behavior. These hardware/gameplay checks remain manual.
5. In each game, reach a normal in-game Save, save, exit using the provided control,
   reopen, and choose Continue. Close/reopen Games and then the browser too. Verify
   progress and RTC. A full commercial-game save cycle is not automatically claimed.
6. Export a `.sav`, make a small gameplay change, and import that matching backup.
   Accept overwrite only intentionally. Confirm restoration and that the other five
   games/revisions remain unchanged. Reject a mismatching named backup and a state.
7. Test missing ROM behavior without deleting files (temporarily change the test
   configuration), guest/Trainer access, a nonlocal host and disabled/production
   settings. Restore your private configuration afterward.
8. Apply the Shoutbox migration manually using
   [database/MIGRATION_v0.7.2.md](database/MIGRATION_v0.7.2.md).
9. On Home, read as guest, then log in and post. Confirm public username, permitted
   avatar/profile link and a character counter. Reopen/restart and confirm real
   database persistence. The fixture tests do not replace this check.
10. Open Home in two browsers. Confirm polling brings new posts and removals into
    view, older-message loading deduplicates, scroll position is usable and hidden
    tabs reduce polling. Try a blank, long, repeated and rapid message.
11. As authorized staff, remove a test message with a reason and confirmation;
    confirm a guest/Trainer cannot remove messages via the API. Check audit SQL.
12. Check theme/mobile layouts, navigation, login/logout, trainer profiles/privacy,
    teams/analysis/sharing, favourites, Pokédex/encyclopedia/progression, Analytics,
    forums, Staff and Administration. No existing feature was intentionally removed.
