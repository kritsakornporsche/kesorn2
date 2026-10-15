-- 014 rollback: removes the reading kind / event / recorder columns and the per-cycle unique key.
-- Photo files in storage/meters stay on disk (rows keep photo_url = /api/meters/<id>/photo, which stops working).
-- Run: mysql -u <user> -p <db> < db/migrations/014_meters.down.sql

ALTER TABLE meter_readings
  DROP INDEX uq_meter_cycle,
  DROP INDEX idx_meter_room,
  DROP COLUMN cycle_key, DROP COLUMN kind, DROP COLUMN event, DROP COLUMN rollover_at, DROP COLUMN old_meter_final,
  DROP COLUMN new_meter_start, DROP COLUMN event_note, DROP COLUMN large_confirmed, DROP COLUMN photo_file,
  DROP COLUMN recorded_by, DROP COLUMN recorded_at, DROP COLUMN confirmed_by, DROP COLUMN confirmed_at;
