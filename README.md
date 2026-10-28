# Dexhaven v0.7.2.1 - Pokémon Soundtrack Player

The private Owner soundtrack player discovers the existing `Dexhaven-Music`
collection, streams audio locally, restores playback preferences across pages
and pauses around GBA gameplay. See [Windows setup and controls](SOUNDTRACK.md),
[implementation/tests](IMPLEMENTATION_v0.7.2.1.md) and
[draft release](RELEASE_v0.7.2.1.md). npm remains valid SemVer `0.7.2`; the human
release label is stored separately as `dexhavenRelease: "0.7.2.1"`. No database
operation is needed. **Nine music files were already tracked in Git; resolve
their tracking/history before any public push.** Audio files were not modified.

Version **0.7.2** adds the private six-game GBA library, automatic Owner-only local ROM loading, EmulatorJS/mGBA, browser-local saves and the homepage Community Shoutbox. This is an independent personal software project.

Start with [Games and setup](GAME_LIBRARY.md), [manual Shoutbox migration](database/MIGRATION_v0.7.2.md), [implementation report](IMPLEMENTATION_v0.7.2.md) and [draft release](RELEASE_v0.7.2.md). **The Shoutbox migration has not been run. Six ROMs were already tracked in Git: remove their tracking/history before any public push or release.** No commit, push, release or deployment was performed.

