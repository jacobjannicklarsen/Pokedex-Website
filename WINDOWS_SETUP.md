# Windows / VS Code setup

**v0.6.2 upgrade:** review [database/MIGRATION_v0.6.2.md](database/MIGRATION_v0.6.2.md) for backup, Workbench execution, validation, recovery and explicit existing-ID Owner bootstrap. No staff migration or Owner assignment has been run. Existing accounts remain Trainers, with ranks calculated from existing Caught records. See [ADMINISTRATION.md](ADMINISTRATION.md) for the permission matrix and suspension policy.

**v0.6.1:** review the separate [Trainer Card Studio migration](database/MIGRATION_v0.6.1.md) for existing decoration tables. It is prepared only and must be approved before application. Fresh installs use the updated schema. Sprite images require access to the public PokéAPI sprite host and fall back to a local placeholder.

Biography now has one editor and an explicit **Show biography publicly** setting. Existing databases require the [manual single-biography migration](database/MIGRATION_single-biography.md); old public text is archived and sharing starts off. Trainer Hub puts picture editing above Biography and offers All/Caught search sources in each team editor.

The project is **Pokédex Website**; the public website is **Dexhaven v0.6.0**. The database remains `pokedex_app`. Existing `.env`, uploads and database records are preserved by this upgrade.

**Upgrading from v0.5.0:** review [database/MIGRATION_v0.6.0.md](database/MIGRATION_v0.6.0.md) and manually apply its two additive community settings tables when approved. Existing accounts/teams remain private; no migration, settings backfill or publication occurs automatically. Older upgrades must first follow their earlier migration guides, then this v0.6.0 guide. Open `/community.html` for opt-in trainers and use Profile/My Teams in the private hub for sharing controls. See [COMMUNITY.md](COMMUNITY.md) for APIs, privacy, calculations and two-account manual verification.

**Upgrading an existing v0.1.0 installation:** follow [database/MIGRATION_v0.2.0.md](database/MIGRATION_v0.2.0.md) first. Do not recreate the database or replace your environment file. No migration is executed automatically. The steps below describe new installations and normal startup/testing.

**Upgrading from v0.2.0–v0.4.0:** v0.5.0 requires two new collection/achievement tables. Preserve your `.env`, database, sessions and uploads; review [database/MIGRATION_v0.5.0.md](database/MIGRATION_v0.5.0.md) and apply its additive SQL manually in MySQL Workbench when approved. Do not recreate the database. No migration is executed automatically. Restart Express after updating files/migrating, then test all four pages and the hub's Progress/Achievements sections. See [PROGRESSION.md](PROGRESSION.md) for API/storage and manual tests.

For the encyclopedia, open http://localhost:3000/pokemon.html?pokemon=1 and test all six detail sections. The new scripts must be present for static previews too. See [ENCYCLOPEDIA.md](ENCYCLOPEDIA.md) for game/ruleset scope, cache expiry and testing. The encyclopedia itself adds no database requirements; personal progression requires the separate manual v0.5.0 migration.

## 1. Prerequisites

1. Use Node.js 22 or later. In VS Code choose **Terminal → New Terminal → PowerShell** and verify `node --version` and `npm.cmd --version`.
2. Use an existing compatible MySQL server, or install **MySQL Community Server 8.4** using its Windows MSI. Run the bundled **MySQL Configurator**, configure a local server and Windows service, and choose your own administrator password. Do not reinstall or reconfigure an existing server unnecessarily. Follow the [official Windows installation guide](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html).
3. Start the configured MySQL service using Windows **Services** (`services.msc`). Its name depends on your installation; do not assume a specific service name.
4. Use MySQL Workbench or the `mysql.exe` command-line client. Workbench is optional and installed separately. This schema requires MySQL 8.0.16+ with enforced CHECK constraints; MariaDB/XAMPP are not the verified target.

## 2. Create only the separate database

Recommended with Workbench:

