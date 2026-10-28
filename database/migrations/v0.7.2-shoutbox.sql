-- Manual only. Preserve all existing tables and records.
USE pokedex_app;
CREATE TABLE IF NOT EXISTS shoutbox_messages (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 message VARCHAR(500) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 deleted_at TIMESTAMP(3) NULL DEFAULT NULL,
 deleted_by INT UNSIGNED DEFAULT NULL,
 CONSTRAINT fk_shoutbox_author FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT fk_shoutbox_moderator FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_shoutbox_message CHECK (CHAR_LENGTH(TRIM(message)) BETWEEN 1 AND 500),
 KEY ix_shoutbox_visible (deleted_at,id),
 KEY ix_shoutbox_author_time (user_id,created_at)
) ENGINE=InnoDB;
