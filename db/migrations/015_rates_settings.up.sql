-- 015: one rates page (lib/settings.ts). dormitory_profile stays the single place for rates and payment details.
--   cleaning_fee: default proposed charge for a maid's cleaning job (KeeperJobs) · bank_*: transfer details printed on
--   the contract (with promptpay_number / promptpay_name) · column defaults now match the real rates (rows unchanged).
--   bills.late_fee_rate: the late fee per day in force when the bill was sent (lib/bill-status.ts sendBills); a later
--   rate change does not change the late fee of bills already sent. Backfill: every sent bill (not Draft / Cancelled)
--   gets today's rate. NULL (drafts, older code paths) → the current rate, as before.
--   rate_changes: who changed which rate / payment field, when, from what to what (owner only, lib/settings.ts).
-- Run: mysql -u <user> -p <db> < db/migrations/015_rates_settings.up.sql

ALTER TABLE dormitory_profile
  ADD cleaning_fee DECIMAL(10,2) NOT NULL DEFAULT 300.00,
  ADD bank_name VARCHAR(255) NULL,
  ADD bank_account VARCHAR(50) NULL,
  ADD bank_account_name VARCHAR(255) NULL,
  MODIFY water_rate DECIMAL(10,2) DEFAULT 100.00,
  MODIFY electricity_rate DECIMAL(10,2) DEFAULT 4.88;

ALTER TABLE bills ADD late_fee_rate DECIMAL(10,2) NULL;

UPDATE bills
   SET late_fee_rate = (SELECT COALESCE(MAX(late_fee_per_day), 50.00) FROM dormitory_profile)
 WHERE LOWER(status) NOT IN ('draft', 'cancelled', 'canceled');

CREATE TABLE rate_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field VARCHAR(50) NOT NULL,
  old_value VARCHAR(255) NULL,
  new_value VARCHAR(255) NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL,
  INDEX idx_rate_changes_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
