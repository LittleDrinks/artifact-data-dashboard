# 统一 API 配置管理规格

> **设计原则**：先由平台统一管理，后续版本支持用户自定义

---

## 架构演进路线

```
v0.6 - 平台统一管理（当前）
    │
    ├── AI 问答 API：系统配置（DeepSeek/Ollama）
    │
    └── 图像修复 API：系统配置（阿里云）

v0.7 - 用户自定义（后续）
    │
    ├── 平台默认配置（兜底）
    │
    └── 用户自定义配置（可选）
        │
        ├── AI 问答 API：用户可配置自己的 DeepSeek/OpenAI Key
        │
        └── 图像修复 API：用户可配置自己的阿里云/百度 Key
```

---

## 配置层级设计

### 三级配置优先级

```
用户会话配置（最高优先级）
    │
    ├── 用户 API 配置（如用户配置了自定义 API）
    │   └── 适用于：该用户的所有请求
    │
    └── 系统默认配置（兜底）
        └── 适用于：所有未配置自定义 API 的用户

平台级配置（全局）
    └── 适用于：系统运维、监控、告警
```

### 配置继承规则

```javascript
function resolveApiConfig(userId, apiType, options = {}) {
  // 1. 检查是否有会话级强制配置
  if (options.forceConfig) {
    return options.forceConfig;
  }
  
  // 2. 检查用户是否配置了自定义 API
  const userConfig = await UserApiConfig.findOne({
    where: { 
      user_id: userId, 
      api_type: apiType,
      is_active: true 
    }
  });
  
  if (userConfig) {
    // 检查预算是否超限
    if (userConfig.monthly_budget > 0 && 
        userConfig.current_month_usage >= userConfig.monthly_budget) {
      // 预算超限，降级到系统配置
      return getSystemDefaultConfig(apiType);
    }
    return decryptUserConfig(userConfig);
  }
  
  // 3. 返回系统默认配置
  return getSystemDefaultConfig(apiType);
}
```

---

## 数据模型

### 1. 系统级 API 配置表（平台管理）

```sql
-- 系统默认 API 配置（管理员维护）
CREATE TABLE system_api_configs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- API 类型
    api_type ENUM('llm', 'inpainting', 'embedding') NOT NULL,
    
    -- 服务商
    provider VARCHAR(50) NOT NULL,
    
    -- 认证信息（加密存储，只有管理员可查看）
    api_key_encrypted VARCHAR(500) NOT NULL,
    api_secret_encrypted VARCHAR(500),
    
    -- 服务端点
    base_url VARCHAR(500),
    
    -- 模型配置（LLM 使用）
    model_name VARCHAR(100),
    model_params JSON,  -- { temperature: 0.7, max_tokens: 2048 }
    
    -- 配额控制
    daily_quota INT UNSIGNED,        -- 每日调用上限（0=无限制）
    monthly_quota INT UNSIGNED,      -- 每月调用上限（0=无限制）
    
    -- 成本限制
    daily_cost_limit DECIMAL(10, 2),    -- 每日成本上限
    monthly_cost_limit DECIMAL(10, 2),  -- 每月成本上限
    
    -- 状态
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,  -- 是否为该类型的默认配置
    priority INT DEFAULT 0,             -- 优先级（高优先级先使用）
    
    -- 降级配置
    fallback_config_id BIGINT UNSIGNED,  -- 失败时降级到的配置ID
    
    -- 元数据
    name VARCHAR(100) NOT NULL,
    description TEXT,
    environment ENUM('development', 'staging', 'production') DEFAULT 'production',
    
    -- 审计
    created_by BIGINT UNSIGNED,
    updated_by BIGINT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id),
    INDEX idx_api_type_default (api_type, is_default),
    INDEX idx_environment (environment)
);

-- 初始化数据示例
INSERT INTO system_api_configs 
(api_type, provider, name, description, is_default, environment, model_name) 
VALUES
-- 生产环境 LLM 配置
('llm', 'deepseek', 'DeepSeek 生产环境', 'DeepSeek API 正式密钥', TRUE, 'production', 'deepseek-chat'),
('llm', 'ollama', 'Ollama 本地模型', '本地部署的 Ollama 服务', FALSE, 'production', 'deepseek-r1:8b'),

-- 生产环境图像修复配置
('inpainting', 'aliyun', '阿里云图像修复', '阿里云视觉智能 API', TRUE, 'production', NULL),

-- 开发环境配置
('llm', 'deepseek', 'DeepSeek 开发环境', '开发测试用', TRUE, 'development', 'deepseek-chat');
```

### 2. 用户级 API 配置表（用户自定义）

