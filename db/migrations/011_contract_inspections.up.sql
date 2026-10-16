-- 011: room inspection before move-in (and later move-out), with a photo per item and the tenant's acknowledgement.
-- One inspection per contract and kind. Items start from room_inventory (read only, not changed by the app) or a
-- default list, and the owner/manager can add more. The inspection can be edited until the tenant acknowledges it.
-- Photos are stored outside public/ (storage/inspections/<random name>) and opened through
-- /api/contracts/[id]/inspection-photo/[file]. inspected_at and tenant_ack_at are Thai local time from the app,
-- never MySQL NOW(). Only 'move_in' is used for now; 'move_out' is reserved.
-- Run: mysql -u <user> -p <db> < db/migrations/011_contract_inspections.up.sql

CREATE TABLE contract_inspections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  kind ENUM('move_in','move_out') NOT NULL,
  inspected_by INT NULL,
  inspected_at DATETIME NOT NULL,
  note TEXT NULL,
  tenant_ack_at DATETIME NULL,
  tenant_ack_by INT NULL,
  UNIQUE KEY uq_contract_inspection_kind (contract_id, kind)
);

CREATE TABLE contract_inspection_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inspection_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  condition_status ENUM('Good','Damaged','Missing') NOT NULL DEFAULT 'Good',
  note TEXT NULL,
  photo_file VARCHAR(64) NULL,
  KEY idx_inspection_items_inspection (inspection_id),
  CONSTRAINT fk_inspection_items_inspection FOREIGN KEY (inspection_id)
    REFERENCES contract_inspections (id) ON DELETE CASCADE
);
