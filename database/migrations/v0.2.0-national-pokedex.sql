-- MANUAL ONLY. Existing v0.1.0 pokedex_app schema, MySQL 8.0.16+.
-- Back up first, pause application writes, and inspect SHOW CREATE TABLE.
-- Do not run this on a new v0.2.0 installation or repeat after success.
-- Each ALTER atomically replaces one CHECK; DDL commits per table, not together.
USE pokedex_app;

ALTER TABLE team_pokemon
  DROP CHECK ck_team_pokemon,
  ADD CONSTRAINT ck_team_pokemon_v020 CHECK (pokemon_id BETWEEN 1 AND 649);

ALTER TABLE favorites
  DROP CHECK ck_favorite_pokemon,
  ADD CONSTRAINT ck_favorite_pokemon_v020 CHECK (pokemon_id BETWEEN 1 AND 649);

-- Users, avatars, sessions, team slots, uniqueness, keys and saved records remain.
