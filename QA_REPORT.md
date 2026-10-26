# Pokédex QA review

This report records successive project stages. The **Full-stack implementation** section at the end describes the current architecture and latest verification; earlier sections document previous reviews.

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
