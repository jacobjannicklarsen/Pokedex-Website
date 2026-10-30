-- Review and apply manually in MySQL Workbench for existing installations.
-- Preserves audit records and includes the earlier password audit action.
USE pokedex_app;
ALTER TABLE admin_audit_logs
 DROP CHECK ck_audit_action,
 ADD CONSTRAINT ck_audit_action CHECK (action IN
 ('owner.bootstrap','role.change','permissions.change','restriction.apply','restriction.revoke','password.change','username.change'));
