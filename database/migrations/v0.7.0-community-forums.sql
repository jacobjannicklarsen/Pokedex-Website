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
