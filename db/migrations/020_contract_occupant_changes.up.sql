-- 020: history of changes to the number of occupants during a contract (commit 27). Confirmed with the dorm: at most 2
-- people per room, one tenant on the contract, nothing kept about the other occupant. The owner / manager can change
-- contracts.occupants during the contract; each change keeps the old and new number, who, when (Thai time from the
-- app) and the reason. Only bills issued after the change use the new number (bills keep their own amounts).
-- New table only — contracts and every other table are unchanged (existing contracts keep occupants = 1).
-- Run: mysql -u <user> -p <db> < db/migrations/020_contract_occupant_changes.up.sql

CREATE TABLE contract_occupant_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  old_occupants INT NOT NULL,
  new_occupants INT NOT NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL,
  reason VARCHAR(500) NULL,
  INDEX idx_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
