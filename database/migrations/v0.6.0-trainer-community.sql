-- Manual additive migration for MySQL 8.0.16+. Review/backup in Workbench first.
-- Requires existing v0.5.0 schema. No automatic publication or backfill.
USE pokedex_app;

CREATE TABLE IF NOT EXISTS trainer_public_settings (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  public_bio VARCHAR(500) NOT NULL DEFAULT '',
  featured_pokemon_id SMALLINT UNSIGNED NULL,
  featured_team_id INT UNSIGNED NULL,
  share_avatar BOOLEAN NOT NULL DEFAULT FALSE,
  share_favorites BOOLEAN NOT NULL DEFAULT FALSE,
  share_progress BOOLEAN NOT NULL DEFAULT FALSE,
  share_achievements BOOLEAN NOT NULL DEFAULT FALSE,
  KEY ix_public_trainers (enabled, user_id),
  CONSTRAINT fk_public_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_public_featured_team FOREIGN KEY (featured_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT ck_public_featured_pokemon CHECK (featured_pokemon_id IS NULL OR featured_pokemon_id BETWEEN 1 AND 649),
  CONSTRAINT ck_public_flags CHECK (enabled IN (0,1) AND share_avatar IN (0,1) AND share_favorites IN (0,1) AND share_progress IN (0,1) AND share_achievements IN (0,1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS team_sharing (
  team_id INT UNSIGNED NOT NULL PRIMARY KEY,
  share_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_team_share_id (share_id),
  KEY ix_shared_teams (is_public, team_id),
  CONSTRAINT fk_sharing_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT ck_team_public_flag CHECK (is_public IN (0,1))
) ENGINE=InnoDB;
