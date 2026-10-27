-- Manual additive v0.6.1 upgrade. Back up pokedex_app; run once after profile-decorations.sql.
-- Existing choices, uploads, biographies and visibility are unchanged.
USE pokedex_app;
ALTER TABLE trainer_decorations
  ADD COLUMN accent_color CHAR(7) NULL DEFAULT NULL,
  ADD COLUMN border_color CHAR(7) NULL DEFAULT NULL,
  ADD COLUMN frame_color CHAR(7) NULL DEFAULT NULL,
  ADD COLUMN border_style VARCHAR(16) NOT NULL DEFAULT 'solid',
  ADD COLUMN title_style VARCHAR(16) NOT NULL DEFAULT 'ribbon',
  DROP CHECK ck_decoration_palette,
  ADD CONSTRAINT ck_decoration_palette CHECK (palette IN ('mint','ocean','sunset','violet','rose','gold','ember','arctic','forest','cobalt','copper','monochrome')),
  DROP CHECK ck_decoration_pattern,
  ADD CONSTRAINT ck_decoration_pattern CHECK (pattern IN ('aurora','constellation','grid','waves','petals','plain','nebula','depths','ember','forest','royal')),
  DROP CHECK ck_decoration_frame,
  ADD CONSTRAINT ck_decoration_frame CHECK (frame IN ('classic','halo','double','laurel','hexagon','orbit','rounded','diamond','neon','minimal','champion')),
  DROP CHECK ck_decoration_effect,
  ADD CONSTRAINT ck_decoration_effect CHECK (effect IN ('none','sparkles','shimmer','starfield','holographic','glow','electric','particles')),
  ADD CONSTRAINT ck_decoration_border_style CHECK (border_style IN ('solid','double','dashed','etched')),
  ADD CONSTRAINT ck_decoration_title_style CHECK (title_style IN ('ribbon','pill','minimal')),
  ADD CONSTRAINT ck_decoration_accent_color CHECK (accent_color IS NULL OR accent_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT ck_decoration_border_color CHECK (border_color IS NULL OR border_color REGEXP '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT ck_decoration_frame_color CHECK (frame_color IS NULL OR frame_color REGEXP '^#[0-9A-Fa-f]{6}$');
