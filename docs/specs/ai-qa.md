# AI 智能问答模块规格说明

> 最后更新：2026-04-15
> 状态：讨论中，部分已实现

---

## 1. 产品定位

智能问答是本系统的核心交互界面，统一承载两类场景：

1. **信息检索** — 用户提出文物相关问题，AI 检索数据库并给出有引用来源的回答
2. **数据操作**（MVP 后）— 用户通过自然语言指令让 AI 执行操作，人工审批确认

当前 MVP 阶段聚焦于场景 1：**准确的检索、有据的回答、可追溯的来源**。AI 不直接修改数据。

### 核心竞争点

1. **懂文物** — 基于真实文物数据库和知识图谱的领域问答，不是通用 AI
2. **有出处** — 回答附带引用来源（哪件文物、哪个字段），用户能验证
3. **可追溯** — 点击来源能跳转到文物详情页，看到完整数据

### 设计原则

- **插件化、可扩展** — 工具（Tool）以插件形式注册，新增工具不需要改动 Agent 编排逻辑
- **人机协作** — AI 是操作助手，人是审批者和指挥者
- **来源优先** — 回答必须附来源，来源在回答中以内联编号标注

---

## 2. 架构决策

### 2.1 Tool Calling（ReAct 模式）

系统采用 **ReAct（Reasoning + Acting）** 架构，由 LLM 自主决定调用哪些工具、传什么参数。

选择 Tool Calling 而非 Pre-retrieval 的理由：

1. **搜索质量是回答准确性的瓶颈**。LLM 能将"商代有哪些青铜鼎"拆解为 `search_artifacts(keyword="青铜鼎", era="商")`，比 jieba 分词（"商代"+"青铜"+"鼎"）精准得多
2. **可扩展**。新增工具（图像修复、数据修改等）只需注册 Tool schema，不改动编排逻辑
3. **统一架构**。检索类查询和数据操作类查询使用同一套 Agent 编排，无需两套代码路径
4. **成本可接受**。DeepSeek API 价格约 ¥1/百万 token，日均百次查询成本可忽略

**Pre-retrieval 的位置**：Pre-retrieval 并非被完全替代。对于需要先验知识（如用户画像、常用查询缓存）的场景，Pre-retrieval 可以作为 Tool Calling 的补充。但在当前 MVP 中，Tool Calling 是唯一模式。

**已验证**：DeepSeek-Chat 和 DeepSeek-Reasoner 均支持 function calling（2026-04-15 实测通过）。

### 2.2 LLM 模型选择

| 场景 | 模型 | 理由 |
|------|------|------|
| Agent Tool Calling | `deepseek-chat` | 支持 tool calling，速度快，成本低 |
| 最终回答生成 | `deepseek-chat` 或 `deepseek-reasoner` | Reasoner 有原生 thinking 但更慢，视需求选择 |
| LightRAG 索引构建 | `glm-4.7` via mydamoxing | 独立 API 配置，不影响 Chat |

> **待定**：是否用 Reasoner 做最终回答以获取 thinking 展示。Reasoner 的 thinking 在简单问题上可能过于冗长（"嗯，用户问的是..."），需要 benchmark 评估。

### 2.3 ReAct 执行流程

```
用户提问
  ↓
LLM Call 1: 推理 → 决定是否调用工具
  ↓ (如果需要工具)
执行工具 → 获取结果
  ↓
LLM Call 2: 基于工具结果 → 推理 → 生成回答（或决定再调用工具）
  ↓
流式输出: thinking → tool_call → ... → answer
```

Kimi、ChatGPT Search 均采用此模式。一轮 ReAct = 一次推理 + 一次工具调用，复杂问题可能需要多轮。

### 2.4 System Prompt

Agent 的系统指令，控制工具使用行为和回答风格：

