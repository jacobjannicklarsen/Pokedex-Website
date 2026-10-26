# Dexhaven v0.2.0 — National Pokédex

The public website is **Dexhaven**; the development project remains **Pokédex Website** and its MySQL database remains **pokedex_app**. Explore all **649 species from Generations I–V** with the existing vanilla HTML/CSS/JavaScript frontend and Node.js/Express/MySQL backend. Trainer accounts, profiles, uploads, multiple six-member teams, favourites and both themes are preserved. No frontend framework or build step.

## Run locally

**Existing v0.1.0 installation:** preserve your `.env`, database and uploads. Follow the [manual migration instructions](database/MIGRATION_v0.2.0.md) to widen the two existing ID CHECKs. The migration is never executed automatically. Re-importing `schema.sql` does not update existing CHECKs.

**New installation:** follow [WINDOWS_SETUP.md](WINDOWS_SETUP.md), configure `.env` with your actual credentials, and import [database/schema.sql](database/schema.sql), which already supports #001–649.

After MySQL and `.env` are configured, from this folder:

```sh
npm.cmd ci
npm.cmd start
```

Open **http://localhost:3000**. Stop with Ctrl+C. Use `npm.cmd run dev` for automatic server restarts during development. Use Express for the full application; Live Server and Python do not provide the account API.

Internet is needed for the first data load and artwork. Optional Google Fonts fall back to system fonts.

## Project structure

- `index.html`, `styles.css`, `script.js`, `theme.js`: preserved Pokédex and light/dark mode, with new navigation and sibling favourite controls.
- `account.js`: login/register dialog, trainer routes, profile editing/uploads, teams and favourites using same-origin fetch requests.
- `pokemon-selector.js`: accessible searchable team-slot comboboxes using the existing catalogue; no extra API requests or dependencies.
- `server/index.js`, `server/app.js`: startup, Express routes, security middleware and explicitly allowlisted frontend assets.
- `server/repository.js`, `server/session-store.js`: parameterized mysql2 queries, team transactions and persistent sessions.
- `server/config.js`, `server/validation.js`: environment configuration and server-side validation.
- `database/schema.sql`, `server/setup-db.js`: opt-in setup scoped to `pokedex_app` only. Normal startup does not alter the schema.
- `database/migrations/v0.2.0-national-pokedex.sql`: manual, non-destructive old-schema migration; preserves saved records and other constraints.
- `.env.example`, `.gitignore`: secret-free template and exclusions for real credentials/uploads/dependencies.
- `tests/`: frontend logic, theme, backend/API, optional real MySQL integration, and headless Chrome workflows.

See [server/API.md](server/API.md) for routes, bodies and status codes. The UI exposes `/profile`, `/teams` and `/favorites` as dedicated views with browser history and direct reload support. Authenticated data is stored in MySQL; PokéAPI data/theme preferences continue to use the existing browser cache.

Accounts use Argon2id passwords, HTTP-only SameSite session cookies, login session rotation, CSRF tokens, and private-data ownership checks. Production enables Secure cookies and requires HTTPS. Uploads are size/type/pixel-validated and converted to random-named WebP files outside the static source allowlist.

### Team selection and account navigation

Logged-out navigation shows National Pokédex, Log in, Register and the theme toggle. My Teams, My Favourites, Trainer Profile and Log out appear only after the session API confirms authentication. Protected links start hidden in HTML while the session loads. Direct logged-out visits to private routes show a login/register prompt; backend authentication and ownership checks remain unchanged.

Each of the six team slots has a searchable Pokémon field. Type part of a name or an exact National number (`25`, `025`, `#649`); results filter immediately and show numbers, names and artwork. Only twelve matches render at a time—keep typing to narrow the list. Pokémon in another slot of the same team are marked unavailable. Select with a click or Arrow Up/Down and Enter. Escape cancels a search, Tab leaves without committing typed text, and Remove empties the slot. The chosen Pokémon remains visible in the slot preview; typing alone never changes the saved selection. Choose **Save team** to persist changes through the unchanged API.

Each team also has a **Delete team** button below its slots. Confirm deletion to remove that team and its members; other teams and favourites remain. Create/save/delete update from their successful API responses, so an unrelated favourites-refresh failure cannot make a completed action appear to fail. Failed deletions keep the team visible and re-enable its controls.

If the selector script is temporarily unavailable, saved teams still display and can be created, renamed or deleted without changing their existing members. **Retry Pokémon editor** reloads the selector. If `/pokemon-selector.js` returns 404 after a code update, restart the running Express process and hard-refresh the browser (Ctrl+Shift+R); an old Node process can serve updated HTML but retain its old asset routes. Use `npm.cmd run dev` during development to restart automatically when server files change.

Manual checks: register/log in and confirm trainer links appear; refresh to confirm the session restores them; log out and confirm they disappear. Open `/teams` while logged out and verify the prompt. In My Teams, search `pika` and `#649`, test mouse and keyboard selection, try choosing the same Pokémon twice, remove/replace members, save and reload. Check popup layout in both themes at mobile widths. Real screen-reader and touch-device checks remain manual.

## How it works

### Light and dark themes

Use the sun/moon button in the header. The icon and accessible label describe the theme you can switch to. The original dark palette is preserved; light mode uses soft green-white surfaces, dark green text, and mint accents.

