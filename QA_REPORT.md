# Pokédex QA review

This report records successive project stages. The **Dexhaven v0.2.0 expansion** section at the end describes the current version and latest verification; earlier sections document previous reviews.

Reviewed search, filtering, sorting, details, loading, API failures, cache behavior, accessibility, keyboard interaction, and responsive geometry. The design and existing features are preserved; no dependencies were added.

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
