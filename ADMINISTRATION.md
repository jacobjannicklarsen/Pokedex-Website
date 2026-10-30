# Dexhaven v0.6.2 — Ranks & Administration

The public brand remains Dexhaven and the project remains Pokédex Website.
The existing Express/session/MySQL application now has explicit staff
permissions, temporary account restrictions, append-only administrative history
and independent calculated trainer ranks. No frontend framework was added.

## Architecture

`server/authorization.js` owns the capability matrix, hierarchy, permission
subset rules and Express permission middleware. `server/admin-validation.js`
rejects extra mutation fields and validates role/reason/duration/version values.
`server/admin-routes.js` registers separately authorized and rate-limited routes.
`server/admin-repository.js` owns bound SQL, scoped reads, transactions and audit
inserts. `Repository.administration` uses the same configured MySQL pool.

The common private API middleware loads the user, current role/permissions and
active restriction on **every request**. Sessions contain the user ID, not trusted
role claims. Login, session refresh and owner-only avatar reads also check active
restrictions. Registration always produces an ordinary Trainer regardless of
extra client role claims. Existing accounts have no privileged backfill.

Sensitive changes acquire the singleton `admin_state` guard before reading the
actor and target. Authorization is rechecked under this lock, stale target
versions return 409, and the change plus audit record commits atomically.
Restricting or revoking also increments the target version. This serializes
absent-row assignments and competing bootstrap attempts; a unique generated
Owner key provides a second single-Owner safeguard. There is no HTTP Owner
creation, transfer, account-deletion or audit-edit endpoint.

