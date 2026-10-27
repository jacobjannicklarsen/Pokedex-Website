# Manual v0.4.0 → v0.5.0 trainer progression migration

This additive migration creates **user_pokedex** and **user_achievements** inside the existing **pokedex_app** database. It does not rename/recreate users, teams, team members, favourites or sessions, modify their records, or touch avatar files. No code applies this migration automatically.

Existing installations must already have the v0.2.0+ 1–649 constraints. If upgrading directly from v0.1.0, follow [MIGRATION_v0.2.0.md](MIGRATION_v0.2.0.md) first. New installations can use the updated `schema.sql`; existing installations should review and run this specific migration instead.

## MySQL Workbench steps

1. When you approve applying the migration, stop the local Express process with Ctrl+C. Connect Workbench to the intended MySQL 8.0.16+ server. Keep the existing `.env`, session secret and uploads.
2. Use **Server → Data Export** to back up `pokedex_app` to a self-contained file outside the public repository. Preserve `uploads/avatars` separately. MySQL DDL is not undone by an ordinary transaction rollback; keep a backup before applying schema changes.
3. In a SQL tab, inspect the selected database and existing table names/counts:

```sql
USE pokedex_app;
SELECT DATABASE();
SHOW TABLES;
SELECT 'users' AS entity, COUNT(*) AS total FROM users
UNION ALL SELECT 'teams', COUNT(*) FROM teams
UNION ALL SELECT 'team_pokemon', COUNT(*) FROM team_pokemon
UNION ALL SELECT 'favorites', COUNT(*) FROM favorites
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions;
```

4. If `user_pokedex` or `user_achievements` already exists, inspect `SHOW CREATE TABLE` before proceeding. Do not drop an existing table or unrelated data. `IF NOT EXISTS` makes this migration repeatable, but does not repair a conflicting pre-existing definition.
5. Choose **File → Open SQL Script**, then open `database/migrations/v0.5.0-trainer-progression.sql` from this project. Review that it selects only `pokedex_app` and creates only the two new tables. Execute that script manually.
6. Verify the definitions and integrity, then repeat the original-table counts above:

```sql
USE pokedex_app;
SHOW CREATE TABLE user_pokedex;
SHOW CREATE TABLE user_achievements;
SELECT COUNT(*) AS collection_records FROM user_pokedex;
SELECT COUNT(*) AS achievement_records FROM user_achievements;
SELECT COUNT(*) AS invalid_caught_records
FROM user_pokedex
WHERE caught_at IS NOT NULL AND (seen_at IS NULL OR caught_at < seen_at);
```

`invalid_caught_records` must be zero. A first migration creates empty progression tables; an already migrated installation keeps its existing records. Existing table counts must remain unchanged while the app is stopped.

7. Restart Express with `npm.cmd start`, hard-refresh the browser and sign in. Open `pokemon.html`, mark a Pokémon Seen and then Caught, and refresh. Inspect `trainers.html#view=progress` and `trainers.html#view=achievements`. Check that old teams, favourites and the avatar still work.

## Storage and upgrade behavior

- `(user_id, pokemon_id)` is the collection primary key. IDs are checked to be 1–649, and the user foreign key cascades on account deletion. **Not registered means no row**. `seen_at` is required; a non-null `caught_at` must be at least `seen_at`, so Caught necessarily implies Seen.
- The API writes `seen_at`, `caught_at`, `updated_at` and achievement `unlocked_at` explicitly in UTC with millisecond precision. New Caught rows set both Seen and Caught dates. Caught → Seen clears only `caught_at`; removing a registration deletes that collection row. Repeating an unchanged status preserves dates and does not move it into the recent list again.
- `(user_id, achievement_key)` prevents duplicate awards. Achievement timestamps are permanent historical unlocks and are not revoked when collection records or teams are removed. Only account deletion cascades them away.
- Collection mutations and award reconciliation run in one transaction after locking the authenticated user's row. A dependent failure rolls back both. Full-team awards are inserted within the existing team-save transaction.
- Existing full teams qualify for Team Builder when progression first checks them after migration. The unlock date is when the server first verifies eligibility, not an invented historical team-creation date. Deleted pre-upgrade teams cannot be reconstructed.
- Until the migration is applied, progression endpoints return an actionable **503** and frontend tracking stays unavailable with Retry controls. Existing profile/team/favourite features keep working; saving a six-member team skips only a missing achievements-table error until migration. Other database failures still propagate normally.

The migration has been reviewed by automated definition/constraint checks but **has not been executed against the live database**. Actual MySQL execution and existing-account verification remain manual. Do not delete the new tables to roll back code without first preserving any collected progress and awards.
