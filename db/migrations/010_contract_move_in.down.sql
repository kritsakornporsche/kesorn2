-- 010 rollback: removes the move-in bill link, start meter and signed paper columns.
-- Contracts waiting for their move-in bill lose the link (they become "handled by hand"); files in storage/contracts
-- stay on disk but contract_file_url values 'paper:<file>' can no longer be opened through the app.
-- Run: mysql -u <user> -p <db> < db/migrations/010_contract_move_in.down.sql

ALTER TABLE contracts
  DROP COLUMN move_in_bill_id,
  DROP COLUMN start_meter_reading,
  DROP COLUMN paper_signed_date,
  DROP COLUMN paper_uploaded_at,
  DROP COLUMN paper_uploaded_by;
