-- Migration 002: Smart QA Enhancement Tables
-- Feature: 002-enhance-smart-qa
-- Date: 2026-01-11

USE artifact_dashboard;

-- T004: Mode Configuration Table
CREATE TABLE IF NOT EXISTS mode_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mode_name VARCHAR(20) NOT NULL UNIQUE,
  health_check_url VARCHAR(255) NULL,
  timeout_ms INT NOT NULL DEFAULT 5000,
  fallback_mode VARCHAR(20) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mode_config_active (is_active),
  INDEX idx_mode_config_priority (priority)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 初始化模式配置
INSERT INTO mode_config (mode_name, health_check_url, timeout_ms, fallback_mode, is_active, priority) VALUES
('ONLINE', NULL, 10000, 'LOCAL', TRUE, 1),
('LOCAL', 'http://ollama:11434/api/tags', 5000, 'MOCK', TRUE, 2),
('MOCK', NULL, 1000, NULL, TRUE, 3)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- T005: MCP Settings Table
CREATE TABLE IF NOT EXISTS mcp_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by VARCHAR(50) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mcp_settings_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO mcp_settings (is_enabled, updated_by) VALUES
(TRUE, 'system')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- T006: Cypher Audit Log Table
CREATE TABLE IF NOT EXISTS cypher_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  query_text TEXT NOT NULL,
  executor VARCHAR(50) NOT NULL,
  execution_time FLOAT NULL,
  result_summary TEXT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  validation_errors TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cypher_audit_executor (executor),
  INDEX idx_cypher_audit_created (created_at),
  INDEX idx_cypher_audit_valid (is_valid)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- T007: Extend chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  title VARCHAR(255) NULL,
  mode_used VARCHAR(20) DEFAULT 'ONLINE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_chat_sessions_mode (mode_used),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

COMMIT;
