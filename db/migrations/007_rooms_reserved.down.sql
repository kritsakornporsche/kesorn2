-- 007 rollback: removes Reserved. Reserved rooms become Available first (the old ENUM cannot hold it)
-- Run: mysql -u <user> -p <db> < db/migrations/007_rooms_reserved.down.sql

UPDATE rooms SET status = 'Available' WHERE status = 'Reserved';

ALTER TABLE rooms
  MODIFY status ENUM('Available', 'Occupied', 'Maintenance') DEFAULT 'Available';
