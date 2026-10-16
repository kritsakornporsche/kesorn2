-- 001 rollback: remove 'manager' from users.role
-- Refuses to run while any user still has role = 'manager'.
-- Run: mysql -u <user> -p <db> < db/migrations/001_add_manager_role.down.sql

DROP PROCEDURE IF EXISTS mig_001_down;

DELIMITER //
CREATE PROCEDURE mig_001_down()
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE role = 'manager') > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'users with role=manager exist; change their role before rolling back';
  END IF;

  ALTER TABLE users
    MODIFY role ENUM('owner','tenant','keeper','researcher','guest','platform_admin','admin')
    NOT NULL DEFAULT 'guest';
END//
DELIMITER ;

CALL mig_001_down();
DROP PROCEDURE IF EXISTS mig_001_down;
