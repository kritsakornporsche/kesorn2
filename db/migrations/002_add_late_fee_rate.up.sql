-- 002: late fee per day (THB) for monthly rent bills, editable as a dorm setting
-- Run: mysql -u <user> -p <db> < db/migrations/002_add_late_fee_rate.up.sql

ALTER TABLE dormitory_profile
  ADD late_fee_per_day DECIMAL(10,2) NOT NULL DEFAULT 50.00;
