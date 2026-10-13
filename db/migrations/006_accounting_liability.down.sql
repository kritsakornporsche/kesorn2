-- 006 rollback: removes the Liability type. Liability rows (deposits held, refunds, forfeits moved out)
-- are deleted first because the old ENUM cannot hold them (data is lost)
-- Run: mysql -u <user> -p <db> < db/migrations/006_accounting_liability.down.sql

DELETE FROM accounting_transactions WHERE type = 'Liability';

ALTER TABLE accounting_transactions
  MODIFY type ENUM('Income', 'Expense') NOT NULL;
