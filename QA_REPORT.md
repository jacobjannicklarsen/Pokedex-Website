# Pokédex QA review

This report records successive project stages. The **Dexhaven v0.7.1 Community, Battles & Profile Customization** section at the end describes the current version and latest verification; earlier sections document previous reviews.

Reviewed search, filtering, sorting, details, loading, API failures, cache behavior, accessibility, keyboard interaction, and responsive geometry. The design and existing features are preserved; each development stage below records its dependency and verification scope.

## Issues found and fixed

| Issue | Change | Verification |
| --- | --- | --- |
| Name matching rejected ordinary punctuation/spacing variants such as `Farfetch'd` and `mr mime`. | Normalize punctuation and spaces in both names and queries. Preserve partial name search and exact padded-number search. | Logic and Chrome tests. |
| Reset buttons hid themselves while retaining keyboard focus, leaving focus on the page body. | Move focus to search after resetting filters. | Reproduced and verified in Chrome; logic regression test. |
| Sustained failures continued through all 151 records; repeated 12-second timeouts could keep users waiting for several minutes. Retry also initially displayed the previous progress text. | Stop queueing after six consecutive failures, retain successful records, show the complete missing count, and reset progress text on retry. Retry fetches missing records only. | Logic tests for network rejection, timeout/abort, HTTP 503, invalid JSON, and malformed payloads; Chrome outage/recovery test. |
| Error text claimed loaded records were saved even when storage was blocked or full. | Say loaded records are still available, which is accurate for the in-memory collection. | Code review; blocked-storage logic test. |
| Future-dated cache entries, negative stats, and duplicate stat names could be accepted. | Require a finite, nonfuture timestamp, six unique recognized stats in range, and valid abilities/measurements. Reject invalid entries and refetch. | Regression tests for expired/future entries, malformed JSON, invalid stats, and null abilities. |
| Artwork was wider than its card's content area on narrow phones. | Allow artwork and decorative circles to shrink to available width. | Reproduced at 320px and 375px; all five tested widths pass geometry checks. |
| The search input used 14px text, below the usual iOS threshold for automatic focus zoom. | Set search input text to 16px. | CSS inspection only; actual iOS behavior still needs manual verification. |
| The decorative hero image lacked a fallback. | Fall back to the local placeholder, including failures that occur before deferred JavaScript executes. | Chrome test with external artwork blocked; card artwork fallback also tested. |
| Cards contained nonphrasing markup inside native buttons, their explicit accessible names omitted types, and the collection's label lacked an appropriate semantic role. | Use span-based card content, include types in card names, and give the collection a named group role. Expose the existing `/` shortcut through `aria-keyshortcuts`. | Code review and Chrome accessibility-tree checks for named search, sort, type/collection groups, cards, and dialog. |

## Tests actually run

- `node --check script.js` and `node --check tests/browser-qa.cjs`: passed.
- `node --test tests/pokedex.test.cjs`: **12 tests passed**. Includes concurrency limited to six, all 151 records, cache reuse, search, sorting, detail values, image fallback, loading flags, duplicate-load prevention, partial retry, full outages, and unavailable storage.
- `node tests/browser-qa.cjs`: **14 checks passed** in real headless Chrome, served over localhost. Uses deterministic API fixtures, not live data.
- Browser checks exercise input/change/click handlers, filter pressed state, sort order, modal values, Enter activation, Tab and Shift+Tab isolation, Escape, focus restoration, `/`, backdrop clicks, local image fallback, and retry recovery. No uncaught JavaScript exceptions were observed.
- Browser geometry checked at **320, 375, 700, 768, and 1280px**, including page overflow, card artwork fit, and horizontal overflow inside dialogs.
- Static checks passed for unique HTML IDs, JavaScript selector targets, input labels, referenced local assets, UTF-8 content, and balanced CSS blocks.

The original three tests passed before the review but missed these cases. Added regression tests reproduced failures before the fixes. Early keyboard-test failures also exposed incomplete Enter-event simulation in the browser harness; that harness was corrected. Native dialog keyboard behavior passes, so it was preserved.

## Still requires manual browser testing

- Live PokéAPI data, CORS, network latency, image delivery, and optional Google Fonts loading. The browser tests intentionally substitute API responses and block external fonts/artwork to make results repeatable.
- Real screen-reader announcements and reading order. Accessibility-tree assertions do not establish full accessibility conformance.
- Actual iOS/Android touch targets, keyboard/zoom behavior, orientation changes, and modal vertical scrolling on short screens.
- Firefox, Safari, high zoom, forced colors, and a visual review of typography and animation. Automated width/overflow checks do not replace visual inspection.

See README.md for local setup and a manual checklist. The browser harness closes its server/browser and removes its unique temporary Chrome profile after testing.

## Light/dark theme implementation and verification

Added `theme.js`, loaded synchronously before the stylesheet, plus an accessible sun/moon navigation button. Light-theme overrides are appended to the CSS; the existing dark declarations and custom footer remain intact. Light mode uses mint accents with deeper green text for readability. Theme selection is independent of Pokémon loading and does not modify the Pokémon cache or search/filter state.

Saved `pokedex-theme` values take priority over the system preference. Without a valid saved value, the page follows live system changes. Selections synchronize across tabs; unavailable storage falls back to an in-memory selection. Transitions activate only after initial rendering, and reduced-motion preferences disable them.

Latest verification:

- **18 logic tests passed** (`node --test tests/pokedex.test.cjs tests/theme.test.cjs`): the original 12 regressions plus six theme tests covering early initialization, saved/system precedence, toggling, storage failure, synchronization, and script ordering.
- **19 Chrome checks passed** (`node tests/browser-qa.cjs`): the original 14 checks plus system/theme changes, keyboard activation, reload persistence, light-mode functionality, contrast, mobile geometry, and reduced motion.
- Dark-mode rendered color, background, border, radius, shadow, font size, and padding were compared with the original stylesheet for representative components; they match.
- Light-mode contrast passed a 4.5:1 threshold for all 18 type badges, muted description text, accent heading text, and text buttons.
- Light mode passed overflow/toggle visibility checks at 320, 375, 768, and 1280px. Dark-mode responsive checks remain in place at the original five widths.
- Theme bootstrap ordering and pre-DOM initialization were tested; the initial theme is applied before CSS loads rather than corrected after page rendering. This does not substitute for observing first paint on every browser/device.

The browser suite continues to use deterministic API fixtures. Real-device touch, screen-reader announcements, Safari/Firefox, live API behavior, and subjective visual inspection remain manual checks.

## Full-stack implementation

### Implemented

- Same-origin Express 5 application serving an explicit frontend asset allowlist and JSON REST endpoints. HTML, CSS and vanilla JavaScript remain the frontend; the existing theme and PokéAPI cache remain separate.
- Account registration/login/logout with input validation, maintained Argon2id hashing, generic failed-login responses, login rate limiting, session regeneration, HTTP-only SameSite cookies, CSRF tokens, origin checks and security headers/CSP.
- Production sessions use a MySQL-backed express-session Store with seven-day rolling expiry and expiry cleanup. Secure cookies are mandatory in production; local HTTP development intentionally omits Secure. No production fallback to in-memory data/session storage exists.
- Private trainer profile, editable bio, username/email/join information, saved team/favourite summaries and profile pictures. Uploads accept JPEG/PNG/WebP only, limit bytes/pixels, inspect the decoded image format, and write metadata-stripped 256×256 WebP images with random filenames outside the frontend allowlist.
- Team creation, naming, deletion and atomic replacement of up to six distinct Kanto Pokémon. Ownership is checked under a row lock before deleting/inserting members in a transaction. Parameterized queries and MySQL CHECK/unique/foreign-key constraints enforce boundaries.
- Favourite controls are sibling buttons beside existing detail buttons (not nested interactive elements), with pressed states and meaningful names. Card/detail controls and dedicated favourites/profile views use the current artwork/data.
- Dedicated `/profile`, `/teams`, `/favorites` views, native auth/detail dialogs, browser history/direct reload support, mobile layout and both themes.
- Separate `pokedex_app` schema/setup script, mysql2 repository/session-store modules, `.env.example`, dependency lockfile and `.gitignore`. A local ignored `.env` has a randomly generated secret; DB_USER and DB_PASSWORD remain blank. No real credentials were invented or printed.
- [WINDOWS_SETUP.md](WINDOWS_SETUP.md) documents MySQL installation, non-destructive schema import, a dedicated runtime account, environment configuration, Windows npm commands, production requirements and manual testing. [server/API.md](server/API.md) documents the REST contract.

