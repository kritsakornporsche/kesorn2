-- 022: the tenant's name and address on the contract in separate fields (commit 28-8), as on the dorm's contract form:
-- title (นาย / นาง / นางสาว), first name, last name; house no., หมู่, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, postcode.
-- Filled in at step 3 "ยืนยันข้อมูลสัญญา" and kept with the contract (a later name change of the tenant does not change a
-- signed contract's printout). Adds only — every existing contract keeps NULL and is printed from its single-field
-- name / address as before (split by lib/address-parser when printed). No existing row is changed.
-- Run: mysql -u <user> -p <db> < db/migrations/022_contract_party_fields.up.sql

ALTER TABLE contracts
  ADD COLUMN tenant_title VARCHAR(20) NULL,
  ADD COLUMN tenant_first_name VARCHAR(100) NULL,
  ADD COLUMN tenant_last_name VARCHAR(100) NULL,
  ADD COLUMN addr_house_no VARCHAR(100) NULL,
  ADD COLUMN addr_moo VARCHAR(100) NULL,
  ADD COLUMN addr_soi VARCHAR(100) NULL,
  ADD COLUMN addr_road VARCHAR(100) NULL,
  ADD COLUMN addr_subdistrict VARCHAR(100) NULL,
  ADD COLUMN addr_district VARCHAR(100) NULL,
  ADD COLUMN addr_province VARCHAR(100) NULL,
  ADD COLUMN addr_postcode VARCHAR(5) NULL;
