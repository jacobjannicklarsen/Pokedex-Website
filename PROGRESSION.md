# Dexhaven v0.5.0 — Trainer Progression

The later [achievement vault enhancement](TRAINER_STYLE.md) expands the catalogue to **96 achievements** while preserving the original eight below, their keys, thresholds and unlock dates. It also adds rarity/category styling, filters, unlock celebrations and earned profile pins. New criteria use existing stored collection/team/favourite data; no new tracking schema is needed for awards.

The website remains **Dexhaven**, the development project remains **Pokédex Website**, and MySQL remains **pokedex_app**. This update carries the existing v0.4.0 work onto `dev/v0.5.0` without discarding or committing it.

## Enable and test locally

The migration is prepared but is not run by startup or the frontend. Follow [database/MIGRATION_v0.5.0.md](database/MIGRATION_v0.5.0.md) in MySQL Workbench when you approve modifying your database. No migration or live database test has been executed by this development work. Existing installations need the prior v0.2.0+ schema. For a new installation, the new tables are included in `database/schema.sql`.

After the approved migration, restart Express with `npm.cmd start` and visit:

- `http://localhost:3000/pokemon.html` — card collection controls and personal filters.
- `http://localhost:3000/trainers.html#view=progress` — personal statistics and completion.
- `http://localhost:3000/trainers.html#view=achievements` — locked/unlocked awards and current progress.

Guests can browse every public Pokémon page. Collection controls stay hidden for guests and personal filters are disabled with a sign-in invitation. Private progression requires the same-origin Express API and authenticated session; the static/GitHub Pages preview never simulates private persistence.

