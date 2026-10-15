-- 006: deposits are recorded as a liability (money held for the tenant), not as income
-- Existing rows are not changed (older deposits stay as Income/Deposit and refunds as Expense/Deposit Refund)
-- Run: mysql -u <user> -p <db> < db/migrations/006_accounting_liability.up.sql

ALTER TABLE accounting_transactions
  MODIFY type ENUM('Income', 'Expense', 'Liability') NOT NULL;
