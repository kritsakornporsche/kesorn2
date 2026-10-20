-- 022 rollback: drop the separate name / address fields of contracts (the single-field name / address kept in
-- tenants.name and contracts.tenant_address stay and are printed as before). Run with the code from before commit 28-8.
-- Run: mysql -u <user> -p <db> < db/migrations/022_contract_party_fields.down.sql

ALTER TABLE contracts
  DROP COLUMN addr_postcode,
  DROP COLUMN addr_province,
  DROP COLUMN addr_district,
  DROP COLUMN addr_subdistrict,
  DROP COLUMN addr_road,
  DROP COLUMN addr_soi,
  DROP COLUMN addr_moo,
  DROP COLUMN addr_house_no,
  DROP COLUMN tenant_last_name,
  DROP COLUMN tenant_first_name,
  DROP COLUMN tenant_title;
