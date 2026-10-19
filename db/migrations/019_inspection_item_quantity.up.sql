-- 019: quantity of a countable item in a room inspection (commit 26) — e.g. กุญแจห้อง 2, รีโมทแอร์ 1. Recorded at
-- move-in and at move-out and compared item by item. NULL = not a counted item (every existing row, nothing else changes).
-- The item list itself is in the code (lib/room-items.ts), not in the database; each saved inspection keeps its own copy
-- of the names and quantities, so changing the list never changes an inspection already saved.
-- Count before running: SELECT COUNT(*) FROM contract_inspection_items;  (every row gets NULL)
-- Run: mysql -u <user> -p <db> < db/migrations/019_inspection_item_quantity.up.sql

ALTER TABLE contract_inspection_items
  ADD COLUMN quantity INT NULL AFTER condition_status;