```
你是一个专业的文物知识助手，服务于「文物大数据与人工智能集成系统」。

## 可用工具

你拥有以下工具来检索文物信息：

- **search_artifacts** — 搜索文物数据库。支持按关键词、朝代、类别、出土地点筛选。
  - 适用于：查找具体文物、按条件筛选文物列表
  - 参数：keyword（必填）、era、category、location、limit

- **get_artifact_detail** — 获取指定文物的完整详细信息（描述、尺寸、材质、馆藏等）。
  - 适用于：用户追问某件文物的具体细节
  - 参数：artifact_id（必填）

- **query_knowledge_graph** — 查询知识图谱，获取语义相关的上下文信息。
  - 适用于：关系型问题（"和XX一起出土的文物"）、需要超越关键词匹配的语义检索
  - 参数：question（必填）

## 工具使用规则

1. **精确查找**（"后母戊鼎是什么"）→ 调 search_artifacts，keyword 用完整名称
2. **条件筛选**（"商代青铜鼎"）→ 调 search_artifacts，把"商代"拆为 era="商"，"青铜鼎"作为 keyword
3. **追问详情**（"它的尺寸"）→ 从上下文获取 artifact_id，调 get_artifact_detail
4. **关系查询**（"和XX相关的文物"）→ 调 query_knowledge_graph
5. **闲聊/通用问题**（"你好"、"你能做什么"）→ 不调工具，直接回复
6. 检索结果不足时，可以调多个工具补充信息
7. 不要为了一个简单问题调用所有工具，按需调用

## 回答要求

1. 基于检索结果回答，不要编造数据库中不存在的事实
2. 引用检索结果时标注来源编号，如「后母戊鼎【1】」
3. 回答结构清晰，使用编号列表和加粗标题
4. 如果检索结果不足以回答问题，明确说明，并适当补充你的通用知识（需说明"根据常识"）
5. 如果问题与文物无关，礼貌引导用户回到文物话题
```

该 prompt 需要随 benchmark 结果迭代优化。当前版本的核心目标是防止两类问题：
- **过度调用**：用户问"你好"时不应搜索数据库
- **参数错误**：用户问"商代青铜鼎"时应拆为 `era="商"` + `keyword="青铜鼎"`，而非 `keyword="商代青铜鼎"`

---

## 3. 工具定义（Tool Schema）

### 3.1 当前工具

#### search_artifacts — 搜索文物

```json
{
  "name": "search_artifacts",
  "description": "搜索文物数据库。支持按关键词、朝代、类别等条件筛选。",
  "parameters": {
    "type": "object",
    "properties": {
      "keyword": {
        "type": "string",
        "description": "搜索关键词，匹配文物名称和描述"
      },
      "era": {
        "type": "string",
        "description": "朝代筛选，如'商'、'唐'、'宋'"
      },
      "category": {
        "type": "string",
        "description": "类别筛选，如'青铜器'、'陶瓷'、'书画'"
      },
      "location": {
        "type": "string",
        "description": "出土地点筛选"
      },
      "limit": {
        "type": "integer",
        "description": "返回结果数量上限，默认10",
        "default": 10
      }
    },
    "required": ["keyword"]
  }
}
```

实现要点：
- 精确匹配优先：`name ILIKE '%keyword%'` 先于分词模糊匹配
- 多条件 AND 组合：keyword + era + category 同时生效时取交集
- 结果按相关度排序：精确名称匹配 > 字段匹配数 > 模糊匹配
- 返回字段：id, name, era, category, location, snippet（描述摘要）

#### get_artifact_detail — 获取文物完整信息

```json
{
  "name": "get_artifact_detail",
  "description": "获取指定文物的完整详细信息，包括完整描述、尺寸、材质、馆藏等。",
  "parameters": {
    "type": "object",
    "properties": {
      "artifact_id": {
        "type": "integer",
        "description": "文物 ID"
      }
    },
    "required": ["artifact_id"]
  }
}
```

用途：当用户追问某件文物的详细信息时调用，而非在首次搜索时返回全部数据。

### 3.2 未来工具（MVP 后）

| 工具 | 描述 | 优先级 |
|------|------|--------|
| `query_knowledge_graph` | 查询知识图谱实体关系（如"和XX一起出土的文物"） | P1 |
| `repair_image` | 调用图像修复算法，返回修复后的图片 | P1 |
| `update_artifact` | 修改文物元数据（需人工审批） | P2 |
| `analyze_trends` | 按朝代/类别统计趋势 | P2 |

工具注册机制应支持插件化扩展：新增工具只需定义 JSON schema + 实现函数，Agent 自动识别。

---

## 4. 交互设计

### 4.1 布局

采用 **中央对话流 + 右侧工具详情面板** 的 70/30 布局。

```
┌──────────────────────────┬─────────────────────┐
│                          │                     │
│  对话流（主区域）           │  工具详情面板         │
│                          │  （默认隐藏/空）      │
│                          │                     │
└──────────────────────────┴─────────────────────┘
          ~70%                       ~30%
```

