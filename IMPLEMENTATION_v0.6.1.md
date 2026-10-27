# Dexhaven v0.6.1 — Pokémon Sprites & Trainer Card Studio Expansion

Project: **Pokédex Website**. Public brand: **Dexhaven**. The existing vanilla
frontend, Express API, authenticated sessions and MySQL ownership model remain.
Version metadata in package.json and both package-lock root entries is 0.6.1.
No tag, release, push, deployment or migration was performed.

## Delivered

- Featured Partners use animated Generation V battle sprites. Shared compact
  team previews and private trainer summaries use party icons; expanded public
  teams use larger static battle sprites with their existing statistics and
  analysis. Names, numbers, saved lineup order and empty slots are retained.
- National Pokédex and Encyclopedia artwork remain unchanged. Featured species
  come from the existing public projection; no trainer-specific species are
  hardcoded. No additional Pokémon API lookups are needed for images.
- One shared appearance renderer styles the Studio preview, private header,
  Community cards and public profile. It also normalizes historical settings.
  Live preview, saved reset, default reset with confirmation, persistence,
  loading feedback and server-confirmed success/error messages are supported.
- Existing badges, titles, mottos, palettes, frames and privacy choices remain.
  Decoration changes cannot publish a profile, avatar, biography or private team.

## Studio options

| Category | Options |
| --- | --- |
| Palettes (12) | Mint, Ocean, Sunset, Violet, Rose, Gold, Ember, Arctic; new Forest, Cobalt, Copper, Monochrome |
| Banners (11) | Aurora, Constellation, Cyber Grid, Coastal Waves, Petals, Minimal; new Nebula, Ocean Depths, Ember, Forest, Royal |
| Frames (11) | Circle, Halo, Double Ring, Laurel, Hexagon, Orbit; new Rounded Square, Diamond, Neon Ring, Minimal Border, Champion |
| Finishing touches (8) | None, Sparkles, Shimmer; new Starfield, Holographic Shine, Subtle Glow, Electric Accents, Floating Particles |
| Card borders | Solid, Double, Dashed, Etched |
| Titles | Ribbon, Pill, Minimal |
| Custom colours | Optional six-digit hex accent/highlight, border and avatar-frame colours; blank restores the palette |
| Presets | Dexhaven Original, Night Explorer, Ocean Companion, Champion Circuit, Neon Journey, Forest Wanderer |

Custom colours affect decoration, not body text. Text stays on Dexhaven's theme
surfaces. Radio selections, accessible native inputs, focus outlines and inline
validation remain usable on small screens. Presets retain personal text and
earned badge pins; default reset is a preview until Save succeeds.

## Hexagon root cause and fix

The original implementation applied clip-path to the same element that carried
a rectangular CSS border. Clipping removed most of that border, leaving short
horizontal fragments instead of six outlined edges. Studio used a standalone
image, while the directory used a containing span with an image child.

Reproduced in Chromium before editing and captured both actual views. The fix
wraps both structures in the same avatar-frame component. The outer clipped
silhouette supplies the border colour; the inset image has the same polygon and
object-fit:cover. This gives six continuous edges, centered cropping and no
protruding corners. Other frames use the same wrapper, including portrait and
landscape uploads. Upload processing and stored avatar files are unchanged.
Pixel checks sample each edge; browser checks cover both rendering locations.

## Sparkles root cause and fix

The old effect was a single absolutely positioned pseudo-element containing
spaced Unicode glyphs. Its automatic stacking and width-based text placement
overlapped the directory stamp and differed across card layouts. It did render,
but did not reliably stay in a decorative area.

The shared renderer now creates an aria-hidden, pointer-transparent layer inside
the 90px banner. Eight SVG stars use bounded percentage positions and staggered
subtle twinkling. Content, avatars and buttons sit above it. Changing effects
replaces the layer; None removes it. Reduced motion keeps static stars and
disables animation. Shimmer and other treatments also stay inside this banner.

## Sprite utility and upstream verification

