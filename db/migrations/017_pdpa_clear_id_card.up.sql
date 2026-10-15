-- 017: PDPA — the 13-digit ID number and the ID card image are no longer stored (commit 16: lib/contracts.ts and
-- lib/bookings.ts never write them; ID card OCR fills the name / address only). This clears what older code stored.
-- Columns stay (NULL) — nothing is dropped or renamed (FEATURE_INTEGRATION_LOG.md rule).
-- ⚠️ Cannot be undone: take a database backup first (the down file cannot bring the numbers back).
-- Count before running (and report the numbers):
--   SELECT COUNT(*) FROM tenants   WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;
--   SELECT COUNT(*) FROM contracts WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;
--   -- older owner screens could save the card photo as the contract file (data URL); check by eye, NOT cleared here:
--   SELECT id, LEFT(contract_file_url, 30) FROM contracts WHERE contract_file_url LIKE 'data:image%';
-- Files: card photos saved by older code under public/uploads/id_cards/ must be deleted by hand after this runs
--   (list them first: ls -la public/uploads/id_cards/ — keep .gitkeep if present).
-- Run: mysql -u <user> -p <db> < db/migrations/017_pdpa_clear_id_card.up.sql

UPDATE tenants
   SET id_card_number = NULL, id_card_image = NULL
 WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;

UPDATE contracts
   SET id_card_number = NULL, id_card_image = NULL
 WHERE id_card_number IS NOT NULL OR id_card_image IS NOT NULL;
