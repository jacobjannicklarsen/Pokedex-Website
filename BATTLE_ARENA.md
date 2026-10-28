# Dexhaven Battle Arena

## Arena presentation and moveset tools

The Arena now groups matchup configuration, battle controls and the live field
into numbered sections. Contender cards show base-stat bars, level statistics,
colour-coded type badges and equipped-move removal shortcuts. Search by move
name and combine Type/Category filters without changing the four-move limit.
Invalid levels disable entry until corrected. Battlefield HUDs show side identity,
types, health and status, with additional vertical space on small screens.

Type and category keys stay lowercase in the historical data and battle engine.
The UI now formats visible names through the shared display formatter (Water,
Physical, Special, Status), rather than rendering those raw keys directly.

The Battle Arena and Forums share one `.intro-portrait` treatment: transparent
artwork, a bottom-only fade, alpha-shaped drop shadow and reduced-motion-aware
entrance. The professor uses its transparent cutout; Forums uses the existing
transparent Patrick image between the introduction and discussion actions.

## v0.7.1 saved simulations

The same Gen V engine now offers Easy/Normal/Hard CPU choices. Difficulty changes
move selection, never stats or battle rules. Easy randomizes legal attacks; Normal
retains existing scoring; Hard also considers HP, KOs, priority, PP and supported
status/recoil decisions. This is a limited simulator, not a competitive ladder.

After a completed local simulation, Save stores a server-reconstructed, unqualified
record. Enabling activity recording before Start requests a one-use server ticket
and seed. Both flows save only validated actions/configuration; forged outcomes
are ignored/rejected. History is owner-only with species/outcome/order filters,
statistics, removal and readonly exact replay playback (play/pause/restart/speed).
Replays store initial metadata, frames, events and ruleset/revision, so future
engine changes do not reroll previously saved outcomes. Unsaved local play still
works without account or database support.

Activity qualification additionally requires server preparation, level 50 on both
sides, different species, at least three moves each, three turns and five seconds,
with at most three awards-eligible records per day and one ordered pairing per day.
Local imports and auto-mode outcomes never become personal competitive wins.
Deleting history excludes it from statistics but retains anti-abuse/award evidence.
Caught-based rank thresholds are unchanged. The three battle awards use only
qualified server activity; Strategist counts Normal/Hard player-vs-CPU wins.

