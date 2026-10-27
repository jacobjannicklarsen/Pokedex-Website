-- Manual, additive migration for MySQL 8.0.16+; run only after reviewing a backup.
-- Requires the existing v0.2.0+ pokedex_app users/teams/favorites schema.
USE pokedex_app;

CREATE TABLE IF NOT EXISTS user_pokedex (
  user_id INT UNSIGNED NOT NULL,
  pokemon_id SMALLINT UNSIGNED NOT NULL,
  seen_at DATETIME(3) NOT NULL,
  caught_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, pokemon_id),
  KEY ix_pokedex_recent (user_id, updated_at, pokemon_id),
  CONSTRAINT ck_pokedex_species_v050 CHECK (pokemon_id BETWEEN 1 AND 649),
  CONSTRAINT ck_pokedex_caught_seen_v050 CHECK (caught_at IS NULL OR caught_at >= seen_at),
  CONSTRAINT fk_pokedex_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INT UNSIGNED NOT NULL,
  achievement_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  unlocked_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, achievement_key),
  KEY ix_achievement_unlock (user_id, unlocked_at),
  CONSTRAINT fk_achievement_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
