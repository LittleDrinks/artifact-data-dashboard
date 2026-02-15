# AI 与 MCP 集成 - 规格说明

## 概述

系统 AI 能力集成在工作台右侧面板，通过 Tab 切换支持**智能问答**和**图像修复**两大功能。右侧面板与左侧文物探索区实时联动，形成完整的"发现→理解→修复"工作流。

```
┌─────────────────────────────────────────────────────────────┐
│                      工作台 (Workbench)                      │
├───────────────────────────┬─────────────────────────────────┤
│                           │                                 │
│     左侧：文物探索          │     右侧：AI 助手                │
│                           │                                 │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │
│  │   文物搜索/图谱      │  │  │  [智能问答] [图像修复]     │  │
│  │   (选中状态)         │  │  │        ↑ Tab 切换          │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│            │              │              │                  │
│            │ 选中同步      │              ▼                  │
│            │ ─────────────┤  ┌───────────────────────────┐  │
│            │              │  │  ChatPanel                │  │
│            ▼              │  │  ├── 模式/工具配置         │  │
│  ┌─────────────────────┐  │  │  ├── 消息历史              │  │
│  │  当前查看: 四羊方尊  │  │  │  ├── 上下文指示器          │  │
│  │  (ContextBridge)    │──┤  │  └── 输入框+快捷问题       │  │
│  └─────────────────────┘  │  └───────────────────────────┘  │
│                           │  ┌───────────────────────────┐  │
│                           │  │  InpaintPanel             │  │
│                           │  │  ├── 图片上传/选择         │  │
│                           │  │  ├── 修复类型选择          │  │
│                           │  │  ├── 前后对比预览          │  │
│                           │  │  └── 进度/操作栏           │  │
│                           │  └───────────────────────────┘  │
└───────────────────────────┴─────────────────────────────────┘
```

---

## 右侧面板架构

### 组件结构

```typescript
interface RightPanelState {
  activeTab: 'chat' | 'inpaint';        // 当前激活的 Tab
  
  // 工作台上下文
  context: {
    selectedArtifact: Artifact | null;   // 左侧选中的文物
    selectedImage: Image | null;         // 用于修复的图片
  };
  
  // AI 问答配置
  chat: {
    mode: 'graph' | 'knowledge' | 'general';  // 问答模式
    model: 'ONLINE' | 'LOCAL' | 'MOCK';       // 模型选择
    enabledTools: string[];                   // MCP 工具开关
    messages: Message[];                      // 对话历史
  };
  
  // 图像修复状态
  inpaint: {
    repairType: 'watermark' | 'face' | 'super' | 'colorize';
    sourceImage: Image | null;
    repairedImage: Image | null;
    progress: number;                    // 0-100
    isProcessing: boolean;
  };
}
```

### 面板组件层级

```
RightPanel/
├── PanelTabs.tsx              # Tab 切换: [智能问答] [图像修复]
│
├── ChatPanel/
│   ├── ConfigBar.tsx          # 固定配置栏
│   │   ├── ModeSelector.tsx   # 图谱/知识/通用模式
│   │   ├── ModelSelector.tsx  # ONLINE/LOCAL/MOCK
│   │   └── ToolToggle.tsx     # MCP 工具开关
│   ├── ContextIndicator.tsx   # 当前关联文物上下文
│   ├── MessageList.tsx        # Markdown 消息历史
│   ├── QuickQuestions.tsx     # 快捷问题推荐
│   └── InputBox.tsx           # 输入框
│
└── InpaintPanel/
    ├── ImageSource.tsx        # 图片来源选择
    │   ├── UploadZone.tsx     # 本地上传
    │   └── ArtifactGallery.tsx # 从左侧文物选择
    ├── RepairTypeSelector.tsx # 修复类型选择
    ├── PreviewCompare.tsx     # 前后对比滑块
    ├── ProgressBar.tsx        # 修复进度条
    └── ActionBar.tsx          # 修复/保存/下载
```

---

## 工作台上下文感知

### 上下文同步机制

**ContextBridge** 组件负责左右面板状态同步：

