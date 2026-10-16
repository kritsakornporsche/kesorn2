-- 005: draft -> sent -> paid flow, voidable payments (unpay) and a bill status history
-- Run: mysql -u <user> -p <db> < db/migrations/005_bill_status_flow.up.sql

ALTER TABLE bills
  ADD sent_at DATETIME NULL;

ALTER TABLE bill_payments
  ADD voided_at DATETIME NULL,
  ADD voided_by INT NULL,
  ADD void_reason TEXT NULL;

CREATE TABLE bill_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bill_status_history_bill (bill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
