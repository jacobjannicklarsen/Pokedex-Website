# Manual v0.1.0 → v0.2.0 database upgrade

The project is **Pokédex Website**, the website is **Dexhaven**, and the database stays **pokedex_app**. This upgrade only widens two Pokémon-ID CHECK constraints. It does not rename/recreate tables, change users/passwords/profile pictures/sessions, delete records, or relax team-slot/duplicate/ownership constraints.

**The migration is not run by server startup, `db:setup`, npm tests, or frontend loading. Run it manually only after reviewing your existing schema.**

1. Stop the application while applying the migration so v0.1.0 and v0.2.0 cannot write concurrently. In Workbench connect to the intended MySQL 8.0.16+ server using an account permitted to ALTER these two tables.
2. Back up `pokedex_app` using **Server → Data Export**, choosing the `pokedex_app` schema and **Export to Self-Contained File**. Keep the backup outside the public repository. Preserve your `uploads/avatars` folder as well.
3. In a new SQL tab, inspect the existing database and record row counts:

```sql
USE pokedex_app;
SHOW CREATE TABLE team_pokemon;
SHOW CREATE TABLE favorites;
SELECT 'users' AS entity, COUNT(*) AS total FROM users
UNION ALL SELECT 'teams', COUNT(*) FROM teams
UNION ALL SELECT 'team_pokemon', COUNT(*) FROM team_pokemon
UNION ALL SELECT 'favorites', COUNT(*) FROM favorites;
```

4. Confirm the old CHECK names are `ck_team_pokemon` and `ck_favorite_pokemon`, each requiring IDs 1–151. If the names differ, reconcile your schema before running this script; do not drop unrelated constraints. If `_v020` constraints already exist and allow 1–649, the migration is already applied.
5. Choose **File → Open SQL Script**, open `database/migrations/v0.2.0-national-pokedex.sql`, review it, and execute it once. Its exact migration is:

```sql
USE pokedex_app;

ALTER TABLE team_pokemon
  DROP CHECK ck_team_pokemon,
  ADD CONSTRAINT ck_team_pokemon_v020 CHECK (pokemon_id BETWEEN 1 AND 649);

ALTER TABLE favorites
  DROP CHECK ck_favorite_pokemon,
  ADD CONSTRAINT ck_favorite_pokemon_v020 CHECK (pokemon_id BETWEEN 1 AND 649);
```

Each ALTER replaces its table's CHECK atomically. MySQL DDL commits per statement; the two ALTER statements are **not one rollback-able transaction**. If the second fails, inspect both tables and execute only the remaining statement after resolving its error. Do not blindly repeat the complete script.

6. Repeat SHOW CREATE TABLE and the row-count query. Verify `_v020` CHECKs allow 1–649 and all row counts are unchanged. The existing slot CHECK (1–6), unique `(team_id,pokemon_id)`, primary keys and foreign keys must still be present.
7. Start the v0.2.0 app with your unchanged `.env`, MySQL account and upload directory:

```powershell
npm.cmd start
```

8. Log in with an existing account. Check its avatar/bio, teams and favourites. Add Genesect (#649), save and reload. The API and database must reject #650. Remove any test favourites/teams you created when finished.

To run the opt-in real database test after the manual migration:

```powershell
$env:RUN_MYSQL_TESTS = '1'
node --test tests/mysql.integration.test.cjs
Remove-Item Env:RUN_MYSQL_TESTS
```

That test creates uniquely named test users inside the configured development database and cleans up only its own rows/session. It does **not** run this migration. Keep backups and avoid running tests against production.

For a **new** installation use `database/schema.sql`, which already creates the expanded constraints. Do not apply the old-schema migration to a new v0.2.0 schema, and do not re-import the schema as a substitute for migrating existing CHECKs (`CREATE TABLE IF NOT EXISTS` does not alter them).

This manual migration was reviewed and tested structurally; it has not been executed against your database. MySQL reference: [ALTER TABLE](https://dev.mysql.com/doc/refman/8.4/en/alter-table.html).
