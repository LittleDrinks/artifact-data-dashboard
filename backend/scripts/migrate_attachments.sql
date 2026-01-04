-- Migration: attachments excel import
-- Safe to run multiple times.

USE artifact_dashboard;

-- Extend attachments metadata
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS `hash` VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS `meta` JSON NULL,
  ADD COLUMN IF NOT EXISTS `status` ENUM('processing','ok','failed') NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS `thumbnail_storage_name` VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(`hash`);
CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(`status`);

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