The preceding version **0.7.1** added Account Settings, avatar/banner cropping and explicit personal-field
privacy, safe formatted biographies, grouped forums and polls, Staff Directory,
member previews, following/blocking and bookmarks. The Arena now offers three AI
difficulties, private saved simulation history, exact recorded replays and separate
validated activity achievements. Existing Pokédex rank thresholds stay unchanged.
See [the implementation report](IMPLEMENTATION_v0.7.1.md),
[API contracts](server/API.md#v071-community-settings-and-saved-simulations) and
[manual migration](database/MIGRATION_v0.7.1.md). The SQL has not been run; no release,
push or deployment has been performed.

Version **0.7.0** adds [community forums](FORUMS.md), moderation/notifications and
[a local Battle Arena](BATTLE_ARENA.md) for all 649 species. The Arena has player
and auto modes, levels 1-100, historical Black/White data and 201 supported moves.
Forums require the separate [manual MySQL upgrade](database/MIGRATION_v0.7.0.md);
it has not been executed. See [implementation, tests and limitations](IMPLEMENTATION_v0.7.0.md).


Version **0.6.2** adds independent Rookie/Bronze/Silver/Gold/**Diamond**/Champion caught ranks, protected staff roles, a responsive Administration panel, temporary restrictions and transactional audit history. See [ADMINISTRATION.md](ADMINISTRATION.md), [the implementation report](IMPLEMENTATION_v0.6.2.md) and the [manual upgrade/Owner bootstrap guide](database/MIGRATION_v0.6.2.md). No migration or real Owner assignment runs automatically.

Version **0.6.1** adds verified Generation V sprites, expanded card presets and colours, and shared fixes for Hexagon frames and Sparkles. See [the implementation report](IMPLEMENTATION_v0.6.1.md) and [manual database upgrade](database/MIGRATION_v0.6.1.md). No migration, release or deployment runs automatically.

Trainer Profile now groups the overview, picture/biography editor, privacy controls and Card Studio, with shortcuts and compact summaries. Five extra cosmetic title styles require the separate [manual title-style constraint upgrade](database/MIGRATION_trainer-title-styles.md) on existing databases. No account data is changed.

Biography now has one editor and an explicit **Show biography publicly** setting. Existing databases require the [manual single-biography migration](database/MIGRATION_single-biography.md); old public text is archived and sharing starts off. Trainer Hub puts picture editing above Biography and offers All/Caught search sources in each team editor.

The public website is **Dexhaven**; the development project remains **Pokédex Website** and its MySQL database remains **pokedex_app**. Explore all **649 species from Generations I–V** with the existing vanilla HTML/CSS/JavaScript frontend and Node.js/Express/MySQL backend. Trainer accounts, profiles, uploads, multiple six-member teams, favourites and both themes are preserved. No frontend framework or build step.

Version **0.2.0** introduced the National Pokédex expansion. Version **0.2.1** separated the homepage from the catalogue. Version **0.2.2** centralized the existing profile, teams and favourites in the dedicated Trainer Hub at `trainers.html`. Version **0.3.0** added a public statistics dashboard, advanced stat filters/sorts and two-Pokémon comparisons. Version **0.4.0** expanded the shared detail dialog with evolution families, game-specific moves, modern type matchups and English Pokédex/species information. See [ENCYCLOPEDIA.md](ENCYCLOPEDIA.md) for rules, cache behavior, shareable links and verification steps. See [ANALYTICS.md](ANALYTICS.md) for data provenance, formulas, refresh instructions and feature testing. See [RELEASE_NOTES.md](RELEASE_NOTES.md). Version **0.5.0** adds personal Seen/Caught tracking, completion statistics and permanent server-verified achievements. It requires the additive [manual v0.5.0 migration](database/MIGRATION_v0.5.0.md); it is never applied automatically. See [PROGRESSION.md](PROGRESSION.md) for storage, APIs, achievement policy and testing.

## Run locally

Version **0.6.0** adds optional public profiles, independently shareable teams, private visibility controls and modern type-based team analysis. Read [COMMUNITY.md](COMMUNITY.md) for the public/private API, privacy model, exact calculations, file list and manual verification. Existing accounts and teams remain private. Custom homepage artwork, hero effects and previous trainer/Pokédex features are preserved.

**Existing v0.5.0 installation:** review [database/MIGRATION_v0.6.0.md](database/MIGRATION_v0.6.0.md) and manually apply its two additive settings tables when approved. No migrations are run automatically. Older upgrades must follow their earlier migration guides first, then this v0.6.0 guide. Public content requires Express; the static preview explains that requirement. Private analysis needs no new analysis records.

**Existing v0.2.0–v0.4.0 installation:** preserve your database, `.env` and uploads. Review [database/MIGRATION_v0.5.0.md](database/MIGRATION_v0.5.0.md) and manually apply the two new tables in Workbench when approved. Until then, tracking reports an actionable unavailable state; existing public/account features remain usable.

**Existing v0.1.0 installation:** preserve your `.env`, database and uploads. Follow the [manual migration instructions](database/MIGRATION_v0.2.0.md) to widen the two existing ID CHECKs, then follow the manual v0.5.0 migration. The migration is never executed automatically. Re-importing `schema.sql` does not update existing CHECKs.

**New installation:** follow [WINDOWS_SETUP.md](WINDOWS_SETUP.md), configure `.env` with your actual credentials, and import [database/schema.sql](database/schema.sql), which already supports #001–649.

After MySQL and `.env` are configured, from this folder:

```sh
npm.cmd ci
npm.cmd start
```

Open **http://localhost:3000/** for the homepage and **http://localhost:3000/pokemon.html** for the National Pokédex, and **http://localhost:3000/trainers.html** for the Trainer Hub. Open **http://localhost:3000/dashboard.html** for public analytics and comparisons. Open **http://localhost:3000/community.html** for opt-in trainers; shared links use `/trainer/username` and `/team/UUIDv4` through Express. Stop with Ctrl+C. Use `npm.cmd run dev` for automatic server restarts during development. Use Express for the full application; Live Server and Python do not provide the account API.

The existing catalogue needs internet on its first uncached index load. Dashboard charts, rankings and comparisons use a complete local PokéAPI snapshot. Artwork remains external with existing fallbacks. Optional Google Fonts fall back to system fonts.

## Project structure

- `about.html`: team introduction built with the shared header, account navigation, footer, stylesheet and scripts. The homepage founders artwork links here. Served publicly through Express and static previews.
- `avatar-cropper.js`: local circular picture preview with drag, zoom, arrow-key positioning, reset and cancel. The existing authenticated upload API validates the selected source-pixel crop after applying photo orientation, then saves a 256×256 WebP. No database migration is needed.

The achievement catalogue now contains **96 milestones**, with a rarity-styled Hall of Fame and configurable trainer cards. See [TRAINER_STYLE.md](TRAINER_STYLE.md) for the studio, privacy/API behavior and testing, plus the [manual decoration migration](database/MIGRATION_profile-decorations.md). Existing awards are preserved; no migration is applied automatically.

- `community.html`, `community.js`: searchable opt-in trainer directory with large decorated public cards, approved avatars/bios, featured partners and shared-team previews; public profiles/teams, owner-only sharing settings and saved-profile preview.
- `team-analysis-data.js`, `team-analysis.js`, `data/type-chart.json`: shared exact modern matchup calculations, interactive Chart.js views, accessible matrices/tables and official 18-type data.
- `server/community.js`, `server/community-repository.js`: strict public projections/validation and transactional settings/sharing queries.
- `database/migrations/v0.6.0-trainer-community.sql`, `database/MIGRATION_v0.6.0.md`: additive manual-only settings migration and Workbench instructions.

- `index.html`: dedicated homepage with the original hero, founder artwork and caption, plus introductions to the catalogue, trainer tools and analytics.
- `pokemon.html`: the complete National Pokédex collection, generation/search/type/sort controls, advanced stat ranges and loading/error states.
- `trainers.html`: Trainer Hub with a guest sign-in invitation and authenticated Profile, My Teams and My Favourites sections; the existing account forms and six-slot selector are reused.
- `dashboard.html`, `dashboard.js`: public generation/type/stat charts, numeric top-ten rankings and searchable comparisons with accessible tables.
- `pokemon-data.js`, `data/pokemon-summary.json`: validated complete PokéAPI data, deterministic calculations, shared loader and inclusive filter predicates.
- `trainer-progress.js`: authenticated in-memory collection state, card/detail controls, personal filters, private progress/achievement views and cross-tab session-aware synchronization. No private progress is stored in localStorage.
- `server/progression.js`, `server/progression-repository.js`: server-derived completion/achievement rules and transactional MySQL collection/award persistence.
- `database/migrations/v0.5.0-trainer-progression.sql`: additive, manual-only collection/achievement table creation.
- `encyclopedia.js`, `encyclopedia-data.js`: six-section shared detail UI and on-demand PokéAPI species/evolution/move/type resources, validated seven-day caches and a four-request scheduler. Shareable entries use `pokemon.html?pokemon=25`.
- `advanced-filters.js`: collapsible seven-stat min/max controls, validation, retry and sorting readiness.
- `scripts/update-pokemon-data.cjs`: explicit maintenance updater; four concurrent read-only PokéAPI requests, complete validation and atomic snapshot replacement.
- `vendor/chart.umd.js`, `vendor/Chart.js.LICENSE.md`, `scripts/vendor-chart.cjs`: locally served pinned Chart.js bundle, MIT license and vendor refresh helper.
- `styles.css`, `theme.js`: shared design, responsive layout and persistent light/dark mode.
- `script.js`: shared catalogue/cache/artwork/detail functions; separate guarded collection, dialog and hero initializers. The homepage makes no catalogue requests. The hub loads the catalogue only after authentication, and concurrent loads reuse one promise. Shared detail dialogs support the Pokédex and saved favourites.
- `account.js`: shared login/register dialog and session/header avatar management on all pages, plus guarded Trainer Hub profile editing/uploads, teams and favourites using same-origin fetch requests.
- `pokemon-selector.js`: accessible searchable team-slot comboboxes using the existing catalogue; no extra API requests or dependencies.
- `server/index.js`, `server/app.js`: startup, Express routes, security middleware and explicitly allowlisted frontend assets.
- `server/repository.js`, `server/session-store.js`: parameterized mysql2 queries, team transactions and persistent sessions.
- `server/config.js`, `server/validation.js`: environment configuration and server-side validation.
- `database/schema.sql`, `server/setup-db.js`: opt-in setup scoped to `pokedex_app` only. Normal startup does not alter the schema.
- `database/migrations/v0.2.0-national-pokedex.sql`: manual, non-destructive old-schema migration; preserves saved records and other constraints.
- `.env.example`, `.gitignore`: secret-free template and exclusions for real credentials/uploads/dependencies.
- `tests/`: frontend logic, theme, backend/API, optional real MySQL integration, and headless Chrome workflows.

See [server/API.md](server/API.md) for routes, bodies and status codes. Trainer sections use `trainers.html#view=profile`, `trainers.html#view=teams` and `trainers.html#view=favorites`, with browser history and direct reload support. Express redirects existing `/profile`, `/teams` and `/favorites` bookmarks to the corresponding hub section; old public-page `#view=...` bookmarks also navigate to the hub. Authenticated data is stored in MySQL; PokéAPI data/theme preferences continue to use the existing browser cache.

Accounts use Argon2id passwords, HTTP-only SameSite session cookies, login session rotation, CSRF tokens, and private-data ownership checks. Production enables Secure cookies and requires HTTPS. Uploads are size/type/pixel-validated and converted to random-named WebP files outside the static source allowlist.

### Team selection and account navigation

All four pages share Home, National Pokédex, Trainer Hub and Analytics links, optional Log in/Register, the theme toggle and the logged-in trainer's header avatar. The current page and hub section are indicated with `aria-current`. Profile, My Teams, My Favourites, Pokédex Progress and Achievements links live inside the hub and stay hidden until authentication is confirmed. The hub is publicly accessible, with a sign-in/create-account invitation for guests; private account data and forms require login. The Dashboard is public and uses only species data; trainer account data remains private.

Navigation and avatar links use relative HTML paths, including on repository-subpath previews. The top-right avatar opens the hub's Profile section, uses an initial when no image is available and updates after uploads. Profile shows the existing username/email, editable biography, avatar upload and team/favourite summaries. Editing uses the existing `{bio}` API; username and email remain display fields. Obsolete trainer-management containers and selector-script loading were removed from the homepage and National Pokédex.

Each of the six team slots has a searchable Pokémon field. Type part of a name or an exact National number (`25`, `025`, `#649`); results filter immediately and show numbers, names and artwork. Only twelve matches render at a time—keep typing to narrow the list. Pokémon in another slot of the same team are marked unavailable. Select with a click or Arrow Up/Down and Enter. Escape cancels a search, Tab leaves without committing typed text, and Remove empties the slot. The chosen Pokémon remains visible in the slot preview; typing alone never changes the saved selection. Choose **Save team** to persist changes through the unchanged API.

Each team also has a **Delete team** button below its slots. Confirm deletion to remove that team and its members; other teams and favourites remain. Create/save/delete update from their successful API responses, so an unrelated favourites-refresh failure cannot make a completed action appear to fail. Failed deletions keep the team visible and re-enable its controls.

If the selector script is temporarily unavailable, saved teams still display and can be created, renamed or deleted without changing their existing members. **Retry Pokémon editor** reloads the selector. If `pokemon-selector.js` returns 404 after a code update, restart the running Express process and hard-refresh the browser (Ctrl+Shift+R); an old Node process can serve updated HTML but retain its old asset routes. Use `npm.cmd run dev` during development to restart automatically when server files change.

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
- Live detail endpoint requests occur **only when opening details**, with duplicate requests coalesced and results cached. Advanced filters and the dashboard also load the committed complete local summary snapshot; dashboard details/comparisons reuse that data. Legacy `kanto-pokedex-v1-*` detail caches remain compatible; existing theme/account/session keys are unchanged.
- Search by partial name or exact number (`25`, `025`, `#025`), combined with generation, type and sorting. Generation ranges: Kanto 1–151, Johto 152–251, Hoenn 252–386, Sinnoh 387–493, Unova 494–649. Counts, headings and range labels update together.
- Index/detail requests time out after 12 seconds. A failed species-list request stops immediately; sustained type errors stop the remaining queue. Retry loads only missing index resources. Partial type failures retain name/number/generation search and clearly identify incomplete type results.
- Detail modals have six keyboard-accessible sections with on-demand loading, error and retry states; closed/stale responses cannot replace a newer selection. Height and weight are converted to meters and kilograms.
- Artwork falls back to a sprite, then a local SVG placeholder.
- Native dialog supports keyboard navigation, Escape, and focus restoration.

### Static/GitHub Pages preview

The public catalogue and analytics work without Express, including generation/search/type/stat/sort controls, comparisons, details and themes. Keep `index.html`, `pokemon.html`, `trainers.html`, `dashboard.html`, `script.js`, `pokemon-selector.js`, `account.js`, `theme.js`, `styles.css`, `artwork-fallback.svg`, `images/group-picture.png`, `pokemon-data.js`, `advanced-filters.js`, `dashboard.js`, `encyclopedia-data.js`, `encyclopedia.js`, `trainer-progress.js`, `community.html`, `community.js`, `team-analysis.js`, `team-analysis-data.js`, `data/type-chart.json`, `data/pokemon-summary.json` and `vendor/chart.umd.js` at the same relative paths. The custom hero artwork and founder caption are preserved.

For a local static preview:

```powershell
python -m http.server 8000
```

Open http://localhost:8000/, http://localhost:8000/pokemon.html, http://localhost:8000/trainers.html and http://localhost:8000/dashboard.html. GitHub Pages project paths are supported: assets stay relative, and trainer navigation uses `trainers.html#view=teams`, `trainers.html#view=favorites` and `trainers.html#view=profile`, so reloads do not request nonexistent server routes. The static hub shows its guest invitation and backend-unavailable message without exposing private data. Account/team/favourite persistence still requires the same-origin Express backend; the preview displays login/backend messaging rather than storing private data locally. No publishing workflow or release is triggered by this upgrade.

## Manual checks

Automated checks after installing dependencies (Node.js 22+):

```sh
npm.cmd test
npm.cmd run test:browser
node tests/live-pokeapi.cjs
```

Frontend logic tests use a minimal DOM stand-in; backend tests exercise real Express, Argon2 and Sharp with an isolated in-memory test repository/session store. The browser suite launches real headless Chrome against Express and tests full trainer workflows, themes, keyboard controls and responsive geometry. It uses deterministic PokéAPI fixtures and an in-memory test repository; production uses MySQL exclusively. The suite defaults to Chrome's standard Windows location; set `CHROME_PATH` for another Chromium executable.

The optional `mysql.integration.test.cjs` is skipped unless `RUN_MYSQL_TESTS=1` is explicitly set after manual database setup/migration. The separate live PokéAPI check makes three read-only GETs. Fixture tests do not replace real MySQL, screen-reader or phone verification. See [QA_REPORT.md](QA_REPORT.md) for verified results and remaining checks.

1. Open the homepage and confirm the original hero and founder caption. As a guest, choose **Create an account** or **Already a member** to open registration or login; both hero buttons stay hidden when signed in. Choose **National Pokédex** in navigation or **Browse Pokémon** below the hero to open `pokemon.html`; confirm navigation highlights the current page. Wait for 649 cards; verify Bulbasaur (#001) and Genesect (#649). Developer tools should show no full `/pokemon/{id}/` requests until details open.
2. Search `pika`, `25`, and `#025` to find Pikachu. Search `not-a-pokemon` for the empty state.
3. Select each generation and verify counts 151, 100, 135, 107, 156. Combine Sinnoh with Dragon, then search `gible`. Reset and check all sort modes.
4. Open Bulbasaur and choose Base Stats: height 0.7 m, weight 6.9 kg; stats 45, 49, 49, 65, 65, 45 (total 318). Check Grass/Poison and hidden ability label.
5. Use Tab and Enter, close details with Escape, and confirm focus returns to the card. Press `/` to focus search.
6. Check all four pages at desktop and 375px mobile widths, including dialog scrolling. Toggle the theme, switch pages and verify it persists. Register/log in on any page and verify the session, teams and favourites survive navigation between all four pages and refreshes. In the hub, test the guest invitation, direct section links and Back/Forward navigation. Confirm logout hides private forms and the header avatar immediately.
7. Reload to check caching. To test a first-load failure, clear site storage in developer tools, enable Offline, and reload. Disable Offline and select Try again.
8. Block artwork requests in developer tools to check image fallbacks.
9. On an actual phone, check touch interactions, opening the keyboard, zoom, orientation changes, and scrolling the modal. Check Safari and Firefox separately.
10. With a screen reader, verify announcements, type names, modal navigation, and focus restoration.
11. After manually migrating, log in with an existing account and verify its avatar, teams and favourites. Add #649 to a team/favourites and confirm #650 is rejected. Six-member and duplicate protections remain unchanged.

12. Open `/pokemon.html?pokemon=133`, inspect the full evolution family and the reference-only #700 branch; test Moves with a specific game group, Type Matchups and the English game-entry selector. Confirm favourite/team actions and previous/next navigation remain usable. See [ENCYCLOPEDIA.md](ENCYCLOPEDIA.md) for representative checks across all five generations.

13. After the approved migration, mark Seen/Caught from cards and details; combine personal filters with public filters; inspect `trainers.html#view=progress` and `#view=achievements`; verify permanent unlock dates after removing records and cross-tab/account isolation. [PROGRESSION.md](PROGRESSION.md) has the full manual flow.

14. After the approved v0.6.0 migration, use two trainer accounts and a logged-out browser to test opt-in profiles, each sharing flag, saved preview, team links and revocation, ownership isolation, draft/public analysis, responsive charts/matrix and real MySQL persistence. See [COMMUNITY.md](COMMUNITY.md#manual-verification).

Data and artwork: https://pokeapi.co/. Unofficial fan project; Pokémon belongs to Nintendo / Game Freak.
