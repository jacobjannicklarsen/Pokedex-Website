# Dexhaven Battle Arena

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

## Engine architecture and formulas

- `battle-calculations.js`: integer level stats, stages, speed, historical type
  multipliers and damage. It is DOM-free and usable by Node tests.
- `battle-move-support.js`: explicit supported-effect whitelist used by the data
  importer. It never marks an unknown effect as an ordinary attack.
- `battle-data.js`: lazy local snapshot loading, level/method eligibility,
  distinct moveset validation and the Struggle definition.
- `battle-engine.js`: explicit immutable state transitions, injected randomness,
  CPU scoring, event log and informational summary generation.
- `battle-runner.js`: one cancellable timer generation, shared by auto mode;
  pause/restart invalidates callbacks from earlier runs.
- `battle.js`/`battle.css`: configuration, sprites, HP/status/PP display, controls,
  CSS feedback and summary sharing. Rendering never determines damage.

For level `L`, base stat `B`, IV 31, EV 0 and neutral nature:

```text
HP    = floor((2B + 31) * L / 100) + L + 10
Other = floor((2B + 31) * L / 100) + 5
Shedinja HP = 1
```

Levels are integers 1–100, default 50. Stat stages are bounded −6…+6. Ordinary
stat multipliers use `(2+n)/2` for positive stages or `2/(2−n)` for negative;
accuracy/evasion use base 3. Paralysis quarters Speed and independently prevents
movement 25% of the time. Priority decides first, then current Speed, then an
injected random tie break. Mid-turn speed changes apply to the next turn order.

Damage uses `floor(floor((floor(2L/5)+2)*Power*Attack/Defense)/50)+2`, then critical,
85–100% integer random variation, STAB (1.5), dual-type effectiveness and physical
burn reduction (0.5). Criticals are 1/16 normally, 1/8 for supported high-crit moves,
deal ×2 and ignore negative attacking/positive defending stages. Physical and
special categories use their corresponding stats. Immunity deals zero; other
damage has a minimum of one. HP clamps to 0…maximum.

Rounding intentionally uses the documented sequential floors rather than all
cartridge fixed-point/truncation edge cases. Drain/healing/recoil use floor with
a one-HP minimum where appropriate. This can differ by a point from cartridge
results. The project references [Pokémon Showdown's Gen V rules](https://github.com/smogon/pokemon-showdown/tree/master/data/mods/gen5)
for comparison; it does not claim simulator-equivalent completeness.

## Supported and unsupported mechanics

**201 moves** are supported. The snapshot contains the complete exact list and
each move's effect descriptor. Supported effects include ordinary damage,
priority attacks, always-hit attacks, increased critical chance, half-damage
drain, quarter/third recoil, burn/poison/freeze/paralysis chances, flinching,
ordinary one/two-stage changes, damaging stat drops and half-HP recovery.

- Accuracy is a percentage adjusted by accuracy/evasion; null-accuracy and
  explicit always-hit attacks bypass the percentage test.
- PP is consumed when a move is attempted, including misses and immunities,
  after sleep/freeze/paralysis/flinch checks. Exhausted moves cannot be chosen.
- Burn and poison deal 1/8 maximum HP at the end of a turn. Burn halves physical
  damage. Fire types cannot burn; Poison/Steel cannot be poisoned.
- Sleep blocks 1–3 attempted turns, then clears. Freeze has a 20% per-action thaw
  check and clears when hit by a damaging Fire move. Ice types cannot freeze.
- Paralysis can affect Electric types in this Gen V-inspired ruleset; Electric
  Thunder Wave still cannot affect Ground. No modern Electric paralysis immunity
  or Grass powder immunity is added.
- Flinch only affects a not-yet-acted opponent in the current turn. Supported
  damaging stage moves still deal damage before applying their change.
- A direct knockout ends actions immediately, including recoil/double knockouts.
  End-of-turn residual damage resolves for both sides before the result check.
  A double knockout or 200-turn safety limit is a draw.
- If no moves are equipped, or all PP is gone, use typeless 50-power Struggle,
  which always hits, has no STAB/type immunity and costs 1/4 maximum HP recoil.

Unsupported moves remain visible in a separate list with a reason, and cannot
be equipped. These include Transform, Sketch, Counter/Mirror Coat, Substitute,
multi-hit/multi-turn moves, OHKO/fixed/variable damage, weather, switching,
confusion, Toxic, recharge, Protect, field effects, ability/item interactions
and other unimplemented effects. Scald is explicitly deferred because its thaw
interactions extend beyond the generic burn effect. Ditto, Unown, Wobbuffet and
Smeargle therefore use the fallback; at level 1 Magikarp/Burmy also need it.
An empty moveset is permitted explicitly, rather than fabricating eligibility.

Additional deliberate scope limits: one Pokémon per side, no switching or sleep
counter reset on switching, no doubles/spread damage modifier, no secondary
effect/ability interactions, no ability/item/nature choices, no complete breeding
chain validation, no cartridge RNG emulation, no multiplayer and no ratings.
AI scores expected power, type effectiveness, accuracy, PP and simple status/
stage/healing opportunities. It is a basic opponent, not a competitive solver.

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

## Verification limits

Tests cover all 649 species at levels 1 and 100, integer examples, history,
eligibility, unsupported moves, physical/special damage, stages, accuracy,
immunities, criticals, PP, status duration, knockouts, Struggle, seeded replay,
AI and timer cancellation. Browser tests exercise configuration, manual/auto
controls, sharing, error retry, both themes, keyboard focus and mobile geometry.
They do not establish cartridge-perfect emulation or validate every move against
an actual Black/White cartridge. Follow the supported-effect contract above.
