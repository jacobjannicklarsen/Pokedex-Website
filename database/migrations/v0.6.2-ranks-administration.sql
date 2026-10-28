-- Manual additive migration. Back up pokedex_app and review before execution.
-- No existing account receives staff privileges; bootstrap is a separate command.
USE pokedex_app;
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
