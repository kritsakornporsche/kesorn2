-- 005 rollback: removes the status history and unpay columns (data is lost)
-- Run: mysql -u <user> -p <db> < db/migrations/005_bill_status_flow.down.sql

DROP TABLE bill_status_history;

ALTER TABLE bill_payments
  DROP COLUMN voided_at,
  DROP COLUMN voided_by,
  DROP COLUMN void_reason;

ALTER TABLE bills
  DROP COLUMN sent_at;
