-- 004 rollback: removes payment history and the paid summary columns (data is lost)
-- Run: mysql -u <user> -p <db> < db/migrations/004_add_bill_payments.down.sql

ALTER TABLE bills
  DROP COLUMN paid_at,
  DROP COLUMN payment_method;

DROP TABLE bill_payments;
