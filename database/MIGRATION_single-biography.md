# Single biography and public visibility

Back up the database, then manually run `migrations/single-biography.sql` once
after the v0.6.0 community migration. Fresh installs use `schema.sql` directly.
No migration runs automatically.

`users.bio` is the single editable Biography. The new `share_bio` flag defaults
to false for every account so a previously private biography cannot become
public accidentally. Existing public profile, avatar and team visibility choices
are preserved. Old `public_bio` text remains archived in place; it is no longer
edited or returned by the API. No text is overwritten or deleted. Trainers may
copy old text into Biography themselves and explicitly enable sharing.

Before this migration, public reads safely hide biographies. Saving community
settings reports the required migration. Profile editing and team building still
work. After migration, sign in → Trainer Hub → Profile: change the picture above
Biography, edit Biography, then enable **Show biography publicly** under Your
public profile and save those settings. Enable the public profile for visitors
to see the biography; disabling either switch hides it from profiles and the
directory.

Trainer Hub → My Teams offers **All Pokémon** and **Caught Pokémon** search
sources per team. Caught uses the authenticated account's existing collection;
Seen alone does not qualify. Empty, loading or failed collections never fall
back to all Pokémon. Existing members and unsaved team edits remain in place
when switching sources. The six-member and duplicate rules remain unchanged.
