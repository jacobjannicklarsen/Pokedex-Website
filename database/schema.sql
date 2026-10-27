-- MySQL 8.0.16+ (enforced CHECK constraints). No DROP or destructive migrations.
-- Only the separate pokedex_app database is selected or changed.
CREATE DATABASE IF NOT EXISTS pokedex_app CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE pokedex_app;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(24) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio VARCHAR(500) NOT NULL DEFAULT '',
  avatar_filename VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teams (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_teams_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY ix_teams_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS team_pokemon (
  team_id INT UNSIGNED NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  pokemon_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (team_id, slot),
  UNIQUE KEY uq_team_pokemon (team_id, pokemon_id),
  CONSTRAINT ck_team_slot CHECK (slot BETWEEN 1 AND 6),
  CONSTRAINT ck_team_pokemon_v020 CHECK (pokemon_id BETWEEN 1 AND 649),
  CONSTRAINT fk_member_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS favorites (
  user_id INT UNSIGNED NOT NULL,
  pokemon_id SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, pokemon_id),
  CONSTRAINT ck_favorite_pokemon_v020 CHECK (pokemon_id BETWEEN 1 AND 649),
  CONSTRAINT fk_favorite_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  data JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY ix_session_expiry (expires_at)
) ENGINE=InnoDB;

-- Trainer progression (v0.5.0). Timestamps are written explicitly in UTC by the API.
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

CREATE TABLE IF NOT EXISTS trainer_public_settings (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  public_bio VARCHAR(500) NOT NULL DEFAULT '', -- Legacy archive; no longer edited or published.
  share_bio BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS trainer_decorations (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  palette VARCHAR(16) NOT NULL DEFAULT 'mint',
  pattern VARCHAR(24) NOT NULL DEFAULT 'aurora',
  frame VARCHAR(16) NOT NULL DEFAULT 'classic',
  effect VARCHAR(16) NOT NULL DEFAULT 'none',
  title VARCHAR(40) NOT NULL DEFAULT '',
  motto VARCHAR(120) NOT NULL DEFAULT '',
  pinned_badges JSON NOT NULL,
  accent_color CHAR(7) NULL DEFAULT NULL,
  border_color CHAR(7) NULL DEFAULT NULL,
  frame_color CHAR(7) NULL DEFAULT NULL,
  border_style VARCHAR(16) NOT NULL DEFAULT 'solid',
  title_style VARCHAR(16) NOT NULL DEFAULT 'ribbon',
  CONSTRAINT fk_decoration_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_decoration_palette CHECK (palette IN ('mint','ocean','sunset','violet','rose','gold','ember','arctic','forest','cobalt','copper','monochrome')),
  CONSTRAINT ck_decoration_pattern CHECK (pattern IN ('aurora','constellation','grid','waves','petals','plain','nebula','depths','ember','forest','royal')),
  CONSTRAINT ck_decoration_frame CHECK (frame IN ('classic','halo','double','laurel','hexagon','orbit','rounded','diamond','neon','minimal','champion')),
  CONSTRAINT ck_decoration_effect CHECK (effect IN ('none','sparkles','shimmer','starfield','holographic','glow','electric','particles')),
  CONSTRAINT ck_decoration_border_style CHECK (border_style IN ('solid','double','dashed','etched')),
  CONSTRAINT ck_decoration_title_style CHECK (title_style IN ('ribbon','pill','minimal')),
  CONSTRAINT ck_decoration_accent_color CHECK (accent_color IS NULL OR accent_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_decoration_border_color CHECK (border_color IS NULL OR border_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_decoration_frame_color CHECK (frame_color IS NULL OR frame_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_decoration_badges CHECK (JSON_TYPE(pinned_badges) = 'ARRAY' AND JSON_LENGTH(pinned_badges) <= 3)
) ENGINE=InnoDB;
