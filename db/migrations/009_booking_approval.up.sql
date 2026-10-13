-- 009: approve-then-pay bookings. Times are Thai local time (the app's MySQL pool uses timezone +07:00) and are
-- always written/compared with the time from the app, never MySQL NOW().
-- booking_bill_id links the booking-fee bill (created at approval) to its contract.
-- New contract statuses (varchar, no schema change): BookingRequested, BookingApproved, Expired, Rejected.
-- Run: mysql -u <user> -p <db> < db/migrations/009_booking_approval.up.sql

ALTER TABLE contracts
  ADD approved_at DATETIME NULL,
  ADD approved_by INT NULL,
  ADD expires_at DATETIME NULL,
  ADD cancelled_at DATETIME NULL,
  ADD cancelled_by INT NULL,
  ADD cancel_reason VARCHAR(500) NULL,
  ADD booking_bill_id INT NULL,
  ADD INDEX idx_contracts_status_expires (status, expires_at);
