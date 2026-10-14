-- 012: move-out settlement (notice, room return, final bill, deposit settlement, refund). One row per move-out
-- request made from commit 12 on. Times are Thai local time from the app (pool timezone +07:00), never MySQL NOW().
-- State: Notified (contract still Active) -> Returned (contract Ended, room released, final bill issued)
--        -> Settled (bills offset from the deposit; rest forfeited or waiting to be refunded) -> Closed; or Cancelled.
-- Accounting rows of a settlement use reference_type settlement_opening / settlement_offset / settlement_forfeit /
-- settlement_refund with reference_id = move_out_settlements.id. Liability of the contract must be 0 when Closed.
-- bill_payments.method gains 'deposit_offset' (a bill paid from the deposit through lib/payments.ts).
--
-- Existing data is NOT converted. Move-out requests without a row here are "คำขอแบบเดิม — จัดการด้วยมือ".
-- Count before deploying:
--   SELECT COUNT(*) AS old_requests, SUM(status IN ('Pending','Approved')) AS still_open FROM move_out_requests;
--   SELECT id, tenant_id, room_id FROM contracts WHERE status = 'MoveOutPending';   -- keep holding their room
--   SELECT COUNT(*) FROM contracts c WHERE c.status IN ('Active','MoveOutPending')
--     AND c.booking_bill_id IS NULL AND c.move_in_bill_id IS NULL AND c.parent_contract_id IS NULL
--     AND c.deposit_outside_system = 0;                                             -- deposit to be confirmed by hand
-- Run: mysql -u <user> -p <db> < db/migrations/012_move_out_settlement.up.sql

CREATE TABLE move_out_settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  contract_id INT NOT NULL,
  tenant_id INT NOT NULL,
  room_id INT NOT NULL,
  state ENUM('Notified','Returned','Settled','Closed','Cancelled') NOT NULL DEFAULT 'Notified',
  notice_at DATETIME NOT NULL,
  notice_by INT NULL,
  planned_return_date DATE NOT NULL,
  paper_notice_date DATE NULL,
  return_date DATE NULL,
  returned_at DATETIME NULL,
  returned_by INT NULL,
  prev_meter DECIMAL(10,2) NULL,
  final_meter DECIMAL(10,2) NULL,
  final_bill_id INT NULL,
  damage_bill_id INT NULL,
  damage_items TEXT NULL,
  early TINYINT(1) NULL,
  c13_half TINYINT(1) NULL,
  c13_notice TINYINT(1) NULL,
  c13_no_arrears TINYINT(1) NULL,
  refundable TINYINT(1) NULL,
  deposit_source VARCHAR(20) NULL,
  deposit_amount DECIMAL(10,2) NULL,
  deposit_note VARCHAR(500) NULL,
  deposit_confirmed_by INT NULL,
  deposit_confirmed_at DATETIME NULL,
  offset_total DECIMAL(10,2) NULL,
  forfeit_total DECIMAL(10,2) NULL,
  refund_amount DECIMAL(10,2) NULL,
  refund_due_date DATE NULL,
  settled_at DATETIME NULL,
  settled_by INT NULL,
  refund_file VARCHAR(64) NULL,
  refunded_at DATETIME NULL,
  refunded_by INT NULL,
  closed_at DATETIME NULL,
  closed_by INT NULL,
  cancelled_at DATETIME NULL,
  cancelled_by INT NULL,
  UNIQUE KEY uq_move_out_settlement_request (request_id),
  KEY idx_move_out_settlement_contract (contract_id),
  KEY idx_move_out_settlement_state (state)
);

ALTER TABLE bill_payments
  MODIFY method ENUM('slip','cash','transfer','deposit_offset') NOT NULL;