```sql
-- 用户自定义 API 配置（v0.7 实现）
CREATE TABLE user_api_configs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    
    -- API 类型
    api_type ENUM('llm', 'inpainting', 'embedding') NOT NULL,
    
    -- 服务商
    provider VARCHAR(50) NOT NULL,
    
    -- 认证信息（加密存储）
    api_key_encrypted VARCHAR(500) NOT NULL,
    api_secret_encrypted VARCHAR(500),
    
    -- 服务端点
    base_url VARCHAR(500),
    
    -- 模型配置
    model_name VARCHAR(100),
    model_params JSON,
    
    -- 预算控制
    monthly_budget DECIMAL(10, 2) DEFAULT 0,  -- 0 表示使用系统配额
    current_month_usage DECIMAL(10, 2) DEFAULT 0,
    
    -- 状态
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,  -- 是否为该用户的默认配置
    
    -- 元数据
    name VARCHAR(100),
    description TEXT,
    
    -- 审计
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_api_type (user_id, api_type),
    INDEX idx_user_default (user_id, api_type, is_default)
);
```

### 3. API 使用日志表

```sql
-- 统一的 API 使用日志（平台和用户共用）
CREATE TABLE api_usage_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- 调用者信息
    user_id BIGINT UNSIGNED,  -- NULL 表示系统调用
    user_config_id BIGINT UNSIGNED,  -- 使用的用户配置ID（NULL表示使用系统配置）
    system_config_id BIGINT UNSIGNED,  -- 使用的系统配置ID
    
    -- API 信息
    api_type ENUM('llm', 'inpainting', 'embedding') NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- 请求信息
    request_type VARCHAR(50),  -- 'chat', 'inpaint', 'embedding'
    request_id VARCHAR(100),   -- 用于追踪的请求ID
    
    -- 用量和成本
    input_tokens INT UNSIGNED DEFAULT 0,     -- LLM 输入 token
    output_tokens INT UNSIGNED DEFAULT 0,    -- LLM 输出 token
    processing_time_ms INT UNSIGNED,         -- 处理时长
    cost_cny DECIMAL(10, 4),                 -- 成本（人民币）
    cost_usd DECIMAL(10, 4),                 -- 成本（美元）
    
    -- 响应信息
    status ENUM('success', 'failed', 'timeout', 'rate_limited') NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,
    response_time_ms INT UNSIGNED,
    
    -- 审计
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (user_config_id) REFERENCES user_api_configs(id),
    FOREIGN KEY (system_config_id) REFERENCES system_api_configs(id),
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_config_created (COALESCE(user_config_id, system_config_id), created_at),
    INDEX idx_request_id (request_id)
);
```

---

## API 接口设计

### 1. 管理后台 - 系统配置管理

```http
# 获取系统 API 配置列表（管理员）
GET /api/admin/system-api-configs?api_type=llm&environment=production

Response:
{
  "items": [
    {
      "id": 1,
      "api_type": "llm",
      "provider": "deepseek",
      "name": "DeepSeek 生产环境",
      "is_default": true,
      "is_active": true,
      "daily_quota": 10000,
      "monthly_cost_limit": 1000.00,
      "today_usage": 523,
      "today_cost": 12.50,
      "status": "healthy"  // healthy, warning, exceeded
    }
  ]
}

# 创建/更新系统配置（管理员）
POST /api/admin/system-api-configs
PUT /api/admin/system-api-configs/:id

Request:
{
  "api_type": "llm",
  "provider": "deepseek",
  "name": "DeepSeek 备用",
  "api_key": "sk-xxxxxxxx",
  "base_url": "https://api.deepseek.com/v1",
  "model_name": "deepseek-chat",
  "daily_quota": 5000,
  "monthly_cost_limit": 500,
  "is_default": false,
  "priority": 1,
  "fallback_config_id": 1
}

# 删除配置
DELETE /api/admin/system-api-configs/:id

# 测试配置是否可用
POST /api/admin/system-api-configs/:id/test

Response:
{
  "valid": true,
  "message": "API Key 验证通过",
  "balance": 150.00,
  "latency_ms": 234
}

# 获取使用统计
GET /api/admin/system-api-configs/:id/stats?start_date=2026-02-01&end_date=2026-02-13

Response:
{
  "total_requests": 15230,
  "total_cost": 325.50,
  "success_rate": 0.98,
  "avg_latency_ms": 450,
  "daily_breakdown": [...]
}
```

### 2. 用户配置管理（v0.7）

