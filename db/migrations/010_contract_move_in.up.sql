-- 010: move-in bill and signed paper contract.
-- move_in_bill_id links the move-in bill (first month of rent + rest of the deposit) to its contract; contracts
-- waiting for that bill without this link are older ones and are handled by hand.
-- start_meter_reading is the electricity meter when the room is handed over (required when the move-in bill is issued).
-- paper_signed_date is the date written on the signed paper contract; the file itself is stored outside public/
-- (contract_file_url = 'paper:<file>'). paper_uploaded_at is Thai local time from the app, never MySQL NOW().
-- Run: mysql -u <user> -p <db> < db/migrations/010_contract_move_in.up.sql

ALTER TABLE contracts
  ADD move_in_bill_id INT NULL,
  ADD start_meter_reading DECIMAL(10,2) NULL,
  ADD paper_signed_date DATE NULL,
  ADD paper_uploaded_at DATETIME NULL,
  ADD paper_uploaded_by INT NULL;
