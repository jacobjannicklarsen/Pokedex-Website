# Dexhaven v0.7.2.1 — Pokémon Soundtrack Player

Draft only. Human release label `v0.7.2.1`; npm SemVer remains `0.7.2` with
`dexhavenRelease: "0.7.2.1"`. Not tagged, published or deployed.

## Added

- Private Owner-only soundtrack discovery and streamed playback across the site.
- Recursive MP3/OGG/WAV/M4A/FLAC catalog with filename/ID3 titles and folder playlists.
- Compact/expanded player, play/pause, previous/next, seek, volume/mute and track list.
- Shuffle queues, repeat all/one/off and browser-local preferences/position restoration.
- GBA lifecycle pause/resume and practical cross-tab playback ownership.

## Security and behavior

- Development-only loopback/Host/Origin/Owner boundary shared with private GBA access.
- File containment, safe track IDs, bounded metadata reads and byte-range streaming.
- Existing session/CSP/CSRF protections preserved; no database schema/data changes.
- Audio stays in its original private folder; public preview excludes it and disables
  private player initialization. No new dependency or public audio provider.

## Testing and limitations

- Native Chrome playback was exercised with generated WAVs and all nine existing MP3s.
- Reload/page restoration, queue modes, seeking, volume, autoplay rejection,
  multi-tab handoff and GBA lifecycle scenarios have focused browser checks.
- Full page navigation has a short interruption and may require another Play gesture.
- Codec/device support varies. Actual speaker output and game/music audio balance
  still require owner listening checks. No cloud sync or gapless architecture added.
- **Nine MP3s were already tracked in Git.** Resolve tracking/shared history and
  artifacts before public release. No automatic Git remediation was performed.

Exact final counts, changed files and manual checks:
[implementation report](IMPLEMENTATION_v0.7.2.1.md) and [setup guide](SOUNDTRACK.md).
