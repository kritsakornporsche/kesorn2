-- 023: columns the sign-up / profile / booking code already uses on users (app/api/auth/signup, app/api/user/profile,
-- app/api/contracts) but no earlier migration added: the parent's phone and the tenant's name/address fields as JSON
-- text (JSON.stringify of { title, firstName, lastName, houseNo, … }).
-- Adds only — existing rows get NULL; no row is changed. Safe to run again: each column is added only when
-- information_schema shows it is missing (a server where someone added them by hand is left as it is).
-- Types: parent_phone as users.phone / contracts.parent_phone (VARCHAR(50)); party_data TEXT (works on MySQL and
-- MariaDB; the app stores and reads it as a JSON string).
-- Run: mysql -u <user> -p <db> < db/migrations/023_user_parent_phone_party_data.up.sql

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'parent_phone');
SET @sql := IF(@has = 0,
  'ALTER TABLE users ADD COLUMN parent_phone VARCHAR(50) NULL AFTER phone',
  'SELECT ''023: users.parent_phone already exists — skipped'' AS note');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'party_data');
SET @sql := IF(@has = 0,
  'ALTER TABLE users ADD COLUMN party_data TEXT NULL',
  'SELECT ''023: users.party_data already exists — skipped'' AS note');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