### Actually verified

- `npm.cmd test`: **26 passed, 1 explicitly skipped**. The skipped test is the opt-in real-MySQL test.
- Backend tests use real Express, Argon2, Sharp and HTTP cookies with an isolated in-memory test repository/session store. They exercise registration validation and duplicate status, hashing, login/logout/session rotation, HTTP-only/SameSite/Secure cookie flags, CSRF and origin rejection, rate limiting, private-data isolation, six-member/duplicate constraints, replacement/removal, favourite idempotency, bio validation, invalid/oversized/spoofed uploads, WebP conversion and old-file cleanup.
- Repository tests assert ownership locking, bound SQL values, rollback/release behavior and session-store serialization across store instances using a fake SQL adapter. These are not proof of MySQL engine behavior.
- `node tests/browser-qa.cjs`: **24 passed** in real Chrome through the real Express application, using deterministic PokéAPI fixtures and an isolated in-memory test repository. Includes the existing Pokédex/theme/keyboard/accessibility checks plus UI registration, team editing, duplicate rejection, card/detail favourites, profile bio/avatar upload, logout/login retention, direct profile reload and deletion. Authenticated pages were checked at 320, 375, 768 and 1280px in both themes.
- Syntax checks passed for account/theme/frontend and server scripts. Installed Argon2/Sharp native modules were exercised successfully on this Windows environment.
- Final `npm.cmd audit --omit=dev`: **0 known vulnerabilities**. The initially selected older Sharp release had advisories and was replaced with the patched maintained release before final verification.
- `npm.cmd start` deliberately stops with a clear missing-DB_USER configuration message while credentials are blank. No connection to or modification of any existing database was attempted.

Tests initially caught a duplicate-registration error being incorrectly reclassified as database-unavailable (503); it now returns 409. The upload test was also corrected to read image bytes rather than leaving a Windows image-file handle open during cleanup. Browser regressions were adapted to the new valid sibling-button card structure, preserving the original detail-button behavior.

### Remaining verification

- Import the schema and run `RUN_MYSQL_TESTS=1` as documented to verify real MySQL constraints, collation, foreign-key cascades, row-lock concurrency, transactions and persistent session reads. This test creates uniquely named test users and removes only its own users/session; no database truncation or destructive schema commands are used.
- Verify server-restart persistence with your real database/account and unchanged session secret, and confirm runtime credentials have access only to `pokedex_app`.
- Exercise live PokéAPI/artwork/font requests, real screen readers, Safari/Firefox, actual phones/touch/zoom/vertical modal scrolling, and production HTTPS/proxy configuration. Browser fixtures and cookie-flag tests do not certify a deployed HTTPS environment.
- Account data and uploaded images need routine MySQL/upload-directory backups for deployment. The provided rate limiter is per process; multiple server instances need shared rate limiting and upload storage.

## Dexhaven v0.2.0 expansion

### Scope and preservation

- Created and switched to `dev/v0.2.0` before application edits. Initial Git status was `main` with uncommitted `index.html` edits and an untracked `images/` directory. Those changes were carried over, without resetting/stashing/discarding them. No commit, push, deployment, tag or existing release was created/modified.
- Rebranded header/footer logos, browser title, descriptions/social metadata and appropriate trainer copy to **Dexhaven**. Kept “National Pokédex” as the encyclopedia name. The development project/folder/repository, package name, MySQL database, cookie name, theme key and old detail-cache keys remain unchanged. Package/lock versions are now `0.2.0`.
- Preserved the custom `./images/group-picture.png` path, original image bytes, founder labels/caption, layout, typography and both themes. The SHA-256 before/after is `2D2AA845789F32E5B7188DCF0EF7B71B74EEF671F0FFB9987CFE1869DB14138F`. Express now explicitly serves that image without exposing the rest of the workspace.
- No `.env`, upload, credential, user, team, favourite, profile or session data was modified. No real database connection or migration was performed during this upgrade.

### Implementation

- All 649 species from Gen I–V, with exact generation ranges, combined generation/name/number/type filtering, sorting and dynamic headings/ranges/counts.
- Cold catalogue load uses **19 API data requests**, not 649 detail requests: one species list and eighteen type-membership lists, with at most four concurrent index requests. Alternate-form IDs above 649 are excluded; membership slots preserve type ordering. All cards can render/search before types finish, and incomplete type results are clearly reported if requests fail.
- Species/type indices cache for seven days. A fresh cached startup makes zero catalogue API requests. Details load on demand, coalesce repeated requests, use existing detail caches, and show loading/error/retry states. Stale modal responses are ignored. Artwork remains lazy-loaded with sprite/local fallbacks.
- Trainer selectors/API validation support 1–649. Six-slot/duplicate/ownership protections are unchanged. A progressive-type update fix refreshes badges on reused favourite cards without replacing their buttons.
- New-install schema accepts 1–649; [manual migration](database/migrations/v0.2.0-national-pokedex.sql) replaces only the two old ID CHECKs. [Workbench instructions](database/MIGRATION_v0.2.0.md) cover backups, CHECK names, per-statement DDL commits, unchanged row counts and manual verification. Neither startup nor db:setup runs this migration.
- Static/GitHub Pages preview retains relative assets and repository-path-safe hash navigation; Express retains its server-backed routes. Authentication/persistent trainer features continue to require Express/MySQL.

### Actually verified

- `npm.cmd test`: **30 passed, 1 skipped**. The opt-in real-MySQL test remains skipped. Tests cover exact generation boundaries, combined filters, all sort modes, all 649 IDs, #649 acceptance/#650 rejection, no eager detail requests, bounded index loading, legacy cache compatibility, invalid/future cache rejection, modal races/errors/retry, type-card refresh, partial failures and existing authentication/profile/security behavior.
- `node tests/browser-qa.cjs`: **26 checks passed** against real Express/Chrome using deterministic PokéAPI fixtures and an isolated test repository. Includes generation selection, native keyboard/modal behavior, themes/contrast/reload, authenticated workflows with #649, mobile widths, custom hero loading, consistent branding and a **backend-free preview at `/preview/Pokedex-Website/`**, including generation search, Genesect details and hash-route reload.
- `node tests/live-pokeapi.cjs`: passed using **three real read-only GETs**: the ordered 649-species list, Dragon membership with slots, and Genesect's stats/abilities/official artwork URL. This verifies representative live contracts, not every species' full record or artwork download.
- `npm.cmd audit --omit=dev`: **0 known vulnerabilities**. No dependency additions were needed for v0.2.0.
- JavaScript syntax, image hash, migration structure and Git whitespace checks passed. The final source diff was reviewed for preservation of the user's hero changes, existing security boundaries and unchanged data access.

### Remaining manual checks

- **Migration has not been executed.** Apply it manually in Workbench after backup and schema inspection; do not use schema re-import as an upgrade. Verify real row counts, existing accounts/avatars/teams/favourites, CHECK constraints and server-restart persistence afterward. Run the opt-in MySQL integration test only after migrating your development database.
- Browser/API workflow tests use isolated in-memory test data; they do not prove your live MySQL contents were migrated or inspected. Preservation is supported by the non-destructive SQL/source changes and by leaving your database untouched.
- Real phone touch/zoom, screen-reader output, Firefox/Safari, production HTTPS and actual GitHub Pages deployment still require manual verification. A repository-path static preview was tested locally; nothing was published.