```http
# 获取用户的 API 配置
GET /api/user/api-configs

# 添加用户自定义配置
POST /api/user/api-configs

# 更新/删除
PUT /api/user/api-configs/:id
DELETE /api/user/api-configs/:id

# 验证 API Key
POST /api/user/api-configs/validate

# 获取使用统计
GET /api/user/api-configs/:id/usage
```

---

## 服务层实现

### 统一的 API 服务基类

```javascript
// backend/src/services/api-providers/base.provider.js
class BaseApiProvider {
  constructor(config) {
    this.config = config;
    this.provider = config.provider;
  }
  
  // 子类必须实现
  async validate() {
    throw new Error('validate() must be implemented');
  }
  
  async getQuota() {
    throw new Error('getQuota() must be implemented');
  }
  
  // 通用方法
  async callWithLogging(apiType, requestType, callFn) {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    try {
      const result = await callFn();
      const responseTime = Date.now() - startTime;
      
      // 记录成功日志
      await this.logUsage({
        requestId,
        apiType,
        requestType,
        status: 'success',
        responseTimeMs: responseTime,
        costCny: result.cost?.cny || 0,
        inputTokens: result.usage?.input_tokens || 0,
        outputTokens: result.usage?.output_tokens || 0
      });
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // 记录失败日志
      await this.logUsage({
        requestId,
        apiType,
        requestType,
        status: error.code === 'ETIMEDOUT' ? 'timeout' : 'failed',
        responseTimeMs: responseTime,
        errorCode: error.code,
        errorMessage: error.message
      });
      
      throw error;
    }
  }
  
  async logUsage(logData) {
    await ApiUsageLog.create({
      userId: this.userId,
      systemConfigId: this.isSystemConfig ? this.config.id : null,
      userConfigId: this.isSystemConfig ? null : this.config.id,
      apiType: logData.apiType,
      provider: this.provider,
      ...logData
    });
  }
}

// LLM 提供商
class LLMProvider extends BaseApiProvider {
  async chat(messages, options = {}) {
    return this.callWithLogging('llm', 'chat', async () => {
      // 子类实现具体的调用逻辑
      return this.doChat(messages, options);
    });
  }
  
  async doChat(messages, options) {
    throw new Error('doChat() must be implemented');
  }
}

// 图像修复提供商
class InpaintingProvider extends BaseApiProvider {
  async inpaint(imageUrl, options = {}) {
    return this.callWithLogging('inpainting', 'inpaint', async () => {
      return this.doInpaint(imageUrl, options);
    });
  }
  
  async doInpaint(imageUrl, options) {
    throw new Error('doInpaint() must be implemented');
  }
}
```

### 具体提供商实现 - 阿里云

```javascript
// backend/src/services/api-providers/aliyun.provider.js
const RPCClient = require('@alicloud/pop-core').RPCClient;
const { InpaintingProvider } = require('./base.provider');

class AliyunInpaintingProvider extends InpaintingProvider {
  constructor(config) {
    super(config);
    this.client = new RPCClient({
      accessKeyId: config.apiKey,
      accessKeySecret: config.apiSecret,
      endpoint: config.baseUrl || 'https://imageenhan.cn-shanghai.aliyuncs.com',
      apiVersion: '2019-09-30'
    });
  }
  
  async validate() {
    try {
      // 调用一个轻量级接口验证凭证
      await this.client.request('RemoveImageWatermark', {
        ImageURL: 'https://example.com/test.jpg'
      });
      return { valid: true };
    } catch (error) {
      if (error.code === 'InvalidImageURL') {
        // URL 无效说明凭证有效
        return { valid: true };
      }
      return { valid: false, error: error.message };
    }
  }
  
  async doInpaint(imageUrl, options) {
    const capability = options.capability || 'watermark_removal';
    
    const actionMap = {
      'watermark_removal': 'RemoveImageWatermark',
      'face_enhance': 'EnhanceFace',
      'upscale': 'UpscaleImage',
      'colorize': 'ColorizeImage'
    };
    
    const action = actionMap[capability] || actionMap['watermark_removal'];
    
    const result = await this.client.request(action, {
      ImageURL: imageUrl,
      ...options.params
    });
    
    return {
      imageUrl: result.ImageURL,
      cost: {
        cny: this.calculateCost(capability)
      }
    };
  }
  
  calculateCost(capability) {
    const pricing = {
      'watermark_removal': 0.01,
      'face_enhance': 0.10,
      'upscale': 0.02,
      'colorize': 0.10
    };
    return pricing[capability] || 0.01;
  }
}
```

### API 工厂

