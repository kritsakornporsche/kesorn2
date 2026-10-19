-- 019 rollback: drop the quantity column (quantities recorded in inspections are lost; names, conditions, notes and
-- photos stay). Run with the code from before commit 26, which does not read the column.
-- Run: mysql -u <user> -p <db> < db/migrations/019_inspection_item_quantity.down.sql

ALTER TABLE contract_inspection_items
  DROP COLUMN quantity;
