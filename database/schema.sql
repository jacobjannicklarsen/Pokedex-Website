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