## Searchable team selectors and authenticated navigation

### Changes

- Added `pokemon-selector.js`, loaded before account integration and allowlisted by Express/static-preview tests. It searches all 649 catalogue entries by partial name or exact/padded National number in memory; it makes no PokéAPI requests. Up to twelve results render with names, numbers and small decorative artwork.
- Replaced only the six team-member dropdowns with editable combobox/listbox widgets. DOM focus stays on the input, with `aria-expanded`, `aria-controls`, `aria-activedescendant`, labels, instructions and result announcements. Arrow Up/Down, Enter, Escape, Tab, mouse selection and explicit Remove controls are supported. Typed text is not saved unless a result is chosen.
- Slot previews retain selected artwork/name/number. Results already used in another slot of the same team are disabled and rejected on activation. The six-slot limit, defensive duplicate check and server validation/authorization remain unchanged. Save still submits the same `{name,pokemonIds}` PUT body; the UI now says “Saving team…” while awaiting completion.
- Trainer navigation links and Log out start hidden in HTML and remain hidden until the existing session endpoint confirms authentication. Guests see National Pokédex, Log in, Register and the theme toggle. Login/logout update navigation immediately after confirmation, refresh restores the session, and direct unauthenticated private routes retain a login/register prompt. Session-loading text avoids showing protected links prematurely.
- Logout clears the rendered private view and closes any selectors. Returning to the public catalogue also closes selectors. No MySQL schema, migration, credentials, accounts, saved records, backend security policy or repository data was changed for this UI improvement. The only server change is serving the new frontend asset.
- Preserved the user's current title/hero copy edits made during development, existing branding/themes, and unchanged custom hero image bytes. Branding tests now require the Dexhaven prefix rather than an obsolete exact subtitle.
- Updated README/Windows manual instructions and browser/selector tests. No dependencies were added, and nothing was pushed or published.

### Latest checks actually run

- `npm.cmd test`: **33 passed, 1 skipped**. The real-MySQL integration test remains explicitly opt-in. New selector unit tests cover all 649 numeric IDs, padded IDs, name/punctuation matching, out-of-range/no-match queries and bounded result rendering.
- `node tests/browser-qa.cjs`: **29/29 passed** in real Chrome through Express, using isolated in-memory trainer/session fixtures and deterministic PokéAPI fixtures. New checks include delayed authentication with hidden protected links, guest Login/Register, direct logged-out access, immediate login/logout visibility, restored authenticated navigation, no native slot selects, search/keyboard/mouse activation, duplicate rejection with Enter/click, selected previews, removal/replacement/save/reload, Escape cancellation, Tab without committing, focus return, listbox semantics and bounded result counts. Searches made no extra catalogue/detail API calls.
- Existing Pokédex, generation/filter/sort/detail, theme, profile/upload/favourite, ownership/security and static repository-path preview regressions passed. Open selector popups fit within the viewport at 320, 375, 768 and 1280px in both themes.
- `node tests/live-pokeapi.cjs`: passed (three read-only GETs).
- `npm.cmd audit --omit=dev`: **0 known vulnerabilities**.
- Syntax/static checks passed for frontend asset references, unique IDs, protected HTML links hidden by default, CSS block balance and Git whitespace. The custom hero SHA-256 still matches the preservation check.

An initial browser failure came from a test mistaking an earlier “Team saved” message for a new save's completion. Explicit save progress fixed that ambiguity. A later exact-title assertion conflicted with the user's updated subtitle; the test was corrected without reverting the user's copy.

### Manual verification still required

Use your configured Express/MySQL instance to save a team and confirm persistence after a full server restart. Real MySQL execution was not performed in this task; SQL/API contracts are unchanged. Also test real screen-reader announcements, touch scrolling/selection on iOS/Android, Safari/Firefox and high zoom. Automated Chrome geometry/accessibility-tree checks are not full accessibility certification.

Quick manual flow: start Express; verify only guest navigation; choose Register or Log in; open My Teams and search `pika`/`#649`; choose with mouse and arrow keys/Enter; try the same Pokémon in another slot; use Escape/Tab to cancel a search, Remove to empty a slot, and Save team; reload; log out; then open `/teams` directly to verify the login prompt and hidden trainer links.

## Team management repair: missing selector and inaccessible deletion

- Reproduced the real local-server failure: `http://localhost:3000/pokemon-selector.js` returned **404**, while current HTML/account files referenced it. The old running Node process retained its earlier static-route allowlist. The unguarded `PokemonSelector.create` reference threw during team rendering, before Save/Delete controls were appended.
- `account.js` now checks `globalThis.PokemonSelector` before using it. Missing selector code produces a recoverable notice and a Retry Pokémon editor action. Team cards still render with their saved members and support creating, renaming and deleting teams. Missing widgets never silently clear saved members.
- Existing Delete controls now have a dedicated `delete-team` class and team-specific accessible label. Deletion confirms first, disables conflicting save/delete actions while pending, updates the local team list after DELETE succeeds, and retains/re-enables the card on failure.
- Create/save/delete now reconcile the API's own results rather than waiting for an unrelated teams/favourites reload. This prevents a successful mutation from being reported as failed because a later GET failed.
- Verified the actual MySQL CHECK metadata read-only: both v0.2.0 constraints allow IDs 1–649. No schema changes or migration were necessary or executed.
- Restarted only the verified stale Dexhaven `node server/index.js` listener on port 3000. The local server now serves the selector with **200 JavaScript**, and serves the corrected account code. Existing `.env`/session secret and persistent trainer data were preserved.
- `npm.cmd test`: **33 passed, 1 skipped** in the standard run. Ran the opt-in real MySQL integration test separately: **1 passed**, including deletion, member cascades, ownership, transactions, valid ID bounds, favourites and session storage. It created uniquely named test users and cleaned up only its own test records/session.
- Chrome regression: **30/30 passed**, including deliberate selector removal, failed retry-script loading, successful recovery, create/rename/delete with unrelated GET failures, failed deletion retaining the card, and all prior selector/navigation/catalogue/theme/static-preview flows. Browser test accounts/repositories are isolated fixtures.
- Confirmed no uncaught browser exceptions during the final fixture run, and syntax checks passed. No code was pushed/published. Real screen-reader, touch and cross-browser checks remain manual.

For the repaired running local app: hard-refresh with Ctrl+Shift+R, open My Teams, create or rename a team, select/save members, then choose Delete team and confirm. The server was already restarted during this repair.

## Dexhaven v0.2.1 restructuring

Verified on 26 October 2026. Earlier results above describe their respective development stages.

- Initial working tree was clean on `dev/v0.2.0`; the branch was preserved. Git's ownership check required a per-command `safe.directory` override for this checkout; no global Git settings were changed.
- Moved the collection section from `index.html` into the new complete `pokemon.html` document. The homepage retains the original hero heading, introduction, founder artwork/caption, header/footer and design, with small introductory sections. Both pages have public navigation and optional accounts; unfinished Trainers/Dashboard pages are not linked.
- Shared collection, detail and hero initialization now guards absent components. Homepage startup makes zero catalogue requests. Trainer tools on that page load the same catalogue lazily, reuse in-flight requests and expose loading/error/retry feedback. Pokémon detail dialogs remain available for trainer favourites on either page.
- `npm.cmd test`: **37 passed, one skipped, zero failed**. Added coverage for both Express public pages, preserved trainer routes, the split HTML/shared layout/version metadata, absent collection/hero/dialog nodes, lazy trainer loading and concurrent load coalescing. Existing 649-species, filters, sorting, detail, cache, selector, theme and API/security tests pass.
- `npm.cmd run test:browser`: **33/33 passed**. Headless Chrome verifies homepage navigation, zero homepage catalogue requests, all 649 cards, generation/search/type/sort combinations, details, keyboard controls, error recovery, registration/login/logout, private links, teams, selector recovery, favourites, profile/avatar, session/theme continuity between public pages and reloads, homepage trainer catalogue failure/retry without losing favourites, and static preview under `/preview/Pokedex-Website/`. Geometry checks cover 320–1280px. No uncaught browser exceptions were observed.
- Chrome's debugging connection timed out before tests in the sandbox. Running the unchanged browser-launch mechanism outside the sandbox allowed the suite to execute. Browser fixtures use isolated in-memory account/session repositories and temporary uploads, not the configured MySQL database.
- `node tests/live-pokeapi.cjs`: **passed** outside the network-restricted sandbox; exactly three read-only GETs verify the 649-species list, Dragon membership and Genesect details/artwork. The initial sandbox attempt failed to fetch.
- Real MySQL integration remains opt-in and was **not run for v0.2.1**. No database schema, credentials, uploads or production records were modified. Tests exercise the existing repository/session contracts with fixtures; they do not establish live database behavior.
- Package and lockfile project versions are 0.2.1; dependency versions and package name are unchanged. Documentation and local release notes were updated. No commit, push, Git release, deployment or publishing was performed.
- Syntax checks passed for `script.js`, `account.js` and the browser harness. Both HTML pages passed unique-ID, UTF-8 and relative local link/asset checks; `git diff --check` passed.

