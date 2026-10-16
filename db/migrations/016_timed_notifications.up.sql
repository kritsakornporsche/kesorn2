-- 016: timed notifications (lib/reminders.ts). A reminder is sent once per (user, event): notifications.event_key is
-- unique per user and reminders are inserted with INSERT IGNORE, so a second run (the check from GET /api/notifications,
-- the cron route, two app servers) never repeats one. NULL keys (every other notification) may repeat as before.
--   Keys: meter:<cycle> · due_soon:<bill> · due_today:<bill> · overdue15:<bill> · movein_due:<contract> · booking_expired:<contract>
-- Existing "overdue > 15 days" alerts (commit 8, one per user and bill, link /owner/billing?bill=<id>) get their key,
-- so moving that check into lib/reminders.ts does not send them again.
-- job_runs: when the reminders last ran (the check from page loads runs at most every 10 minutes).
-- Run: mysql -u <user> -p <db> < db/migrations/016_timed_notifications.up.sql

ALTER TABLE notifications
  ADD event_key VARCHAR(120) NULL,
  ADD UNIQUE KEY uq_notifications_event (user_id, event_key);

UPDATE notifications n
  JOIN (SELECT MIN(id) AS id FROM notifications
         WHERE type = 'overdue_alert' AND link LIKE '/owner/billing?bill=%'
         GROUP BY user_id, link) first_alert ON first_alert.id = n.id
   SET n.event_key = CONCAT('overdue15:', SUBSTRING_INDEX(n.link, '=', -1));

CREATE TABLE job_runs (
  name VARCHAR(50) PRIMARY KEY,
  ran_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO job_runs (name, ran_at) VALUES ('reminders', '2000-01-01 00:00:00');