1. Connect to your local MySQL server using an administrator account you control.
2. Run `SHOW DATABASES LIKE 'pokedex_app';`. If that name is already used for unrelated data, inspect it and resolve the conflict before proceeding. Never drop an existing database for this setup.
3. Choose **File → Open SQL Script** and open `E:\EK - IT-Arkitektur\Pokedex Website\database\schema.sql`.
4. Execute the whole script. It selects only `pokedex_app` and creates its missing tables: `users`, `teams`, `team_pokemon`, `favorites`, `sessions`, `user_pokedex`, `user_achievements`, `trainer_public_settings`, `team_sharing`, `trainer_decorations`. It contains no DROP statements or data replacement. Existing tables are not migrated automatically. Existing v0.6.0 installations can enable saved trainer-card cosmetics with the separate reviewed [manual decoration migration](database/MIGRATION_profile-decorations.md).
5. Verify:

```sql
USE pokedex_app;
SHOW TABLES;
```

Command-line alternative (adjust the executable path and administrator username to your installation):

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -h 127.0.0.1 -P 3306 -u YOUR_ADMIN_USERNAME -p
```

At the `mysql>` prompt:

```sql
SOURCE E:/EK - IT-Arkitektur/Pokedex Website/database/schema.sql;
```

Use the prompt or Workbench to create a **new dedicated application account**, choosing your own username and password. Replace every placeholder before executing; these are not supplied credentials:

```sql
CREATE USER 'YOUR_CHOSEN_APP_USERNAME'@'localhost'
  IDENTIFIED BY 'YOUR_CHOSEN_APP_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON pokedex_app.*
  TO 'YOUR_CHOSEN_APP_USERNAME'@'localhost';