Before release: restart the local Express server to load the new route allowlist. Visit http://localhost:3000/ and http://localhost:3000/pokemon.html; verify an existing MySQL-backed account, avatar, teams and favourites across page navigation and reloads. Real touch-device, screen-reader and Safari/Firefox checks remain manual. The existing project implements no advanced statistic filters; six detail stats and all existing collection filters are preserved.

## Dexhaven v0.2.2 Trainer Hub

Verified on 26 October 2026. Work continues on the existing `dev/v0.2.0` branch, preserving the uncommitted v0.2.1 changes and header avatar enhancement.

- Added `trainers.html` with a shared introduction, guest sign-in invitation and authenticated Profile, My Teams and My Favourites section navigation. Reused the existing account renderers, forms, API requests, searchable selectors, validation and error handling. Profile now also displays the saved biography alongside the existing identity/avatar and team/favourite summaries.
- Removed trainer-management containers and team-selector script loading from `index.html` and `pokemon.html`. Shared login/session/avatar controls and Pokémon account actions still work on public pages. The header avatar navigates to the hub Profile section. The hub alone initializes its private interfaces and loads catalogue data after authentication.
- All three pages have consistent public navigation, header/footer and theme behavior. Direct section links use `trainers.html#view=profile`, `#view=teams` and `#view=favorites`. Legacy Express trainer routes redirect to those links; old public-page hash bookmarks navigate to the hub. Repository-subpath static previews remain supported.
- `npm.cmd test`: **37 passed, one opt-in MySQL test skipped, zero failed**. Updated route, layout, version and trainer-markup assertions. Existing authentication, authorization, CSRF, upload processing, team restrictions, catalogue, selector and theme checks pass.
- `npm.cmd run test:browser`: **34/34 passed** in headless Chrome, with deterministic PokéAPI data and isolated in-memory account/session repositories. Checks include guest invitation buttons and mobile geometry in both themes; registration/login/logout; biography editing; avatar upload and immediate header updates; team create/save/rename/delete and selector recovery; favourites/details; session/theme continuity across all three pages; section history, direct reloads and saved data restoration; catalogue outage/retry; and static repository-subpath navigation. No uncaught browser exceptions were observed.
- Browser geometry covers 320–1280px. Updated the harness to wait for session restoration after full page navigation and to target team deletion independently of guest controls. The outage test explicitly loads a new document so injected network failure applies. Chrome runs outside the sandbox because its debugging connection times out inside it.
- Separately ran the opt-in real-MySQL suite with `RUN_MYSQL_TESTS=1`: **one passed**. It verifies six-slot/duplicate/ID constraints, ownership, transaction rollback and concurrent saves, favourites, cross-instance session persistence and team deletion cascades. It creates uniquely named test accounts and deletes only their records and its own test session afterward. Existing accounts, teams, favourites and uploaded files were not changed; no schema migration was executed.
- Updated package/lockfile project versions to **0.2.2** and refreshed README, Windows setup, API page-route documentation and release notes. Dependency versions and the project/public names are unchanged. No commit, push, Git release or deployment was created.

Local review: restart Express, then visit http://localhost:3000/trainers.html. As a guest, check the invitation and login/registration buttons. Sign in with an existing account and verify the displayed profile/avatar/biography, teams and favourites. Refresh each hub section; navigate through Home and National Pokédex; test both themes and logout. Touch devices, screen-reader announcements and Safari/Firefox remain manual checks.

## Dexhaven v0.3.0 analytics

Verified on 26 October 2026. The initial working tree was clean; the existing development branch and prior features were preserved. The custom founder artwork remains byte-for-byte unchanged.

- Added `dashboard.html` with dataset-derived overview cards, interactive generation and dual-type distributions, grouped generation averages, switchable top-ten rankings, and independent searchable two-species comparisons. Exact values are available in semantic tables; common comparison axes start at zero, ties are explicit and higher values are labelled.
- Added all seven inclusive stat ranges, numeric/inverted-range validation, combined generation/type/name/number predicates, eight stat sort modes and separate stat/all reset controls. Invalid input retains the last valid applied ranges and displays a message; the collapsed panel shows applied bounds.
- Generated `data/pokemon-summary.json` directly from all 649 default PokéAPI records with at most four concurrent read-only requests. Complete validation checks IDs, species names, current typings, six stats, abilities, units and source metadata before replacing the snapshot. Snapshot timestamp: `2026-10-26T20:39:22.756Z`; size approximately 244 KB uncompressed. No analytics values were fabricated or derived from partial loads.
- Snapshot sanity checks: generation counts **151/100/135/107/156**, **18 observed types**, average total base stats **417.363636…** (displayed **417.36**), Bulbasaur **318**, Genesect **600**, Garchomp **600**, Arceus **720**. Type totals include each member of dual typings; Mewtwo and Lugia both total **680**. Rankings break ties using ascending National number.
- Each data-dependent page requests one local summary URL and reuses one in-flight/resolved promise; browser HTTP caching handles navigation. Existing compact index/detail caches and request coalescing remain. Dashboard details/comparisons use snapshot records; ordinary Pokédex details retain their existing live/cache flow. Stat controls remain disabled on snapshot failure and dashboard aggregates stay hidden until the full dataset validates. Retry recovers without a refresh.
- Pinned Chart.js **4.6.1**, locally vendored its UMD bundle and MIT license, and added explicit refresh helpers. Canvas names/descriptions, values tables, theme updates, keyboard selectors and no-motion charts are implemented. Library-loading failure displays a warning while preserving tables/rankings/comparison controls.
- `npm.cmd test`: **44 passed, one opt-in real-MySQL test skipped, zero failed**. Tests cover dataset completeness and known source values, unrounded/dual-type aggregates, numeric validation, all seven predicates and eight new sorts, deterministic ties, combined collection filters/reset, rejected partial snapshots, loader coalescing/retry, public routes/asset isolation and all existing security/account/catalogue/selector/theme regressions.
- `npm.cmd run test:browser`: **40/40 passed** in real headless Chrome. Checks exercise the advanced controls through DOM events; actual Chart.js datasets and tooltips; accessible tables/canvas names; every ranking criterion; comparison names/numbers/keyboard selection, duplicate rejection, generation-spanning pairs, exact stats, differences, ties, removal/replacement and chart lifecycle; incomplete/network dataset failures and retries; missing-library fallback; all four pages' authenticated session/theme continuity; unchanged trainer registration, biography/avatar, team CRUD/selector recovery and favourites workflows; static repository-subpath preview. No uncaught browser exceptions were observed.
- Responsive browser checks cover **320, 375, 700, 768 and 1280px**, both themes, chart canvas fit and selector popup bounds. Desktop dashboard and comparison screenshots were visually inspected. The harness intentionally blocks remote fonts/artwork, so screenshots show the existing local artwork fallback. Real image delivery, touch devices, screen readers and Safari/Firefox remain manual checks.
- `node tests/live-pokeapi.cjs`: **passed**, using the existing three read-only GETs for the species index, Dragon membership and Genesect details/artwork. Dataset generation and the live check required network permission; Chrome required execution outside the sandbox as in prior stages.
- The opt-in MySQL integration test was **not run**: this brief requires approval before live database modifications. Standard backend/browser tests use isolated repositories/session stores and temporary uploads; no live database data, schema, environment credentials or uploaded avatar files were changed. Historical MySQL results above apply only to earlier stages.
- Updated version metadata to **0.3.0**, shared navigation, allowlisted Express assets, release notes and setup/API/data documentation. No commit, branch switch, push, deployment or GitHub release was performed. Source refresh instructions and known snapshot/cache limits are in [ANALYTICS.md](ANALYTICS.md).

