-- 018 rollback: drop the two landlord columns (the values typed on the settings page are lost; contracts go back to
-- whatever the code at that version prints).
-- Run: mysql -u <user> -p <db> < db/migrations/018_landlord_contact.down.sql

ALTER TABLE dormitory_profile
  DROP COLUMN landlord_phone,
  DROP COLUMN landlord_name;
