# Dexhaven v0.3.0 — analytics data and local verification

The public pages are Home (`index.html`), National Pokédex (`pokemon.html`), Trainer Hub (`trainers.html`) and Analytics (`dashboard.html`). Analytics and filtering are public frontend features. They do not read private trainer data or require MySQL.

## The data snapshot

`data/pokemon-summary.json` is generated from real `https://pokeapi.co/api/v2/pokemon/{id}/` responses for default Pokémon IDs **1–649**. The updater verifies `is_default`, the species ID, every stat and the complete ID set. Canonical species names are used for default forms such as Deoxys. Alternate forms are excluded as separate entries. The source URL and UTC retrieval timestamp are included in the JSON and displayed in the UI.

The snapshot includes ID, name, current types in slot order, six current base stats, height in decimetres, weight in hectograms and abilities with hidden flags. It contains no trainer data. This is a current PokéAPI snapshot, not historical game-generation stats: later stat/typing changes, including Fairy typings, apply consistently to every analytics calculation.

The committed snapshot is approximately 244 KB uncompressed. Each data-dependent page requests that same local URL once; concurrent consumers share one promise and normal browser HTTP caching handles navigation/revalidation. It does not duplicate the dataset in localStorage. The existing seven-day catalogue/type cache and legacy detail cache remain intact. The Pokédex and Trainer Hub retain their existing bounded index loader and on-demand details; the dashboard uses snapshot records for ranking/comparison details without additional detail requests. Old cached details can differ from a newer analytics snapshot until their normal cache expiry; all analytics, rankings, comparisons and stat predicates use the same snapshot.

`pokemon-data.js` rejects incomplete collections, duplicate or out-of-range IDs, missing stats, invalid numeric values, unknown typings and malformed source metadata before enabling analytics. Dashboard results remain hidden on failure. Advanced stat inputs and stat-sort options remain disabled until all 649 records validate; existing search/generation/type controls remain usable if the snapshot fails. Both pages provide retry controls. No missing stat is substituted with zero.

## Refreshing data

From the project folder, with Node.js 22+ and internet access:

```powershell
npm.cmd run data:update
npm.cmd test
npm.cmd run test:browser
```

This is an explicit maintenance command, never a page-load or server-startup action. It makes 649 read-only PokéAPI GETs with at most four concurrent requests, a 20-second per-request timeout and up to three attempts per record. It stops queuing work after an unrecoverable failure. It validates every record and the full collection, then replaces the JSON via a temporary file in the same directory. A fetch or validation failure leaves the previous dataset untouched. Review the JSON diff and retrieval date before committing a refreshed snapshot. No database migration or upload changes are involved.

## Calculations

- **Species/generation/type cards:** record count, count of nonempty generation groups and count of observed distinct types. The five generation boundaries are explicit: 1–151, 152–251, 252–386, 387–493 and 494–649.
- **Generation distribution:** count each standard species once in the interval containing its National number, giving 151, 100, 135, 107 and 156.
- **Type distribution:** increment each listed type once per species. Fire/Flying counts once in each type. The sum of memberships exceeds the species count; the interface explains this.
- **Base-stat totals:** sum HP, Attack, Defense, Special Attack, Special Defense and Speed. Average total is the sum of all species totals divided by the complete record count.
- **Generation averages:** independently sum each of the six stats within a generation and divide by that generation's count. Calculations retain full precision; tables, cards and tooltips round for display only.
- **Top ten:** sort the complete collection numerically by the selected stat or total, descending. Break ties by National number ascending, then take ten. This ordering is also used by descending stat sorts. Lowest Total uses ascending totals with the same tie rule.
- **Comparison:** use the two selected snapshot records. Each row shows both exact values and the higher Pokémon's advantage, or an explicit tie. Total difference is the difference between the two six-stat sums. Grouped bars share a zero-based axis; colour is supplemented by names, numeric table values and winner/tie text.

## Charts and accessibility

Chart.js **4.6.1** is pinned in the package/lockfile. The UMD bundle and MIT license are committed under `vendor/` so Express's same-origin CSP and buildless GitHub Pages previews do not rely on a chart CDN. After intentionally changing the dependency, run `npm.cmd run vendor:chart` and review both vendor files. `npm.cmd ci` alone does not refresh committed vendor files.

