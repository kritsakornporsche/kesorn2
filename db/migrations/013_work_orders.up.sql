-- 013: repair / cleaning board. maintenance_requests becomes the one table for both kinds (cleaning_jobs is no longer
-- written; kept for reading). state is the new status flow (lib/maintenance.ts):
--   Requested -> InProgress (a keeper of this dorm claims it)  or  Requested -> Assigned (owner/manager) -> InProgress
--   InProgress -> Closed (finished without a charge)  or  -> Done (with a proposed charge) -> Closed (the owner decides)
--   Requested -> Cancelled (the tenant)   ·   Requested / Assigned -> Rejected (owner/manager, with a reason)
-- Rows with state NULL are from before commit 13 ("งานแบบเดิม"): shown read-only, closed by the owner by hand.
-- A charge proposed by the keeper is decided by the owner (amount may be changed or 0; reason tenant_damage /
-- wear_and_tear / service). Only tenant_damage (Damage) and service (Service) bill the tenant of the job's contract;
-- a job of a move-out goes into that settlement's damages instead (commit 12) while the deposit is not settled yet.
-- Photos are stored outside public/ (storage/maintenance/<random name>), listed in maintenance_photos.
-- Times are Thai local time from the app, never MySQL NOW(). Existing data is NOT converted.
-- Count before deploying:
--   SELECT COUNT(*) AS old_open_jobs FROM maintenance_requests
--     WHERE LOWER(COALESCE(status, '')) NOT IN ('completed', 'resolved', 'cancelled', 'rejected');
--   SELECT COUNT(*) AS cleaning_jobs_rows, SUM(LOWER(status) <> 'completed') AS cleaning_jobs_open FROM cleaning_jobs;
-- Before deploying: the app needs a writable storage/maintenance directory (like storage/contracts, storage/inspections).
-- Run: mysql -u <user> -p <db> < db/migrations/013_work_orders.up.sql

ALTER TABLE maintenance_requests
  ADD kind ENUM('repair','cleaning') NULL,
  ADD state ENUM('Requested','Assigned','InProgress','Done','Closed','Cancelled','Rejected') NULL,
  ADD requested_by INT NULL,
  ADD requested_at DATETIME NULL,
  ADD contract_id INT NULL,
  ADD room_id INT NULL,
  ADD move_out_settlement_id INT NULL,
  ADD assigned_to INT NULL,
  ADD assigned_by INT NULL,
  ADD assigned_at DATETIME NULL,
  ADD started_at DATETIME NULL,
  ADD done_at DATETIME NULL,
  ADD done_note TEXT NULL,
  ADD closed_reason VARCHAR(500) NULL,
  ADD closed_by INT NULL,
  ADD closed_at DATETIME NULL,
  ADD charge_proposed DECIMAL(10,2) NULL,
  ADD charge_proposed_note VARCHAR(500) NULL,
  ADD charge_amount DECIMAL(10,2) NULL,
  ADD charge_reason ENUM('tenant_damage','wear_and_tear','service') NULL,
  ADD charge_note VARCHAR(500) NULL,
  ADD charge_decided_by INT NULL,
  ADD charge_decided_at DATETIME NULL,
  ADD charge_bill_id INT NULL,
  ADD INDEX idx_maintenance_state (state),
  ADD INDEX idx_maintenance_assigned (assigned_to),
  ADD INDEX idx_maintenance_settlement (move_out_settlement_id);

CREATE TABLE maintenance_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  stage ENUM('report','done') NOT NULL,
  file VARCHAR(64) NOT NULL,
  uploaded_by INT NULL,
  uploaded_at DATETIME NOT NULL,
  KEY idx_maintenance_photos_request (request_id)
);
