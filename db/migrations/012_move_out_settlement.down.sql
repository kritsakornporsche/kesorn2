-- 012 rollback: removes move-out settlements and the 'deposit_offset' payment method.
-- Refused (nothing changed) while any payment was made with 'deposit_offset': reverting those needs the owner.
-- Accounting rows with reference_type settlement_* stay; refund files in storage/move-out stay on disk.
-- Run: mysql -u <user> -p <db> < db/migrations/012_move_out_settlement.down.sql

DROP PROCEDURE IF EXISTS m012_down_check;
DELIMITER //
CREATE PROCEDURE m012_down_check()
BEGIN
  IF (SELECT COUNT(*) FROM bill_payments WHERE method = 'deposit_offset') > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '012 down refused: bill_payments has deposit_offset payments';
  END IF;
END//
DELIMITER ;
CALL m012_down_check();
DROP PROCEDURE m012_down_check;

ALTER TABLE bill_payments
  MODIFY method ENUM('slip','cash','transfer') NOT NULL;
DROP TABLE IF EXISTS move_out_settlements;
