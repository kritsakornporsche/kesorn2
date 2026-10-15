-- 009 rollback: removes the booking approval columns (approval/expiry/cancel times and who did it are lost).
-- Contracts left in BookingRequested/BookingApproved should be cancelled first; this does not change statuses.
-- Run: mysql -u <user> -p <db> < db/migrations/009_booking_approval.down.sql

ALTER TABLE contracts
  DROP INDEX idx_contracts_status_expires,
  DROP COLUMN approved_at,
  DROP COLUMN approved_by,
  DROP COLUMN expires_at,
  DROP COLUMN cancelled_at,
  DROP COLUMN cancelled_by,
  DROP COLUMN cancel_reason,
  DROP COLUMN booking_bill_id;
