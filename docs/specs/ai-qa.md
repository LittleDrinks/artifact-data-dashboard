# AI 智能问答模块规格说明

> 最后更新：2026-04-17
> 当前实现状态：**已完成核心功能 + UI 重构**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| ReAct Tool Calling 架构 | ✅ 已实现 | LLM 自主决定调用 search_artifacts、get_artifact_detail 工具 |
| SSE 流式输出 | ✅ 已实现 | thinking_start/delta/end + tool_call_start/result + answer_start/delta/end + done |
| 多轮对话上下文 | ✅ 已实现 | session history 最近 10 条消息传入 LLM |
| Thinking 展示 | ✅ 已重构 | **可折叠的"思考过程"区块**，deepseek-reasoner 的 reasoning_content 字段可见 |
| 工具调用气泡 | ✅ 已重构 | **每个检索单独渲染为一个气泡**，显示查询关键词和结果数，可点击选中 |
| RAG 面板选择 | ✅ 已重构 | **右侧面板专注显示某一轮检索结果**，多轮时顶部有切换标签 |
| 参考来源跳转 | ✅ 已实现 | sources 包含 artifact_id，点击跳转 `/artifacts/:id` |
| AbortController | ✅ 已实现 | 组件卸载/切换会话时取消 SSE 请求 |
| SSE 401 处理 | ✅ 已实现 | fetch 检测 401 后清除 token 跳转登录页 |

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

---

## 2. 架构决策

### 2.1 Tool Calling（ReAct 模式）

系统采用 **ReAct（Reasoning + Acting）** 架构，由 LLM 自主决定调用哪些工具、传什么参数。

选择 Tool Calling 的理由：

1. **搜索质量是回答准确性的瓶颈**。LLM 能将"商代有哪些青铜鼎"拆解为 `search_artifacts(keyword="青铜鼎", era="商")`
2. **可扩展**。新增工具只需注册 Tool schema，不改动编排逻辑
3. **统一架构**。检索类查询和数据操作类查询使用同一套 Agent 编排

**已验证（2026-04-17）**：deepseek-reasoner **同时支持** function calling（tool_calls）和 reasoning_content（思考过程），二者在同一个流式响应中交替出现。无需任何 fallback 或两步方案。

### 2.2 LLM 模型配置

| 场景 | 模型 | 环境变量 | 说明 |
|------|------|---------|------|
| Agent Tool Calling + Thinking | `deepseek-reasoner` | `AI_MODEL_NAME` | **原生 reasoning_content 字段**，支持 tool calling |
| LightRAG 索引构建 | `glm-4.7` | `LIGHTRAG_MODEL_NAME` | 独立 API 配置，不影响 Chat |

> **关键特性**：deepseek-reasoner 同时提供 `reasoning_content`（思考过程）和 `tool_calls`（工具调用）。经实测确认：每轮 ReAct 循环中，模型先输出 thinking（reasoning_content），再输出 tool_calls 或最终回答，二者不冲突。SSE 事件流为：`thinking_start/delta/end → tool_call_start/result → (下一轮) → ... → answer_start/delta/end`。

### 2.3 System Prompt

```python
SYSTEM_PROMPT = (
    "你是一个专业的文物知识助手，服务于「文物大数据与人工智能集成系统」。\n"
    "你可以使用以下工具来获取文物数据：\n"
    "1. **search_artifacts** — 按关键词、朝代、类别搜索文物数据库\n"
    "2. **get_artifact_detail** — 获取指定文物的完整信息\n\n"
    "回答规则：\n"
    "- 【不调用工具的场景】如果用户只是打招呼、寒暄、问你的能力，直接友好回复，**绝对不要调用任何工具**\n"
    "- 用户询问文物相关信息时，务必先调用工具查询数据库\n"
    "- 综合工具返回的数据回答，用编号列表和加粗标题组织内容\n"
    "- 引用数据时标注来源\n"
    "- 如果工具返回为空，如实告知未找到\n"
    "- 回答要结构清晰、准确、专业\n"
)
```

---

## 3. 工具定义

### 3.1 已实现工具

#### search_artifacts — 搜索文物

```json
{
  "name": "search_artifacts",
  "description": "搜索文物数据库。支持按关键词、朝代、类别等条件筛选。",
  "parameters": {
    "keyword": {"type": "string", "description": "搜索关键词"},
    "era": {"type": "string", "description": "朝代筛选"},
    "category": {"type": "string", "description": "类别筛选"},
    "limit": {"type": "integer", "default": 10}
  }
}
```

