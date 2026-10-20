-- 020 rollback: drop the occupant-change history (contracts.occupants keeps its current value). Run with the code from
-- before commit 27, which does not read the table.
-- Run: mysql -u <user> -p <db> < db/migrations/020_contract_occupant_changes.down.sql

DROP TABLE contract_occupant_changes;
