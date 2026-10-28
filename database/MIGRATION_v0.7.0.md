# Dexhaven v0.7.0 manual forum upgrade

**Prepared, not executed. Normal startup never migrates MySQL.** The Battle Arena
uses a local JSON snapshot and requires no new database tables.

## Before execution

1. Confirm the intended MySQL server, database `pokedex_app`, and MySQL 8.0.16+
   (enforced CHECK constraints). Schedule a short maintenance window for forum setup.
2. Export a consistent backup of `pokedex_app` using MySQL Workbench **Server →
   Data Export**, including structure and data, routines and triggers if present.
   Keep it outside the web root/repository and verify that it can be restored.
3. Check the existing migration history: original trainer/session schema, v0.5.0
   progression, v0.6.0 sharing, and the complete v0.6.2 administration migration
   must already exist. The optional single-biography and title-style upgrades
   remain separate; this migration does not apply them or change their settings.
4. Confirm `SELECT schema_version FROM pokedex_app.admin_state WHERE id = 1;`
   returns `1`. Missing administration fails forum participation closed; it does
   not turn an ordinary Trainer into staff.

## Execute manually in Workbench

Open [v0.7.0-community-forums.sql](migrations/v0.7.0-community-forums.sql), review
every statement, verify the selected connection, and execute the file only when
you approve the change. Do not run `db:setup` over an existing installation to
substitute for reviewing incremental migrations.

The file creates nine InnoDB tables: categories, threads, posts, reactions,
reports, subscriptions, notifications, forum audit logs and a readiness marker.
It seeds six default categories and publishes the marker last. It changes no
existing accounts, sessions, staff assignments, teams, achievements or private
profile records. No battle history/ratings tables are created.

Fresh installations use `schema.sql`, which already includes these definitions.
`CREATE TABLE IF NOT EXISTS`/`INSERT IGNORE` allow resuming an interrupted initial
setup; they do **not** repair an incompatible pre-existing table definition.

## Verify

```sql
USE pokedex_app;
SELECT VERSION(), DATABASE();
SELECT schema_version FROM admin_state WHERE id = 1;
SELECT schema_version FROM forum_state WHERE id = 1;
SELECT id, name, announcements, active, position
FROM forum_categories ORDER BY position, id;
SHOW CREATE TABLE forum_posts;
SHOW CREATE TABLE forum_reactions;
SHOW CREATE TABLE user_notifications;
SHOW CREATE TABLE forum_audit_logs;
```

Both versions should be `1`; a new forum should have the six documented default
categories. Inspect foreign keys, `(post_id,user_id)`/`(thread_id,user_id)` unique
keys, notification event uniqueness, visibility checks and pagination indexes.
Restart Express, visit `/forums.html`, and test a normal Trainer and authorized
staff account. Check posting, refresh persistence, report resolution, retained
content restoration, unread counts and public-team revocation on this actual
MySQL installation before publishing.

New code capabilities are `forums.moderate` (Moderator/Administrator/Owner) and
`forums.configure` (Administrator/Owner). Existing explicit permission overrides
stay unchanged and do not acquire these capabilities automatically. The Owner
can review grants in the existing permission editor. No Owner bootstrap is run
by this migration.

## Failure and recovery

MySQL DDL commits implicitly. A transaction rollback cannot undo this file.
If setup stops, preserve the error and inspect existing definitions before
resuming. If there is no final marker, forums report an actionable 503; existing
trainer features remain separate. Do not create a marker manually to hide a
partial or incompatible schema.

For application rollback, stop forum writes and restore the previous application
code while retaining the new tables. Never drop populated forum/audit tables as
a quick rollback. If a database restore is necessary, restore the verified full
backup to a separate database first, inspect it, and plan the restore explicitly
to avoid losing newer trainer/forum changes.

The fixture tests do not prove a live MySQL import, real transaction concurrency,
backup recovery or restart persistence. None of those live operations ran here.