```javascript
// backend/src/services/api-providers/index.js
const providers = {
  // LLM 提供商
  'deepseek': require('./deepseek.provider'),
  'openai': require('./openai.provider'),
  'ollama': require('./ollama.provider'),
  
  // 图像修复提供商
  'aliyun': require('./aliyun.provider'),
  'baidu': require('./baidu.provider'),
  'replicate': require('./replicate.provider')
};

class ApiProviderFactory {
  static create(apiType, provider, config) {
    const ProviderClass = providers[provider];
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    
    return new ProviderClass({ ...config, apiType, provider });
  }
  
  static async resolveAndCreate(apiType, userId, options = {}) {
    const config = await resolveApiConfig(userId, apiType, options);
    return this.create(apiType, config.provider, config);
  }
}
```

---

## 环境变量配置

```bash
# ============================================
# 系统级 API 配置（.env 文件）
# ============================================

# --------------------------------------------
# AI 问答 - DeepSeek
# --------------------------------------------
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# AI 问答 - OpenAI（可选）
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo

# AI 问答 - Ollama（本地）
OLLAMA_BASE_URL=http://ollama:11434/v1
OLLAMA_MODEL=deepseek-r1:8b

# --------------------------------------------
# 图像修复 - 阿里云
# --------------------------------------------
ALIYUN_ACCESS_KEY_ID=your-aliyun-access-key-id
ALIYUN_ACCESS_KEY_SECRET=your-aliyun-access-key-secret
ALIYUN_REGION=cn-shanghai
ALIYUN_INPAINTING_DEFAULT_CAPABILITY=watermark_removal

# --------------------------------------------
# 配额和限制
# --------------------------------------------
# LLM 每日调用上限（0=无限制）
LLM_DAILY_QUOTA=10000
# LLM 每月成本上限（人民币）
LLM_MONTHLY_COST_LIMIT=1000

# 图像修复每日调用上限
INPAINTING_DAILY_QUOTA=1000
# 图像修复每月成本上限
INPAINTING_MONTHLY_COST_LIMIT=500
```

---

## 前端界面

### 管理后台 - API 配置管理

```
┌───────────────────────────────────────────────────────────────────────┐
│  API 配置管理（管理员）                                    [+ 新增配置] │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 🔑 DeepSeek 生产环境                              [默认] [编辑]  │ │
│  │     类型: AI 问答 (LLM)                                          │ │
│  │     服务商: DeepSeek                                             │ │
│  │     模型: deepseek-chat                                          │ │
│  │     今日用量: 523 / 10,000                                       │ │
│  │     今日成本: ¥12.50 / ¥100.00                                   │ │
│  │     状态: ● 健康                                                 │ │
│  │     [测试] [查看日志] [设为默认] [删除]                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 🔑 DeepSeek 开发环境                              [编辑]         │ │
│  │     类型: AI 问答 (LLM)                                          │ │
│  │     ...                                                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 🔑 阿里云图像修复                                 [默认] [编辑]  │ │
│  │     类型: 图像修复 (Inpainting)                                  │ │
│  │     服务商: 阿里云视觉智能                                       │ │
│  │     ...                                                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 用户设置 - 自定义 API（v0.7）

```
┌───────────────────────────────────────────────────────────────────────┐
│  我的 API 配置                                                         │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  系统默认配置（当前使用）                                              │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ AI 问答: DeepSeek 生产环境                                       │ │
│  │ 图像修复: 阿里云图像修复                                         │ │
│  │ [使用系统配置]                                                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  自定义配置                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ 您尚未添加自定义 API 配置                                        │ │
│  │ 添加自定义配置后，系统将优先使用您的 API Key                     │ │
│  │ [+ 添加自定义配置]                                               │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 实施计划

### v0.6 - 平台统一管理

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 创建 `system_api_configs` 表 | 高 | 待实现 |
| 实现 API Provider 基类 | 高 | 待实现 |
| 实现 DeepSeek Provider | 高 | 待实现 |
| 实现阿里云 Inpainting Provider | 高 | 待实现 |
| 实现 API 工厂和配置解析 | 高 | 待实现 |
| 创建 API 使用日志表 | 中 | 待实现 |
| 管理后台 API 配置界面 | 中 | 待实现 |
| 配额监控和告警 | 低 | 待实现 |

### v0.7 - 用户自定义配置

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 创建 `user_api_configs` 表 | 中 | 待实现 |
| 用户配置 CRUD API | 中 | 待实现 |
| API Key 加密存储 | 高 | 待实现 |
| 用户配置界面 | 中 | 待实现 |
| 预算超限提醒 | 低 | 待实现 |

---

*文档版本：v1.0*
*最后更新：2026-02-13*
