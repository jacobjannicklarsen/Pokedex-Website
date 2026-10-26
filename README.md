# Kanto Pokédex

Responsive original-151 Pokédex with a vanilla HTML/CSS/JavaScript frontend and a Node.js/Express/MySQL backend. Includes trainer accounts, profiles, image uploads, multiple six-member teams, and favourites. No frontend framework or frontend build step.

## Run locally

Follow [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for the exact Windows/VS Code/MySQL steps. The ignored `.env` in this workspace already has a generated session secret; enter your actual MySQL username and password and import [database/schema.sql](database/schema.sql) before starting.

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
- `server/index.js`, `server/app.js`: startup, Express routes, security middleware and explicitly allowlisted frontend assets.
- `server/repository.js`, `server/session-store.js`: parameterized mysql2 queries, team transactions and persistent sessions.
- `server/config.js`, `server/validation.js`: environment configuration and server-side validation.
- `database/schema.sql`, `server/setup-db.js`: opt-in setup scoped to `pokedex_app` only. Normal startup does not alter the schema.
- `.env.example`, `.gitignore`: secret-free template and exclusions for real credentials/uploads/dependencies.
- `tests/`: frontend logic, theme, backend/API, optional real MySQL integration, and headless Chrome workflows.

See [server/API.md](server/API.md) for routes, bodies and status codes. The UI exposes `/profile`, `/teams` and `/favorites` as dedicated views with browser history and direct reload support. Authenticated data is stored in MySQL; PokéAPI data/theme preferences continue to use the existing browser cache.

Accounts use Argon2id passwords, HTTP-only SameSite session cookies, login session rotation, CSRF tokens, and private-data ownership checks. Production enables Secure cookies and requires HTTPS. Uploads are size/type/pixel-validated and converted to random-named WebP files outside the static source allowlist.

## How it works

### Light and dark themes

Use the sun/moon button beside “Kanto region.” The icon and accessible label describe the theme you can switch to. The original dark palette is preserved; light mode uses soft green-white surfaces, dark green text, and mint accents.

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

- Six concurrent PokéAPI requests maximum, with progressively rendered cards.
- Compact individual records cached in localStorage for seven days. Blocked or full storage does not prevent use.
- Search by partial name or exact number (`25`, `025`, `#025`), combined with type filters and sorting.
- Details reuse loaded data: no extra requests on click. Height and weight are converted to meters and kilograms.
- Requests time out after 12 seconds; retry fetches only missing records.
- Six consecutive failures stop the remaining request queue, so a sustained outage does not trigger 151 requests. Retry resumes all missing records.
- Artwork falls back to a sprite, then a local SVG placeholder.
- Native dialog supports keyboard navigation, Escape, and focus restoration.

## Manual checks

Automated checks after installing dependencies (Node.js 22+):

```sh
npm.cmd test
npm.cmd run test:browser
```

Frontend logic tests use a minimal DOM stand-in; backend tests exercise real Express, Argon2 and Sharp with an isolated in-memory test repository/session store. The browser suite launches real headless Chrome against Express and tests full trainer workflows, themes, keyboard controls and responsive geometry. It uses deterministic PokéAPI fixtures and an in-memory test repository; production uses MySQL exclusively. The suite defaults to Chrome's standard Windows location; set `CHROME_PATH` for another Chromium executable.

The optional `mysql.integration.test.cjs` is skipped unless `RUN_MYSQL_TESTS=1` is explicitly set after database setup. These checks do not verify the live PokéAPI service, real screen-reader output, or real mobile touch/zoom behavior. See [QA_REPORT.md](QA_REPORT.md) for verified results and remaining checks.

1. Wait for 151 cards; verify Bulbasaur (#001) and Mew (#151).
2. Search `pika`, `25`, and `#025` to find Pikachu. Search `not-a-pokemon` for the empty state.
3. Combine search with Electric and Grass filters. Reset filters and check sorting.
4. Open Bulbasaur: height 0.7 m, weight 6.9 kg; stats 45, 49, 49, 65, 65, 45 (total 318). Check Grass/Poison and hidden ability label.
5. Use Tab and Enter, close details with Escape, and confirm focus returns to the card. Press `/` to focus search.
6. Check desktop and 375px mobile widths, including dialog scrolling.
7. Reload to check caching. To test a first-load failure, clear site storage in developer tools, enable Offline, and reload. Disable Offline and select Try again.
8. Block artwork requests in developer tools to check image fallbacks.
9. On an actual phone, check touch interactions, opening the keyboard, zoom, orientation changes, and scrolling the modal. Check Safari and Firefox separately.
10. With a screen reader, verify announcements, type names, modal navigation, and focus restoration.

Data and artwork: https://pokeapi.co/. Unofficial fan project; Pokémon belongs to Nintendo / Game Freak.