```

Do not overwrite or alter an existing MySQL account. The runtime user needs only these CRUD privileges on `pokedex_app.*`, not administrator or schema-creation privileges. The local hostname/account host must match your MySQL installation's account rules.

Optional setup alternative: `npm.cmd run db:setup` executes the same fixed SQL script using `.env`. It needs an explicitly configured account with database/table creation privileges, so use it only if you intentionally grant that setup access. Normal `npm.cmd start` never creates databases or tables.

## 3. Configure the ignored environment file

Open this project in VS Code and run:

```powershell
Set-Location -LiteralPath 'E:\EK - IT-Arkitektur\Pokedex Website'
if (!(Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Edit `.env` in VS Code. Keep the generated `SESSION_SECRET`; enter your actual database account details:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=http://localhost:3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=pokedex_app
DB_USER=YOUR_CHOSEN_APP_USERNAME
DB_PASSWORD="YOUR_CHOSEN_APP_PASSWORD"
SESSION_SECRET=KEEP_THE_EXISTING_GENERATED_SECRET
TRUST_PROXY=false
```

The uppercase values above describe what to enter; do not paste them literally. Quote a password containing `#` or spaces. If you copied `.env.example` into a fresh checkout and the secret is blank, generate a random value with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Paste that value into `SESSION_SECRET`. Keep it stable across restarts so saved sessions remain valid. `.env`, uploads, installed packages, and local npm cache are excluded by `.gitignore`; never put credentials in source files or `.env.example`.

## 4. Install and start Express

```powershell
npm.cmd ci
npm.cmd start
```

Open **http://localhost:3000** in your browser. Keep the terminal running. Use **Ctrl+C** to stop. For restart-on-edit development use `npm.cmd run dev` instead of `npm.cmd start`.

Use the same hostname/port as `APP_ORIGIN`; `http://127.0.0.1:3000` has a different origin from `http://localhost:3000`. Do not use Live Server or Python's HTTP server for account features: frontend and API need the same Express origin.

If PowerShell blocks `npm.ps1`, continue using **npm.cmd** as shown; no execution-policy changes are needed. On a machine that needs to build native Argon2/Sharp binaries, follow the packages' installation requirements. Installed native binaries were successfully exercised in this workspace.

## 5. Test the application

1. Click **Register** in the logged-out navigation (or **Log in → New here? Create an account**). Register a username (3–24 letters/numbers/underscores), email, and password (12–128 characters). Confirm trainer links appear only after login and return after a session-restoring refresh; they must disappear on logout.
2. Search and filter the Pokédex; toggle light/dark mode. Open a Pokémon's details and check its measurements, abilities and stats.
3. Tap hearts on a card and in details. Open **My Favourites**, remove one, and reload to verify persistence.
4. Open **My Teams**, create two named teams, and search each slot by name or number. Select with a click or Arrow Up/Down and Enter; Escape cancels and Tab leaves without changing the member. Choose up to six distinct Pokémon from #001–649 and save. Replace a member by searching again; use **Remove** to leave a slot empty. Try a duplicate: it must be unavailable in other slots of that team. Save and reload to confirm persistence. You can also add from a detail view using **Add to a team**. #649 is valid; #650 must be rejected by the API/database.
5. Open **Trainer Profile**, save a bio, and upload a JPEG/PNG/WebP. Try an invalid file or a file over 2 MB: it must be rejected. The profile also displays your saved teams and favourites.
6. Log out and log back in. Restart Express and verify that the MySQL-backed session, teams, favourites, bio and avatar persist. Keep `SESSION_SECRET` unchanged.
7. Create a second account and verify that its private teams/favourites are separate.
8. Test narrow screens and Tab/Enter/Space/Escape navigation. Use browser developer tools to check the session cookie: HTTP-only, SameSite=Lax, and a seven-day rolling expiration.

Run automated tests from a second terminal:

```powershell
npm.cmd test
npm.cmd run test:browser
```

The browser suite expects installed Chrome at its standard Windows path. For another Chromium installation:

```powershell
$env:CHROME_PATH = 'C:\your\actual\path\chrome.exe'
npm.cmd run test:browser
Remove-Item Env:CHROME_PATH
```

After your real MySQL configuration works, explicitly run the live database integration test:

```powershell
$env:RUN_MYSQL_TESTS = '1'
node --test tests/mysql.integration.test.cjs
Remove-Item Env:RUN_MYSQL_TESTS
```

This test creates random `qa_...` users inside `pokedex_app`, verifies constraints/transactions and session storage, then deletes only its own test users and session. Related team/favourite rows cascade. It does not create the schema or truncate tables. Run it against a development database; if forcibly interrupted, its generated test rows may require cleanup.

## Troubleshooting and deployment

- **Missing DB_USER:** enter actual credentials; blank credentials deliberately stop startup.
- **ECONNREFUSED:** start the correct MySQL service and check DB_HOST/DB_PORT.
- **ER_ACCESS_DENIED_ERROR:** check the account's password, allowed host, and privileges.
- **ER_BAD_DB_ERROR / missing tables:** import `database/schema.sql` into the intended local server.
- **Port in use:** stop the other listener or change both PORT and APP_ORIGIN.
- **403 on writes:** use the exact configured origin; refresh to renew the session/CSRF token.
- **Pokémon data unavailable:** the PokéAPI/artwork network connection is separate from MySQL. Existing loading, cache and retry behavior is preserved.
- **Production:** use HTTPS, `NODE_ENV=production`, an HTTPS APP_ORIGIN and a strong secret. Cookies become Secure automatically; local HTTP development intentionally uses non-Secure cookies. If using exactly one trusted HTTPS reverse proxy, configure TRUST_PROXY=true and bind the app so clients cannot bypass that proxy. Persist/back up both MySQL and `uploads/avatars`. The built-in rate limiter is per process; multiple production instances need a shared limiter and shared upload storage.

Password reset and email verification are outside this implementation's requested scope. Registration/login/logout and private trainer data are implemented.

## v0.7.0 local testing

Restart Express with `npm.cmd start`, then open `http://localhost:3000/forums.html`
and `http://localhost:3000/battle.html`. The Arena runs locally without new SQL.
Forums show a readable upgrade message until the reviewed [manual forum migration](database/MIGRATION_v0.7.0.md)
has been approved and applied in Workbench. Existing staff overrides may need
Owner review for the new forum capabilities; no accounts/permissions are rewritten
automatically. Test MySQL persistence and privacy revocation before publishing.
`npm.cmd run data:battle` is an explicit developer-only rebuild of the pinned
public battle snapshot, not a database migration or normal startup step.
