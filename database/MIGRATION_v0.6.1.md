# Dexhaven v0.6.1: Trainer Card Studio

This migration is prepared for manual review. It has not been applied. Approval
is required before applying it. Use MySQL 8.0.16 or newer and back up
`pokedex_app` first; do not recreate an existing database.

The existing `trainer_decorations` table has fixed checks on its options and no
fields for custom colours or border/title treatments. The upgrade adds three
nullable six-digit hex colours and two defaulted style fields, and widens the
four existing option checks. Old values remain valid. No rows, avatar files,
accounts, teams, progress, badges, biographies or visibility settings change.

1. Complete earlier migrations, including
   [profile decorations](MIGRATION_profile-decorations.md) and, independently,
   [single Biography](MIGRATION_single-biography.md), if needed.
2. Back up the database, including existing decoration rows.
3. Review `migrations/v0.6.1-trainer-studio.sql` in MySQL Workbench. It uses one
   ALTER on `pokedex_app.trainer_decorations`; the DROP CHECK clauses replace
   option constraints and do not drop columns or data.
4. After explicit approval, execute the script once. MySQL DDL commits itself;
   do not treat wrapping it in a transaction as an undo strategy.
5. Inspect `SHOW CREATE TABLE pokedex_app.trainer_decorations;`, restart Express
   and check an old saved card, new presets and custom colours. Save, refresh,
   log out/in and view the card publicly. Test privacy with another account.

Fresh databases use `schema.sql` directly and must not run this ALTER again.
Before migration, old card reads retain existing settings with default values
for new fields. Saving expanded settings reports the migration requirement; the
UI never claims success for a failed save. New-install/schema composition and
SQL binding are tested without modifying a real database.

The sprite system uses public image URLs and a checked-in availability manifest;
it needs no database fields, trainer-specific species or additional Pokémon API
calls. Shiny images are used only if an existing record explicitly identifies
the same Pokémon as shiny. Current teams store species IDs, so they stay normal.
