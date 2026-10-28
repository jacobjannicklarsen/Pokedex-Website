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
  CONSTRAINT ck_decoration_title_style CHECK (title_style IN ('ribbon','pill','minimal','outlined','medallion','ticket','gradient','champion')),
  CONSTRAINT ck_decoration_accent_color CHECK (accent_color IS NULL OR accent_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_decoration_border_color CHECK (border_color IS NULL OR border_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_decoration_frame_color CHECK (frame_color IS NULL OR frame_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_decoration_badges CHECK (JSON_TYPE(pinned_badges) = 'ARRAY' AND JSON_LENGTH(pinned_badges) <= 3)
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  role VARCHAR(16) NOT NULL DEFAULT 'trainer',
  permissions_json JSON NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  owner_key TINYINT GENERATED ALWAYS AS (CASE WHEN role = 'owner' THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY uq_protected_owner (owner_key),
  KEY ix_staff_role (role, user_id),
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_staff_role CHECK (role IN ('trainer','moderator','administrator','owner')),
  CONSTRAINT ck_staff_permissions CHECK (permissions_json IS NULL OR JSON_TYPE(permissions_json) = 'ARRAY')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_restrictions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  issued_by INT UNSIGNED NOT NULL,
  reason VARCHAR(300) NOT NULL,
  issued_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoked_by INT UNSIGNED NULL,
  revoke_reason VARCHAR(300) NULL,
  KEY ix_active_restriction (user_id, revoked_at, expires_at),
  KEY ix_restriction_expiry (expires_at, revoked_at),
  CONSTRAINT fk_restricted_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_restriction_actor FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_restriction_revoker FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_restriction_period CHECK (expires_at > issued_at AND expires_at <= TIMESTAMPADD(HOUR,720,issued_at)),
  CONSTRAINT ck_restriction_reason CHECK (CHAR_LENGTH(reason) BETWEEN 5 AND 300),
  CONSTRAINT ck_restriction_revocation CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL AND CHAR_LENGTH(revoke_reason) BETWEEN 5 AND 300))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NOT NULL,
  target_id INT UNSIGNED NOT NULL,
  target_role VARCHAR(16) NOT NULL,
  action VARCHAR(32) NOT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_admin_audit_actor (actor_id,id),
  KEY ix_admin_audit_target (target_id,id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_audit_action CHECK (action IN ('owner.bootstrap','role.change','permissions.change','restriction.apply','restriction.revoke')),
  CONSTRAINT ck_audit_target_role CHECK (target_role IN ('trainer','moderator','administrator','owner')),
  CONSTRAINT ck_audit_metadata CHECK (JSON_TYPE(metadata) = 'OBJECT')
) ENGINE=InnoDB;

-- Created last: one guard row serializes bootstrap, role, permission and restriction writes.
CREATE TABLE IF NOT EXISTS admin_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  schema_version TINYINT UNSIGNED NOT NULL,
  CONSTRAINT ck_admin_state CHECK (id = 1 AND schema_version = 1)
) ENGINE=InnoDB;
INSERT INTO admin_state (id,schema_version) VALUES (1,1) ON DUPLICATE KEY UPDATE schema_version = schema_version;

-- Dexhaven v0.7.0. Manual only. Requires v0.6.2 and v0.6.0 sharing/progression.
-- Back up pokedex_app and inspect the selected server before executing.
USE pokedex_app;

CREATE TABLE IF NOT EXISTS forum_categories (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(80) NOT NULL UNIQUE,
 description VARCHAR(300) NOT NULL DEFAULT '',
 announcements BOOLEAN NOT NULL DEFAULT FALSE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 position SMALLINT UNSIGNED NOT NULL DEFAULT 1,
 CONSTRAINT ck_forum_position CHECK (position BETWEEN 1 AND 1000)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_threads (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 category_id INT UNSIGNED NOT NULL,
 author_id INT UNSIGNED NOT NULL,
 title VARCHAR(120) NOT NULL,
 locked BOOLEAN NOT NULL DEFAULT FALSE,
 pinned BOOLEAN NOT NULL DEFAULT FALSE,
 visibility VARCHAR(8) NOT NULL DEFAULT 'visible',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE RESTRICT,
 FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_forum_thread_visibility CHECK (visibility IN ('visible','hidden','removed')),
 KEY ix_forum_thread_activity (visibility, pinned, updated_at, id),
 KEY ix_forum_thread_category (category_id, visibility, id),
 FULLTEXT KEY ft_forum_titles (title)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_posts (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 thread_id INT UNSIGNED NOT NULL,
 author_id INT UNSIGNED NOT NULL,
 body TEXT NOT NULL,
 team_share_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 quote_post_id INT UNSIGNED DEFAULT NULL,
 visibility VARCHAR(8) NOT NULL DEFAULT 'visible',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 edited_at TIMESTAMP(3) NULL DEFAULT NULL,
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
 FOREIGN KEY (quote_post_id) REFERENCES forum_posts(id) ON DELETE RESTRICT,
 CONSTRAINT ck_forum_post_visibility CHECK (visibility IN ('visible','hidden','removed')),
 CONSTRAINT ck_forum_body_length CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 6000),
 KEY ix_forum_post_thread (thread_id, id),
 KEY ix_forum_post_activity (thread_id, visibility, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_reactions (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 post_id INT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE RESTRICT,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 UNIQUE KEY uq_forum_reaction (post_id, user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_subscriptions (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 thread_id INT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 UNIQUE KEY uq_forum_follow (thread_id, user_id),
 KEY ix_forum_follow_user (user_id, thread_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_reports (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 thread_id INT UNSIGNED NOT NULL,
 post_id INT UNSIGNED DEFAULT NULL,
 reporter_id INT UNSIGNED NOT NULL,
 reason VARCHAR(500) NOT NULL,
 status VARCHAR(8) NOT NULL DEFAULT 'pending',
 resolved_by INT UNSIGNED DEFAULT NULL,
 resolution VARCHAR(500) DEFAULT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 resolved_at TIMESTAMP(3) NULL DEFAULT NULL,
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE RESTRICT,
 FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE RESTRICT,
 FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_forum_report_status CHECK (status IN ('pending','resolved')),
 KEY ix_forum_report_queue (status, id),
 KEY ix_forum_report_duplicate (thread_id, post_id, reporter_id, status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS user_notifications (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 thread_id INT UNSIGNED NOT NULL,
 post_id INT UNSIGNED DEFAULT NULL,
 event_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 kind VARCHAR(12) NOT NULL,
 read_at TIMESTAMP(3) NULL DEFAULT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE RESTRICT,
 CONSTRAINT ck_notification_kind CHECK (kind IN ('reply','mention','moderation')),
 UNIQUE KEY uq_notification_event (user_id, event_key),
 KEY ix_notification_unread (user_id, read_at, id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_audit_logs (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_id INT UNSIGNED NOT NULL,
 target_user_id INT UNSIGNED NOT NULL,
 thread_id INT UNSIGNED DEFAULT NULL,
 post_id INT UNSIGNED DEFAULT NULL,
 action VARCHAR(40) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 metadata JSON NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
 FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT,
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE RESTRICT,
 KEY ix_forum_audit_actor (actor_id, id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_state (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 schema_version INT UNSIGNED NOT NULL,
 CONSTRAINT ck_forum_state_singleton CHECK (id = 1)
) ENGINE=InnoDB;
INSERT IGNORE INTO forum_categories (name,description,announcements,position) VALUES
 ('Announcements','Official Dexhaven news and updates.',TRUE,1),
 ('General Pokémon','Meet other trainers and talk Pokémon.',FALSE,2),
 ('Team Building & Strategy','Share your six, trade tactics and ask for advice.',FALSE,3),
 ('Pokédex & Discoveries','Explore species, evolutions and discoveries.',FALSE,4),
 ('Competitive Battling','Battle strategies and Arena stories.',FALSE,5),
 ('Dexhaven Feedback & Support','Suggestions, bug reports and a helping hand.',FALSE,6);
-- Readiness is published only after every table and seed exists.
INSERT IGNORE INTO forum_state (id,schema_version) VALUES (1,1);