This follows [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
on least privilege, default denial and per-request checks, with
[InnoDB locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
for transactional decisions. Tests do not substitute for a production security
review or live database verification.

## Permission matrix

| Capability | Trainer | Moderator | Administrator | Owner |
| --- | --- | --- | --- | --- |
| Administration shell/tools | No | Yes | Yes | Yes |
| Overview totals | No | Yes | Yes | Yes |
| Search basic account records | No | Yes | Yes | Yes |
| Assign/revoke Moderator role | No | No | Lower accounts | Lower accounts |
| Appoint/demote Administrator | No | No | No | Yes |
| Assign Owner | No | No | No | Explicit local bootstrap only |
| Staff permission subsets | No | No | No | Lower staff, within their role maximum |
| Apply temporary suspension | No | Trainer only, 1–24h | Lower accounts, 1–720h | Lower accounts, 1–720h |
| Revoke suspension | No | Own restriction on a Trainer | Lower accounts | Lower accounts |
| Audit read | No | Own actions only | Permitted actions on Trainers/Moderators | Complete records |
| Private trainer content bypass | No | No | No | No |
| Self/Owner demotion or suspension | No | No | No | No |

The explicit capability names are `panel.access`, `overview.read`, `users.read`,
`roles.manage`, `permissions.manage`, `restrictions.apply`,
`restrictions.revoke`, `audit.read` and `audit.all`. Every administrative operation
requires both `panel.access` and its specific capability; removing panel access
disables administration while leaving ordinary Trainer tools intact. The Owner can remove selected
capabilities from a lower staff member; overrides cannot exceed that role's
maximum. Owner role changes deliberately reset the subset to the new role
defaults; Administrator changes preserve an Owner-assigned subset, even through
demotion and later re-promotion. A protected
Owner always retains full authority and cannot modify their own administrative
assignment through the UI/API.

Administrator logs include only role/restriction actions whose target was a
Trainer or Moderator. Owner bootstrap and permission-change records are Owner
only. Moderator logs are limited to that Moderator's actor ID. Removing audit
permission also removes recent activity from that account's overview.

## Suspension policy

Reasons are required (5–300 characters). No actor can restrict themselves, an
equal/higher account or the Owner. Moderators can suspend only ordinary Trainers,
for at most 24 hours, cannot extend an active suspension and can revoke only
their own. Repeat incidents needing longer action must be reviewed by an
Administrator or Owner. Other permitted staff have a 30-day maximum; there are
no permanent bans or bulk/destructive actions in v0.6.2.

Expiry is evaluated in UTC by the database; no scheduler or persisted "active"
flag is needed. Revocation retains the record and the revoker/reason. Existing
sessions are checked again on the next private request, rejected and cleared
when restricted; expired/revoked accounts can log in again. Already in-flight
ordinary requests may complete; staff writes are serialized and reauthorized.

Suspension prevents authenticated tools and private avatar access. It does not
hide already opted-in public profiles or separately shared teams, delete data
or prevent ordinary public Pokémon browsing. Staff must continue using public
sharing rules and ownership checks; being Owner does not grant private team,
email, biography, favourites or collection access for another user.

## Admin Panel and interaction design

Open `/admin.html` after signing in as staff. It serves only an empty shared
shell initially. The account session decides whether to show the Administration
link; protected data always comes from separately authorized API calls. Guests,
ordinary Trainers and missing-schema states receive clear gated messages.

The panel has Overview, User Management and Audit Logs. User cards show ID,
username, joining date, staff role, active restriction and only permitted
actions. Search and cursor pagination are bounded to 25 accounts. Role and
permission management is integrated into these cards, with required review
confirmation, reason, optimistic version and accessible native modal forms.
Private emails, biographies, avatar files, team contents, favourites and caught
records are never part of administrative list DTOs. Reads batch role/restriction
data rather than issuing queries per account.

Actions disable controls while saving and announce success only after a backend
response. Failures restore controls and retain useful feedback. Server-side
changes invalidate stale authority on the next request; refreshing/focusing the
page also updates navigation. Modal close returns focus to the opening control.
Touch targets, keyboard focus, hover/press feedback, selected navigation,
accessible status regions, themes and reduced motion are shared styles in
`interactions.css`, with panel-specific layout in `admin.css`.

## Trainer progression ranks

| Rank | Unique Caught Pokémon |
| --- | --- |
| Rookie | 0–24 |
| Bronze | 25–99 |
| Silver | 100–249 |
| Gold | 250–449 |
| Diamond | 450–648 |
| Champion | 649 |

Diamond is the fifth tier. `server/trainer-ranks.js` calculates a versioned
`national-i-v` scheme from the existing server-derived unique caught count.
There is no rank/count table and no accepted client rank claim. A status change
can raise or lower the current rank, while historical achievement unlocks remain.
The returned DTO includes scheme, key/name, caught/total, next threshold,
remaining species, interval progress and Champion completion. A future-generation
scheme must be introduced deliberately; importing more species must not silently
move the existing 649 milestone or rewrite achievement history.

The Trainer Hub profile/progress views show a distinct rank badge and expandable
details (open by default), caught count, progress and remaining species. Staff
role badges are separately labelled account roles. Public profiles and directory
summaries receive ranks **only with existing progress sharing enabled**. Compact
directory details start collapsed. Published profiles/cards can also expose a
minimal staffRole label (Owner, Administrator or Moderator) for their distinct
name treatment. Permission arrays, versions and restrictions remain private;
this label grants no authority and disappears on the next request after demotion. Champion shows the completed 649 milestone.

## API contract

All routes below require the authenticated, unrestricted session plus the named
capability. Mutations also require the existing CSRF token/origin checks. They
return no-store JSON. Invalid/extra fields: 400; login missing: 401; permission,
hierarchy or restriction: 403; missing target: 404; stale revision: 409; rate
limit: 429; missing/partial schema: 503.

| Method | Path | Permission / response |
| --- | --- | --- |
| GET | `/api/admin/context` | `panel.access`: role, permissions and duration limits |
| GET | `/api/admin/overview` | `overview.read`: trainer/staff/restricted totals, permitted recent activity |
| GET | `/api/admin/users?q=&after=` | `users.read`: bounded identity/status/action DTOs, total and next cursor |
| GET | `/api/admin/audit?before=` | `audit.read`: scoped immutable records and next cursor |
| POST | `/api/admin/users/:id/role` | `roles.manage`: `{role,version,reason}` |
| POST | `/api/admin/users/:id/permissions` | `permissions.manage`: `{permissions,version,reason}` |
| POST | `/api/admin/users/:id/restrictions` | `restrictions.apply`: `{hours,version,reason}` |
| POST | `/api/admin/users/:id/restrictions/revoke` | `restrictions.revoke`: `{restrictionId,version,reason}` |

Mutations return the authoritative updated account card under `{user}`. There is
no arbitrary metadata/body forwarding; audit metadata is assembled on the server
from allowlisted action values. Do not put secrets into staff-entered reasons.
Audit records have actor/target IDs and names, action, timestamp and appropriate
change metadata. No update/delete API exists for those records.

`/api/auth/session` and private profile responses add the user's own staff
context for navigation. `/api/pokedex` bundles add `rank`; public profile/card
responses add `rank` only when progress sharing permits it. No extra Pokémon
API requests or private-content permissions are needed for rank displays.

## Installation, bootstrap and recovery

Follow [database/MIGRATION_v0.6.2.md](database/MIGRATION_v0.6.2.md). The four-table
additive migration is prepared only and requires manual approval/application.
Fresh installs use the composed schema. Existing users remain Trainers until a
selected ID is deliberately promoted. The command is:

```powershell
npm.cmd run admin:bootstrap -- --user-id 123 --confirm-owner 123
```

It is not called by startup, registration or database setup. No Owner username,
password or default credential is hardcoded. Do not run it against an arbitrary
account ID or use it as a transfer mechanism. The guide includes backups,
Workbench steps, validation queries and partial-failure recovery.

## Verification and follow-up

Automated policy/API/SQL-contract tests cover authorization, Owner protection,
hierarchy, permission reduction, suspensions/expiry/revocation, CSRF, live session
changes, stale versions, concurrent fixture updates, audit rollback, scoped logs,
literal SQL binding, rank boundaries/updates and public privacy. Schema tests
compare all four additive table definitions and readiness/bootstrap defaults.
Browser results and exact counts are recorded in [QA_REPORT.md](QA_REPORT.md).

No real migration, Owner bootstrap, database concurrency/grant test or restart
persistence test was executed. Browser runs use temporary fixture accounts and
MemoryRepository; SQL mocks verify query order/binding but cannot prove InnoDB
locking on a deployed server. Perform the guide's two-session manual checks after
approval. Before public deployment, consider MFA/step-up authentication for staff,
independent security review, audit retention/export monitoring and operational
Owner recovery procedures. Forum-specific permissions/tools remain for v0.7.0.

## Owner username changes

In Administration > User management, Owners can choose **Change username** beside
**Change password**. Confirm with the current Owner password and an audit reason.
Usernames accept 3 to 24 letters, numbers or underscores and must be unique.
The account ID, password and account data remain intact; profile URLs change and
existing sessions are revoked. Renaming yourself requires signing in again.

Existing installations must manually review and apply
[owner-username-audit.sql](database/migrations/owner-username-audit.sql) in MySQL
Workbench. It expands the audit CHECK without removing records and includes the
earlier password audit action. It is not executed by application startup.
