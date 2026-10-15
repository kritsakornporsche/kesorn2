-- 017 rollback: nothing to do. The cleared ID numbers / card images cannot be restored by SQL —
-- restore them from the backup taken before 017 if they are really needed (they should not be: PDPA).
-- Run: mysql -u <user> -p <db> < db/migrations/017_pdpa_clear_id_card.down.sql

SELECT 'migration 017 cannot be rolled back; restore from the backup taken before it' AS note;
