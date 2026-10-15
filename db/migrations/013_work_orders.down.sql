-- 013 rollback: removes the board columns and maintenance_photos. Jobs made from commit 13 on lose their state,
-- assignment and charge decision (bills already issued stay); photo files in storage/maintenance stay on disk.
-- Run: mysql -u <user> -p <db> < db/migrations/013_work_orders.down.sql

DROP TABLE IF EXISTS maintenance_photos;
ALTER TABLE maintenance_requests
  DROP INDEX idx_maintenance_state,
  DROP INDEX idx_maintenance_assigned,
  DROP INDEX idx_maintenance_settlement,
  DROP COLUMN kind, DROP COLUMN state, DROP COLUMN requested_by, DROP COLUMN requested_at, DROP COLUMN contract_id,
  DROP COLUMN room_id, DROP COLUMN move_out_settlement_id, DROP COLUMN assigned_to, DROP COLUMN assigned_by,
  DROP COLUMN assigned_at, DROP COLUMN started_at, DROP COLUMN done_at, DROP COLUMN done_note, DROP COLUMN closed_reason,
  DROP COLUMN closed_by, DROP COLUMN closed_at, DROP COLUMN charge_proposed, DROP COLUMN charge_proposed_note,
  DROP COLUMN charge_amount, DROP COLUMN charge_reason, DROP COLUMN charge_note, DROP COLUMN charge_decided_by,
  DROP COLUMN charge_decided_at, DROP COLUMN charge_bill_id;
