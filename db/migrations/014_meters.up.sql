-- 014: meter readings (lib/meters.ts). Every reading is recorded by the server: the previous reading comes from the
-- database (the latest row of the room by time, any kind), never from the page.
--   kind: cycle (the monthly reading, one per room / type / billing cycle) · start (contract start, lib/moveIn.ts)
--         · move_out (return day, lib/moveOut.ts). Only kind = 'cycle' prices a monthly bill.
--   event: normal · rollover (the meter passed its maximum and started again from 0; rollover_at = that maximum)
--          · replaced (a new meter: old_meter_final = last number of the old one, new_meter_start = first of the new one)
--   recorded_by / recorded_at: who recorded it and when (app time, Thai). confirmed_by / confirmed_at: for a later
--   "keeper records, owner confirms" step; owner/manager readings are confirmed when recorded.
--   photo_file: random file name under storage/meters (served by /api/meters/[id]/photo). Older rows keep photo_url.
-- Uniqueness: one 'cycle' row per room / type / cycle (generated cycle_key). Monthly bills are kept unique by
-- lib/meters.ts in a transaction (contract row locked), not by a key: a month also has damage / service / final bills.
-- Existing rows become kind 'cycle' (not converted otherwise). Count before deploying — must be 0:
--   SELECT COUNT(*) FROM (SELECT room_id, type, billing_cycle FROM meter_readings
--     GROUP BY room_id, type, billing_cycle HAVING COUNT(*) > 1) d;
-- Before deploying: the app needs a writable storage/meters directory (like storage/maintenance).
-- Run: mysql -u <user> -p <db> < db/migrations/014_meters.up.sql

ALTER TABLE meter_readings
  ADD kind ENUM('cycle','start','move_out') NOT NULL DEFAULT 'cycle',
  ADD event ENUM('normal','rollover','replaced') NOT NULL DEFAULT 'normal',
  ADD rollover_at DECIMAL(10,2) NULL,
  ADD old_meter_final DECIMAL(10,2) NULL,
  ADD new_meter_start DECIMAL(10,2) NULL,
  ADD event_note VARCHAR(500) NULL,
  ADD large_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  ADD photo_file VARCHAR(64) NULL,
  ADD recorded_by INT NULL,
  ADD recorded_at DATETIME NULL,
  ADD confirmed_by INT NULL,
  ADD confirmed_at DATETIME NULL,
  ADD cycle_key VARCHAR(80) AS (IF(kind = 'cycle', CONCAT(room_id, '|', type, '|', billing_cycle), NULL)) STORED,
  ADD UNIQUE KEY uq_meter_cycle (cycle_key),
  ADD INDEX idx_meter_room (room_id, id);