- **右侧面板不重复主区域内容**。它只展示被点击的工具调用的完整参数和原始结果
- **右侧面板按消息持久化**。切换历史消息时，面板展示该消息对应的工具调用详情
- **参考 ChatGPT 的浮窗**：ChatGPT 在 tool calling 后展示可展开的浮窗，位于页面右侧，显示工具执行的具体结果。本系统的右侧面板承担相同角色

### 4.2 消息流中的元素

每条 AI 回复可能包含以下元素，按出现顺序：

#### (1) 工具调用状态卡片（内嵌在对话流中）

类似 ChatGPT 的搜索步骤卡片：

```
┌──────────────────────────────────┐
│ 🔍 搜索文物数据库                  │
│ 参数: "青铜鼎" 朝代: 商            │
│ 找到 5 条结果 · 1.2s      [查看]  │
└──────────────────────────────────┘
```

- 点击 [查看] → 右侧面板展示该次调用的完整信息
- 多次工具调用时显示多个卡片

#### (2) Thinking（默认折叠）

```
┌──────────────────────────────────┐
│ 💭 思考了 8 秒            [展开]  │
└──────────────────────────────────┘
```

- 参照 ChatGPT o1/o3 的设计：思考时显示脉冲动画 + 计时器，完成后自动折叠
- 展开后显示 LLM 的完整推理文本（灰色背景区域）
- 前端需要折叠/展开动效优化

#### (3) 回答正文

标准 Markdown 渲染，包含：
- 结构化内容（编号列表、加粗标题）
- 内联引用标注，如 `后母戊鼎【1】`
- 引用编号对应下方的来源列表

#### (4) 参考来源（紧凑列表）

```
📎 参考来源
[1] 后母戊鼎 — 文物数据库     →
[2] 四羊方尊 — 知识图谱       →
```

- 每条来源可点击，跳转到 `/artifacts/:id` 文物详情页
- 箭头图标暗示可跳转

### 4.3 右侧面板内容

当用户点击某个工具调用卡片时，右侧面板展示：

```
┌─────────────────────┐
│  🔍 搜索文物数据库    │
│                     │
│  搜索参数:           │
│  keyword: 青铜鼎    │
│  era: 商            │
│  limit: 10          │
│                     │
│  检索结果 (5条):     │
│                     │
│  1. 后母戊鼎         │
│     商 · 青铜器      │
│     河南安阳         │
│     [查看详情 →]     │
│                     │
│  2. 四羊方尊         │
│     商 · 青铜器      │
│     湖南宁乡         │
│     [查看详情 →]     │
│                     │
│  ...                │
└─────────────────────┘
```

面板内的"查看详情"链接跳转到文物详情页。

---

## 5. SSE 流式协议

### 5.1 事件类型

| 事件 | 数据 | 说明 |
|------|------|------|
| `thinking_start` | `{}` | 开始推理 |
| `thinking_delta` | `{content: string}` | 推理内容增量 |
| `thinking_end` | `{duration_ms: int}` | 推理结束 |
| `tool_call_start` | `{tool: string, args: object}` | 开始工具调用 |
| `tool_call_result` | `{tool: string, args: object, result: object, elapsed: float}` | 工具调用完成 |
| `answer_start` | `{}` | 开始生成回答 |
| `answer_delta` | `{content: string}` | 回答内容增量 |
| `answer_end` | `{}` | 回答生成完毕 |
| `done` | `{elapsed: float, sources: array}` | 全部完成 |

### 5.2 多轮工具调用的事件流示例

```
thinking_start → thinking_delta... → thinking_end
tool_call_start → tool_call_result
thinking_start → thinking_delta... → thinking_end
tool_call_start → tool_call_result
thinking_start → thinking_delta... → thinking_end
answer_start → answer_delta... → answer_end
done
```

Agent 可能进行多轮 thinking + tool_call 循环（ReAct），每次循环产生一组事件。

### 5.3 前端处理要点

- 事件按顺序处理，每个事件类型更新对应 UI 区域
- 多轮 tool_call 时，消息流中追加多个工具调用卡片
- `done` 事件标记整条回复结束

---

## 6. 多轮对话

### 6.1 上下文管理

当前实现**没有传递对话历史**，这是一个严重缺陷。修复方案：

- 每次调用 LLM 时，将当前 session 的最近 N 条消息（user + assistant）作为 `messages` 数组传入
- LLM 据此理解代词引用（"它"、"那个"）和上下文关联
- 建议 N = 10（最近 5 轮对话），避免 token 膨胀

