# Dexhaven release notes

## v0.3.0 — Pokémon Analytics & Advanced Filtering

- Added the public `dashboard.html` page with dataset-derived overview cards, interactive generation/type distributions, six-stat generation averages and top-ten rankings switchable between Total and every base stat. Dual-type memberships count toward both types; tied rankings use ascending National number.
- Added two-species comparisons using the existing searchable keyboard-operated selector. Cards show artwork, ID/name, generation, types, measurements and abilities. A grouped chart and semantic table show exact stats, totals, advantages and ties; selecting a replacement or removing a species updates the interface immediately.
- Added collapsible Advanced Filters to the National Pokédex: inclusive min/max bounds for six stats and total, combined with existing generation/type/search controls. Invalid numeric or inverted ranges show clear validation and preserve the last valid results. Added all requested Highest stat/total sorts and Lowest Total; Reset Advanced and Reset all filters have distinct scopes.
- Added a complete, validated local PokéAPI snapshot for standard species #001–649 with metadata and an explicit `npm.cmd run data:update` maintenance command. Data-dependent controls wait for the entire collection. Failures expose retry states; no partial dataset is aggregated. Runtime pages do not make 649 detail requests.
- Pinned Chart.js 4.6.1 and committed its local bundle and license. Charts support theme changes and tooltips, with named canvases, readable labels and table equivalents. If Chart.js fails to load, tables, rankings and comparison controls remain available with a warning.
- Updated navigation across all four pages, Express's explicit asset/page allowlist, both package versions and documentation. Preserved trainer authentication, profiles/uploads, teams, favourites, persistent sessions, catalogue caches/details and the custom homepage artwork. No database schema or live records were changed.

Validation: **44 automated tests passed**, **one opt-in live-MySQL test skipped**, **40 browser checks passed**, and the existing read-only live PokéAPI contract check passed. Browser workflows use isolated test accounts/repositories, deterministic legacy API responses and the committed real analytics snapshot. See [QA_REPORT.md](QA_REPORT.md) for scope and remaining manual checks.

Restart Express and review http://localhost:3000/pokemon.html and http://localhost:3000/dashboard.html. [ANALYTICS.md](ANALYTICS.md) documents source/refresh procedures, calculation formulas, filter/comparison test steps, the changed files and limitations. This is a local development update; no commit, push, deployment or release was created.

## v0.2.2 — Trainer Hub

Local development update for **Dexhaven**, in the **Pokédex Website** project. No release or deployment is created automatically.

- Added `trainers.html`, a dedicated hub with Profile, My Teams and My Favourites section links and a shared introduction. Guests see a sign-in invitation with login, registration and a public Pokédex link; private forms stay hidden until the existing session is authenticated.
- Migrated the existing `account.js` profile, avatar, team and favourite interfaces into the hub. Profile shows the trainer's username, avatar, biography and team/favourite summaries. Biography and avatar editing use the existing endpoints. Username/email remain display fields, matching the existing profile API.
- Preserved team creation, renaming, deletion, six-member/duplicate restrictions, searchable selectors and transactional saves. Favourites retain artwork, names, National numbers, types, detail dialogs, removal and a National Pokédex link.
- All three pages share working Home, National Pokédex and Trainer Hub navigation, themes, login/registration, sessions and the top-right profile avatar. The avatar opens the hub Profile section and updates after uploads. Removed trainer-management containers and the team selector script from the public homepage and Pokédex.
- Direct hub links use `trainers.html#view=profile`, `#view=teams` and `#view=favorites`, supporting reload, browser history and static repository subpaths. Express redirects old `/profile`, `/teams` and `/favorites` URLs to their hub sections. Old public-page `#view=...` bookmarks navigate to the hub too.
- The authenticated hub loads the shared catalogue once, with loading/error/retry states. Browsing the homepage and visiting the hub as a guest do not request catalogue data. Shared auth and detail hooks safely run without trainer containers on public pages.
- Updated both project versions to **0.2.2**, tests and documentation. Dependencies, database schema, account records, team/favourite records, session storage and uploaded avatar files are unchanged. No migration is needed from v0.2.0/v0.2.1.

Validation: **37 standard tests passed** (one opt-in MySQL test skipped), **34/34 Chrome checks passed**, and the separately enabled **real-MySQL integration test passed** with temporary test records cleaned up afterward.

For local review, restart Express with `npm.cmd start` and open http://localhost:3000/trainers.html. Test all three section links, login/logout, biography/avatar changes, team operations, favourites, reloads, themes and navigation to the homepage and Pokédex before publishing. See [QA_REPORT.md](QA_REPORT.md) for current verification and limitations.

## v0.2.1 — Multi-Page Restructuring

Local development changes prepared for testing. This update does not publish a release or deploy the website. The public name remains **Dexhaven** and the development project remains **Pokédex Website**.

Version 0.2.0 introduced the National Pokédex expansion covering Generations I–V. Version 0.2.1 reorganizes that experience into two public pages:

- `index.html` is the dedicated homepage. The original heading, introduction, founder image and caption are preserved. Explore the collection opens `pokemon.html`. Small introductory sections explain the catalogue, existing trainer features and planned dashboard.
- `pokemon.html` contains the full National Pokédex section: all 649 species, generation selection, name/number search, type filtering, sorting, cards, loading, empty and error states. Its title is **National Pokédex — Dexhaven**.
- Both pages retain shared header/footer styling, optional login/registration, session restoration, theme selection and Pokémon detail dialogs. Guests can browse the catalogue without Express or an account.
- Logged-in trainers see their profile picture in the top-right header on both pages. It opens their trainer profile and updates immediately after an upload. Accounts without a picture, or images that fail to load, show the trainer's initial; guests do not see this control.
- Collection controls initialize only when the collection exists. Shared catalogue, artwork, cache and detail functions also support trainer views on the homepage. Catalogue loads are lazy for trainer views and concurrent callers share one request; failures expose a retry control without removing saved trainer data.
- Navigation shows Home and National Pokédex with a current-page indicator. Existing `/teams`, `/favorites` and `/profile` routes remain functional, with protected links hidden until authentication is confirmed. Static previews use hash views on the current HTML page. `trainers.html` and `dashboard.html` are reserved for later phases and are not linked.
- Express explicitly serves `/`, `/index.html` and `/pokemon.html`; frontend links and assets support GitHub Pages repository subpaths. Backend authorization, session cookies, CSRF checks, MySQL integration and the database schema are unchanged.
- Package and lockfile project versions are **0.2.1**. Dependencies and the existing npm package name are unchanged.

The existing code has generation, search, type and sort filters and six statistics in the detail dialog; it has no advanced statistic-filter controls to migrate. These existing capabilities are preserved.

Validation: **37 automated tests passed**, **one opt-in real-MySQL test skipped**, and **33/33 headless Chrome checks passed** using deterministic PokéAPI fixtures and an isolated in-memory account repository. The separate read-only live PokéAPI contract check also passed. See [QA_REPORT.md](QA_REPORT.md) for scope and remaining manual checks.

For local review, run `npm.cmd start` with the existing MySQL configuration, then visit http://localhost:3000/ and http://localhost:3000/pokemon.html. Test registration/login, teams, favourites, theme persistence and page navigation before publishing. No new database migration is required from v0.2.0; installations still on v0.1.0 need the existing manual v0.2.0 migration.
