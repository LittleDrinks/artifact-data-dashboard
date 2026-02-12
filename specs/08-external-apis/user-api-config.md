# 用户自定义 API 配置规格

## 概述

系统支持用户配置自己的外部 API Key（BYOK - Bring Your Own Key），让用户能够：
1. 使用自己的 AI 服务商账号（DeepSeek、OpenAI、阿里云等）
2. 控制成本和用量
3. 使用自定义的模型端点

适用于图像修复和 AI 问答两大功能模块。

---

## 支持的 API 类型

| 功能 | 支持的服务商 | 配置字段 |
|------|-------------|----------|
| **AI 问答** | DeepSeek、OpenAI、Ollama、自定义 | api_key, base_url, model |
| **图像修复** | 阿里云、百度智能云、Replicate、Stability AI | api_key, api_secret, provider |

---

## 数据模型

### 1. API 配置表

```sql
CREATE TABLE user_api_configs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    
    -- API 类型
    api_type ENUM('llm', 'inpainting') NOT NULL,
    
    -- 服务商
    provider VARCHAR(50) NOT NULL,
    -- 可选值：
    -- LLM: 'deepseek', 'openai', 'ollama', 'custom'
    -- Inpainting: 'aliyun', 'baidu', 'replicate', 'stability', 'custom'
    
    -- 认证信息（加密存储）
    api_key_encrypted VARCHAR(500),
    api_secret_encrypted VARCHAR(500),  -- 部分服务商需要
    
    -- 自定义端点
    base_url VARCHAR(500),
    
    -- 模型配置（LLM 使用）
    model_name VARCHAR(100),
    
    -- 预算控制
    monthly_budget DECIMAL(10, 2) DEFAULT 0,  -- 0 表示无限制
    current_month_usage DECIMAL(10, 2) DEFAULT 0,
    
    -- 状态
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,  -- 是否默认配置
    
    -- 元数据
    name VARCHAR(100),  -- 用户自定义名称
    description TEXT,
    
    -- 审计
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_type (user_id, api_type),
    INDEX idx_default (user_id, api_type, is_default)
);

-- 使用记录表（用于统计和审计）
CREATE TABLE api_usage_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    config_id BIGINT UNSIGNED NOT NULL,
    api_type ENUM('llm', 'inpainting') NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- 请求信息
    request_type VARCHAR(50),  -- 'chat', 'inpaint', etc.
    request_params JSON,       -- 脱敏后的请求参数
    
    -- 成本和用量
    input_tokens INT UNSIGNED DEFAULT 0,    -- LLM 输入 token
    output_tokens INT UNSIGNED DEFAULT 0,   -- LLM 输出 token
    cost_cny DECIMAL(10, 4),                -- 成本（人民币）
    cost_usd DECIMAL(10, 4),                -- 成本（美元）
    
    -- 响应信息
    status ENUM('success', 'failed', 'timeout') NOT NULL,
    error_message TEXT,
    response_time_ms INT UNSIGNED,
    
    -- 审计
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (config_id) REFERENCES user_api_configs(id),
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_config_created (config_id, created_at)
);
```

### 2. API 配置加密

```javascript
// backend/src/utils/encryption.js
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY; // 32字节
const IV_LENGTH = 16;

function encryptApiKey(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptApiKey(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
```

---

## API 接口设计

### 1. 获取支持的 API 服务商列表

```http
GET /api/user/api-configs/providers

Response:
{
  "llm": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "description": "深度求索 AI",
      "requires_key": true,
      "requires_secret": false,
      "default_base_url": "https://api.deepseek.com/v1",
      "models": ["deepseek-chat", "deepseek-reasoner"]
    },
    {
      "id": "openai",
      "name": "OpenAI",
      "description": "OpenAI API",
      "requires_key": true,
      "requires_secret": false,
      "default_base_url": "https://api.openai.com/v1",
      "models": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"]
    },
    {
      "id": "ollama",
      "name": "Ollama",
      "description": "本地 Ollama 服务",
      "requires_key": false,
      "requires_secret": false,
      "default_base_url": "http://localhost:11434/v1",
      "models": ["deepseek-r1:8b", "llama2", "qwen"]
    },
    {
      "id": "custom",
      "name": "自定义",
      "description": "兼容 OpenAI API 格式的自定义端点",
      "requires_key": true,
      "requires_secret": false,
      "default_base_url": "",
      "models": []
    }
  ],
  "inpainting": [
    {
      "id": "aliyun",
      "name": "阿里云视觉智能",
      "description": "阿里云图像修复服务",
      "requires_key": true,
      "requires_secret": true,
      "capabilities": ["watermark_removal", "face_enhance", "upscale", "colorize"]
    },
    {
      "id": "baidu",
      "name": "百度智能云",
      "description": "百度图像修复服务",
      "requires_key": true,
      "requires_secret": false,
      "capabilities": ["inpaint", "denoise", "upscale", "colorize"]
    },
    {
      "id": "replicate",
      "name": "Replicate",
      "description": "开源模型托管平台",
      "requires_key": true,
      "requires_secret": false,
      "capabilities": ["inpaint", "outpaint", "upscale"]
    }
  ]
}
```

