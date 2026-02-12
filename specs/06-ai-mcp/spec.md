# AI 与 MCP 集成 - 规格说明

## 概述

系统 AI 能力分三层，支持用户在界面**实时切换模式**：

1. **图谱模式**：只查询知识图谱，回答基于实证的特定问题
2. **知识模式**：基于图谱检索的实例，AI 归纳通用知识
3. **通用模式**：不限制，AI 基于训练数据自由回答

```
┌─────────────────────────────────────────────────────────────┐
│                        用户提问                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    用户配置面板（可实时调整）                  │
├─────────────────────────────┬───────────────────────────────┤
│  AI 模型选择：               │  MCP 工具开关：               │
│  ○ 云端 (DeepSeek)          │  ☑ 图谱查询工具               │
│  ● 本地 (Ollama 8B)         │  ☐ 数据分析工具               │
│  ○ 模拟模式                 │                               │
├─────────────────────────────┴───────────────────────────────┤
│  问答模式：                                                  │
│  ● 图谱模式  ○ 知识模式  ○ 通用模式                          │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │   图谱模式   │   │   知识模式   │   │   通用模式   │
   │              │   │              │   │              │
   │ Cypher 查询  │   │ 查图谱→归纳  │   │ 直接回答     │
   │ 返回事实     │   │ 基于实例     │   │ 自由发挥     │
   └──────────────┘   └──────────────┘   └──────────────┘
```

---

## AI 模式管理

### 三级运行模式（系统层）

系统支持三种运行模式，**自动降级**保证可用性：

```
ONLINE (云端 API) ──► LOCAL (Ollama 本地) ──► MOCK (模拟响应)
    ↑                                              ↑
    └────────────── 自动降级逻辑 ──────────────────┘
```

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **ONLINE** | 调用云端 API（DeepSeek/ChatGPT） | 网络畅通，追求回答质量 |
| **LOCAL** | 本地 Ollama 运行 8B 模型 | 内网环境，数据敏感 |
| **MOCK** | 返回预设响应 | 测试、演示、LLM 全挂 |

**自动降级**：
- 每 30 秒健康检查
- 连续 3 次失败自动降级到下一级
- 上级恢复后自动升级

**用户可手动覆盖**：聊天界面提供模型切换按钮，无视自动降级逻辑

---

## 问答模式（应用层）

### 三种问答模式

| 模式 | 触发条件 | AI 行为 | 适用问题 |
|------|----------|---------|----------|
| **图谱模式** | 用户选择 | 必须调用图谱工具查询，只回答图谱中有的事实 | "哪些唐代青铜器收藏在故宫？" |
| **知识模式** | 用户选择 | 先调用图谱获取实例，再基于实例归纳知识 | "唐代青铜器有什么特点？" |
| **通用模式** | 用户选择 | 不强制使用工具，AI 自由回答 | "青铜器制作工艺简介" |

### 模式实现细节

#### 图谱模式

```javascript
// 系统提示词
const GRAPH_MODE_PROMPT = `
你是一位文物知识助手。用户当前处于"图谱模式"。
规则：
1. 必须调用 query_graph 工具查询知识图谱获取信息
2. 只回答图谱中存在的事实，不确定时回答"根据现有数据..."
3. 如果图谱中没有相关信息，明确告知用户"图谱中未找到相关信息"
`;

// 流程
userQuestion → forceToolCall('query_graph') → presentFacts
```

#### 知识模式

```javascript
// 系统提示词
const KNOWLEDGE_MODE_PROMPT = `
你是一位文物知识助手。用户当前处于"知识模式"。
规则：
1. 首先调用 query_graph 工具查询知识图谱获取相关文物实例
2. 基于这些具体实例，归纳总结通用知识
3. 回答时引用具体实例作为证据（"如故宫博物院藏的X文物所示..."）
4. 如果图谱中没有相关实例，回答"缺乏足够实例支持结论"
`;

// 流程
userQuestion → queryGraphForExamples → summarizeWithEvidence
```

#### 通用模式

```javascript
// 系统提示词
const GENERAL_MODE_PROMPT = `
你是一位文物知识助手。用户当前处于"通用模式"。
规则：
1. 可以基于你的训练数据自由回答
2. 如果问题涉及具体馆藏文物，建议调用图谱工具核实
3. 明确区分"通用知识"和"具体馆藏信息"
`;

// 流程
userQuestion → optionalToolCall → freeResponse
```

---

## MCP 工具开关

### 用户可控的工具列表

在聊天界面提供工具开关，用户可启用/禁用特定工具：

| 工具 | 功能 | 默认状态 |
|------|------|----------|
| `query_graph` | 查询知识图谱 | ☑ 开启 |
| `search_artifacts` | 搜索文物 | ☑ 开启 |
| `get_artifact_detail` | 获取文物详情 | ☑ 开启 |
| `search_documents` | 搜索文献 | ☑ 开启 |
| `data_analysis` | 数据分析（统计、趋势） | ☐ 关闭 |

**影响**：
- 禁用 `query_graph` 后，图谱模式和知识模式自动降级为通用模式
- 工具禁用时，AI 的 function_call 不会包含该工具

---

## MCP (Model Context Protocol)

### 工具注册规范

