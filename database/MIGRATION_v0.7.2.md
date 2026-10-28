# Dexhaven v0.7.2 — manual Shoutbox migration

**Not executed by Codex or server startup.** The real MySQL Shoutbox remains
unavailable until the owner applies this migration. Passing memory-adapter tests
does not establish real MySQL integration.

1. Stop the local Express process with Ctrl+C in its terminal. Keep MySQL running.
2. In MySQL Workbench, connect with an administrative account to the existing
   `pokedex_app` database, on MySQL 8.0.16+ with enforced CHECK constraints.
3. Back up `pokedex_app` using **Server → Data Export → Export to Self-Contained
   File**, selecting schema and data. Keep `.env` and uploads backed up privately.
   Confirm the backup can be restored before proceeding.
4. Confirm earlier migrations, including administration, forums and v0.7.1, are
   complete. The Shoutbox reuses `users`, `admin_state`, staff roles and
   `forum_audit_logs`; it does not alter them.
5. **File → Open SQL Script** and open
   [migrations/v0.7.2-shoutbox.sql](migrations/v0.7.2-shoutbox.sql).
6. Review its `USE pokedex_app` and single additive CREATE TABLE. Execute the
   complete script with the lightning-bolt button. Do not run `db:setup` over an
   existing installation, and do not recreate the database.
7. Run the following verification queries in a new SQL tab:

```sql
USE pokedex_app;
SHOW CREATE TABLE shoutbox_messages;
SHOW INDEX FROM shoutbox_messages;
SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA='pokedex_app' AND TABLE_NAME='shoutbox_messages'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
SELECT COUNT(*) AS initial_messages FROM shoutbox_messages;
```

Both foreign keys must reference `users(id)` and use the existing unsigned INT
type. The visibility/id and author/time indexes should exist. The message length
CHECK must be enforced. A fresh table has zero messages.

8. Restart from VS Code's PowerShell terminal in the project directory:

```powershell
npm.cmd start
```

Open `http://localhost:3000/`, refresh with Ctrl+F5, and perform the Shoutbox tests
in [GAME_LIBRARY.md](../GAME_LIBRARY.md). After posting and removing a test message,
verify persistence and its moderation record:

```sql
SELECT id,user_id,CHAR_LENGTH(message) AS length,created_at,deleted_at,deleted_by
FROM shoutbox_messages ORDER BY id DESC LIMIT 20;
SELECT actor_id,target_user_id,action,reason,metadata,created_at
FROM forum_audit_logs WHERE action='shoutbox.remove' ORDER BY id DESC LIMIT 20;
```

## Recovery and rollback limits

The migration is one additive, repeatable CREATE TABLE IF NOT EXISTS. MySQL DDL
commits implicitly. If execution fails, inspect SHOW CREATE TABLE and the error;
do not assume IF NOT EXISTS repairs a partially or incorrectly defined table.
Resolve the mismatch with the backup/schema under administrator review. Do not
delete existing rows or drop tables automatically.

Application rollback can disable the homepage component while retaining messages
and moderation history. Removing the table would destroy messages and is not a
provided automatic rollback. Restore backups only after considering newer data.
The normal application account needs CRUD access, not ALTER/CREATE privileges.
No database tables are created for emulator saves.
