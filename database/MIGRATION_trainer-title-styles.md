# Additional trainer title styles

Prepared only; not applied automatically or during this update.

Existing `title_style` fields already store the choice, but the v0.6.1 CHECK
allows only Ribbon, Pill and Minimal. The separate
`migrations/trainer-title-styles.sql` widens that check to retain those three
and add Outlined, Medallion, Ticket, Gradient and Champion. No columns, title
text, profile settings, accounts or saved designs are changed.

1. Back up `pokedex_app` and verify MySQL 8.0.16+ and the intended connection.
2. Apply earlier Studio migrations first if needed. Open this new SQL file in
   MySQL Workbench, inspect its single ALTER and execute manually after approval.
3. Verify `SHOW CREATE TABLE pokedex_app.trainer_decorations;` contains all eight
   `title_style` values. Restart Express and save/reload one new style in Profile.

Fresh installations use the updated `schema.sql`; do not run the ALTER again.
The script may be safely rerun on the intended schema (it replaces the same
named constraint), but MySQL DDL commits implicitly and cannot be undone by a
normal transaction rollback. If the ALTER fails, inspect the current CHECK
definition before retrying; do not delete decoration rows or recreate the table.

Before applying it, the three existing styles continue saving normally. A new
style previews locally, but a rejected save reports this migration and never
claims persistence. New title styles are cosmetic, independent of staff roles,
earned badges and the actual Champion caught milestone.
