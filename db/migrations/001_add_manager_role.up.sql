-- 001: add 'manager' to users.role
-- Run: mysql -u <user> -p <db> < db/migrations/001_add_manager_role.up.sql

ALTER TABLE users
  MODIFY role ENUM('owner','tenant','keeper','researcher','guest','platform_admin','admin','manager')
  NOT NULL DEFAULT 'guest';
