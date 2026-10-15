-- 008: mark contracts whose deposit was received outside the system (tenants who lived here before the system).
-- Such deposits have no Liability row in accounting_transactions; move-out settlement (commit 12) needs to know.
-- Existing contracts are not changed (0). Note: deposits taken before commit 8 are not in Liability either.
-- Run: mysql -u <user> -p <db> < db/migrations/008_contract_deposit_source.up.sql

ALTER TABLE contracts
  ADD deposit_outside_system TINYINT(1) NOT NULL DEFAULT 0,
  ADD deposit_note VARCHAR(500) NULL;