- With no saved choice, the site follows your system's light/dark preference, including live system changes.
- Clicking the toggle saves `pokedex-theme` in localStorage; this takes priority over the system preference and synchronizes between tabs.
- If storage is blocked, the toggle still works for the current page.
- `theme.js` runs before CSS to select the theme before rendering. Transitions begin after initial rendering and respect reduced-motion settings.
- To return to following the system, remove only the theme preference in the browser console and reload:

```js
localStorage.removeItem('pokedex-theme');
location.reload();
```

To test: toggle both ways, reload, emulate the opposite system preference in browser developer tools, then remove the saved choice and check that system changes apply. Check cards, search, filters, details, and retry states in both modes. Test the button using Tab and Enter/Space.

### Pokémon data

- A cold load uses **19 index requests**: one species-name list and 18 type-membership lists, with at most four concurrent index requests. Alternate-form IDs above #649 are excluded; type slots preserve primary/secondary ordering. Cards render progressively and artwork loads lazily.
- Compact species/type resources are cached for seven days under `dexhaven-index-v2-*`. A fresh cached startup makes **zero catalogue data requests** (artwork remains browser-loaded). Blocked or full storage does not prevent use.
- Full stats, abilities and measurements are fetched **only when opening details**, with duplicate requests coalesced and results cached. Legacy `kanto-pokedex-v1-*` detail caches remain compatible; existing theme/account/session keys are unchanged.
- Search by partial name or exact number (`25`, `025`, `#025`), combined with generation, type and sorting. Generation ranges: Kanto 1–151, Johto 152–251, Hoenn 252–386, Sinnoh 387–493, Unova 494–649. Counts, headings and range labels update together.
- Index/detail requests time out after 12 seconds. A failed species-list request stops immediately; sustained type errors stop the remaining queue. Retry loads only missing index resources. Partial type failures retain name/number/generation search and clearly identify incomplete type results.
- Detail modals have loading, error and retry states; closed/stale responses cannot replace a newer selection. Height and weight are converted to meters and kilograms.
- Artwork falls back to a sprite, then a local SVG placeholder.
- Native dialog supports keyboard navigation, Escape, and focus restoration.

### Static/GitHub Pages preview

The public catalogue works without Express, including generation/search/type/sort controls, details and themes. Keep `index.html`, `script.js`, `pokemon-selector.js`, `account.js`, `theme.js`, `styles.css`, `artwork-fallback.svg` and `images/group-picture.png` at the same relative paths. The custom hero artwork and founder caption are preserved.

For a local static preview:

```powershell
python -m http.server 8000
```

Open http://localhost:8000. GitHub Pages project paths are supported: assets stay relative, and trainer navigation falls back to `#view=teams`, `#view=favorites`, and `#view=profile`, so reloads do not request nonexistent server routes. Account/team/favourite persistence still requires the same-origin Express backend; the preview displays login/backend messaging rather than storing private data locally. No publishing workflow or release is triggered by this upgrade.

## Manual checks

Automated checks after installing dependencies (Node.js 22+):

```sh
npm.cmd test
npm.cmd run test:browser
node tests/live-pokeapi.cjs
```

Frontend logic tests use a minimal DOM stand-in; backend tests exercise real Express, Argon2 and Sharp with an isolated in-memory test repository/session store. The browser suite launches real headless Chrome against Express and tests full trainer workflows, themes, keyboard controls and responsive geometry. It uses deterministic PokéAPI fixtures and an in-memory test repository; production uses MySQL exclusively. The suite defaults to Chrome's standard Windows location; set `CHROME_PATH` for another Chromium executable.

The optional `mysql.integration.test.cjs` is skipped unless `RUN_MYSQL_TESTS=1` is explicitly set after manual database setup/migration. The separate live PokéAPI check makes three read-only GETs. Fixture tests do not replace real MySQL, screen-reader or phone verification. See [QA_REPORT.md](QA_REPORT.md) for verified results and remaining checks.

1. Wait for 649 cards; verify Bulbasaur (#001) and Genesect (#649). Developer tools should show no full `/pokemon/{id}/` requests until details open.
2. Search `pika`, `25`, and `#025` to find Pikachu. Search `not-a-pokemon` for the empty state.
3. Select each generation and verify counts 151, 100, 135, 107, 156. Combine Sinnoh with Dragon, then search `gible`. Reset and check all sort modes.
4. Open Bulbasaur: height 0.7 m, weight 6.9 kg; stats 45, 49, 49, 65, 65, 45 (total 318). Check Grass/Poison and hidden ability label.
5. Use Tab and Enter, close details with Escape, and confirm focus returns to the card. Press `/` to focus search.
6. Check desktop and 375px mobile widths, including dialog scrolling.
7. Reload to check caching. To test a first-load failure, clear site storage in developer tools, enable Offline, and reload. Disable Offline and select Try again.
8. Block artwork requests in developer tools to check image fallbacks.
9. On an actual phone, check touch interactions, opening the keyboard, zoom, orientation changes, and scrolling the modal. Check Safari and Firefox separately.
10. With a screen reader, verify announcements, type names, modal navigation, and focus restoration.
11. After manually migrating, log in with an existing account and verify its avatar, teams and favourites. Add #649 to a team/favourites and confirm #650 is rejected. Six-member and duplicate protections remain unchanged.

Data and artwork: https://pokeapi.co/. Unofficial fan project; Pokémon belongs to Nintendo / Game Freak.