Source: [PokéAPI sprites](https://github.com/PokeAPI/sprites). Verified revision:
`d8c2fb78563e28ad7b3abe938cf6e79998d04e90`.

`scripts/verify-sprites.cjs` inspects complete Git trees, rejects truncated
responses and generates data/sprite-availability.json plus the small shared
sprite-availability.js. All 649 normal animated, normal static, party, shiny
animated and shiny static paths were present. Nine sample files (#009, #151,
#649 across animated/static/party) returned HTTP 200 and decode successfully;
the GIF samples contain multiple frames. It does not issue thousands of image
requests or run at startup. Rerun explicitly with `npm.cmd run sprites:verify`.

`pokemon-sprites.js` validates IDs 1–649 and builds a finite chain:
animated battle → static battle → default sprite → local placeholder. Party
icons start with the menu asset and then use static fallbacks. Reduced motion
skips GIFs and reacts to preference changes. Offscreen battle images switch to
static; image dimensions are reserved, decoding/loading are deferred and CSS
keeps pixel art sharp. Detached images are released from observation. Shiny
paths require an existing matching record with isShiny:true; current species-ID
teams do not invent shiny state. Party icons have no invented shiny URL.

## Persistence and database implications

See [the manual migration guide](database/MIGRATION_v0.6.1.md). The separate
v0.6.1 ALTER adds five decoration fields and widens four option checks without
changing existing rows. It is prepared only; approval is required before
application. The fresh schema contains the resulting definition. Earlier
decoration and single-Biography upgrades remain separate prerequisites.

Before migration, existing card reads keep their previous choices and default
the new fields. Saving expanded settings returns an actionable migration error.
Both strict server validation and safe client normalization reject arbitrary
CSS, URLs or HTML. Colours are limited to #RRGGBB. SQL uses bound values and the
authenticated user ID; badge pin validation and public privacy gates remain.

## Files changed in this update

New runtime: trainer-card-config.js, trainer-cards.css, pokemon-sprites.js,
sprite-availability.js and data/sprite-availability.json.

Updated runtime: profile-decorations.js, community.js, account.js,
server/decorations.js, server/community-repository.js, server/community.js,
server/app.js, index.html, pokemon.html, trainers.html, dashboard.html,
community.html, about.html, styles.css and database/schema.sql. Shared pages load the new
assets in dependency order; Express keeps explicit static-file allowlists.

New tooling/tests: scripts/verify-sprites.cjs, tests/sprites.test.cjs,
tests/trainer-card.test.cjs, tests/firefox-card-qa.cjs,
tests/support/card-baseline.cjs, tests/support/studio-expansion.cjs and nine
tests/fixtures/sprites files. Updated tests/browser-qa.cjs,
tests/community.test.cjs and tests/upgrade.test.cjs for the expanded contract.

Version/docs: package.json, package-lock.json, README.md, RELEASE_NOTES.md,
TRAINER_STYLE.md, WINDOWS_SETUP.md, COMMUNITY.md, server/API.md, QA_REPORT.md,
database/MIGRATION_v0.6.1.md, database/migrations/v0.6.1-trainer-studio.sql and
this report. Earlier uncommitted work and user artwork were retained.

## Verification and remaining limits

- Automated suite: **94 passed**, one opt-in live-MySQL test skipped; one existing
  founder-artwork checksum mismatch remains. The supplied image was preserved,
  and its historical checksum expectation was not weakened.
- Targeted sprite, card and community tests: **24/24 passed**. Includes every
  curated option/preset, legacy defaults, injection rejection, bound persistence,
  additive schema/version consistency, sprite metadata and sample decoding.
- Focused Chromium checks passed for Studio options, save/reload/error states,
  default/saved resets, six-edge border pixels, Sparkles switching, shared public
  appearance, Mew/Blastoise animation, party slot order/empty slots, reduced
  motion and finite error fallback. The complete Chromium regression suite
  passed **68/68** checks, including the existing authentication, uploads,
  privacy, team analysis, collection, favourites, Encyclopedia and filtering
  interactions. Additional focused checks confirmed distinct computed styles
  for every palette, background, frame, effect and border choice.
- Firefox: **12/12** desktop/mobile theme layouts passed using the real Studio,
  directory and public-profile pages; also checked Hexagon clipping,
  object-fit, contained decorative layers and effect switching. Screenshots
  were inspected. This is a focused Firefox review, not the whole Chromium
  interaction suite.

Browser runs use temporary profiles, sessions/uploads and a MemoryRepository
fixture. Sprite browser checks serve the downloaded upstream samples; fallback
checks inject failures (including a failed image event for an already cached
GIF). Live repository/tree and sample HTTP checks were executed separately.
These runs do not prove real MySQL constraint execution, post-migration live
restart persistence, Safari rendering or performance on low-end phones. Remote
images can still be unavailable, in which case the local fallback is used.

Chromium/Firefox review images are in the temporary dexhaven-v061-review and
dexhaven-v061-firefox directories. Pre-fix evidence is separately retained in
dexhaven-v061-baseline. There is no automatic publishing step.
