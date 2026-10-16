-- 015 rollback: drops the rate history, the late fee snapshot on bills and the new profile columns; restores the
-- old column defaults. Late fees then follow the current rate again for every bill.
-- Run: mysql -u <user> -p <db> < db/migrations/015_rates_settings.down.sql

DROP TABLE IF EXISTS rate_changes;
ALTER TABLE bills DROP COLUMN late_fee_rate;
ALTER TABLE dormitory_profile
  DROP COLUMN cleaning_fee,
  DROP COLUMN bank_name,
  DROP COLUMN bank_account,
  DROP COLUMN bank_account_name,
  MODIFY water_rate DECIMAL(10,2) DEFAULT 18.00,
  MODIFY electricity_rate DECIMAL(10,2) DEFAULT 8.00;