1. Sign in and mark Pikachu (#025) **Seen**. Seen becomes 1 and Caught remains 0. Change it to **Caught**; it now counts once in Seen and once in Caught. Verify the same status in its detail dialog.
2. Change Caught back to Seen, remove the registration and repeat a status. Verify no duplicate counts, proper removal, preserved Seen date when changing status and unchanged timestamps for an identical update.
3. Combine All/Seen/Caught/Not Seen/Not Caught with name or number, generation, type, advanced stats and sorting. Seen includes Caught; Not Seen means absent; Not Caught includes absent and Seen-only species. Reset all filters restores All.
4. In Progress, verify totals, percentages, generation bars, team/favourite counts, recent registrations and type memberships. Generations use **introduction intervals**, not individual games' regional Pokédex lists. Dual-type species contribute to both type totals.
5. Unlock First Encounter and First Catch, then remove the registration. The awards remain unlocked with their original dates; current collection counts return to zero. Catch 25 species for Pokémon Collector, or save a six-member team for Team Builder, then verify permanence after reducing the collection/deleting the team.
6. Refresh, log out/log back in and navigate all four pages. Open a second tab, change a status and confirm it updates. Switching accounts must replace the private collection, not merge it with the previous trainer's records.
7. Test mobile layouts, both themes, keyboard toggles and detail controls. Each card/detail uses three exclusive icons: minus-circle (Not registered), eye (Seen), and Poké Ball (Caught). Buttons have accessible names, hover labels and an `aria-pressed` selection; Not registered clears tracking. The main collection-filter dropdown remains available. With the backend or new tables unavailable, tracking must show a meaningful error/retry state while ordinary public filters and existing trainer features remain available.

## Records, API and consistency

`user_pokedex` has one row per authenticated trainer/species. Absence represents Not registered; `seen_at` is non-null and `caught_at` is nullable. The schema's ID CHECK, composite primary key, user foreign key and timestamp CHECK enforce identity bounds, uniqueness, ownership association and Caught ⇒ Seen. Timestamps are stored and returned in UTC, then localized for display.

Protected endpoints use the existing session cookie, authentication, same-origin policy and CSRF token:

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/pokedex` | Consistent bundle: `{collection, statistics, achievements}` |
| GET | `/api/pokedex/:id` | Current user's status/timestamps; absent row returns `status: "not-registered"` |
| PUT | `/api/pokedex/:id` | Body `{status: "seen"}` or `{status: "caught"}`; returns updated bundle |
| DELETE | `/api/pokedex/:id` | Removes the registration; returns updated bundle, including historical awards |
| GET | `/api/progression` | `{statistics}` with National/generation/type/recent/team/favourite data |
| GET | `/api/achievements` | `{achievements}` with definition, goal/current progress and unlock date |

IDs must be 1–649. PUT rejects extra owner/timestamp/achievement fields and invalid statuses. Neither URL nor body accepts a different trainer's ownership scope: all repository calls use `req.user.id`. GET responses use the existing `Cache-Control: no-store`. Mutations return 200 with the full authoritative bundle; they are idempotent for repeated status/removal. Bad input returns 400, guests 401, invalid CSRF/origin 403 and unavailable progression schema 503. SQL details and credentials are not returned.

The repository locks the authenticated user's row before collection mutation and snapshot/award calculation. Collection changes and all qualifying awards commit or roll back together. Primary keys and duplicate-key award writes preserve the first unlock timestamp. GET bundle/statistics/achievement operations also reconcile currently eligible awards, supporting pre-existing full teams. Saving a full team awards Team Builder in that team's existing transaction, so deleting it immediately afterward cannot lose an earned award after migration.

## Calculations and achievement policy

All personal calculations run on the backend over current owned records and the complete validated 649-species dataset. Seen is the row count, Caught counts rows with a Caught timestamp, Not Seen is 649 minus Seen and Not Caught is 649 minus Caught. Percentages are `count / total × 100`, kept unrounded in the API and displayed to two decimals.

Generation boundaries are Kanto 1–151 (151), Johto 152–251 (100), Hoenn 252–386 (135), Sinnoh 387–493 (107) and Unova 494–649 (156). Type denominators use the real summary dataset's current typings; a species is counted once in each of its types. Recent registrations are currently present records sorted by most recent status change descending, with National number ascending for ties, limited to ten. Deleted records are not retained as a public/private activity log.

| Achievement key | Condition verified by the server |
| --- | --- |
| `first-encounter` | At least one Seen species, including Caught |
| `first-catch` | At least one Caught species |
| `pokemon-collector` | At least 25 currently Caught species |
| `dedicated-collector` | At least 100 currently Caught species |
| `kanto-completionist` | All 151 Generation I species Caught |
| `regional-master` | Any generation's introduced-species collection 100% Caught |
| `national-pokedex-master` | All 649 species Caught |
| `team-builder` | A saved team contains six Pokémon |

**Every award is permanent once verified**, even if the trainer later removes records or deletes a team. `unlockedAt` describes historical verification; `current` and `goal` describe present qualification. Regional Master's progress is the highest current generation Caught percentage. No client-submitted award claims are accepted. New definitions/conditions can be added in `server/progression.js` without adding an achievement catalogue table or changing the key schema. Old, deleted activity from before this feature existed is not reconstructed or backdated.

## Frontend state and privacy

`trainer-progress.js` owns one in-memory collection map and receives the existing account module's authenticated request function. It requests one bundle after identity restoration, not one request per card. Controls remain disabled until a complete response is ready. Writes are serialized within the page and only server-confirmed bundles update counts/status; a failed write restores controls to the prior confirmed value.

Cards and detail dialogs reuse this store. Team/favourite changes refresh the same private statistics without making successful mutations depend on an unrelated refresh. New Progress and Achievements views reuse the existing overview cards, semantic analytics tables and responsive layout, with accessible native progress bars; the heavy chart bundle is not added to the Trainer Hub just for simple percentages. The public analytics page remains global species data and does not render personal progress.

Navigation restores the collection through MySQL/session API requests. BroadcastChannel plus storage events notify other tabs; storage contains only a small change signal, never private records, counts, achievements or trainer IDs. Receiving tabs revalidate the session before refreshing their own collection. Login/logout/account changes clear the old in-memory collection and private cached team/favourite UI; late requests from an earlier identity are ignored. If cross-tab mechanisms are blocked, navigation/reload still restores current server state.

## Verification and files

`npm.cmd test` runs pure calculation/milestone tests, fixture-backed Express ownership/validation/session tests, SQL transaction/rollback inspections, migration consistency checks and all prior regressions. `npm.cmd run test:browser` runs real Chrome with isolated test repositories/accounts/uploads. The live-MySQL suite stays opt-in and was not run for this update; static SQL checks and simulated transactions do not establish live MySQL execution. Apply and verify the reviewed migration manually before publishing. Real touch/screen-reader and Safari/Firefox checks also remain manual.

Created: `server/progression.js`, `server/progression-repository.js`, `trainer-progress.js`, `database/migrations/v0.5.0-trainer-progression.sql`, `database/MIGRATION_v0.5.0.md`, `tests/progression.test.cjs` and this guide. Modified: `database/schema.sql`, Express routes/validation/repository, shared account/filter code and HTML/script loading, Pokédex/hub controls, styles, version files, test fixtures/suites and project documentation. All uncommitted v0.4.0 encyclopedia work was preserved; the existing public dataset, artwork and trainer records were not replaced. No database migration, live database write, deployment, release or push was performed.
