-- Run manually once after v0.6.0-trainer-community.sql. Back up first.
-- Keep users.bio as the only active biography. Do not publish private text by default.
USE pokedex_app;
ALTER TABLE trainer_public_settings
  ADD COLUMN share_bio BOOLEAN NOT NULL DEFAULT FALSE AFTER public_bio;
-- public_bio is retained as an archive of old public biographies, never published.
