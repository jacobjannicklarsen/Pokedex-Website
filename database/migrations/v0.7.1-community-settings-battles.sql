-- Dexhaven v0.7.1: manual, additive upgrade after the complete v0.7.0 migration.
-- Back up pokedex_app. DDL commits implicitly. No existing content is reset.
USE pokedex_app;
CREATE TABLE IF NOT EXISTS user_settings (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL UNIQUE,
 profile JSON NOT NULL,
 privacy JSON NOT NULL,
 notifications JSON NOT NULL,
 preferences JSON NOT NULL,
 banner_filename VARCHAR(64) DEFAULT NULL,
 security_version INT UNSIGNED NOT NULL DEFAULT 0,
 last_active_at TIMESTAMP(3) NULL DEFAULT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 KEY ix_settings_presence (last_active_at,user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS trainer_follows (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 target_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
 UNIQUE KEY uq_trainer_follow (user_id,target_id),
 KEY ix_trainer_followers (target_id,user_id),
 CONSTRAINT ck_trainer_follow_self CHECK (user_id<>target_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS trainer_blocks (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 target_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
 UNIQUE KEY uq_trainer_block (user_id,target_id),
 KEY ix_trainer_block_target (target_id,user_id),
 CONSTRAINT ck_trainer_block_self CHECK (user_id<>target_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_bookmarks (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 thread_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 UNIQUE KEY uq_forum_bookmark (user_id,thread_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_reads (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL UNIQUE,
 read_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_category_layout (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 category_id INT UNSIGNED NOT NULL UNIQUE,
 group_name VARCHAR(60) NOT NULL,
 parent_id INT UNSIGNED DEFAULT NULL,
 FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE RESTRICT,
 FOREIGN KEY (parent_id) REFERENCES forum_categories(id) ON DELETE RESTRICT,
 CONSTRAINT ck_forum_layout_self CHECK (parent_id IS NULL OR parent_id<>category_id),
 KEY ix_forum_layout_parent (parent_id)
) ENGINE=InnoDB;
INSERT IGNORE INTO forum_category_layout (category_id,group_name,parent_id)
 SELECT id,CASE WHEN announcements=1 OR name='Dexhaven Feedback & Support' THEN 'Dexhaven' ELSE 'Pokémon' END,NULL FROM forum_categories;
CREATE TABLE IF NOT EXISTS forum_polls (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 thread_id INT UNSIGNED NOT NULL UNIQUE,
 author_id INT UNSIGNED NOT NULL,
 question VARCHAR(200) NOT NULL,
 closes_at TIMESTAMP(3) NULL DEFAULT NULL,
 closed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE RESTRICT,
 FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_poll_options (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 poll_id INT UNSIGNED NOT NULL,
 label VARCHAR(100) NOT NULL,
 position TINYINT UNSIGNED NOT NULL,
 FOREIGN KEY (poll_id) REFERENCES forum_polls(id) ON DELETE RESTRICT,
 UNIQUE KEY uq_poll_position (poll_id,position),
 UNIQUE KEY uq_poll_option_parent (id,poll_id),
 CONSTRAINT ck_poll_position CHECK (position BETWEEN 1 AND 6)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS forum_poll_votes (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 poll_id INT UNSIGNED NOT NULL,
 option_id INT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (poll_id) REFERENCES forum_polls(id) ON DELETE RESTRICT,
 FOREIGN KEY (option_id,poll_id) REFERENCES forum_poll_options(id,poll_id) ON DELETE RESTRICT,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 UNIQUE KEY uq_poll_vote (poll_id,user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS battle_runs (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 seed INT UNSIGNED NOT NULL,
 mode VARCHAR(8) NOT NULL,
 difficulty VARCHAR(8) NOT NULL,
 configuration JSON NOT NULL,
 ruleset VARCHAR(40) NOT NULL,
 status VARCHAR(10) NOT NULL DEFAULT 'started',
 replay JSON DEFAULT NULL,
 digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
 qualified BOOLEAN NOT NULL DEFAULT FALSE,
 started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 completed_at TIMESTAMP(3) NULL DEFAULT NULL,
 deleted_at TIMESTAMP(3) NULL DEFAULT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 UNIQUE KEY uq_battle_replay (user_id,digest),
 KEY ix_battle_history (user_id,status,deleted_at,id),
 KEY ix_battle_awards (user_id,qualified,completed_at),
 CONSTRAINT ck_battle_mode CHECK (mode IN ('player','auto')),
 CONSTRAINT ck_battle_difficulty CHECK (difficulty IN ('easy','normal','hard')),
 CONSTRAINT ck_battle_status CHECK (status IN ('started','completed'))
) ENGINE=InnoDB;
-- Existing notifications keep their IDs/read state. New kinds may have no thread.
ALTER TABLE user_notifications
 MODIFY COLUMN thread_id INT UNSIGNED NULL,
 ADD COLUMN actor_id INT UNSIGNED NULL,
 ADD CONSTRAINT fk_notification_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
 DROP CHECK ck_notification_kind,
 ADD CONSTRAINT ck_notification_kind CHECK (kind IN ('reply','mention','moderation','watched','follower','announcement'));
ALTER TABLE users ADD COLUMN bio_format VARCHAR(8) NOT NULL DEFAULT 'plain', ADD CONSTRAINT ck_bio_format CHECK (bio_format IN ('plain','limited'));
CREATE TABLE IF NOT EXISTS enhancement_state (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 schema_version INT UNSIGNED NOT NULL,
 CONSTRAINT ck_enhancement_singleton CHECK (id=1)
) ENGINE=InnoDB;
-- Publish readiness last. No startup script executes this file.
INSERT IGNORE INTO enhancement_state (id,schema_version) VALUES (1,1);
