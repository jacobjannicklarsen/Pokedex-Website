# Dexhaven v0.6.2 — Ranks & Administration

Prepared source update for **Pokédex Website**, retaining the public **Dexhaven**
brand and vanilla JavaScript/Express/MySQL architecture. No migration, live Owner
bootstrap, commit, push, tag, GitHub release or deployment was performed.

## Features delivered

- Central Owner, Administrator, Moderator and Trainer roles, with explicit
  capability checks per administrative endpoint and current-session enforcement.
- Owner-only permission subsets bounded by the target role; Administrator role
  changes preserve Owner-assigned limits through demotion/re-promotion. Removing
  panel access disables all administrative APIs, not just navigation.
- Protected single Owner and a deliberate local bootstrap command accepting a
  selected existing account ID plus a matching confirmation. No default username,
  password, public privileged registration or HTTP bootstrap route.
- Responsive `admin.html`: overview counts/recent activity, searched/paginated
  account cards, inline role/permission management, restriction/revocation dialogs
  and scoped audit views. Private trainer content is not exposed to staff.
- Reasoned temporary suspensions with issuer, expiration, revocation history and
  a conservative 24-hour Moderator limit on ordinary Trainers. Administrators
  and Owner may act only on lower accounts, up to 30 days. No self/Owner/equal
  authority changes, active-extension, permanent ban or account-delete feature.
- A shared guard serializes sensitive writes; authority is re-read and target
  revisions checked under the lock. Each change and its audit insert commits or
  rolls back together. A unique generated Owner key prevents duplicate Owners.
- Server-calculated Rookie, Bronze, Silver, Gold, **Diamond**, Champion ranks,
  independently of staff authority, stored counts or historical achievements.
- Shared accessible hover/press/focus states, 44px controls, loading and duplicate
  submission protection, confirmation, focus return and backend-confirmed
  success/error feedback. Both themes and reduced motion are supported.

See [ADMINISTRATION.md](ADMINISTRATION.md) for the exact permission matrix,
suspension policy, architecture, rank thresholds and API contracts.

## Architecture and privacy

The existing session holds only user identity, not trusted role claims. Current
permissions/restrictions are loaded for each private request, login and session
refresh; private avatar access checks restrictions too. Suspended sessions are
rejected/cleared, while normal public browsing and already approved shared
content remain available. No ownership bypass was added for staff.

The administrative user DTO contains ID, username, joining date, account role,
version and restriction/action metadata. No email, biography, avatar filename,
private team, favourites or collection payload is exposed. Search pages contain
at most 25 users and batch role/restriction reads. Audit views are Owner-complete,
Administrator-scoped or Moderator-own. There is no audit edit/delete API and
metadata is assembled server-side rather than copied from arbitrary requests.

The Admin page is an empty, no-store, noindex HTML shell; protected content comes
from authorized API calls. Showing a navigation link is not authorization.
CSRF/origin checks, same-site HTTP-only sessions, existing rate limits and the
explicit static-file allowlist remain. No new dependencies or framework.

## Rank scheme

| Rank | Unique species currently marked Caught |
| --- | --- |
| Rookie | 0–24 |
| Bronze | 25–99 |
| Silver | 100–249 |
| Gold | 250–449 |
| Diamond | 450–648 |
| Champion | 649 |

The backend derives rank, caught/total, next threshold, remaining count, interval
progress and Champion completion from existing collection records. The private
Trainer Hub profile/progress pages show open details; directory summaries start
compact. Public profiles/cards receive rank data only if progress sharing is
enabled. Public responses do not gain staff permissions or private role context.
The explicit `national-i-v` scheme supports deliberate future generation schemes
without silently moving the existing milestone or rewriting earned awards.

## Database upgrade and Owner setup

Prepared [database/migrations/v0.6.2-ranks-administration.sql](database/migrations/v0.6.2-ranks-administration.sql):
`user_roles`, `user_restrictions`, `admin_audit_logs` and the singleton
`admin_state` guard/readiness table. No existing tables are recreated, no users
are promoted and ranks need no new storage. Fresh schema composes the same
definitions. Complete absence preserves ordinary trainer use with no staff
rights; incomplete administrative schemas fail closed.

Follow the [manual Workbench/backup/recovery guide](database/MIGRATION_v0.6.2.md).
After explicit approval and manual execution, deliberately bootstrap the selected
existing account, replacing both example IDs:

```powershell
npm.cmd run admin:bootstrap -- --user-id 123 --confirm-owner 123
```

This command was **not run against MySQL**. Fixture tests exercise its policy and
argument parsing without selecting or changing a real account.

## New endpoints

All require an unrestricted authenticated account, `panel.access` plus their
specific capability; mutations require the existing CSRF/origin protections.

