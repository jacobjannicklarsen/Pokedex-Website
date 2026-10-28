# Dexhaven v0.7.2 — Game Library & Community Shoutbox

**Draft for owner review. Not tagged, published or deployed.**

## Added

- Six-game GBA library: FireRed, LeafGreen, Ruby, Sapphire, Emerald and Light Platinum.
- Pinned EmulatorJS 4.2.3/mGBA with automatic private local ROM loading.
- Keyboard/controller, audio, pause/restart, fullscreen, exit and native in-game saves.
- Game/revision save identities, validated raw-save imports, exports and local backups.
- Homepage Community Shoutbox, MySQL adapter, polling and audited staff moderation.

## Improved

- Games in the main navigation and responsive, theme-aware native cards.
- Homepage community integration, loading/empty/error states and local game management.
- An explicit public-only preview build and Git/Jekyll private-path exclusions.

## Security

- Development-only, loopback socket/binding, Host/Origin/same-site and live Owner checks.
- Fixed ROM mapping, realpath containment and SHA-256 revision-pinned delivery.
- No ROM directory static mount, cloud saves or arbitrary filesystem requests.
- Existing session/CSRF controls; parameterized SQL and safe plain-text message rendering.
- 500-character limit, five-second cooldown, ten posts/minute/account, duplicate protection.
- Fresh moderation permissions/hierarchy, transactional soft deletion and audit recording.
- Runtime dynamic-JS exception confined to the private player document.

## Database

- Additive **manual-only** `database/migrations/v0.7.2-shoutbox.sql`.
- Migration not executed. No emulator-save database tables or unrelated table alterations.

## Testing

- New API/security/schema/save tests and focused Chrome checks.
- All six existing ROMs booted and rendered video through the real mGBA player.
- Real MySQL Shoutbox persistence awaits manual migration and owner validation.
- Final exact commands/counts and manual limits are in `IMPLEMENTATION_v0.7.2.md`.

## Known limitations and release blockers

- Private Owner installation only. Public preview has no playable ROMs.
- No cloud saves, DS support, multiplayer, trading or save-to-Pokédex synchronization.
- Browser storage clearing/origin changes can remove or hide saves; export backups.
- Physical-controller/audio/RTC and full real-game save/restore cycles need manual checks.
- **Six ROMs were already tracked in Git before this work.** Ignore rules do not erase
  tracked files or history. Resolve tracking/history/artifact distribution before a push.
- Review GPL source/notice obligations before distributing emulator/runtime artifacts.
