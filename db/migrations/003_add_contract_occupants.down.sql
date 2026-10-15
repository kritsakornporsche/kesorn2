-- 003 rollback: removes occupants (any value other than 1 is lost)
-- Run: mysql -u <user> -p <db> < db/migrations/003_add_contract_occupants.down.sql

ALTER TABLE contracts
  DROP COLUMN occupants;