Charts have accessible names and descriptions plus semantic table equivalents. Table headers identify their rows and columns; horizontally wide tables scroll within their panels. Rankings use native buttons and selectors reuse the existing keyboard-operated combobox. Live theme changes update chart text, grid, tooltip and series colours. Chart animations are disabled to avoid unnecessary motion. Chart loading failure leaves the exact tables, rankings and comparison controls available with a visible warning. This follows the [Chart.js accessibility guidance](https://www.chartjs.org/docs/latest/general/accessibility.html); real assistive-technology verification remains manual.

## Test the features locally

Restart Express with `npm.cmd start` after installing dependencies and open http://localhost:3000/pokemon.html. The existing account functionality uses your normal server configuration; the new public features also work from a static HTTP preview without the API.

1. Open **Advanced Filters**. Wait for the complete-data status. Select Sinnoh, Dragon, minimum Attack 100 and minimum Speed 90. The results must meet all four conditions; Garchomp is one match. Combine this with a name/number search.
2. Exercise both bounds of each stat and Total Base Stats. Blank bounds mean unrestricted. All bounds are inclusive, whole numbers from 0–255 per stat or 0–1530 for totals. Negative, decimal or inverted ranges show an error and leave the last valid applied range active until corrected.
3. Choose each Highest stat sort and Highest/Lowest Total. Equal values retain National number order. **Reset Advanced Filters** clears only stat bounds; **Reset all filters** clears bounds, search, generation/type selection and sorting. Verify the empty state using incompatible limits.
4. Open http://localhost:3000/dashboard.html. Inspect chart tooltips, expand each values table and change the ranking criterion. Click a ranked Pokémon to inspect its details. No login is required.
5. Search `bulba` in First Pokémon and `#649` in Second Pokémon, then press Enter or select a result. Compare Bulbasaur and Genesect: total base stats are 318 and 600, a difference of 282. Verify artwork, types, generation, measurements, abilities and exact stats.
6. Replace the pair with Mewtwo (`#150`) and Lugia (`#249`): totals tie at 680. Try selecting the same species twice; the duplicate must be unavailable. Remove one selection, replace it and verify the chart/table update without reloading.
7. Switch themes, check 320px/mobile and desktop widths, test Tab/arrow keys/Enter/Escape and navigate all four pages. Register/log in, edit the trainer biography/avatar, save teams/favourites, refresh and log out to check the existing flows.

For a repository-subpath/static preview, include all four HTML pages, shared scripts/styles/artwork, `pokemon-data.js`, `advanced-filters.js`, `dashboard.js`, `pokemon-selector.js`, `data/pokemon-summary.json` and `vendor/chart.umd.js` at their relative paths. Run `python -m http.server 8000` and browse http://localhost:8000/dashboard.html. Trainer persistence still needs the same-origin Express API. A `file://` page is not a supported fetch environment.

## Scope and limitations

Snapshot values stay fixed until the explicit refresh command runs; artwork/fonts remain external resources with the existing fallbacks. The opt-in live-MySQL suite is not enabled for this phase because live database writes require the owner's approval. Standard API/browser tests use isolated repositories and uploads; they do not establish current live database state. Real screen-reader use, touch devices and Safari/Firefox need manual checks before release. No push, deployment or GitHub release is performed by this work.

## Files in this update

Created `dashboard.html`, `dashboard.js`, `advanced-filters.js`, `pokemon-data.js`, `data/pokemon-summary.json`, `scripts/update-pokemon-data.cjs`, `scripts/vendor-chart.cjs`, the Chart.js files under `vendor/`, `tests/analytics.test.cjs` and this guide. Modified `index.html`, `pokemon.html`, `trainers.html`, `script.js`, `pokemon-selector.js`, `styles.css`, `server/app.js`, `server/API.md`, the package/lockfile, existing backend/catalogue/browser/upgrade tests, README, Windows setup, QA report and release notes. The shared account controller also handles the guest-only homepage registration/login buttons. Theme code, database definitions and the founder image were not modified.
