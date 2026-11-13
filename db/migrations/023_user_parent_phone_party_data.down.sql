-- 023 down: removes users.parent_phone and users.party_data (only when they exist). WARNING: this deletes the parent
-- phones and name/address fields people saved since 023 — back up first; on a server where these columns were added by
-- hand before 023, do not run this file.
-- Run: mysql -u <user> -p <db> < db/migrations/023_user_parent_phone_party_data.down.sql

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'party_data');
SET @sql := IF(@has = 1, 'ALTER TABLE users DROP COLUMN party_data', 'SELECT ''023 down: users.party_data not there — skipped'' AS note');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'parent_phone');
SET @sql := IF(@has = 1, 'ALTER TABLE users DROP COLUMN parent_phone', 'SELECT ''023 down: users.parent_phone not there — skipped'' AS note');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
