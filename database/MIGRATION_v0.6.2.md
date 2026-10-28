# Dexhaven v0.6.2 — Ranks & Administration

Prepared for manual review only. **No migration or Owner bootstrap was executed.**
Use MySQL 8.0.16+ with InnoDB. Existing users, sessions, avatars, biographies,
teams, favourites, sharing, progression and achievement rows are unchanged.

## Why four small tables

- `user_roles`: optional role/permission subset and revision per existing user.
  An absent row means Trainer. A generated unique Owner key limits the system
  to one protected Owner. Assignments never come from registration/session input.
- `user_restrictions`: reason, issuer, issue/expiration time and optional
  revocation history. Times use UTC. Records are retained after expiry/revocation.
- `admin_audit_logs`: append-only application history with actor, target,
  target role, action, timestamp and server-selected metadata. No passwords,
  cookies, tokens, email addresses or private trainer content are copied here.
- `admin_state`: one readiness/version row, also locked to serialize all staff
  writes and bootstrap. This prevents races when an ordinary Trainer has no
  role row yet and keeps authorization plus audit changes in one transaction.

Ranks need no table or backfill. They use unique Caught records from
`user_pokedex`, independently of staff roles and historical achievements.

## Before applying

1. Stop staff use and review the SQL in
   `migrations/v0.6.2-ranks-administration.sql`.
2. In Workbench, verify the connected server and `SELECT DATABASE();`.
   The script explicitly selects **pokedex_app**.
3. Export a consistent full backup, including routines/triggers if your local
   setup uses them. Preserve the existing `.env` and uploaded avatar directory
   separately; do not put credentials or backup files in Git.
4. Record current counts for users, teams, favourites, user_pokedex,
   user_achievements, sessions and existing public-sharing tables. Complete older
   migrations if needed; v0.6.1 Studio and single-Biography upgrades are separate.
5. Read [ADMINISTRATION.md](../ADMINISTRATION.md) for the exact permission matrix,
   suspension limits and Owner bootstrap procedure. Choose the intended existing
   account ID deliberately, not a username assumed by application code.

## Workbench execution

After explicit developer approval, open the versioned migration in Workbench and
execute it manually, stopping on errors. It uses CREATE IF NOT EXISTS for four
new tables and an idempotent readiness-row insert. It does not reset or ALTER
existing application tables and does not promote any account.

The readiness table/row is installed last. MySQL DDL commits implicitly; wrapping
the script in BEGIN/ROLLBACK does not make DDL undoable. Review every error before
proceeding. Restart Express after verification.

```sql
USE pokedex_app;
SHOW CREATE TABLE user_roles;
SHOW CREATE TABLE user_restrictions;
SHOW CREATE TABLE admin_audit_logs;
SHOW CREATE TABLE admin_state;
SELECT * FROM admin_state; -- exactly id=1, schema_version=1
SELECT role, COUNT(*) FROM user_roles GROUP BY role; -- initially empty
SELECT COUNT(*) FROM user_restrictions; -- initially 0
SELECT COUNT(*) FROM admin_audit_logs; -- initially 0
SELECT id, username FROM users ORDER BY id; -- choose an existing Owner ID
```

Compare all pre-migration application counts. Existing accounts remain Trainers.
Use an application DB principal with only necessary privileges; audit access
needs SELECT/INSERT, not UPDATE/DELETE, and the application never modifies audit
records. Run DDL through a separately authorized developer connection.

## Explicit Owner bootstrap

Run only after reviewing the chosen account and applying the migration:

```powershell
npm.cmd run admin:bootstrap -- --user-id 123 --confirm-owner 123
```

Replace both occurrences with the same existing ID. The command reads normal
untracked database configuration, acquires the shared guard, verifies that the
account exists and is not suspended, refuses if any Owner already exists, and
commits assignment plus `owner.bootstrap` audit record together. There is no web
bootstrap route, default Owner username or public privileged registration.

Sign in again or refresh access, then open `/admin.html`. Bootstrap is not an
Owner transfer tool. The protected Owner cannot be demoted, restricted, deleted
or have permissions reduced through application administration. Any future
deliberate Owner recovery/transfer requires a separately reviewed manual process.

```sql
SELECT user_id, role, version FROM user_roles ORDER BY user_id;
SELECT id, actor_id, target_id, action, created_at
  FROM admin_audit_logs ORDER BY id DESC LIMIT 20;
SELECT id, user_id, issued_by, expires_at, revoked_at
  FROM user_restrictions ORDER BY id DESC LIMIT 20;
```

## Partial execution and recovery

If none of the administrative tables exists, existing Trainer functions continue
with no staff permissions and Administration reports the required migration.
If the guard is absent but any staff table exists, or readiness/data tables are
incomplete, authenticated account access fails closed with 503. Public browsing
still works. This prevents a half-installed authorization system from granting
privileges or ignoring configured restrictions.

On failure, inspect which CREATE statements succeeded with SHOW TABLES/SHOW
CREATE TABLE, retain the full error text locally and compare definitions with
the versioned script. After fixing the cause, rerun the reviewed script; CREATE
IF NOT EXISTS will preserve valid completed tables. Do not delete roles, audit
rows or restriction history to hide a migration error. If an existing table has
an unexpected definition, stop and prepare a separately reviewed repair rather
than treating IF NOT EXISTS as schema repair.

If a restore is necessary, restore the verified full backup consistently. Do not
roll back to old application code that ignores active restrictions while keeping
new staff/restriction tables in service. Do not run Owner bootstrap repeatedly
or remove the guard to bypass checks. Keep staff access unavailable until the
schema and application agree.

## Manual verification after approval

Use separate Owner, Administrator, Moderator and Trainer test sessions. Check
hierarchy, live demotion, permission reduction, CSRF, self/Owner protection,
24-hour Moderator limits, expiry, revocation and fresh login. Verify that a
restriction blocks already logged-in private API access and private avatar reads.
It intentionally leaves ordinary public browsing and already approved public
profiles/teams available; it is not a content-unpublishing operation.

Change a role and restriction while reading audit records; both data and audit
must commit or roll back together. Repeat competing changes from two sessions
using the same version; one must return 409. Test bootstrap races only in an
isolated development copy with no existing Owner. Compare real MySQL behavior
with the automated policy/fixture tests; fixture passes do not prove live DDL,
database-user grants, locking or restart persistence.