### 2. 获取用户的 API 配置列表

```http
GET /api/user/api-configs?type=llm

Response:
{
  "items": [
    {
      "id": 1,
      "api_type": "llm",
      "provider": "deepseek",
      "name": "我的 DeepSeek",
      "description": "个人 DeepSeek API Key",
      "base_url": "https://api.deepseek.com/v1",
      "model_name": "deepseek-chat",
      "monthly_budget": 100.00,
      "current_month_usage": 23.50,
      "is_active": true,
      "is_default": true,
      "last_used_at": "2026-02-12T15:30:00Z",
      "created_at": "2026-01-15T10:00:00Z"
    }
  ]
}
```

### 3. 添加 API 配置

```http
POST /api/user/api-configs

Request:
{
  "api_type": "llm",
  "provider": "deepseek",
  "name": "我的 DeepSeek",
  "description": "个人 DeepSeek API Key",
  "api_key": "sk-xxxxxxxxxxxxxxxx",
  "base_url": "https://api.deepseek.com/v1",
  "model_name": "deepseek-chat",
  "monthly_budget": 100,
  "is_default": true
}

Response:
{
  "id": 1,
  "api_type": "llm",
  "provider": "deepseek",
  "name": "我的 DeepSeek",
  "is_active": true,
  "is_default": true,
  "created_at": "2026-02-13T01:00:00Z"
}
```

### 4. 验证 API Key 有效性

```http
POST /api/user/api-configs/validate

Request:
{
  "api_type": "llm",
  "provider": "deepseek",
  "api_key": "sk-xxxxxxxxxxxxxxxx",
  "base_url": "https://api.deepseek.com/v1"
}

Response:
{
  "valid": true,
  "message": "API Key 验证通过",
  "balance": 150.00,  // 余额（如有返回）
  "available_models": ["deepseek-chat", "deepseek-reasoner"]
}
```

### 5. 更新/删除 API 配置

```http
PUT /api/user/api-configs/:id
DELETE /api/user/api-configs/:id
```

### 6. 获取使用统计

```http
GET /api/user/api-configs/:id/usage?start_date=2026-02-01&end_date=2026-02-13

Response:
{
  "total_requests": 1523,
  "total_cost_cny": 23.50,
  "daily_breakdown": [
    {
      "date": "2026-02-12",
      "requests": 145,
      "cost_cny": 2.15,
      "input_tokens": 45000,
      "output_tokens": 12000
    }
  ],
  "by_request_type": {
    "chat": { "requests": 1400, "cost": 20.50 },
    "tool_call": { "requests": 123, "cost": 3.00 }
  }
}
```

---

## 前端界面设计

### API 配置管理页面

