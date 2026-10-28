-- Existing installations: preserve all audit records and allow password-change events.
USE pokedex_app;
ALTER TABLE admin_audit_logs
  DROP CHECK ck_audit_action,
  ADD CONSTRAINT ck_audit_action CHECK (action IN
    ('owner.bootstrap','role.change','permissions.change','restriction.apply','restriction.revoke','password.change'));
