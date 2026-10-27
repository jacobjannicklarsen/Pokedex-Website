-- Optional manual additive profile customization upgrade, after v0.6.0.
-- Review and back up pokedex_app before running in MySQL Workbench.
USE pokedex_app;
CREATE TABLE IF NOT EXISTS trainer_decorations (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  palette VARCHAR(16) NOT NULL DEFAULT 'mint',
  pattern VARCHAR(24) NOT NULL DEFAULT 'aurora',
  frame VARCHAR(16) NOT NULL DEFAULT 'classic',
  effect VARCHAR(16) NOT NULL DEFAULT 'none',
  title VARCHAR(40) NOT NULL DEFAULT '',
  motto VARCHAR(120) NOT NULL DEFAULT '',
  pinned_badges JSON NOT NULL,
  CONSTRAINT fk_decoration_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_decoration_palette CHECK (palette IN ('mint','ocean','sunset','violet','rose','gold','ember','arctic')),
  CONSTRAINT ck_decoration_pattern CHECK (pattern IN ('aurora','constellation','grid','waves','petals','plain')),
  CONSTRAINT ck_decoration_frame CHECK (frame IN ('classic','halo','double','laurel','hexagon','orbit')),
  CONSTRAINT ck_decoration_effect CHECK (effect IN ('none','sparkles','shimmer')),
  CONSTRAINT ck_decoration_badges CHECK (JSON_TYPE(pinned_badges) = 'ARRAY' AND JSON_LENGTH(pinned_badges) <= 3)
) ENGINE=InnoDB;
