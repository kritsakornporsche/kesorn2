-- 002 rollback: removes the late fee setting (any custom value is lost)
-- Run: mysql -u <user> -p <db> < db/migrations/002_add_late_fee_rate.down.sql

ALTER TABLE dormitory_profile
  DROP COLUMN late_fee_per_day;
