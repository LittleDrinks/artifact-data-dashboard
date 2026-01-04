-- Migration: attachments excel import
-- Safe to run multiple times.

USE artifact_dashboard;

-- Extend attachments metadata
SET @db := DATABASE();

-- Add columns (MySQL 8.x may not support ADD COLUMN IF NOT EXISTS)
SET @col := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'attachments' AND column_name = 'hash'
);
SET @sql := IF(@col = 0, 'ALTER TABLE attachments ADD COLUMN `hash` VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'attachments' AND column_name = 'meta'
);
SET @sql := IF(@col = 0, 'ALTER TABLE attachments ADD COLUMN `meta` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'attachments' AND column_name = 'status'
);
SET @sql := IF(@col = 0, "ALTER TABLE attachments ADD COLUMN `status` ENUM('processing','ok','failed') NOT NULL DEFAULT 'ok'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE table_schema = @db AND table_name = 'attachments' AND column_name = 'thumbnail_storage_name'
);
SET @sql := IF(@col = 0, 'ALTER TABLE attachments ADD COLUMN `thumbnail_storage_name` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Indexes (MySQL 8.x does not support CREATE INDEX IF NOT EXISTS)

SET @idx := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE table_schema = @db AND table_name = 'attachments' AND index_name = 'idx_attachments_hash'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_attachments_hash ON attachments(`hash`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE table_schema = @db AND table_name = 'attachments' AND index_name = 'idx_attachments_status'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_attachments_status ON attachments(`status`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE table_schema = @db AND table_name = 'attachments' AND index_name = 'idx_attachments_original_name'
);
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_attachments_original_name ON attachments(original_name)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Attachment refs (many-to-many)
CREATE TABLE IF NOT EXISTS attachment_refs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attachment_id INT NOT NULL,
  owner_type VARCHAR(50) NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  relation_type VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_attachment_refs_owner (owner_type, owner_id),
  INDEX idx_attachment_refs_attachment (attachment_id),
  CONSTRAINT fk_attachment_refs_attachment
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Make artifact-image linking idempotent
SET @idx := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE table_schema = @db AND table_name = 'attachment_refs' AND index_name = 'uq_attachment_refs_link'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE attachment_refs ADD UNIQUE KEY uq_attachment_refs_link (attachment_id, owner_type, owner_id, relation_type)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
