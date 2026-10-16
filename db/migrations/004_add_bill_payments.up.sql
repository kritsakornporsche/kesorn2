-- 004: one row per payment received for a bill, plus a paid summary on bills
-- Run: mysql -u <user> -p <db> < db/migrations/004_add_bill_payments.up.sql

CREATE TABLE bill_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('slip','cash','transfer') NOT NULL,
  paid_at DATETIME NOT NULL,
  slip_ref VARCHAR(100) NULL,
  recorded_by INT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bill_payments_bill (bill_id),
  INDEX idx_bill_payments_slip_ref (slip_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE bills
  ADD paid_at DATETIME NULL,
  ADD payment_method VARCHAR(20) NULL;
