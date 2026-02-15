/**
 * Services Barrel File
 * Centralized exports for all services
 */

// Core Services
const folderService = require('./core/folder.service');
const tagService = require('./core/tag.service');
const attachmentService = require('./core/attachment.service');
const exportService = require('./core/export.service');
const publicLinkService = require('./core/public-link.service');

// Knowledge Graph Services
const cypherExecutor = require('./kg/cypher-executor');
const cypherValidator = require('./kg/cypher-validator');
const neo4jTools = require('./kg/neo4j-tools');

// AI Services
const modeManager = require('./ai/mode-manager');
const chatConfigService = require('./ai/chat-config.service');
const healthCheckService = require('./ai/health-check.service');
const modeNotifier = require('./ai/mode-notifier');
const modePrompts = require('./ai/mode-prompts');
const pluginConfig = require('./ai/plugin-config');

// AI Providers
const localProvider = require('./ai/providers/local-provider');
const mockProvider = require('./ai/providers/mock-provider');
const mcpProvider = require('./ai/providers/mcp-provider');

// Infrastructure Services
const mcpController = require('./infra/mcp-controller');
const { getStorageDriver } = require('./infra/storage');
const uploadQueue = require('./infra/queue/upload-queue');

// Utility Services
const { ToolManager, toolManager } = require('./utils/tool-manager');
const redisStateService = require('./utils/redis-state.service');
const auditService = require('./utils/audit.service');
const keywordService = require('./utils/keyword.service');
const excelKgService = require('./utils/excel-kg.service');
const { IntegrityService } = require('./utils/integrity.service');

// Tools
const { registerAllTools } = require('./tools');

// MCP Service (root level)
const mcpService = require('./mcp.service');

module.exports = {
  // Core
  folderService,
  tagService,
  attachmentService,
  exportService,
  publicLinkService,

  // Knowledge Graph
  cypherExecutor,
  cypherValidator,
  neo4jTools,

  // AI
  modeManager,
  chatConfigService,
  healthCheckService,
  modeNotifier,
  modePrompts,
  pluginConfig,

  // AI Providers
  localProvider,
  mockProvider,
  mcpProvider,

  // Infrastructure
  mcpController,
  getStorageDriver,
  uploadQueue,

  // Utils
  ToolManager,
  toolManager,
  redisStateService,
  auditService,
  keywordService,
  excelKgService,
  IntegrityService,

  // Tools
  registerAllTools,

  // MCP
  mcpService
};
