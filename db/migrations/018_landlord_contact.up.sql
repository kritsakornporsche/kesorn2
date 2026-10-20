-- 018: landlord name and phone printed on the contract (Word export and print page) instead of the names / phone
-- that were written into the code. Set by the owner on the settings page ("ข้อมูลผู้ให้เช่า (ใช้ในสัญญา)").
-- Empty (NULL) = the contract shows a dotted line to fill in by hand. The landlord address is the dorm address
-- (dormitory_profile.address) — no new column for it.
-- Count before running: SELECT COUNT(*) FROM dormitory_profile;  (expected 1 — every row gets NULL, nothing else changes)
-- Run: mysql -u <user> -p <db> < db/migrations/018_landlord_contact.up.sql

ALTER TABLE dormitory_profile
  ADD COLUMN landlord_name VARCHAR(255) NULL AFTER phone,
  ADD COLUMN landlord_phone VARCHAR(50) NULL AFTER landlord_name;
