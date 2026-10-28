# Dexhaven community forums

Visit `forums.html` from the main navigation or Community subnavigation. The
existing `community.html` trainer directory and clean public trainer/team links
remain available. Public visitors can read categories and visible discussions;
the existing login/register dialog enables participation.

The forum home loads categories from MySQL, shows thread/reply totals and latest
activity, and lists pinned discussions first. Discussion titles can be searched
as literal text and sorted by activity, newest or reply count. Pages contain 20
threads/posts. Notifications use 30-item pages; moderation uses 25-item pages.
Post deep links locate the correct page, including after earlier soft removals.

## Modules and storage

- `server/forum-routes.js`: public reads and authenticated mutations using the
  existing session, CSRF, origin checks, account restrictions and request limits.
- `server/forum-validation.js`: explicit field allowlists, bounded text, IDs,
  enums and optimistic versions. Forged authors/staff fields are rejected.
- `server/forums.js`: ownership, current staff authority, privacy projections,
  quotes, team embeds, reports, notifications and moderation transactions.
- `server/forum-store.js`: parameterized MySQL queries and a fixed identifier
  allowlist, indexed pagination, notification fan-out and transaction storage.
- `forums.js`/`forums.css`: categories, search, discussion view, composer, quoting,
  editing/removal, reactions, subscriptions, reports and notification views.
- `forum-admin.js`: the existing Admin Panel's Forum Moderation tab.
- `forum-notifications.js`: a compact header indicator, refreshed on sign-in,
  successful read changes and once a minute while the page is visible.

See [the manual migration](database/MIGRATION_v0.7.0.md). Normal startup never
creates these tables. Public reads check forum readiness; mutations additionally
require functioning administration/restriction infrastructure.

## Authorship, privacy and moderation

Trainers create discussions, reply, edit their own posts/title and soft-remove
their own posts while the thread is visible and unlocked. Removed posts retain
their original record; public responses contain only an unavailable placeholder,
ID and timestamp. Every edit preserves its previous body/team reference in the
private forum audit record. Deletion is never a destructive row delete.

Author DTOs contain username, current staff role, optional public-profile link,
opted-in public avatar and optionally opted-in progression rank. No email, bio,
raw caught collection, permissions or restriction metadata enters forum JSON.
Ranks use the existing progression calculator and require the existing public
profile/progress switches. A staff role is independent of the caught rank.
Identity reads are memoized only within one response, never across requests.

Attach an existing **owned public team** in the composer. The attachment stores
only its existing share token, not duplicate team or membership records. Every
read resolves current visibility; private/deleted teams disappear from the API
and card. The underlying public-team query now reads membership and public
visibility in one statement. Attachment writes also lock the owned team while
checking sharing. Sharing does not enable a private trainer profile.

Quotes store a post reference and resolve the currently visible text on read;
hiding/removing a source removes its quote preview. Quotes cannot be moved to a
different source during an edit. Text and names render with DOM text nodes;
The composer lazily loads name/number suggestions from the existing local Pok?mon
summary; it still accepts National numbers if suggestions fail. `[[pokemon:25]]` becomes a bounded link to `pokemon.html?pokemon=25`. User HTML is
never evaluated or inserted as HTML.

Staff need both `panel.access` and `forums.moderate`. The Moderator role includes
moderation; Administrator/Owner additionally include `forums.configure`.
Existing explicit permission overrides still limit these defaults. Staff can
moderate their own content or content by lower-authority accounts, never other
equal/higher-authority staff. Forum tools do not bypass account privacy or grant
account-management permissions. Announcements require configuration permission
to start threads; ordinary trainers may reply to unlocked announcements.

In **Administration → Forum moderation**, review pending reports, or inspect a
discussion by ID. Inspect retained posts to hide, remove or restore them, even
after report resolution. Discussion controls lock/unlock, pin/unpin and change
visibility. Every operation requires a reason and current version. Resolved
reports remain stored. Owner sees all forum history; other staff see their own
history. Historical edit bodies remain retained in SQL rather than being sent
in general history responses. Categories can be created, edited and archived;
archiving stops new threads and retains existing discussions.

Writes lock the existing administration guard first, then re-read authority and
restrictions on the same connection. This serializes forum writes with staff
changes. Content, report resolution, audit and moderation notification commit
together; audit failure rolls the operation back. This deliberately favors
correctness over high forum write throughput for the initial release.

## Notifications and limits

Thread authors, followers and `@username` mentions receive one notification per
new post, excluding the writer. Mention matching follows the existing username
rules. Moderation of someone else's content creates a generic notification.
Notifications are owner-only and contain no post body, team or private content;
removed/hidden targets have no navigable preview. Old items are marked read
individually. A post that mentions and replies to the same person produces one
event because `(user_id,event_key)` is unique.

Forum reads are limited to 180 requests/minute per IP; writes to 60/minute per
IP across posting, reactions, follows, reports, notifications and moderation.
Existing authentication and administration limits still apply. This is an
initial shared-IP limit, not a complete anti-spam system. A duplicated pending
report is rejected; reactions and follows are idempotent and unique.

Posts allow 1–6000 characters, titles 3–120 and report/moderation reasons 5–500;
the existing 16 KB JSON body limit also applies. Search is title-only, uses
escaped `LIKE` parameters, and is not relevance-ranked. A FULLTEXT title index
is prepared but not used for this literal search mode. No rich text, direct
messaging, email delivery, WebSockets or ranked battle records are introduced.
