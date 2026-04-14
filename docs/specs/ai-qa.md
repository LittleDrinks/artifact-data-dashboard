# AI 智能问答模块规格说明

> 参考：`docs/PRD.md` §3.4 智能问答
> 相关 ADR：ADR-003 (LightRAG + LangChain Agent)、ADR-013 (GraphRAG vs RAG 待测)

---

## 1. 需求概述

AI 智能问答模块是本系统的核心差异化功能，提供基于知识图谱增强的文物问答能力。

### 1.1 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| SSE 流式输出 | 实时展示 AI 思考过程和回答 | P0 |
| 双栏布局 | 左侧聊天区 + 右侧知识面板 | P0 |
| 会话管理 | 创建/切换/重命名/删除会话 | P0 |
| 三阶段展示 | Thinking → Tool Call → Answer | P0 |
| 模式切换 | tool_calling / pre_retrieve | P1 |
| 历史记录 | 按会话 ID 加载历史消息 | P1 |

---

## 2. 系统架构

### 2.1 整体流程

```
用户问题
    ↓
┌────────────────────────────────────────────────┐
│  LangChain Agent 编排                          │
│  ┌──────────────┐  ┌──────────────────────┐   │
│  │ 关键词提取    │  │  工具调用决策         │   │
│  │ (jieba TF-IDF)│  │  (需要调用哪些工具)   │   │
│  └──────────────┘  └──────────────────────┘   │
└────────────────────────────────────────────────┘
    ↓
┌────────────────────────────────────────────────┐
│  可用工具                                       │
│  ┌────────────────┐  ┌────────────────────┐   │
│  │ search_artifacts│  │ query_graph       │   │
│  │ (SQLite 搜索)   │  │ (Neo4j 图谱查询)   │   │
│  └────────────────┘  └────────────────────┘   │
│  ┌────────────────┐  ┌────────────────────┐   │
│  │ rag_query      │  │ get_artifact_detail│   │
│  │ (LightRAG 语义) │  │ (完整详情)         │   │
│  └────────────────┘  └────────────────────┘   │
└────────────────────────────────────────────────┘
    ↓
┌────────────────────────────────────────────────┐
│  LLM 生成回答                                   │
│  System Prompt + 检索结果 → SSE 流式输出        │
└────────────────────────────────────────────────┘
```

---

## 3. AI 问答模式

### 3.1 Tool Calling 模式

LangChain AgentExecutor 驱动，AI 自主决定调用哪些工具。

**可用工具**：

| 工具 | 输入 | 输出 | 用途 |
|------|------|------|------|
| search_artifacts | keyword, category, era | artifacts[] | 搜索文物列表 |
| query_graph | keyword, depth | nodes[], edges[] | 图谱关系查询 |
| rag_query | question | contexts[] + answer | LightRAG 语义检索 |
| get_artifact_detail | artifact_id | artifact{} | 获取完整详情 |

**工具定义**：
```python
# backend/app/ai/tools.py
@tool
def search_artifacts(keyword: str, category: str = None, era: str = None) -> list[dict]:
    """按关键词搜索文物列表"""
    return artifact_service.search(keyword, category, era)

@tool
def query_graph(keyword: str, depth: int = 1) -> dict:
    """查询知识图谱实体关系"""
    return graph_service.search(keyword, depth)

@tool
def rag_query(question: str) -> dict:
    """使用 LightRAG 进行语义检索"""
    return lightrag_service.query(question)
```

### 3.2 Pre-retrieve 模式

先提取关键词，并行检索，结果注入 System Prompt。

```python
# backend/app/ai/chat_service.py
def pre_retrieve_mode(question: str):
    # 1. 关键词提取
    keywords = jieba_extract_keywords(question)
    
    # 2. 并行检索
    artifacts = search_artifacts(keywords)
    graph_data = query_graph(keywords[0], depth=2)
    rag_context = rag_query(question)
    
    # 3. 构建 System Prompt
    system_prompt = f"""
    你是一个文物知识问答助手。
    
    以下是检索到的相关数据：
    
    【文物数据】
    {format_artifacts(artifacts)}
    
    【图谱关系】
    {format_graph(graph_data)}
    
    【语义检索结果】
    {rag_context}
    
    请基于以上数据回答用户问题。
    """
    
    # 4. 调用 LLM 生成回答
    return llm_stream(system_prompt, question)
```

---

## 4. SSE 流式协议

### 4.1 事件类型

| 层次 | SSE 事件 | 内容 |
|------|----------|------|
| LLM Thinking | `thinking_start` / `thinking_delta` / `thinking_end` | AI 推理过程（可折叠） |
| Tool Call | `tool_call_start` / `tool_call_delta` / `tool_call_result` | 检索策略 + 执行结果 |
| Answer | `answer_delta` / `done` | 最终回答 + 引用来源 |

### 4.2 SSE 响应格式