```
┌─────────────────────────────────────────────────────────────┐
│  API 配置管理                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [AI 问答] [图像修复]  ← 标签切换                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔑 我的 DeepSeek                      [默认] [编辑] │   │
│  │     服务商: DeepSeek                                 │   │
│  │     模型: deepseek-chat                              │   │
│  │     本月使用: ¥23.50 / ¥100.00                       │   │
│  │     最后使用: 2026-02-12 15:30                       │   │
│  │     [测试] [删除]                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ➕ 添加新配置                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 添加配置弹窗

```
┌─────────────────────────────────────────────────────┐
│  添加 API 配置                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  配置名称 *                                         │
│  [我的 DeepSeek                               ]     │
│                                                     │
│  服务商 *                                           │
│  [DeepSeek ▼]                                       │
│                                                     │
│  API Key *                                          │
│  [sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx ]     │
│                                                     │
│  自定义端点（可选）                                 │
│  [https://api.deepseek.com/v1                ]     │
│                                                     │
│  模型                                               │
│  [deepseek-chat ▼]                                  │
│                                                     │
│  月度预算上限（可选）                               │
│  [¥ 100.00                                   ]     │
│                                                     │
│  ☑ 设为默认配置                                     │
│                                                     │
│            [取消]  [验证并保存]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 使用流程

### 1. AI 问答使用用户配置的 API

```javascript
// backend/src/services/llm.service.js
async function getLLMClient(userId, preferredConfigId = null) {
  // 1. 获取用户的 API 配置
  let config;
  if (preferredConfigId) {
    config = await UserApiConfig.findOne({
      where: { id: preferredConfigId, user_id: userId, is_active: true }
    });
  }
  
  // 2. 如果没有指定，使用默认配置
  if (!config) {
    config = await UserApiConfig.findOne({
      where: { user_id: userId, api_type: 'llm', is_default: true, is_active: true }
    });
  }
  
  // 3. 如果用户没有配置，使用系统默认
  if (!config) {
    return getSystemDefaultLLMClient();
  }
  
  // 4. 检查预算
  if (config.monthly_budget > 0 && config.current_month_usage >= config.monthly_budget) {
    throw new Error('月度预算已用完，请调整预算或等待下月重置');
  }
  
  // 5. 解密 API Key
  const apiKey = decryptApiKey(config.api_key_encrypted);
  
  // 6. 创建客户端
  return createLLMClient({
    provider: config.provider,
    apiKey,
    baseUrl: config.base_url,
    model: config.model_name
  });
}
```

### 2. 图像修复使用用户配置的 API

```javascript
// backend/src/services/inpainting.service.js
async function inpaintImage(userId, imageUrl, repairType, options = {}) {
  // 1. 获取用户的图像修复 API 配置
  const config = await UserApiConfig.findOne({
    where: { user_id: userId, api_type: 'inpainting', is_active: true }
  });
  
  if (!config) {
    throw new Error('请先配置图像修复 API');
  }
  
  // 2. 解密凭证
  const apiKey = decryptApiKey(config.api_key_encrypted);
  const apiSecret = config.api_secret_encrypted 
    ? decryptApiKey(config.api_secret_encrypted) 
    : null;
  
  // 3. 调用对应服务商的 API
  const startTime = Date.now();
  let result, cost;
  
  try {
    switch (config.provider) {
      case 'aliyun':
        result = await callAliyunInpainting(apiKey, apiSecret, imageUrl, repairType);
        cost = calculateAliyunCost(repairType);
        break;
      case 'baidu':
        result = await callBaiduInpainting(apiKey, imageUrl, repairType, options.mask);
        cost = calculateBaiduCost(repairType);
        break;
      case 'replicate':
        result = await callReplicateInpainting(apiKey, imageUrl, repairType);
        cost = await getReplicateCost(result.prediction_id);
        break;
      default:
        throw new Error(`不支持的服务商: ${config.provider}`);
    }
    
    // 4. 记录使用日志
    await ApiUsageLog.create({
      user_id: userId,
      config_id: config.id,
      api_type: 'inpainting',
      provider: config.provider,
      request_type: repairType,
      cost_cny: cost,
      status: 'success',
      response_time_ms: Date.now() - startTime
    });
    
    // 5. 更新当月用量
    await config.increment('current_month_usage', { by: cost });
    
    return result;
    
  } catch (error) {
    // 记录失败日志
    await ApiUsageLog.create({
      user_id: userId,
      config_id: config.id,
      api_type: 'inpainting',
      provider: config.provider,
      request_type: repairType,
      status: 'failed',
      error_message: error.message,
      response_time_ms: Date.now() - startTime
    });
    throw error;
  }
}
```

---

## 安全考虑

### 1. 传输安全

- 所有 API 请求使用 HTTPS
- 前端提交 API Key 时，使用临时公钥加密（可选增强）

### 2. 存储安全

- API Key 使用 AES-256-CBC 加密存储
- 加密密钥存储在环境变量，不存入数据库
- 数据库备份不包含解密后的明文

### 3. 访问控制

- 用户只能访问自己的 API 配置
- API Key 只在服务端解密，不返回给前端
- 删除配置时，同时清理相关使用日志（保留汇总统计）

### 4. 审计追踪

- 记录所有 API 调用（时间、成本、状态）
- 异常调用触发告警
- 支持导出使用报告

---

## 实现任务清单

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 创建数据库表 | 高 | 待实现 |
| 实现加密工具函数 | 高 | 待实现 |
| 实现 API CRUD 接口 | 高 | 待实现 |
| 实现 API Key 验证接口 | 高 | 待实现 |
| 修改 LLM 服务支持用户配置 | 高 | 待实现 |
| 实现图像修复服务 | 中 | 待实现 |
| 前端配置管理页面 | 中 | 待实现 |
| 使用统计报表 | 低 | 待实现 |
