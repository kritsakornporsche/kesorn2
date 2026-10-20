-- 007: rooms can be Reserved (booked, waiting for the contract). The code already writes 'Reserved';
-- without it in the ENUM a non-strict MySQL stores an empty status instead.
-- Rooms left with an empty status by that are set back from their contracts.
-- Run: mysql -u <user> -p <db> < db/migrations/007_rooms_reserved.up.sql

ALTER TABLE rooms
  MODIFY status ENUM('Available', 'Occupied', 'Maintenance', 'Reserved') DEFAULT 'Available';

UPDATE rooms r
SET r.status = CASE
  WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.room_id = r.id AND c.status = 'Active') THEN 'Occupied'
  WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.room_id = r.id AND c.status IN ('PendingOwnerSignature', 'PendingContract', 'PendingFirstBill')) THEN 'Reserved'
  ELSE 'Available'
END
WHERE r.status = '' OR r.status IS NULL;