实现位置：`backend/app/ai/tools.py`

#### get_artifact_detail — 获取文物详情

```json
{
  "name": "get_artifact_detail",
  "description": "获取指定文物的完整详细信息。",
  "parameters": {
    "artifact_id": {"type": "integer", "description": "文物 ID"}
  }
}
```

### 3.2 query_knowledge_graph 工具 — ✅ 已实现

> 工具已在 `backend/app/ai/tools.py` 完整实现，但依赖 Neo4j 有数据才能返回结果。

**实现位置**：
- 工具定义：`tools.py:83-108`
- 实现函数：`tools.py:228-273` (`_tool_query_knowledge_graph`)
- 调度入口：`tools.py:127` (`execute_tool` 分支)

```json
{
  "name": "query_knowledge_graph",
  "description": "查询知识图谱中的语义实体和关系，用于概念性知识查询。",
  "parameters": {
    "keyword": {"type": "string", "description": "搜索关键词"},
    "limit": {"type": "integer", "default": 20}
  }
}
```

**已知限制**：工具依赖 Neo4j 图谱数据。当前 Neo4j 未接入（使用 LightRAG KV Store fallback），因此调用此工具返回空结果（message: "知识图谱暂无数据"）。需运行 `build_lightrag_index.py` 并将数据导入 Neo4j 后才能正常使用。

---

## 4. SSE 流式协议

### 4.1 事件类型

| 事件 | 数据字段 | 说明 |
|------|---------|------|
| `thinking_start` | `{}` | 开始推理（仅 deepseek-reasoner） |
| `thinking_delta` | `{content: string}` | 推理内容增量 |
| `thinking_end` | `{}` | 推理结束 |
| `tool_call_start` | `{tool, query}` | 工具调用开始 |
| `tool_call_result` | `{results, count, elapsed}` | 工具调用返回 |
| `answer_start` | `{}` | 开始生成回答 |
| `answer_delta` | `{content: string}` | 回答内容增量 |
| `answer_end` | `{}` | 回答结束 |
| `done` | `{elapsed, sources}` | 全部完成 |

### 4.2 多轮 ReAct 事件流

```
thinking_start → thinking_delta... → thinking_end
tool_call_start → tool_call_result
(thinking 可能再次出现)
answer_start → answer_delta... → answer_end
done
```

最多 5 轮 ReAct 循环（`MAX_REACT_ROUNDS = 5`）。

---

## 5. 前端实现

### 5.1 布局

中央对话流 + 右侧 RAG 知识面板（70/30 布局）。

位置：`frontend/src/pages/Chat.tsx`

### 5.2 SSE 处理

```typescript
// frontend/src/api/chat.ts
export function sendChatMessage(
  sessionId: number,
  query: string,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void>
```

关键实现：
- 接收 `AbortSignal` 参数传入 fetch — `chat.ts:89,102`
- 检测 401 状态码后清除 token 跳转登录 — `chat.ts:107-110`
- SSE 读取循环中 try/catch 处理 AbortError — `chat.ts:156-161`

### 5.3 AbortController 管理

```typescript
// frontend/src/pages/Chat.tsx
const abortControllerRef = useRef<AbortController | null>(null)

// 组件卸载时 abort
useEffect(() => {
  return () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }
}, [])

// 切换会话时 abort
const handleSelectSession = async (sessionId: number) => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort()
  }
  // ...
}
```

位置：`Chat.tsx:88, 91-95, 188-189, 229-230`

### 5.4 Thinking 展示（2026-04-17 重构）

Thinking 以**可折叠区块**形式展示：

```typescript
// frontend/src/pages/Chat.tsx
const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())

const renderThinkingSection = (msg: DisplayMessage) => {
  // 显示"思考过程 ▸"折叠标题
  // 展开后显示 reasoning_content 文本
  // 思考进行中显示 LoadingOutlined
}
```

设计要点：
- 默认折叠，点击标题展开
- 标题显示字数统计（思考完成后）
- 思考文本在浅灰背景中展示，字体稍小
- 使用 `BulbOutlined` 图标标识

### 5.5 工具调用气泡（2026-04-17 重构）

每个检索单独渲染为一个**可点击气泡**：

