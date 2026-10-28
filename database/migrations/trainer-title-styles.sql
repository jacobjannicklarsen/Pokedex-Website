-- Manual additive option expansion, after v0.6.1-trainer-studio.sql.
-- Back up pokedex_app first. No rows, fields or saved titles are changed.
USE pokedex_app;
ALTER TABLE trainer_decorations
  DROP CHECK ck_decoration_title_style,
  ADD CONSTRAINT ck_decoration_title_style CHECK (title_style IN ('ribbon','pill','minimal','outlined','medallion','ticket','gradient','champion'));