### 6.2 上下文窗口策略

| 策略 | 描述 |
|------|------|
| 滑动窗口 | 最近 N 条消息，超出截断 |
| 摘要压缩 | 长对话自动摘要旧消息（复杂，MVP 不做） |

MVP 采用滑动窗口，简单可靠。

---

## 7. 检索质量与 Benchmark

### 7.1 当前问题

Pre-retrieval 模式下的 jieba 分词导致：
- "青铜鼎" 被拆为 "青铜" + "鼎"，匹配到所有含 "青铜" 的记录
- "后母戊鼎" 被拆为 "后母" + "戊鼎"，可能匹配到无关文物

Tool Calling 直接解决此问题——LLM 传完整 keyword。

### 7.2 搜索质量优化

`search_artifacts` 工具的实现应遵循：

1. **精确匹配优先**：`name ILIKE '%keyword%'` 先于分词匹配
2. **多条件 AND 组合**：keyword + era + category 同时生效时取交集
3. **相关度排序**：完全匹配 > 前缀匹配 > 包含匹配
4. **结果截断**：默认返回 top 10，避免过多无效结果

### 7.3 Benchmark 方案

准备一组标准问答对，评估 Tool Calling 模式的回答质量：

| 指标 | 度量方式 |
|------|---------|
| 工具调用准确率 | LLM 是否选择了正确的工具和参数 |
| 检索准确率 | 搜索结果是否包含目标文物 |
| 回答相关性 | 回答是否直接回应了用户问题 |
| 引用准确性 | 引用来源是否正确标注 |

Benchmark 数据集需在 LightRAG 索引构建完成后准备。暂缓。

---

## 8. 知识图谱（LightRAG + Neo4j）

### 8.1 当前问题

项目中存在**两套独立的图谱系统**：

| | LightRAG | Neo4j（`/graph` 页面） |
|---|---|---|
| 数据来源 | artifact detail JSON 文本 | SQLite artifacts 表结构化数据 |
| 存储方式 | JSON 文件（kv_store_*.json） | Neo4j 图数据库 |
| 构建方式 | LLM 抽取实体/关系 | 导入结构化数据 |
| 用途 | Q&A 语义检索 | D3.js 可视化展示 |
| 问题 | 查询慢（20s），和 Neo4j 不同步 | 无法用于 Q&A 语义检索 |

这两套系统数据不同步、存储不统一、各自维护，是显著的技术债。

### 8.2 查询慢的根因

LightRAG 的 `aquery()` 每次 Query 都执行以下步骤：

1. LLM 提取查询关键词 → 调 GLM-4.7 API（~5s）
2. 计算查询向量 → 调 Ollama bge-m3（~2s）
3. 向量搜索 + 图遍历 → 在 JSON 文件中遍历（~1s）
4. LLM 生成回答 → 又调 GLM-4.7 API（~8s）

其中 Step 4 完全多余：LightRAG 生成了一次回答，然后这个回答被塞进 system prompt 让 DeepSeek 再生成一次。两次 LLM 生成，只需要一次。

### 8.3 解决方案：统一到 Neo4j

LightRAG 原生支持 Neo4j 作为图谱存储后端：

```python
rag = LightRAG(
    working_dir=WORKING_DIR,
    graph_storage="Neo4JStorage",  # 只需改这一行
)
```

统一后的架构：

```
artifact detail JSON
       ↓ (构建索引，一次性，离线执行)
  LightRAG + Neo4JStorage
       ↓ (实体/关系存入)
  Neo4j 图数据库 ← 唯一的图谱存储
       ↑              ↑
       │              │
  Q&A Agent           /graph 页面
  (query_knowledge_   (D3.js 可视化)
   graph 工具)
```

收益：
- **Q&A 和可视化共享同一份图谱数据**，不再有两套系统
- **查询加速**：Neo4j Cypher 查询替代 JSON 文件遍历，图遍历从秒级降到毫秒级
- **维护简化**：一次构建，两处使用

### 8.4 查询优化

除了切换存储后端，还需要优化查询流程：

1. **`only_need_context=True`**：告诉 LightRAG 只返回检索到的上下文片段，不生成回答。省掉一次 LLM 调用
2. **跳过关键词提取**：Agent 的 Tool Calling 已经将用户问题结构化为参数（如 `query_knowledge_graph(question="后母戊鼎的相关文物")`），不需要 LightRAG 内部再用 LLM 提取关键词
3. **缓存查询向量**：相同或相似问题的 embedding 可以缓存复用