Before release, restart Express and manually review http://localhost:3000/pokemon.html and http://localhost:3000/dashboard.html. Try Sinnoh + Dragon + minimum Attack 100 + minimum Speed 90, then a name/number search; reset; compare Bulbasaur/#649 and #150/#249. Verify an existing real account across all four pages when approved. Snapshot values only change through the explicit update command; cached live details may differ until expiry if PokéAPI changes after snapshot generation.

## Dexhaven v0.4.0 encyclopedia

Verified on 26 October 2026. The initial working tree was clean on `dev/v0.4.0`, but that branch pointed to the first 151-species release (`247f881`). Fast-forwarded it to the existing local v0.3.0 commit `ae85475` before implementation so the required Trainer Hub, analytics, 649-species catalogue and previous work were retained. This created no merge commit and performed no push. The migrations inherited from that baseline were not executed.

- Added six sections to the existing shared dialog, with native tab buttons/panels, arrow/Home/End navigation, previous/next species and shareable `pokemon.html?pokemon=ID` entries. Existing overview artwork, measurements, abilities, statistics, favourites and team actions are reused. New data is not fetched by Overview/Base Stats.
- Evolution families come from species/chain resources, without individual family hardcoding. Full branches include later species, which are labelled reference-only beyond #649. Requirements preserve level/item/trade/held-item/friendship/time/gender/location/move/party/stat/beauty/affection and special conditions, with source game labels and explicit fallback for structured conditions. Standalone species and missing chain data have separate states.
- Moves stay within the selected Generation I–V game group. Historical move changes and pre-IV Physical/Special categories are applied, including nonchronological resource-ID exceptions. Name/type/category/method filters and name/level/power/accuracy/PP sorts operate on that group's entries. Initial metadata loads are paged at 24 rows; type/category/numeric searches inspect all relevant candidates in bounded cached batches. Missing power/accuracy/levels display dashes.
- Modern type resources drive defensive products and offensive type tables. Tests verify Charizard's Rock 4×, Grass 0.25× and Ground 0×, plus normal/ghost immunity precedence. The UI explicitly excludes historical chart variants, actual moveset coverage, ability/item/weather effects and other battle modifiers.
- Species sections show current recorded experience/capture/friendship/growth, English genus, egg groups/gender/habitat, introduction/region and legendary/mythical state alongside existing identity/measurements/abilities. English entries are game-selectable and normalized. Null/missing optional values remain explicit rather than invented.
- Added response-validated, seven-day per-resource caches under `dexhaven-encyclopedia-v1-*`, compact English/species and supported learnset data, shared request promises, a four-request scheduler and 12-second timeouts. Existing detail fetches seed raw learnset summaries. Invalid/future/mismatched/expired or unavailable storage falls back safely; failures remain retryable. Shared chain/move resources are reused across entries and page loads.
- Fixed two focus/race issues found during browser QA: heading focus now occurs on the rendered frame after internal/deep-link navigation, and a queued close event from a prior opening cannot invalidate the next opening. Detached section checks and move-search revisions prevent late responses from replacing current content.
- `npm.cmd test`: **52 passed, one opt-in real-MySQL test skipped, zero failed**. New tests use real PokéAPI resource samples for representative species across all five generations, standard/branching/later/standalone evolution cases, special requirements, isolated learnsets and historical values, type products, missing fields/English entries, cache reuse/coalescing/concurrency and failure retries. Existing account/security/catalogue/analytics/selector/theme tests remain.
- `npm.cmd run test:browser`: **46/46 checks passed** in headless Chrome against an isolated fixture-backed Express server. Added deep-link/heading focus, keyboard sections, species game entries, shared family caching, Eevee/Sylveon and no-evolution views, learnset filtering/sorting and cached historical metadata, dual-type matchups, retry/rapid switching, and all encyclopedia sections at 320/375/768/1280px in both themes. Existing registration, avatar/profile, teams/favourites, session/theme continuity, advanced filters, analytics/comparison and GitHub Pages subpath checks remain. No uncaught browser exceptions were observed.
- `node tests/live-pokeapi.cjs`: **passed** (three read-only GETs). Additionally inspected live historical move values and generated the real sampled fixtures through read-only resource requests. Browser fixtures deliberately restrict learnsets to included metadata; this restriction is not applied to the runtime application. Remote artwork/fonts are blocked in the browser harness, exercising existing fallbacks.
- No schema changes, database migrations or live-MySQL tests were run. Backend/browser accounts, session stores and uploads are isolated fixtures; existing live records, credentials and uploaded files were not edited. New assets are explicitly allowlisted without exposing source/test fixtures or adding trainer endpoints. The analytics dataset, theme code and custom founder image are unchanged.
- Updated package/lockfile project versions to **0.4.0** and refreshed README, Windows setup, API documentation and release notes. Added [ENCYCLOPEDIA.md](ENCYCLOPEDIA.md) with source/rules/caching details, changed files, test instructions and historical-data limitations. No implementation commit, push, deployment or GitHub release was created.

Before release: restart Express and inspect `/pokemon.html?pokemon=1`, `?pokemon=133`, `?pokemon=6` and `?pokemon=649`, then representative species from Generations II–V. Verify a real existing trainer account when approved. Touch-device, real screen-reader and Safari/Firefox checks remain manual. Historical move/evolution records can have gaps; modern defensive rules intentionally differ from Gen I–V, and later evolution relatives are references only.

## Dexhaven v0.5.0 trainer progression

Verified on 27 October 2026 on `dev/v0.5.0`. Existing uncommitted v0.4.0 work was carried forward without discarding it. Both package versions are **0.5.0**.

- Added authenticated Seen/Caught controls shared by cards and details, composed personal filters, Trainer Hub Progress/Achievements views, generation/type completion, recent activity and eight permanent server-validated achievements. Current completion remains separate from historical unlocks.
- Added owner-scoped API endpoints and transactional collection/award storage. SQL parameters, user-row locks, duplicate awards, idempotent timestamps, six-member team awards and rollback behavior are covered. Client-supplied ownership/unlock fields are rejected; session authentication, CSRF and private no-store responses remain enforced.
- `npm.cmd test`: **63 passed, one opt-in live-MySQL test skipped, zero failed**. Includes all previous regression suites, completion formulas, thresholds, historical awards, API isolation/validation, production repository transaction checks and additive schema consistency.
- `npm.cmd run test:browser`: **52/52 passed** in headless Chrome using isolated fixture accounts/repositories. Includes status controls, composed filters, statistics, full-team/collector awards, refresh/login persistence, permanent unlocks after removals, failed-save rollback, missing-schema retry, cross-tab changes and switching between two trainers, responsive layouts and both themes. Existing encyclopedia, analytics, navigation, auth/profile/avatar/team/favourite checks remain. Private records are not stored in localStorage.
- Visually inspected the private progress dashboard screenshot. Remote artwork/fonts remain blocked by the isolated browser harness; existing fallbacks are exercised.
- Prepared the additive migration and [Workbench guide](database/MIGRATION_v0.5.0.md), [progression/API guide](PROGRESSION.md), release notes and setup documentation. **No migration, live database write or live-MySQL integration test was executed.** Static SQL/simulated transactions do not prove execution against the installed MySQL server. Existing accounts, uploaded artwork and public data were preserved.
- No implementation commit, push, deployment or release was created.