```typescript
// 当左侧选中文物变化时
useEffect(() => {
  if (selectedArtifact) {
    // 1. 更新 ChatPanel 上下文指示器
    setChatContext({
      artifactId: selectedArtifact.id,
      artifactName: selectedArtifact.name,
      contextPrompt: `我正在查看"${selectedArtifact.name}"（${selectedArtifact.dynasty}），请基于此文物回答我的问题。`
    });
    
    // 2. 可选：自动发送上下文问候
    if (autoContextEnabled) {
      sendMessage(chatContext.contextPrompt);
    }
    
    // 3. 更新 InpaintPanel 可选图片列表
    setAvailableImages(selectedArtifact.images);
  }
}, [selectedArtifact]);
```

### 上下文注入方式

#### 方式一：自动注入（默认）

用户提问时，系统自动追加上下文到提示词：

```javascript
// 系统提示词模板（含上下文）
const SYSTEM_PROMPT_WITH_CONTEXT = `
你是一位文物知识助手。用户当前正在查看以下文物：
- 名称: {{artifactName}}
- 年代: {{dynasty}}
- 收藏地: {{museum}}

请在回答时结合该文物的具体信息。
当前问答模式: {{mode}}
`;
```

#### 方式二：用户触发

ChatPanel 显示**上下文指示器**，用户可手动清除或修改：

```
┌─────────────────────────────────────────────────┐
│ 🔗 当前关联: 四羊方尊 (商代晚期)        [清除]   │
├─────────────────────────────────────────────────┤
│ 输入框...                                        │
└─────────────────────────────────────────────────┘
```

### Inpaint 图片来源联动

**从左侧文物直接启动修复**：

```
左侧文物卡片:
┌─────────────────┐
│ [文物图片]      │
│ 四羊方尊        │
│                 │
│ [查看] [修复▶]  │  ← 点击修复
└─────────────────┘
          │
          ▼ 自动跳转
┌─────────────────────────────────┐
│  [智能问答] [图像修复●]          │  ← Tab 自动切换
├─────────────────────────────────┤
│ 已选择: 四羊方尊-正视图.jpg      │
│ [预览图]                        │
│                                 │
│ 修复类型: [去水印▼] [开始修复]   │
└─────────────────────────────────┘
```

---

## 三种问答模式

用户可在 ChatPanel 的 ConfigBar 中实时切换模式，切换立即生效：

### 模式对比

| 模式 | 触发条件 | AI 行为 | 适用问题 | 上下文感知 |
|------|----------|---------|----------|------------|
| **图谱模式** | 用户选择 | 必须调用图谱工具查询，只回答图谱中存在的事实 | "哪些唐代青铜器收藏在故宫？" | 自动注入当前文物 ID 到查询条件 |
| **知识模式** | 用户选择 | 先调用图谱获取实例，再基于实例归纳知识 | "唐代青铜器有什么特点？" | 优先检索与当前文物相关的实例 |
| **通用模式** | 用户选择 | 不强制使用工具，AI 自由回答 | "青铜器制作工艺简介" | 在提示词中提及当前文物作为参考 |

### 模式实现细节

#### 图谱模式（带上下文）