优化后的查询流程：

```
Agent 调用 query_knowledge_graph(question)
  ↓
计算查询向量 → Ollama bge-m3（~2s，可缓存）
  ↓
Neo4j 图遍历 + 向量相似度搜索（~100ms）
  ↓
返回相关上下文片段（不生成回答）
  ↓
Agent 拿到上下文，生成最终回答
```

目标延迟：3s 以内（当前 20s）。

### 8.5 在 Tool Calling 架构中的位置

LightRAG 不是 Q&A 的后台自动检索，而是 Agent 的一个工具：

```json
{
  "name": "query_knowledge_graph",
  "description": "查询文物知识图谱，获取语义相关的上下文信息。适用于关系型问题（如'和XX一起出土的文物'）或需要超越关键词匹配的语义检索。",
  "parameters": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "自然语言问题"
      }
    },
    "required": ["question"]
  }
}
```

Agent 自行决定何时调用此工具。简单关键词查询走 `search_artifacts`，语义/关系查询走 `query_knowledge_graph`。

---

## 9. 已知问题与技术债

### 8.1 会话切换导致 API 调用中断

**现象**：用户在 SSE 流式响应过程中切换会话，前端 EventSource 未正确关闭，导致后端 API 调用仍在执行但无人消费结果。

**影响**：资源浪费、可能触发 API 速率限制、数据库连接泄漏。

**解决方案**：需要 E2E 测试覆盖以下场景：
- 流式响应中切换会话
- 流式响应中发送新消息（取消当前请求）
- 流式响应中关闭页面/浏览器
- 网络断开后重连

### 8.2 历史消息的工具调用丢失 query

**现象**：`tool_calls` JSON 存入数据库时包含 `results` 和 `count`，但不包含 `query`（搜索关键词）。加载历史消息时工具调用卡片显示空 query。

**解决方案**：在 `tool_calls` JSON 中也保存 `args`（完整的工具调用参数）。

### 8.3 Thinking 文本未持久化

**现象**：历史消息加载时 thinking 为空（未存入数据库）。

**是否需要修复**：取决于是否要让历史消息也展示 thinking。如果 thinking 是辅助信息（用户很少回头看），可以不持久化。

---

## 9. 模块划分

| 模块 | 描述 | 依赖 |
|------|------|------|
| M1: 工具定义与实现 | 定义 Tool schema + 实现 search_artifacts, get_artifact_detail | 无 |
| M2: Agent 编排 | Tool Calling 循环、多轮对话上下文、SSE 事件发射 | M1 |
| M3: SSE 协议 | 新事件格式（支持多轮 tool_call） | M2 |
| M4: 前端重构 | 工具调用卡片、右侧面板（持久化）、thinking 折叠、来源跳转 | M3 |
| M5: 检索质量优化 | search_artifacts 的 SQL 改进（精确匹配、排序） | M1 |
| M6: E2E 测试 | 覆盖会话切换、异步操作、多轮对话等边缘场景 | M4 |

---

## 10. 图像修复（独立模块）

图像修复算法集成在**文物详情页**（`/artifacts/:id`），不在智能问答界面中。参照 demo HTML 的实现。

此功能与 Q&A 架构解耦，作为独立的工具/服务存在。

---

## 附录 A：竞品参考

| 产品 | 值得借鉴的设计 |
|------|---------------|
| ChatGPT (o1/o3) | Thinking 默认折叠 + 自动折叠 + 计时器；工具调用内嵌卡片 + 右侧浮窗 |
| Perplexity AI | 来源卡片在答案上方横向排列，来源优先设计 |
| FastGPT | 引用分块阅读器——点击引用弹浮窗显示完整原文+高亮+评分 |
| Kimi | Thinking + Tool Calling 一轮交替（ReAct），UI 展示清晰 |
| Phind | 右侧面板始终显示来源（仅宽屏适配） |

## 附录 B：API 配置

Chat Q&A 和 LightRAG 使用独立的 API 配置，具体值见 `backend/.env`（不提交到 Git）。

| 配置项 | 用途 | 环境变量 |
|--------|------|---------|
| Chat Q&A | DeepSeek | `AI_API_KEY` / `AI_API_BASE` / `AI_MODEL_NAME` |
| LightRAG | GLM via mydamoxing | `LIGHTRAG_API_KEY` / `LIGHTRAG_API_BASE` / `LIGHTRAG_MODEL_NAME` |