Before release: back up and review/apply the migration manually when approved, verify its constraints and unchanged existing records in MySQL, restart Express, then test a real existing account at `/pokemon.html`, `/trainers.html#progress` and `/trainers.html#achievements`. Check status changes across refresh/login, profile/avatar, team/favourite operations and navigation. Real touch, screen-reader, Safari and Firefox checks remain manual.


## Dexhaven v0.6.0 trainer community

Verified on 27 October 2026 on branch dev/v0.6.0, preserving the existing uncommitted homepage styling. Package and root lockfile versions are 0.6.0. No migration, live MySQL writes, implementation commit, push, deployment or release was performed.

- Implemented opt-in public profiles/directory, separate public biography, featured species/team, four optional sharing flags, saved owner-only preview, independent team visibility and stable UUID links. Missing settings stay private; public responses explicitly project approved fields. Public pictures check profile/avatar opt-in per request, while original upload URLs are owner-only. Public aggregate statistics exclude collection records/recent activity. Shared teams remain separately public when a profile is disabled, as stated in the UI.
- Protected sharing/settings endpoints reuse session-derived ownership and CSRF/origin checks. Production SQL uses bound values, owned-team row locks, transactions/rollback, foreign keys/unique/check constraints and disabled defaults. Public reads are bounded/rate limited and no-store. Clean public routes serve local assets correctly; static previews show a backend requirement.
- Team analysis reuses the Encyclopedia modern type calculation with 18 official Pok?API resources retrieved read-only. Tests validate reciprocity, all multiplier categories including dual-type/immunity cases, exact incomplete-team averages, totals, type diversity and offensive type potential. Public saved and private draft analysis share the calculation; empty slots never count. Charts have interactive measures, tooltips, theme updates and exact keyboard-accessible tables/matrix, including missing-library fallback.
- npm.cmd test: **73 passed, one opt-in live-MySQL test skipped, zero failed**. New tests exercise two-account authorization, default-private projections, optional fields/avatar revocation, guessed links, forged settings/CSRF, featured-team ownership, revocation/deletion, clean routes/allowlists, rate limiting, missing-schema errors and transaction rollback/schema consistency. The opt-in MySQL suite is extended for real settings persistence, flags, public progress, revocation and sharing cascades, but was not executed.
- npm.cmd run test:browser: **58/58 passed** in isolated real headless Chrome. Retains all prior checks and adds draft analysis/update-without-saving, charts/matrix, public settings/preview/literal biography rendering, sharing/copyable link and logged-out deep links, visibility revocation, optional public picture/sections, public mobile layouts/both themes/keyboard scrolling, chart-library failure and static backend-required handling. Two-account browser session switching and existing auth/profile/upload/team/favourite/progression/catalogue/Encyclopedia/dashboard checks remain. No uncaught script exceptions were observed.
- Browser QA exposed an initial hub-data readiness race and narrow-screen canvas overflow; both were fixed and the complete suite then passed. Visually inspected community-team.png from the isolated QA screenshot directory; external artwork/fonts are intentionally blocked by the harness and existing image fallbacks render.
- Reviewed additive migration SQL without executing it. Schema matching and SQL mocks do not validate an installed MySQL server. Follow database/MIGRATION_v0.6.0.md and COMMUNITY.md for backup, manual execution, original-record counts, constraints and real-account persistence checks. Real touch/screen-reader and Safari/Firefox checks remain manual.


## Achievement vault and trainer-card decorations

Verified on 27 October 2026. Expanded eight achievements to 96 with preserved keys/dates, four rarity tiers, category/status filters and dismissible unlock celebrations. Added curated live-preview trainer cards (eight palettes, six banners, six frames, finishing effects, title/motto and up to three earned badge pins) to private/public profiles. Earned pins are server-validated and omitted publicly unless achievement sharing is enabled. Existing status-toggle, ability-tooltip and chart-hitbox work was retained.

- npm.cmd test: **78 passed, one opt-in live-MySQL test skipped, zero failed**. Covers all reachable award criteria, type thresholds, historical retention, reconciliation without redundant writes, two-account decoration ownership/validation/CSRF, forged pins, public privacy and migration consistency.
- npm.cmd run test:browser: **61/61 passed** with isolated fixtures. Includes existing regressions plus the 96-badge vault, filtering, unlock toast/dismissal, decoration preview/reset/save/reload, literal custom text, earned pins, public rendering, both themes and responsive widths. An existing hover check now scrolls instantly before moving the pointer to avoid a smooth-scroll timing race.
- Visually inspected the decorated public trainer card; corrected shared panel padding so name/avatar/content sit below the banner. External artwork/fonts are blocked by the harness and use fallbacks.
- Prepared database/migrations/profile-decorations.sql and its Workbench guide without executing them. No live records, schema, avatars, version numbers, commits, remote branches, deployments or releases were changed by this enhancement. Actual MySQL save/restart persistence and schema constraints remain manual checks after the approved migration. Real screen-reader/touch/Safari/Firefox checks remain manual.


## Avatar picture framing

Added a circular local drag/zoom preview, keyboard positioning, reset/cancel and server-applied source-pixel crops with EXIF orientation handling. Existing upload authentication, limits, output size, owner-only images and cleanup remain. No migration or live database test was run.

- Targeted crop/geometry/API/security checks: **17/17 passed**. Tests cover portrait/landscape bounds, zoom/pan math, malformed/forged crops, actual saved crop pixels, phone orientation and preserving an existing avatar after invalid requests.
- Full isolated Chrome suite: **63/63 passed**, including pointer dragging, keyboard repositioning, reset/cancel, responsive previews/both themes and comparing saved image pixels against the chosen crop.
- The full automated suite has one unrelated founder-artwork checksum failure: images/group-picture.png changed on disk during this work, and the historical test still expects its previous bytes. The new artwork and test baseline were left unchanged. The opt-in live MySQL test remains skipped.


## Community discovery redesign

Replaced the username-only listing with decorated trainer cards containing approved avatars (or initials), public biographies/titles, featured partners and shared-team previews. Added bounded global username search, result totals, load-more pagination, useful empty/error states and whole-card profile links with a separate team action. Fixed Community metadata, removed the Public trainers self-link, and gave profile/team pages route-aware back-navigation and larger profile identity headers. No schema migration, live database write, deployment or release was performed.

- Community API/calculation/privacy suite: **14/14 passed**, including two-account privacy, rich-card allowlists, literal wildcard search, pagination, public-team revocation and bounded batch SQL reads.
- Isolated Chrome suite: **64/64 passed**, covering cards/approved avatar URLs/partner names/lineups, search and clear, pagination across 28 fixture trainers, profile navigation, both themes and 320/375/768/1280px geometry. Visually reviewed the dark/light directory screenshots; profile photos are synthetic fixture images and external artwork uses fallback images in this harness. No fixture profiles are added to the production database.
- The full automated suite continues to flag the existing founders-artwork checksum mismatch after the user changed that image; the artwork and historical baseline remain untouched. Live MySQL tests remain opt-in and were not executed.


## Single Biography and caught-team search

Profile now has one Biography editor, with avatar editing above it. The adjacent public-profile settings offer Show biography publicly; the separate public text editor and publicBio API input have been removed. Public profiles, directory cards and saved owner previews derive the text from users.bio only when explicitly approved. Old public text stays archived, and a manual single-biography migration adds an unchecked sharing flag. No database migration was executed.

Team editors switch between All and Caught search sources using the authenticated collection. Seen-only species are excluded in Caught mode. Switching, collection failures and retries preserve existing members and unsaved edits; failed or empty collections never expand the results to the full catalogue. Existing six-slot and duplicate protection is preserved.