```javascript
// backend/src/services/tools/query-graph.tool.js
module.exports = {
  name: 'query_graph',
  description: '查询知识图谱获取文物、人物、地点等实体信息',
  parameters: {
    type: 'object',
    properties: {
      cypher: {
        type: 'string',
        description: 'Cypher 查询语句（只读查询）'
      }
    },
    required: ['cypher']
  },
  
  // 工具可用性检查（根据用户启用的插件）
  isEnabled: (userContext) => {
    return userContext.enabledTools.includes('query_graph');
  },
  
  async execute({ cypher }, context) {
    // 安全检查
    const forbidden = ['DELETE', 'DROP', 'CREATE', 'SET', 'REMOVE'];
    if (forbidden.some(k => cypher.toUpperCase().includes(k))) {
      throw new Error('禁止执行写入操作');
    }
    
    // 根据用户启用的插件过滤节点类型
    const enabledLabels = context.getEnabledNodeLabels();
    
    const session = neo4jDriver.session();
    try {
      const result = await session.run(cypher, { labels: enabledLabels });
      return formatNeo4jResult(result);
    } finally {
      await session.close();
    }
  }
};
```

### 已注册工具

| 工具名 | 功能 | 参数 | 适用模式 |
|--------|------|------|----------|
| `query_graph` | 查询知识图谱 | `cypher`: Cypher 语句 | 图谱/知识 |
| `search_artifacts` | 搜索文物 | `keyword`: 关键词 | 全部 |
| `get_artifact_detail` | 获取文物详情 | `id`: 文物 ID | 全部 |
| `search_documents` | 搜索文献 | `keyword`: 关键词 | 全部 |
| `analyze_data` | 数据统计分析 | `metric`: 统计指标 | 通用 |

---

## 流式响应实现

使用 SSE（Server-Sent Events）实现打字机效果，并传输配置变更：

```
event: config
data: {"mode": "knowledge", "model": "LOCAL", "tools": ["query_graph"]}

event: message
data: {"type": "thinking", "content": "正在查询知识图谱..."}

event: message
data: {"type": "tool_call", "tool": "query_graph", "params": {...}}

event: message
data: {"type": "tool_result", "result": {...}}

event: message
data: {"type": "content", "content": "根据故宫博物院的3件唐代青铜器..."}

event: done
data: {}
```

---

## 配置详解

### AI 插件配置

文件：`backend/config/ai-plugins.json`

```json
{
  "providers": [
    {
      "name": "deepseek",
      "type": "online",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "model": "deepseek-chat",
      "timeout": 30000
    },
    {
      "name": "ollama",
      "type": "local",
      "baseUrl": "http://ollama:11434/v1",
      "model": "deepseek-r1:8b",
      "timeout": 60000
    }
  ],
  "modes": {
    "graph": {
      "systemPrompt": "你必须使用 query_graph 工具查询知识图谱...",
      "requiredTools": ["query_graph"],
      "temperature": 0.1
    },
    "knowledge": {
      "systemPrompt": "先查询知识图谱获取实例，再归纳总结...",
      "requiredTools": ["query_graph"],
      "temperature": 0.3
    },
    "general": {
      "systemPrompt": "基于你的知识自由回答...",
      "requiredTools": [],
      "temperature": 0.7
    }
  },
  "tools": {
    "query_graph": { "enabledByDefault": true },
    "search_artifacts": { "enabledByDefault": true },
    "data_analysis": { "enabledByDefault": false }
  }
}
```

### 用户配置存储

```javascript
// Redis 中存储用户会话配置
{
  "chat:config:{sessionId}": {
    "mode": "knowledge",           // graph | knowledge | general
    "model": "LOCAL",              // ONLINE | LOCAL | MOCK
    "modelLocked": false,          // 是否手动锁定（无视自动降级）
    "enabledTools": ["query_graph", "search_artifacts"],
    "graphView": "core"            // core | conservation（根据插件）
  }
}
```

---

## 前端界面设计

### 聊天界面控制面板

```
┌─────────────────────────────────────────────────────────────┐
│  ChatWindow                                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AI 配置面板（可折叠）                               │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  模型: [云端 ▼]  [锁定] 健康: ●                     │   │
│  │  模式: ○ 图谱  ● 知识  ○ 通用                       │   │
│  │  工具: ☑图谱 ☑搜索 ☐分析                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  消息历史                                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [输入框...] [发送]                                         │
└─────────────────────────────────────────────────────────────┘
```

**交互逻辑**：
- 切换模型：立即生效，当前会话后续请求使用新模型
- 切换模式：立即生效，影响下一条消息的系统提示词
- 开关工具：立即生效，工具禁用时 AI 不会收到该工具定义

---

## Cypher 安全规则

文件：`backend/config/cypher-rules.js`

```javascript
module.exports = {
  // 黑名单：禁止的操作
  blacklist: [
    'DELETE', 'DROP', 'CREATE', 'SET', 'REMOVE',
    'DETACH', 'LOAD CSV', 'apoc', 'dbms'
  ],
  
  // 白名单：只允许以这些开头的查询
  allowedPrefixes: [
    'MATCH', 'OPTIONAL MATCH', 'RETURN', 'WITH',
    'UNWIND', 'WHERE', 'LIMIT', 'ORDER BY', 'COUNT'
  ],
  
  // 最大返回节点数
  maxResults: 100,
  
  // 超时时间（毫秒）
  timeout: 5000
};
```

---

## 扩展指南

### 添加新问答模式

1. 在配置中添加模式定义：
```json
"modes": {
  "my_mode": {
    "systemPrompt": "...",
    "requiredTools": ["tool1"],
    "temperature": 0.5
  }
}
```

2. 在前端添加模式选项

3. 无需修改后端逻辑（配置驱动）

### 添加新工具

1. 创建工具文件
2. 注册到工具注册表
3. 在配置中设置默认启用状态
