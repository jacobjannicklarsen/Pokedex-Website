# Dexhaven v0.7.1 manual migration

This upgrade has **not been executed**. Fixture tests do not establish that your
MySQL installation has been migrated. Preserve the development project name
**Pokédex Website**, public name **Dexhaven** and database **pokedex_app**.

## Before applying

1. Back up `pokedex_app`, `.env` and the complete configured avatar/upload directory
   (banners use that same private directory). Verify that the backup can be restored.
2. Complete all earlier migrations, including the single-biography, title-style,
   v0.6.1, v0.6.2 and [v0.7.0](MIGRATION_v0.7.0.md) upgrades. Use MySQL 8.0.16+
   with enforced CHECK constraints; MariaDB is not a validated substitute.
3. Stop Express while applying the upgrade. Use an administrative MySQL connection
   in Workbench; the application runtime account should retain CRUD privileges only.
4. Review [the SQL](migrations/v0.7.1-community-settings-battles.sql), then execute
   that file manually against `pokedex_app`. Do not rerun `db:setup` on an existing
   installation and do not recreate tables or clear data.

MySQL DDL commits implicitly. This is **not an all-or-nothing migration**. CREATEs
are guarded, but the ALTERs deliberately fail if already applied. If interrupted,
inspect `SHOW CREATE TABLE users`, `SHOW CREATE TABLE user_notifications` and each
new table before completing only the missing statements. Do not blindly rerun the
whole file. Publish `enhancement_state` readiness only after every statement has
succeeded. Do not insert the marker to hide a partial migration failure.

## Schema changes

Eleven new tables: `user_settings`, `trainer_follows`, `trainer_blocks`,
`forum_bookmarks`, `forum_reads`, `forum_category_layout`, `forum_polls`,
`forum_poll_options`, `forum_poll_votes`, `battle_runs`, `enhancement_state`.

`users.bio_format` defaults to `plain`, preserving all existing biography text.
`user_notifications.thread_id` becomes nullable, `actor_id` is added with an
ON DELETE SET NULL foreign key, and the kind constraint gains watched/follower/
announcement events. Existing IDs, read states and notifications are retained.

Follows, blocks, bookmarks and votes have owner-scoped unique constraints. Poll
votes also have a composite foreign key tying the option to its poll. Battle
digests are unique per owner, including removed history records. Category layout
is seeded from existing categories without moving any discussions.

No existing account, team, favourite, uploaded picture, staff assignment, caught
record, rank threshold or achievement timestamp is reset. Missing settings rows
use private personal-field defaults; nothing becomes public automatically.

## After applying

Restart Express with the existing `SESSION_SECRET`. Check settings and staff pages
for migration errors, then verify two accounts independently:

- Edit a biography; upload/crop/remove an avatar and 3:1 banner. Refresh and restart
  Express to verify persistence and old-file cleanup.
- Publish selected fields only. Inspect guest public-profile and member responses:
  Hidden birthday exposes no date/age; day/month exposes no birth year or age.
  Revoke publication and verify old banner URLs return 404.
- Change a password or revoke other sessions; verify a second logged-in browser
  loses access and the current browser retains access with a rotated session.
- Follow/block/unblock, bookmark, mark forums read, create/vote/close a poll and
  configure one-level subforums as authorized staff. Confirm duplicate votes fail.
- Save local and prepared simulations; replay stored frames, refresh and restart
  Express, and verify another account cannot read/remove those records.
- Recheck teams, favourites, tracking, analytics, administration and both themes.

The automated suites use an isolated in-memory repository. A live MySQL import,
restart persistence, actual DB constraints/concurrency and backup restoration
remain manual release gates. Keep the migration backup until these checks pass.

If an application rollback is needed, stop the new server and restore a matched
database/files backup. Older code does not understand every new notification kind
or limited-format biography. Do not drop tables to simulate a rollback.