```javascript
const GRAPH_MODE_PROMPT = `
你是一位文物知识助手。用户当前处于"图谱模式"。
{{#if selectedArtifact}}
用户正在查看的文物: {{selectedArtifact.name}} (ID: {{selectedArtifact.id}})
{{/if}}

规则：
1. 必须调用 query_graph 工具查询知识图谱获取信息
2. {{#if selectedArtifact}}优先查询与当前文物相关的实体和关系{{/if}}
3. 只回答图谱中存在的事实，不确定时回答"根据现有数据..."
4. 如果图谱中没有相关信息，明确告知用户"图谱中未找到相关信息"
`;

// 流程
userQuestion → injectContext → forceToolCall('query_graph') → presentFacts
```

#### 知识模式（带上下文）

```javascript
const KNOWLEDGE_MODE_PROMPT = `
你是一位文物知识助手。用户当前处于"知识模式"。
{{#if selectedArtifact}}
用户正在查看的文物: {{selectedArtifact.name}}
请优先从知识图谱中检索与该文物类似的实例进行归纳。
{{/if}}

规则：
1. 首先调用 query_graph 工具查询知识图谱获取相关文物实例
2. 基于这些具体实例，归纳总结通用知识
3. 回答时引用具体实例作为证据（"如故宫博物院藏的X文物所示..."）
4. 如果图谱中没有相关实例，回答"缺乏足够实例支持结论"
`;
```

#### 通用模式（带上下文）

```javascript
const GENERAL_MODE_PROMPT = `
你是一位文物知识助手。用户当前处于"通用模式"。
{{#if selectedArtifact}}
用户正在查看的文物: {{selectedArtifact.name}} ({{selectedArtifact.dynasty}})
你可以在回答时参考这件文物的信息。
{{/if}}

规则：
1. 可以基于你的训练数据自由回答
2. {{#if selectedArtifact}}如果问题涉及该文物的具体馆藏信息，建议调用图谱工具核实{{/if}}
3. 明确区分"通用知识"和"具体馆藏信息"
`;
```

---

## MCP 工具设计

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
      },
      contextArtifactId: {
        type: 'string',
        description: '上下文文物ID（可选，用于优先检索相关实体）'
      }
    },
    required: ['cypher']
  },
  
  isEnabled: (userContext) => {
    return userContext.enabledTools.includes('query_graph');
  },
  
  async execute({ cypher, contextArtifactId }, context) {
    // 安全检查
    const forbidden = ['DELETE', 'DROP', 'CREATE', 'SET', 'REMOVE'];
    if (forbidden.some(k => cypher.toUpperCase().includes(k))) {
      throw new Error('禁止执行写入操作');
    }
    
    // 如果提供了上下文文物ID，注入到查询中
    if (contextArtifactId) {
      cypher = injectArtifactContext(cypher, contextArtifactId);
    }
    
    const session = neo4jDriver.session();
    try {
      const result = await session.run(cypher, { 
        labels: context.getEnabledNodeLabels(),
        contextId: contextArtifactId
      });
      return formatNeo4jResult(result);
    } finally {
      await session.close();
    }
  }
};
```

### 已注册工具

| 工具名 | 功能 | 参数 | 适用模式 | 工作台上下文支持 |
|--------|------|------|----------|------------------|
| `query_graph` | 查询知识图谱 | `cypher`, `contextArtifactId?` | 图谱/知识 | 自动注入当前文物ID |
| `search_artifacts` | 搜索文物 | `keyword`, `filters?` | 全部 | 优先返回与当前文物同类别/年代的结果 |
| `get_artifact_detail` | 获取文物详情 | `id` | 全部 | 如未提供id，默认使用当前文物 |
| `search_documents` | 搜索文献 | `keyword` | 全部 | - |
| `analyze_data` | 数据统计分析 | `metric` | 通用 | - |
| `inpaint_image` | 图像修复 | `image_url`, `repair_type`, `options?` | - | 自动关联到当前文物 |

### 图像修复工具（新增）

```javascript
// backend/src/services/tools/inpainting.tool.js
module.exports = {
  name: 'inpaint_image',
  description: '对文物图像进行 AI 修复（去水印、人脸修复、超分辨率、上色）',
  parameters: {
    type: 'object',
    properties: {
      image_url: {
        type: 'string',
        description: '需要修复的图像 URL'
      },
      repair_type: {
        type: 'string',
        enum: ['watermark', 'face', 'super', 'colorize'],
        description: '修复类型: watermark=去水印, face=人脸修复, super=超分辨率, colorize=上色'
      },
      context_artifact_id: {
        type: 'string',
        description: '关联的文物ID（修复完成后自动添加到该文物的附件）'
      },
      options: {
        type: 'object',
        properties: {
          scale: { type: 'number', description: '超分倍数（仅super有效）' },
          quality: { type: 'string', enum: ['standard', 'high'], default: 'standard' }
        }
      }
    },
    required: ['image_url', 'repair_type']
  },
  
  async execute({ image_url, repair_type, context_artifact_id, options }, context) {
    // 1. 获取用户的图像修复 API 配置
    const userConfig = await getUserInpaintingConfig(context.userId);
    const provider = userConfig?.provider || 'aliyun';
    
    // 2. 调用图像修复 API
    const result = await callInpaintingAPI({
      provider,
      apiKey: userConfig?.api_key,
      imageUrl: image_url,
      repairType: repair_type,
      options
    });
    
    // 3. 保存修复结果到附件系统
    const attachment = await saveRepairedImage({
      originalUrl: image_url,
      repairedUrl: result.url,
      artifactId: context_artifact_id,
      userId: context.userId,
      metadata: {
        repairType,
        provider,
        cost: result.cost
      }
    });
    
    // 4. 记录修复历史
    await saveRepairRecord({
      userId: context.userId,
      artifactId: context_artifact_id,
      originalImage: image_url,
      repairedImage: result.url,
      attachmentId: attachment.id,
      cost: result.cost,
      provider,
      repairType
    });
    
    return {
      original_url: image_url,
      repaired_url: result.url,
      attachment_id: attachment.id,
      cost: result.cost,
      provider
    };
  }
};
```

### 工具开关与模式关系

**工具禁用时的降级策略**：

| 禁用工具 | 影响 |
|----------|------|
| `query_graph` | 图谱模式自动降级为通用模式；知识模式自动降级为通用模式 |
| `inpaint_image` | 图像修复功能完全禁用，InpaintPanel 显示"未配置 API"提示 |

---

## 流式响应实现

使用 SSE（Server-Sent Events）实现打字机效果：

```
event: config
data: {"mode": "knowledge", "model": "LOCAL", "tools": ["query_graph"], "contextArtifactId": "123"}

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

## 用户配置存储

### Redis 存储结构

```javascript
// 会话级配置（临时，浏览器关闭后保留一段时间）
{
  "chat:config:{sessionId}": {
    "mode": "knowledge",                    // graph | knowledge | general
    "model": "LOCAL",                       // ONLINE | LOCAL | MOCK
    "modelLocked": false,                   // 是否手动锁定（无视自动降级）
    "enabledTools": ["query_graph", "search_artifacts", "inpaint_image"],
    "contextArtifactId": "artifact_123",    // 当前关联的文物ID
    "autoContextEnabled": true              // 是否自动注入上下文
  }
}

// 用户级图像修复 API 配置（持久化）
{
  "user:inpaint:config:{userId}": {
    "provider": "aliyun",                   // aliyun | baidu | custom
    "apiKeyEncrypted": "aes:xxx",           // 加密存储
    "apiSecretEncrypted": "aes:xxx",        // 阿里云需要
    "endpointUrl": "https://...",           // 自定义端点（可选）
    "monthlyBudget": 100.00,                // 月度预算上限
    "defaultRepairType": "watermark"        // 默认修复类型
  }
}
```

### 配置优先级

```
1. 会话级配置（Redis: chat:config:{sessionId}）
   ↓ 无会话配置
2. 用户默认配置（MySQL: user_preferences 表）
   ↓ 无用户配置
3. 系统默认配置（ai-plugins.json）
```

---

## 前端界面设计

### 右侧面板整体布局

```
┌─────────────────────────────────────────────────────────────┐
│  RightPanel (width: 400px, resizable)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PanelTabs                                          │   │
│  │  ┌─────────────┐ ┌─────────────┐                   │   │
│  │  │ 智能问答    │ │ 图像修复    │                   │   │
│  │  │   ●         │ │             │                   │   │
│  │  └─────────────┘ └─────────────┘                   │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Tab: 智能问答]                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ConfigBar (固定高度, 可折叠)                         │   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ 模型: [本地 ▼]  模式: [知识 ●]  工具: [设置]     │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ContextIndicator (仅当有选中文物时显示)              │   │
│  │ 🔗 当前关联: 四羊方尊                     [清除]    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ MessageList (flex: 1, overflow: auto)               │   │
│  │ [消息历史...]                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ InputBox                                            │   │
│  │ [快捷问题: 介绍 | 年代 | 收藏地...]                  │   │
│  │ ┌─────────────────────────────────────────┐ [发送] │   │
│  │ │ 请输入您的问题...                        │       │   │
│  │ └─────────────────────────────────────────┘       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Tab: 图像修复]                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ImageSource                                         │   │
│  │ ┌───────────────────┐ ┌───────────────────────────┐ │   │
│  │ │   [拖拽上传区]    │ │ 从左侧文物选择:          │ │   │
│  │ │   点击或拖拽图片  │ │ [图片1] [图片2] [图片3]  │ │   │
│  │ └───────────────────┘ └───────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ RepairTypeSelector                                  │   │
│  │ [去水印] [人脸修复] [超分辨率] [上色]               │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ PreviewCompare                                      │   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │     原图        [||||||滑块||||||]       修复后  │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ProgressBar + ActionBar                             │   │
│  │ 修复中... [████████░░] 80%              [保存][下载]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 配置栏展开状态

```
┌─────────────────────────────────────────────────────────────┐
│ ConfigBar (展开)                                            │
├─────────────────────────────────────────────────────────────┤
│ 模型选择                                                    │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ ● 云端 (DeepSeek)    ○ 本地 (Ollama)    ○ 模拟     │    │
│ │   [●在线]              [●在线]           [●在线]   │    │
│ └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│ 问答模式                                                    │
│ ┌─────────────────────────────────────────────────────┐    │
│ │ ○ 图谱    ● 知识    ○ 通用                         │    │
│ │   只查事实   归纳知识   自由回答                     │    │
│ └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│ MCP 工具                                                    │
│ ☑ 图谱查询  ☑ 文物搜索  ☐ 图像修复  ☐ 数据分析          │    │
│ (禁用工具将影响对应功能)                                     │    │
└─────────────────────────────────────────────────────────────┘
```

### 组件交互逻辑

#### Tab 切换

```typescript
// 切换 Tab 时保持工作台上下文
const handleTabChange = (newTab: 'chat' | 'inpaint') => {
  // 1. 保存当前 Tab 的状态
  saveTabState(activeTab, currentTabState);
  
  // 2. 恢复目标 Tab 的状态
  const targetState = loadTabState(newTab);
  restoreTabState(targetState);
  
  // 3. 上下文保持不变（selectedArtifact 不变）
  setActiveTab(newTab);
};
```

#### 上下文清除

用户可以手动清除当前关联的文物：

```typescript
const handleClearContext = () => {
  setContextArtifact(null);
  // 后续提问不再自动注入上下文
  updateConfig({ contextArtifactId: null });
};
```

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

## API 接口

### 获取右侧面板状态

```http
GET /api/workbench/right-panel
Authorization: Bearer {token}

Response:
{
  "activeTab": "chat",
  "context": {
    "selectedArtifact": { "id": "123", "name": "四羊方尊", ... },
    "selectedImage": null
  },
  "chat": {
    "mode": "knowledge",
    "model": "LOCAL",
    "enabledTools": ["query_graph", "search_artifacts"]
  },
  "inpaint": {
    "repairType": "watermark",
    "isProcessing": false
  }
}
```

### 更新配置

```http
POST /api/chat/config
Authorization: Bearer {token}
Content-Type: application/json

{
  "sessionId": "xxx",
  "mode": "knowledge",
  "model": "LOCAL",
  "enabledTools": ["query_graph", "search_artifacts", "inpaint_image"],
  "contextArtifactId": "123"
}
```

### 图像修复

```http
POST /api/inpaint
Authorization: Bearer {token}
Content-Type: application/json

{
  "imageUrl": "https://...",
  "repairType": "watermark",
  "contextArtifactId": "123",  // 可选，关联到文物
  "options": {
    "quality": "high"
  }
}

Response (异步):
{
  "jobId": "job_xxx",
  "status": "processing",
  "progress": 0
}

// 通过 SSE 获取进度
GET /api/inpaint/stream?jobId=job_xxx
```

---

## 扩展指南

### 添加新 Tab

1. 在 `PanelTabs.tsx` 添加新 Tab 按钮
2. 创建新 Panel 组件（如 `TranslatePanel/`）
3. 在 `RightPanel/index.tsx` 注册新 Tab 的渲染逻辑
4. 更新状态类型 `RightPanelState`

### 添加新 MCP 工具

1. 创建工具文件 `backend/src/services/tools/{name}.tool.js`
2. 注册到工具注册表
3. 在配置中设置默认启用状态
4. 在 `ToolToggle.tsx` 添加开关（如果需要用户控制）

### 自定义图像修复服务商

1. 实现服务商适配器 `backend/src/services/inpainting/{provider}.js`
2. 实现接口：`repair(imageUrl, type, options)`
3. 在 `inpainting.tool.js` 中注册新 provider
4. 在前端配置页面添加服务商选项

---

*文档版本: v2.0 - 工作台架构*
*更新日期: 2026-02-15*

