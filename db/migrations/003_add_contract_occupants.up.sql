-- 003: number of occupants per contract (water is billed per person)
-- Existing contracts get 1, so current water charges stay the same.
-- Run: mysql -u <user> -p <db> < db/migrations/003_add_contract_occupants.up.sql

ALTER TABLE contracts
  ADD occupants INT NOT NULL DEFAULT 1;