```
event: thinking_start
data: {"phase": "thinking"}

event: thinking_delta
data: {"text": "用户问的是商代青铜器..."}

event: thinking_end
data: {}

event: tool_call_start
data: {"tool": "search_artifacts", "args": {"keyword": "商代青铜器"}}

event: tool_call_result
data: {"result": [...], "count": 15, "elapsed_ms": 120}

event: answer_delta
data: {"text": "商代青铜器有以下特点..."}

event: done
data: {"sources": [...]}
```

### 4.3 前端 SSE 处理

```typescript
// frontend/src/features/chat/ChatPanel.tsx
const eventSource = new EventSource(`/api/chat/ask?session_id=${sessionId}&question=${encodeURIComponent(question)}`);

eventSource.addEventListener('thinking_delta', (e) => {
  setThinkingText(prev => prev + JSON.parse(e.data).text);
});

eventSource.addEventListener('tool_call_result', (e) => {
  setToolCalls(prev => [...prev, JSON.parse(e.data)]);
});

eventSource.addEventListener('answer_delta', (e) => {
  setAnswerText(prev => prev + JSON.parse(e.data).text);
});

eventSource.addEventListener('done', () => {
  eventSource.close();
});
```

---

## 5. System Prompt 设计

### 5.1 基础 Prompt

```
你是一个中国文物知识问答助手。你的任务是：
1. 理解用户关于中国文物的问题
2. 使用可用工具检索相关数据
3. 基于检索结果生成准确、有帮助的回答

回答要求：
- 必须基于检索到的数据，不要编造
- 如果检索结果不足以回答问题，明确说明
- 提供引用来源（文物名称、数据来源）
- 回答结构清晰，使用分段和列表

可用工具：
- search_artifacts: 搜索文物列表
- query_graph: 查询知识图谱关系
- rag_query: LightRAG 语义检索
- get_artifact_detail: 获取文物完整详情

当前用户问题：{question}
```

### 5.2 工具调用决策 Prompt

```
分析用户问题，决定需要调用哪些工具：

问题类型判断：
- 单实体查询（"XX是什么时候的？"）→ get_artifact_detail
- 筛选聚合（"商代有哪些青铜器？"）→ search_artifacts
- 关联推理（"和XX一起出土的有哪些？"）→ query_graph
- 开放问答（"为什么...？"）→ rag_query + search_artifacts

请输出你的思考过程，然后调用合适的工具。
```

---

## 6. API 接口

### 6.1 Chat API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/chat/sessions | GET | 获取会话列表 |
| /api/chat/sessions | POST | 创建新会话 |
| /api/chat/sessions/:id | DELETE | 删除会话 |
| /api/chat/sessions/:id/messages | GET | 获取历史消息 |
| /api/chat/ask | POST (SSE) | 智能问答 |

### 6.2 Ask 请求格式

```json
{
  "session_id": 1,
  "question": "商代青铜器有哪些典型纹饰？",
  "mode": "tool_calling"  // 或 "pre_retrieve"
}
```

---

## 7. RAG 知识面板

### 7.1 面板内容

| 区域 | 内容 |
|------|------|
| Thinking 详情 | AI 推理过程（可折叠） |
| Tool Calling 详情 | 工具名称、参数、结果数量、耗时 |
| 引用结果 | 回答引用的文物来源列表 |

### 7.2 联动机制

- 点击聊天气泡中的工具调用条 → 右侧面板高亮对应工具详情
- 点击引用来源 → 可跳转到文物详情页

---

## 8. 数据持久化

### 8.1 SQLite 表结构

**chat_sessions 表**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER (PK) | 会话 ID |
| user_id | INTEGER (FK) | 用户 ID |
| title | VARCHAR(100) | 会话标题 |
| mode_used | VARCHAR(20) | 使用模式 |
| created_at | DATETIME | 创建时间 |

**chat_messages 表**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER (PK) | 消息 ID |
| session_id | INTEGER (FK) | 会话 ID |
| role | VARCHAR(10) | user/assistant/system |
| content | TEXT | 消息内容 |
| tool_calls | JSON | 工具调用记录 |
| created_at | DATETIME | 创建时间 |

---

## 9. 性能要求

| 指标 | 标准 |
|------|------|
| SSE  token | < 3s |
| 完整回答 | < 30s |
| 工具调用 | < 500ms |
| 安全超时 | 60s 无数据自动终止 |

---

## 10. 验收标准

| 检查项 | 标准 | 验证方法 |
|--------|------|---------|
| SSE 流式 | 正常展示三阶段 | 手动测试 |
| 会话管理 | CRUD 功能完整 | 测试用例 |
| 工具调用 | 正确调用并展示结果 | 手动测试 |
| 引用来源 | 回答包含来源链接 | 手动测试 |
| 历史记录 | 切换会话可加载历史 | 手动测试 |
| 模式切换 | tool_calling / pre_retrieve 均可用 | 手动测试 |

---

## 11. 踩坑记录

参考 `docs/pitfalls.md`。

---

*最后更新：2026-04-14*