Verification: 16 community tests passed, including opt-in/revocation/current text, account isolation, manual-migration fallback and additive schema composition. The complete automated suite reports 86 passed, one skipped opt-in live-MySQL test, and the existing founder-artwork checksum mismatch (the user-supplied image was preserved). The isolated Chrome suite passed 65/65 checks, including empty/failed/recovered caught searches, Seen exclusion, draft retention, save/reload, biography field count/order and public sharing, plus existing avatar/team/authentication, mobile and theme checks. Browser runs use fixture data and temporary sessions/uploads, not live MySQL or live PokeAPI.


## Dexhaven v0.6.1 sprites and Trainer Card Studio

Completed sprite integration and expanded the existing Studio using a shared safe configuration/appearance renderer. Reproduced Hexagon's missing diagonal borders and Sparkles overlapping the directory stamp before editing; saved baseline screenshots separately. The new silhouette/inset-image frame has six real edges, and SVG Sparkles stays in the banner behind interactive content. Reviewed Chromium and Firefox screenshots in dark/light themes at 375px and 1280px.

- Complete upstream Git-tree inspection found all 649 standard animated, static and party sprite paths, plus 649 shiny battle paths in each supported style. Nine samples for #009/#151/#649 returned HTTP 200, decoded and had real GIF animation. The checked manifest pins the upstream revision.
- Automated suite: 94 passed, one opt-in live-MySQL test skipped and one existing founder-image checksum mismatch. Preserved the supplied image and historical expectation.
- Targeted sprite/card/community checks: 24 passed. New schema tests compare every added column/constraint with the fresh definition, ensure one complete decoration table and preserve old defaults/options; validation and parameterized owner persistence are covered. No real SQL was executed.
- Full Chromium suite: **68/68 passed**, covering existing registration/login/logout, crop uploads, profile/biography privacy, team CRUD/limits/caught source, favourites, collection/achievements, filtering, Encyclopedia, public sharing/analysis and both themes/mobile. Added Studio options, custom colour validation, preview/default reset, successful/failed save/reload, shared styling, six-edge border pixels, bounded Sparkles, Mew/Blastoise GIFs, party order/empty slots, static reduced motion and finite sprite fallback. Focused checks additionally verify distinct computed appearances for every palette/background/frame/effect/border option.
- Firefox BiDi: **12/12 layout checks passed** across the real Studio, directory and public profile in two widths/two themes. Also verified portrait-avatar object-fit/clipping, pointer-transparent decorative layers and None/Shimmer/Sparkles switching. This was a focused visual review, not a full Firefox regression run.

Browser tests use temporary profiles, fixture sessions/uploads and MemoryRepository, with downloaded upstream sprite samples supplied through browser interception. GIF failure handling includes an injected image error to avoid an already-decoded image cache. Live upstream asset checks ran separately. These tests do not validate a live MySQL migration or real-account restart persistence, Safari, screen readers or low-end-device CPU usage.

The [manual v0.6.1 migration](database/MIGRATION_v0.6.1.md) remains unapplied and needs explicit approval. Existing reads default new fields safely; expanded saves give migration guidance before approval/application. No tag, release, push or deployment. See [the implementation report](IMPLEMENTATION_v0.6.1.md) for all options, root causes and files.


## Dexhaven v0.6.2 Ranks & Administration

Executed full automated suite: **109 passed**, one opt-in real-MySQL test skipped and one existing founder-image SHA mismatch retained (111 total). The supplied image and historical expected checksum were preserved; npm test still exits nonzero. New staff/rank/schema tests: **15/15 passed**, covering per-endpoint authorization, role spoofing, hierarchy/Owner/self protection, Owner-only appointment and permission subsets, live-session changes, suspension limits/expiry/revocation, CSRF, literal/batched SQL binding, stale/concurrent fixture updates, audit failure rollback, scoped logs, private-content ownership, bootstrap arguments, additive readiness schema and every rank threshold/privacy transition. Administrator demotion/re-promotion cannot clear an Owner-assigned subset; removing panel.access blocks all administrative APIs.

Full Chromium regression: **73/73 passed**. Existing login/registration, crop avatars, personal/public profiles, teams/six-slot/caught sources, favourites, collection/awards, filtering, Encyclopedia, sharing/analysis, Studio/sprites and theme/navigation checks remained. New browser flows verify guest/Trainer gates and hidden staff links, Owner role/permission/restriction/revocation confirmations, audit presence, Moderator limits, live demotion, failed-save restoration, keyboard Tab/Escape/focus, touch activation, hover without width changes, reduced motion and rank updates/public opt-in. New panel geometry spans 320/375/768/1280px in both themes; rank profiles also fit 320/375px. Reviewed Admin screenshots in both themes.

Firefox BiDi: **24/24 focused desktop/mobile theme layouts passed** across Studio, directory, public profile and Admin overview/user cards/modal, at 375 and 1280px. Checked modal initial focus and containment. This is a focused layout review, not the full Chromium interaction suite. Temporary-profile cleanup now uses browser.close; no existing browser profile is targeted.

No live database migration, Owner bootstrap, MySQL privilege/grant check, true database race test or existing-account restart persistence test was executed. Browser/security tests use temporary fixture sessions/uploads and MemoryRepository; SQL mocks assert the real repository's guard order, binding and rollback calls without proving deployed InnoDB behavior. Follow [the manual migration guide](database/MIGRATION_v0.6.2.md) after approval. Safari, screen readers and physical-device performance remain untested.

The source is versioned 0.6.2, with no commit, tag, push, release or deployment. See [ADMINISTRATION.md](ADMINISTRATION.md) and [the implementation report](IMPLEMENTATION_v0.6.2.md) for the full permission matrix, policies, endpoint contracts and file list.


## Community hover repair and staff-name presentation

Reproduced the hover bug before editing in an isolated Chromium fixture: the stretched profile-link pseudo-element measured roughly 372x575px at rest and 117x44px when hover introduced a containing block. Sampling the same pointer position showed the link alternating hover states. The card's own hover translation also moved its bounds. Removed both the stretched overlay and card translation; avatar, name, profile and shared-team links now have explicit, independent hitboxes. Rank controls and biography text no longer sit under a navigation overlay.

Enhanced community spacing, partner sprite framing, team-slot presentation, role labels, action rows, search clearing, skeleton/loading states, retry feedback and stale/aborted response handling. Loading results are inert; long search strings wrap without mobile overflow. Shared staff-name rendering adds gold/rose Owner, violet/blue Administrator and mint/cyan Moderator treatment with bounded pointer-transparent SVG glitter. Motion preferences retain static names/stars, and forced-colour mode uses solid text. Only published profiles expose the backend-derived staffRole enum; permission arrays, revisions, restrictions and private data remain excluded. Demotion/removal of publication removes the label on subsequent API reads. No new migration, real account change or live database write was performed for this repair.

Executed verification:

- 18 targeted community/public-staff tests passed, including batch/parameter binding, role spoof rejection, unpublished staff exclusion, demotion and privacy.
- Full automated suite: 111 passed, one live-MySQL test skipped, one existing founder-image checksum mismatch (113 total). Kept the supplied artwork and historical expectation unchanged.
- Full Chromium regression: 77/77 passed. Added repeated pointer hitbox measurements, independent rank clicks, actual role colour distinctions, ordinary-name exclusion, loading/clear/retry/stale-search behavior, 320/375/768/1280px layouts in both themes, long-query wrapping, keyboard/touch profile navigation and reduced motion. Existing application checks remain intact.
- Firefox: 24/24 layout checks passed, expanded with actual pointer hover over the community card, stable bounds, no biography overlay and trusted Owner-name rendering in mobile/desktop themes. This remains a focused Firefox review, not the entire Chromium interaction suite.

Reviewed screenshots in the temporary dexhaven-community-polish directory; baseline evidence is separately retained in dexhaven-community-hover-before. Tests use fixture accounts/data and temporary profiles, not the live MySQL database. Existing staff setup is reused; restart Express and refresh Community after source updates. See COMMUNITY.md for the new public role-label boundary.