| Method | Endpoint |
| --- | --- |
| GET | `/api/admin/context` |
| GET | `/api/admin/overview` |
| GET | `/api/admin/users?q=&after=` |
| GET | `/api/admin/audit?before=` |
| POST | `/api/admin/users/:id/role` |
| POST | `/api/admin/users/:id/permissions` |
| POST | `/api/admin/users/:id/restrictions` |
| POST | `/api/admin/users/:id/restrictions/revoke` |

Existing private session/profile DTOs gain own staff context; progression bundles
gain `rank`, and public profiles/cards gain a privacy-gated rank. Other account,
upload, team, analysis, favourites, achievements and catalogue contracts remain.

## Created and modified files

New frontend: `admin.html`, `admin.js`, `admin.css`, `interactions.css`,
`trainer-ranks.js`.

New backend/tooling: `server/authorization.js`, `server/admin-repository.js`,
`server/admin-validation.js`, `server/admin-routes.js`, `server/trainer-ranks.js`,
`scripts/bootstrap-owner.cjs`.

New tests: `tests/administration.test.cjs`, `tests/admin-schema.test.cjs`,
`tests/trainer-ranks.test.cjs`, `tests/support/memory-admin.cjs`,
`tests/support/app-fixture.cjs`, `tests/support/admin-browser.cjs`.

Updated runtime: `server/app.js`, `server/repository.js`,
`server/progression-repository.js`, `server/community-repository.js`,
`server/community.js`, `account.js`, `trainer-progress.js`, `community.js`,
`index.html`, `pokemon.html`, `trainers.html`, `dashboard.html`, `community.html`,
`about.html`, `database/schema.sql`.

Updated tests: `tests/browser-qa.cjs`, `tests/firefox-card-qa.cjs`,
`tests/support/memory-repository.cjs`, `tests/support/memory-community.cjs`,
`tests/trainer-card.test.cjs`, `tests/upgrade.test.cjs`. Existing branding/image
expectations were retained; version/schema expectations reflect the new release.

Version/docs: `package.json`, `package-lock.json`, `README.md`, `RELEASE_NOTES.md`,
`WINDOWS_SETUP.md`, `server/API.md`, `COMMUNITY.md`, `PROGRESSION.md`,
`QA_REPORT.md`, `ADMINISTRATION.md`, this report and the versioned migration/guide.

## Executed verification

- Full automated suite: **109 passed**, one opt-in live-MySQL test skipped and
  one pre-existing founder-image checksum mismatch. The user-provided artwork
  and its historical expected checksum were not changed.
- New authorization/rank/schema tests: **15/15 passed**. Includes guest/Trainer
  direct requests, role/header spoofing, Owner/self/hierarchy protection,
  Administrator/Moderator boundaries, permission revocation in existing
  sessions, restriction/expiry/revocation, CSRF/origin, scoped audit reads,
  audit-failure rollback, stale/concurrent fixture changes, bootstrap validation,
  literal/batched SQL binding, additive schema composition, every rank boundary,
  live caught updates and privacy. Owner-assigned limits cannot be reset by an
  Administrator's demotion/re-promotion cycle.
- Chromium: **73/73 full regression checks passed**. Preserved the existing
  catalogue/filter/detail/Encyclopedia, account/crop, teams/caught selector,
  favourites/progression/awards, public privacy/sharing/analysis, Studio/sprites
  and theme/mobile checks. New flows cover gated Admin access, confirmed role/
  permission/restriction changes, revocation, live demotion, failed-save recovery,
  native validity, keyboard Tab/Escape/focus, touch activation, hover without
  layout shift, reduced motion and private/public rank displays. Geometry spans
  320, 375, 768 and 1280px. Screenshots were reviewed in both themes.
- Firefox: **24/24 layout checks passed**, including existing Studio, directory,
  public profile and new Admin overview/users/modal layouts at 375/1280px in
  both themes. This is focused Firefox coverage, not the full Chromium suite.

Browser runs use temporary profiles, sessions, uploads and MemoryRepository;
no real MySQL or live trainer accounts are touched. SQL mocks verify locking
order, bound values and rollback calls, not a real InnoDB server. Real database
constraint execution, bootstrap races, grants, post-restart persistence and
existing-account migration must be verified manually after approval. The
historical image-checksum failure means `npm.cmd test` still returns nonzero.

## Remaining scope

No forum feature, permanent ban, account deletion, audit export/edit or automated
migration was added. Public content is not automatically unpublished by account
suspension. Future v0.7.0 work can extend the explicit permission registry without
mixing caught ranks with staff roles. Recommended operational follow-up: live
two-session database/security review, MFA/step-up for staff, reviewed Owner
recovery, audit retention/export monitoring, and Safari/screen-reader/manual
device testing. Test coverage does not establish those unexecuted checks.
