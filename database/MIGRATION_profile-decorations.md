# Manual profile decorations migration

Prepared only. **No migration or live database verification was executed.** Existing v0.6.0 accounts, privacy settings, uploaded pictures, teams, collection and awards are preserved. This optional additive upgrade creates one `trainer_decorations` table; it does not modify old tables or publish profiles.

1. Stop Express, back up `pokedex_app` with Workbench Data Export, and preserve `.env` and uploads separately. MySQL DDL does not roll back through an ordinary transaction rollback.
2. Connect to the intended MySQL 8.0.16+ development server. Run `USE pokedex_app; SELECT DATABASE(); SHOW TABLES;`. Record counts for users, teams, favourites, user_pokedex and user_achievements. Existing installations must already have the v0.5.0 and v0.6.0 tables.
3. If `trainer_decorations` already exists, inspect `SHOW CREATE TABLE trainer_decorations;` and compare with the script. `IF NOT EXISTS` does not repair incompatible definitions. Do not drop an existing table.
4. When you approve applying it, open **database/migrations/profile-decorations.sql** in Workbench, review its single CREATE statement scoped to `pokedex_app`, and execute it manually. Fresh installations instead use the updated `database/schema.sql`.
5. Inspect `SHOW CREATE TABLE trainer_decorations;`, repeat original counts and confirm no existing rows changed. The new table should initially have zero rows. It has a user primary/foreign key, disabled motion by default, bounded curated style values and a JSON array limited to three pinned keys. Express additionally validates that every pinned key was earned by the authenticated owner; SQL alone cannot prove achievement ownership.
6. Restart Express. In the private Profile view, open **Trainer card studio**, preview choices, save and refresh. Confirm a second account has independent settings. Public styling appears only on enabled public profiles; pinned badges additionally require achievement sharing. Test private/public previews, both themes, mobile and reduced-motion mode.

Before this migration, decoration reads return safe defaults so existing public profiles keep working. Saving returns an explicit migration message; unsaved previews remain available. Do not remove tables to revert UI changes. Default public visibility remains controlled by the existing community settings.

The 88 additional achievement definitions need **no new achievement tables**. They use existing collection/favourite/team data and the existing unique historical awards table. New qualifying awards are reconciled by the existing authenticated progression flow; original unlock keys and dates are retained. No new unlock dates are invented for past activity that was never recorded.