```typescript
const renderToolCallBubbles = (msg: DisplayMessage) => {
  // 为每个 ToolCallEntry 渲染独立卡片
  // 卡片显示：轮次编号、🔍图标、查询关键词、结果数
  // 点击卡片切换 RAG 面板到对应检索
}
```

设计要点：
- 每个气泡显示 "第 N 轮" + "关键词" + 结果数
- 当前选中的气泡有紫色边框高亮
- 检索进行中显示 LoadingOutlined
- 点击气泡自动打开 RAG 面板并切换到对应检索

### 5.6 RAG 面板选择（2026-04-17 重构）

右侧面板**专注显示某一轮检索结果**：

```typescript
const [selectedToolCallIndex, setSelectedToolCallIndex] = useState<number>(-1)

// 多轮时顶部显示切换标签
{allToolCalls.length > 1 && (
  <div style={{ display: 'flex', gap: 6 }}>
    {allToolCalls.map((tc, idx) => (
      <div onClick={() => setSelectedToolCallIndex(idx)}>
        第 {idx + 1} 轮
      </div>
    ))}
  </div>
)}
```

设计要点：
- 默认显示最新一轮检索结果
- 多轮检索时顶部有"第 1 轮 / 第 2 轮"切换标签
- 点击标签切换到对应检索的结果列表
- 与消息流中的工具调用气泡联动（点击气泡也切换面板）

### 5.7 参考来源跳转

```typescript
// frontend/src/pages/Chat.tsx:628-630
onClick={() => {
  if (s.artifact_id) {
    navigate(`/artifacts/${s.artifact_id}`)
  }
}}
```

后端在构建 sources 时提取 artifact_id：`chat.py:281-285`

### 5.7 参考来源跳转

```typescript
// frontend/src/pages/Chat.tsx:628-630
onClick={() => {
  if (s.artifact_id) {
    navigate(`/artifacts/${s.artifact_id}`)
  }
}}
```

后端在构建 sources 时提取 artifact_id：`chat.py:281-285`

---

## 6. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| P2-CHAT-5 | 历史消息不显示 Thinking | [review-chat-graph] | P2 | `Chat.tsx:171` 历史消息的 thinking 硬编码为空。后端 ChatMessage 模型无 thinking 字段。 |
| UX-1 | ~~ReAct reasoning steps 在 UI 中合并展示~~ | [设计] | ~~P2~~ | **2026-04-17 已解决**：每个检索渲染为独立气泡。 |
| UX-2 | ~~简单问候也会显示 ThinkingBlock 折叠框~~ | [体验] | ~~P3~~ | **2026-04-17 已解决**：思考区块仅在有内容时显示，默认折叠。 |

---

## 7. 验收标准

| 标准 | 状态 | 验证方法 |
|------|------|---------|
| SSE 流中途断开不泄漏资源 | ✅ Pass | AbortController 实现，组件卸载/切换会话时 abort |
| 连续发送消息不竞态 | ✅ Pass | loading 状态禁用发送按钮 |
| 流式响应切换会话后 UI 不残留旧数据 | ✅ Pass | 切换会话时 abort + 清空 messages |
| 用户消息和 AI 回复成对保存 | ✅ Pass | save_message 在 done 前执行 |
| 参考来源可点击跳转 | ✅ Pass | sources 包含 artifact_id，onClick navigate |
| RAG 面板与消息流数据同步 | ✅ Pass | useEffect 从消息派生面板状态 |

质量评审标准得分：**23/25 Pass**（见 `docs/quality-rubric.md`）

---

## 8. API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/chat/sessions` | GET | 获取用户会话列表（分页） |
| `/api/chat/sessions` | POST | 创建新会话 |
| `/api/chat/sessions` | DELETE | 批量删除会话（ids 参数） |
| `/api/chat/sessions/:id/messages` | GET | 获取会话历史消息 |
| `/api/chat/ask` | POST | AI 问答（SSE 流式） |

---

## 9. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/services/chat.py` | ReAct 循环、SSE 事件发送、会话管理 |
| `backend/app/ai/tools.py` | 工具定义（search_artifacts、get_artifact_detail） |
| `backend/app/routers/chat.py` | SSE 端点 |
| `frontend/src/pages/Chat.tsx` | SSE 处理、消息渲染、AbortController |
| `frontend/src/api/chat.ts` | sendChatMessage、类型定义 |
| `backend/.env` | AI_API_KEY、AI_API_BASE、AI_MODEL_NAME |

---

*最后更新：2026-04-16*