## Profile structure, title treatments and identity layout follow-up

Chromium: **81/81** full regression checks passed with an isolated Express/in-memory repository. Added checks for hero hover/focus glow and stable hitboxes; picture-before-biography structure; eight distinct live title treatments and save/reload; profile/Studio geometry at 320, 390 and 1280px in both themes; section shortcut focus; and separate motto/biography rendering with privacy revocation. Staff role and title share a center line. Existing avatar cropping, authentication, teams, favourites and account isolation checks still pass. Firefox: **24/24** desktop/mobile theme layout checks passed. Its biography-hover fixture now explicitly shares a real biography rather than relying on the removed placeholder.

Automated tests: **112 passed, one skipped live-MySQL check, one existing founder-art checksum failure**. The title constraint expansion and fresh-schema checks are covered, including specific upgrade guidance for an older CHECK. No real MySQL migration was executed; live database persistence after that manual upgrade remains unverified. The checksum assertion and artwork were left intact.

## Dexhaven v0.7.0 - Community Forums & Battle Arena

`npm.cmd test`: **131 passed, one skipped live-MySQL integration test, one existing
founder-image checksum failure**. All **19 new forum/battle tests** passed.
Existing assertions and custom artwork were preserved. The aggregate command
therefore still exits nonzero and is not described as a completely green release.

Chromium full regression: **89/89 passed**. New scenarios cover registration,
posting/XSS-safe text, Pokemon references, title editing, quote/reply/edit,
reactions/follows, public-team revocation, notifications/read state, staff reports,
hiding/locking/category configuration, selector/level/moveset changes, manual and
auto battles, restart/pause/speed, forum summary drafts, reduced motion, keyboard
focus, 320/390/1280px geometry, both themes and loading/error retry. A focused
follow-up also verified lazy name suggestions, author removal via confirmation
and the final mobile header/selector styling with scrollbar-aware width checks.
Firefox: **37/37 passed**, with new list/discussion/Arena layouts at 375/1280px in
both themes, plus manual/auto controls and existing Studio/directory/profile/admin
coverage. Screenshots were reviewed from OS temporary review folders.

Security/storage fixtures cover ownership, restrictions, fresh staff permissions,
hierarchy, CSRF, optimistic edit conflicts, soft removal/retained restoration,
transactional audit failure, private-team revocation, safe quotes, notification
isolation/deduplication, pagination/deep links, literal search, reaction/follow
uniqueness and write rate limiting. Battle tests check all 649 species at levels
1/100, historical values/types, integer stat/damage examples, criticals, accuracy,
PP, stage/status effects, priority/ties, immunities, knockouts, Struggle, AI,
seeded reproducibility and stale timer cancellation.

The forum migration is prepared only. Tests use in-memory repositories and mocked
SQL contracts, not the real MySQL schema. Live import, actual MySQL constraints/
concurrency, backup recovery and restart persistence require the manual checklist
in [MIGRATION_v0.7.0.md](database/MIGRATION_v0.7.0.md). Browser artwork and external
API calls use fixtures, so upstream sprite/network availability is not established.
The battle rules are intentionally simplified; unsupported moves are explicitly
disabled and cartridge-perfect behavior is not claimed.


## Dexhaven v0.7.1 Community, Battles & Profile Customization

Automated `npm.cmd test`: **148 tests; 146 passed, one skipped live-MySQL test,
one pre-existing founder-art checksum failure**. The user-supplied artwork and
original checksum assertion are preserved. See the exact hashes in
[the implementation report](IMPLEMENTATION_v0.7.1.md#16-automated-test-results).
Fifteen added tests cover settings/privacy/birthdays, biography safety, image
processing/revocation, credentials and other-session revocation, social ownership,
notifications, discovery, layout cycles, polls, awards, replay reconstruction,
qualification, owner isolation and schema/backward-compatible SQL contracts.

Full Chromium: **97/97 browser checks passed** with fixture data. Eight new groups
exercise actual settings registration/editing, cropped avatar/banner file input,
limited biography/public privacy, Staff keyboard/pointer/touch previews, persisted
collapses, poll creation/voting, bookmarks/follow/block/unblock, save/import and
history/replay with random generation disabled, drafts on save failure, reduced
motion and both themes at 320/768/1280 px. Existing 89 checks preserve earlier
Pokédex/analytics/profile/team/Admin/forum/local-battle regressions. Follow-up
focused checks also exercise the Arena's new community navigation links.

Firefox: **55/55 checks passed**, extending the earlier 37 checks with settings,
privacy, Staff and exact replay at 375/1280 px in dark/light themes, keyboard
preview activation/dismissal and replay with RNG disabled. Headless Firefox can
keep a document unfocused despite `.focus()`; BiDi keyboard input validates the
explicit Arrow Down activation rather than assuming the OS focus state.

Screenshots: `%TEMP%\dexhaven-v071-review` (new Chromium pages),
`%TEMP%\dexhaven-v061-firefox` (existing Firefox output folder with expanded checks).
Browser sessions, fixture accounts and upload directories are temporary. No live
MySQL, production users or existing uploaded images are used. Responsive emulator
and synthetic pointer/file-input checks are not physical-device validation.

Not executed: manual MySQL upgrade, real constraint/concurrency checks, live DB
restart persistence, actual outbound email, physical mobile and screen-reader
validation. Complete [the migration checklist](database/MIGRATION_v0.7.1.md) before
publishing. No migration, deployment, Git push or release was performed.


### Avatar settings dropdown and Battle Arena portrait follow-up

Removed Settings from every main navigation bar. The logged-in avatar now opens
shared Trainer profile, Profile customization, Password & Security, Privacy and
Preferences links. Verified toggle, outside-click and Escape dismissal, focus
return, arrow-key navigation, section destinations and 320/768/1280 px bounds in
both themes. Existing profile-navigation checks now follow the dropdown shortcut.

Used the confirmed `images/prof_nicklas.png` on the Battle Arena introduction,
beside the heading on desktop and below on mobile, with entrance animation and
soft edge masking. Added only that exact image to Express's public asset routes.
Verified actual image loading, placement, viewport bounds and reduced motion.

Full Chromium regression at the shared-header stage: **98/98 passed**. Final
focused v0.7.1 run, including the added portrait case: **10/10 passed**. Light and
dark portrait screenshots were reviewed; original image files were not modified.
No database migration or release action was performed for these UI changes.


### Arena enhancement and forum Patrick portrait

Enhanced Arena hierarchy, contender cards, stat bars, move search and combined
Type/Category filters, removable equipped-move chips, readiness validation,
controls, colour-coded capitalized type/category labels, HUDs and battle log.
Stored battle keys and mechanics are unchanged. Raw lowercase data keys previously
bypassed the display formatter; the UI now uses the shared name formatter and
shared type palette. Selected mode contrast and mobile HUD separation were checked.

Forums now places the original transparent `images/patrick.png` between the intro
copy and discussion actions. Both pages use a shared `.intro-portrait` class for
bottom-only masking, one alpha-shaped shadow, entrance animation and reduced motion.
No Patrick raster editing was needed. The live server was reloaded; both portrait
URLs, Forums HTML and updated battle JavaScript return HTTP 200.

Latest focused Chromium checks: **11/11** forum/Arena groups, including new move
filters, capitalization, four-move limits, invalid-level recovery, HUD separation,
Patrick placement, image loading, themes, motion reduction and discussion access.
Existing manual/auto battle, forum moderation, quoting, notifications and loading
recovery checks also pass. A pre-existing wait-expression race during an empty
forum rerender was corrected with optional chaining; the required final assertion
was retained, and the rerun passed. Saved simulation/settings/replay checks:
**10/10**. Firefox Arena regression: **55/55**, run before extracting the unchanged
portrait effect into the shared class for Forums.

Reviewed desktop setup/control screenshots and mobile battlefield/Patrick layouts.
No SQL, battle-engine, package version, deployment or release changes were made.
