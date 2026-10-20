-- 011 rollback: removes room inspections and their items.
-- Photos in storage/inspections stay on disk but can no longer be opened through the app.
-- Run: mysql -u <user> -p <db> < db/migrations/011_contract_inspections.down.sql

DROP TABLE IF EXISTS contract_inspection_items;
DROP TABLE IF EXISTS contract_inspections;
