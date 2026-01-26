-- Migration: 004-dams-enhancement
-- Description: DAMS 增强 - 虚拟文件夹、标签、公开链接
-- Date: 2026-01-26

-- 1. 创建 folders 表
CREATE TABLE IF NOT EXISTS folders (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    parent_id INT UNSIGNED DEFAULT NULL,
    path VARCHAR(1000) NOT NULL DEFAULT '/',
    depth TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_folder_parent FOREIGN KEY (parent_id) 
        REFERENCES folders(id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_parent_id (parent_id),
    INDEX idx_path (path(255)),
    UNIQUE INDEX idx_parent_name (parent_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 创建 tags 表
CREATE TABLE IF NOT EXISTS tags (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#1890ff',
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 创建 file_tags 表
CREATE TABLE IF NOT EXISTS file_tags (
    attachment_id INT UNSIGNED NOT NULL,
    tag_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (attachment_id, tag_id),
    CONSTRAINT fk_filetag_attachment FOREIGN KEY (attachment_id) 
        REFERENCES attachments(id) ON DELETE CASCADE,
    CONSTRAINT fk_filetag_tag FOREIGN KEY (tag_id) 
        REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_tag_id (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 创建 public_links 表
CREATE TABLE IF NOT EXISTS public_links (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    attachment_id INT UNSIGNED NOT NULL,
    token VARCHAR(64) NOT NULL,
    expires_at DATETIME DEFAULT NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    access_count INT UNSIGNED NOT NULL DEFAULT 0,
    revoked_at DATETIME DEFAULT NULL,
    UNIQUE INDEX idx_token (token),
    INDEX idx_attachment (attachment_id),
    CONSTRAINT fk_publiclink_attachment FOREIGN KEY (attachment_id) 
        REFERENCES attachments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 扩展 attachments 表
ALTER TABLE attachments 
    ADD COLUMN IF NOT EXISTS folder_id INT UNSIGNED DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by INT UNSIGNED DEFAULT NULL;

-- 添加外键（如果不存在）
SET @constraint_exists = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_NAME = 'fk_attachment_folder' 
    AND TABLE_NAME = 'attachments'
);
SET @sql = IF(@constraint_exists = 0, 
    'ALTER TABLE attachments ADD CONSTRAINT fk_attachment_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引（MySQL 5.x 兼容写法 - 忽略已存在的索引错误）
-- 注意: 如果索引已存在，这些语句会在 migrate.js 中被捕获并跳过
ALTER TABLE attachments ADD INDEX idx_folder (folder_id);
ALTER TABLE attachments ADD INDEX idx_is_deleted (is_deleted);

-- 6. 创建访问日志表（可选）
CREATE TABLE IF NOT EXISTS public_link_access_logs (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    link_id INT UNSIGNED NOT NULL,
    accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(500) DEFAULT NULL,
    INDEX idx_link_id (link_id),
    INDEX idx_accessed_at (accessed_at),
    CONSTRAINT fk_accesslog_link FOREIGN KEY (link_id) 
        REFERENCES public_links(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. 插入默认标签（可选）
INSERT IGNORE INTO tags (name, color, created_by) VALUES
    ('需修复', '#f5222d', 1),
    ('高分辨率', '#52c41a', 1),
    ('展出用', '#1890ff', 1),
    ('待归档', '#faad14', 1);
