-- 021: booking → tenant in 7 steps (commit 28). Adds only — no existing row is changed.
--  · contracts.data_confirmed_at / data_confirmed_by: step 3 "ยืนยันข้อมูลสัญญา" (who / when, Thai time from the app).
--    NULL on every existing contract; lib/booking-steps.ts reads older contracts by what they already have.
--  · contract_inspections.ack_paper_by: the owner / manager who recorded "ผู้เช่ารับทราบบนกระดาษ" (the tenant signed
--    the printed inspection record); the time is tenant_ack_at as for an acknowledgement in the app. NULL = in the app.
--  · contract_data_changes: changes to confirmed contract data (name, address, occupants, dates): old → new as JSON,
--    reason, who, when. No changes are possible once the signed paper is uploaded.
-- Run: mysql -u <user> -p <db> < db/migrations/021_booking_steps.up.sql

ALTER TABLE contracts
  ADD COLUMN data_confirmed_at DATETIME NULL,
  ADD COLUMN data_confirmed_by INT NULL;

ALTER TABLE contract_inspections
  ADD COLUMN ack_paper_by INT NULL;

CREATE TABLE contract_data_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  changes TEXT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL,
  INDEX idx_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
