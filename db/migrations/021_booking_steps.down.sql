-- 021 rollback: drop the step-3 confirmation, the paper-acknowledgement marker and the contract data change history.
-- Contracts keep their status and data; inspections keep tenant_ack_at. Run with the code from before commit 28.
-- Run: mysql -u <user> -p <db> < db/migrations/021_booking_steps.down.sql

DROP TABLE contract_data_changes;

ALTER TABLE contract_inspections
  DROP COLUMN ack_paper_by;

ALTER TABLE contracts
  DROP COLUMN data_confirmed_by,
  DROP COLUMN data_confirmed_at;
