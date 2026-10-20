-- 008 rollback: removes the deposit source columns (which contracts were marked is lost)
-- Run: mysql -u <user> -p <db> < db/migrations/008_contract_deposit_source.down.sql

ALTER TABLE contracts
  DROP COLUMN deposit_outside_system,
  DROP COLUMN deposit_note;
