# Achievement vault and trainer card studio

The achievement expansion began in v0.6.0; the current Studio update is v0.6.1, preserving Dexhaven branding and the Pokédex Website project name. Existing work was preserved without committing, pushing, deploying or publishing.

## 96 achievements

The original eight keys and historical timestamps remain. Added 88 milestones:

- Six Seen thresholds: 10, 50, 100, 250, 500, 649.
- Five Caught thresholds: 10, 50, 150, 250, 500.
- Five regional trailblazer awards (10 caught per introduction region), plus separate Johto/Hoenn/Sinnoh/Unova completion awards alongside existing Kanto completion.
- Fifty-four type medals: Scout (5 caught), Specialist (15 caught) and Master (all species of that type) for each of 18 modern types. Dual typings count toward both; totals come from the validated 649-species snapshot.
- Five favourites milestones (1/10/25/50/100), three team-count milestones (1/3/5), three region-exploration milestones (3/4/5) and three caught-type-diversity milestones (6/12/18).

All criteria are server-derived from actual saved data. They reconcile when authenticated progression is refreshed. Awards stay earned after progress/favourites/teams are removed; no streaks, battle wins or unsupported historical totals are fabricated. Existing award INSERTs remain idempotent, and reconciliation now skips already stored keys instead of issuing up to 96 redundant INSERTs on every read. Current progress remains separate from lifetime unlock dates.

The Hall of Fame shows earned/total and nearby milestones; toggle filters show earned, locked, nearly-there and six categories. Bronze/silver/gold/legendary styles use colour plus explicit labels, medal artwork, glow and decorative shapes. New unlocks after the initial page snapshot show a dismissible eight-second celebration without changing focus. Sign-out/account changes clear the notification. Motion respects the existing reduced-motion rule.

## Trainer card studio

Open `/trainers.html#view=profile`. Choose from 12 palettes, 11 banner backgrounds, 11 avatar frames, eight finishing touches, four border treatments and three title styles, a 40-character title, a 120-character motto and up to three earned achievement pins. The live preview responds immediately; **Reset preview** restores saved choices, and **Save decorations** persists through Express/MySQL. Optional accent, border and frame colours accept only six-digit hex values. Six coherent presets keep the editor manageable. Reset to default asks for confirmation when replacing a saved design and remains a preview until Save succeeds. There are no arbitrary CSS, HTML or image URLs. Text renders literally through textContent.

Decorations apply to the private profile header and enabled public profile/owner preview. Cosmetics do not enable a public profile or change any existing privacy flags. Public pins are omitted unless achievement sharing is enabled. The server validates pinned keys against the authenticated owner's saved awards, so another trainer's badge cannot be forged. Unknown historical badge keys are ignored safely.

Persistence requires the reviewed [manual decoration migration](database/MIGRATION_profile-decorations.md), which has **not** been applied. Pre-migration reads fall back to a default card, and saving explains the exact SQL file needed. The new-install schema combines that table with the [v0.6.1 extension](database/MIGRATION_v0.6.1.md), which adds five fields and widens option checks. Existing cards read safely before the extension; expanded writes report the required migration. No live database writes or migrations were executed.

## API

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/api/profile/decorations` | Session owner only; reconciles current achievements and returns `{decoration, choices, badges}` with earned badge choices |
| PUT | `/api/profile/decorations` | Session + CSRF/origin protection; complete validated decoration → `{decoration}` |

```json
{"palette":"mint","pattern":"aurora","frame":"classic","effect":"none","title":"","motto":"","pinnedBadges":[],"accentColor":null,"borderColor":null,"frameColor":null,"borderStyle":"solid","titleStyle":"ribbon"}
```

Unknown/extra fields, invalid style choices, excessive text, duplicate/more-than-three pins and unearned keys return 400. Guests return 401; invalid CSRF returns 403; missing save table returns 503 with migration guidance. IDs always come from the session, never the body. Existing public profile responses gain approved `decoration` and `pinnedBadges` fields; public achievement definitions now include icon, rarity and category. Raw private progress/settings remain excluded. Responses stay no-store and profile URLs retain visibility checks.

## Verification and files

Historical achievement-expansion verification: **78 automated tests passed, one opt-in live-MySQL test skipped; 61/61 Chrome checks passed**. Current v0.6.1 results and new options are documented in [the implementation report](IMPLEMENTATION_v0.6.1.md). Visually reviewed the decorated public trainer card.

Run `npm.cmd test` and `npm.cmd run test:browser`. Added calculation checks for all 96 reachable/unique criteria, every type boundary, historical unlock retention and avoiding redundant INSERTs. Two-account API tests cover decoration ownership, validation, forged/unearned pins, CSRF and public badge visibility. Repository checks cover pre-migration fallback, parameter binding and additive schema consistency. Chrome checks cover vault filters, studio preview/reset/save/reload, literal text, earned pins, public styling and mobile/both themes. Live MySQL migration, restart persistence and constraint execution remain manual; fixtures do not prove them.

New: `profile-decorations.js`, `server/decorations.js`, `database/migrations/profile-decorations.sql`, `database/MIGRATION_profile-decorations.md` and this guide. Modified: progression definitions/reconciliation/UI, account and community profile rendering, shared CSS, hub/community script loading, community repository/public projections, protected API/static allowlist, fresh schema and tests/fixtures. Earlier status-toggle, ability-tooltip and chart-hover work remains intact.
