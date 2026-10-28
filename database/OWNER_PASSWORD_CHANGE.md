# Owner password changes

Owners can use Administration → User management → Change password for their own
account or a lower-role account. The form requires the Owner's current password,
a confirmed new password of 12–128 characters and an audit reason. Changing a
password invalidates all sessions for the affected account. Other Owner accounts
remain protected. Passwords and hashes are excluded from audit metadata.

Existing databases need [owner-password-audit.sql](migrations/owner-password-audit.sql)
applied once after the existing v0.7.1 migration. It expands the audit action CHECK
constraint without modifying existing records. Fresh installations include the
constraint in schema.sql. Restart Express after updating the server code.

The application's database account may have CRUD privileges only. Apply this
migration through an administrative MySQL Workbench connection; the application
does not need ALTER privileges during normal use.
