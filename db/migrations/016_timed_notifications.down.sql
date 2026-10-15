-- 016 rollback: removes the reminder keys and the run log. Notifications already sent stay (without their key), so
-- running the reminders again after re-applying 016 may repeat a reminder once.
-- Run: mysql -u <user> -p <db> < db/migrations/016_timed_notifications.down.sql

DROP TABLE IF EXISTS job_runs;
ALTER TABLE notifications
  DROP INDEX uq_notifications_event,
  DROP COLUMN event_key;