See [manual migration](database/MIGRATION_v0.7.1.md) and
[API/replay contracts](server/API.md#v071-community-settings-and-saved-simulations).

Open `battle.html`. No login or MySQL migration is needed for local battles.
Choose both Pokémon by name/number using the existing searchable selector,
set independent levels and equip up to four moves. **Player vs CPU** offers one
move choice each turn; **Auto Battle** controls both sides and supports pause,
resume, speed changes and restart. Keyboard and touch use ordinary controls.

This is a **simplified Generation V Black/White-inspired simulator**, not a full
cartridge emulator. The visible rules panel describes its assumptions. Saved
trainer teams, collection, achievements, caught ranks and staff roles are never
changed by a battle.

## Verified data

`data/battle-v5.json` is a separate, locally served snapshot covering all 649
standard species, 559 historical moves and the 17-type Gen V chart. The existing
modern encyclopedia/analytics snapshot is untouched. The Arena does not download
hundreds of API resources per battle and can run without the external API.

The source is the [official PokéAPI data repository at revision
2bf639e5572812a67d2b94903fdcb9d095f5aeb2](https://github.com/PokeAPI/pokeapi/tree/2bf639e5572812a67d2b94903fdcb9d095f5aeb2/data/v2/csv).
The snapshot records that revision and SHA-256 of every source CSV. The explicit
developer command `npm.cmd run data:battle` rebuilds it from that pinned revision;
normal startup never runs the importer. Source downloads cache in an OS temporary
directory. No secrets or trainer records are included.

The importer uses Black/White version group 11 and only documented level-up,
machine and breeding entries. A level-up move above the selected level cannot
be equipped. Machine/breeding access is an assumption of setup, not a claim
that the player obtained a particular parent or TM in-game. No modern learnsets,
transfer moves or unverified tutor eligibility are invented.

Historical stat/type boundaries are applied to the selected generation. Move
changelog values are applied backwards by the actual version-group order,
including power, PP, accuracy, priority, target and effect identifier. For example,
Pikachu uses its older Defense of 30, Clefairy is Normal, Flamethrower has 95
power, and Steel resists Ghost and Dark. Fairy is absent. See [PokéAPI's data
definitions](https://pokeapi.co/docs/v2) for historical resource semantics.

## Full Generation V move engine

All 559 historical move records now use the pinned @pkmn/sim 0.10.11 simulator,
extracted from Pokemon Showdown. Previously the custom engine supported 201.
Move execution includes charging/recharge, multi-hit, fixed/variable damage,
OHKO moves, weather, protection, Substitute, Transform, Sketch, Toxic, confusion,
Counter/Mirror Coat, field effects and their Generation V interactions.

- battle-data.js still enforces each species' historical Black/White learnset,
  selected level, four distinct moves and standard National species #001-649.
- battle-simulator.js adapts the full engine to immutable Arena state, injects
  deterministic randomness and projects legal move requests, PP, HP, conditions,
  types and transformed appearance. Forced charge/recharge turns cannot be bypassed.
- battle-engine.js routes Arena configurations to this adapter. The former small
  engine remains in battle-engine-legacy.js for existing DOM-free consumers/tests.
- battle-calculations.js continues to supply setup stat tables and legacy math.
  Active battle damage, rounding and move effects come from the full simulator.
- battle-recording.js uses the new dexhaven-bw-sim-0.10.11 ruleset. Existing saved
  replays remain stored frames and are never rerolled. Started tickets using older
  rules expire through the existing validation path.
- scripts/vendor-battle-simulator.cjs builds the pinned local browser bundle with
  esbuild (npm run vendor:battle). It preserves class names required for serialized
  simulator references and retains the MIT license in vendor/battle-simulator.LICENSE.
  Node and browser use the same simulator version and deterministic adapter.
- scripts/battle-data-corrections.cjs records explicit historical CSV corrections:
  Cryogonal's Attack/Defense, six recovery moves' base PP, Luster Purge power,
  Ally Switch priority, and Hidden Power's Dark/70 result with the fixed 31 IVs.
  The importer reapplies these corrections on every regeneration.

The fixed setup remains neutral nature, 31 IVs, zero EVs, base PP, no held items,
no abilities and one Pokemon per side with no reserves. Moves requiring a missing
item, partner or reserve can fail legitimately; their mechanics are not replaced
with ordinary damage. Empty movesets and exhausted PP automatically use Struggle.
Battles retain the 200-turn draw limit. Exact game cartridge RNG is not emulated.

Easy chooses randomly, usually from attacks. Normal scores estimated damage and
support opportunities. Hard adds knockout, priority, healing and recoil decisions.
All difficulties obey the same requested moves and mechanics; stats are unchanged.

Source and licensing: https://github.com/pkmn/ps/tree/main/sim (MIT), derived from
https://github.com/smogon/pokemon-showdown. The Cryogonal historical base stats are
also documented in Showdown's data/mods/gen6/pokedex.ts (inherited by Generation V).

## Presentation and sharing

CSS handles HP transitions, short attack/damage effects, damage numbers, faint
appearance and result feedback. Sprite failure uses the existing local fallback.
Reduced motion disables animations/transitions and floating damage text. The
event log remains readable, with a separate polite live battle-status message.

A completed battle can copy a plain-text summary or offer it to a **new forum
composer** as an explicit draft. The draft stays in sessionStorage for at most an
hour and is never posted automatically. It is labelled an unofficial client
simulation. No trusted competitive record, persistent battle history, rank,
achievement or collection API is written by either battle mode.

## Verification

Tests exercise every move record and forced continuation, all 649 species at levels
1/100, snapshot/simulator stat agreement, charging, recharge, Substitute, Transform
(including copying a shorter moveset), protection, fixed/multi-hit damage, weather,
escalating Toxic, Struggle and non-mutating transitions. Existing replay/API tests
cover owner isolation, deterministic reconstruction, integrity and activity awards.
Chrome checks cover actual Transform selection, updated live HUDs, and identical
complex-move replays in the browser and Node, plus both themes and mobile layouts.
These checks are not a claim of comparison against every real cartridge scenario.
