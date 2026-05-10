# Phase 1: 止血 — 研究分析报告

> 基于实际代码扫描，所有文件路径均为绝对路径，代码片段为实际源码。

---

## 一、代码库结构概览

### Backend (`backend/app/`)
| 文件 | 职责 |
|------|------|
| `main.py` | FastAPI 入口，CORS、路由注册、全局异常处理 |
| `config.py` | Pydantic Settings，环境变量配置 |
| `database.py` | SQLAlchemy SQLite 引擎、Session、init_db、admin 创建 |
| `routers/auth.py` | JWT 认证、登录/注册、限流 |
| `routers/chat.py` | SSE 流式问答、会话管理 |
| `routers/graph.py` | 知识图谱查询、CSV 导入导出、LightRAG 提取/查询 |
| `routers/repair.py` | 图片修复（OpenCV inpaint），含图片下载逻辑 |
| `services/chat.py` | ReAct Tool Calling 核心，DeepSeek API 调用 |
| `services/graph.py` | Neo4j + SQLite 图谱构建与查询 |
| `ai/lightrag_service.py` | LightRAG 初始化与封装 |
| `ai/tools.py` | ReAct 工具实现（search/get_detail/query_graph） |

### Frontend (`frontend/src/`)
| 文件 | 职责 |
|------|------|
| `pages/Chat.tsx` | AI 问答页面，ReactMarkdown 渲染 |
| `pages/Knowledge.tsx` | 知识抽取/查询/CSV 导入导出页面 |
| `pages/KnowledgeDemo.tsx` | 硬编码 Demo 页面（mock 数据） |

### Tests (`backend/tests/`)
| 文件 | 覆盖 |
|------|------|
| `test_auth.py` | 注册/登录/Token 验证 |
| `test_artifacts.py` | 文物 CRUD、分页、筛选 |
| `test_stats.py` | 统计 API |
| `test_chat.py` | 会话管理（不含 SSE） |
| `test_graph_knowledge.py` | LightRAG 提取/查询验证（mock） |

---

## 二、SEV-1 分析：REL-01 DeepSeek API 400（reasoning_content）

**根因**：非 reasoner 模型（如 deepseek-v4-flash）在流式响应中可能返回 `reasoning_content` 字段，但后端在构建 assistant message 历史时，**未区分模型类型**，一律将 `reasoning_content` 回传给 API。当切换到非 reasoner 模型时，API 拒绝该字段导致 400。

**代码位置**：
- `E:\shared\workplace\ADD_new\backend\app\services\chat.py` 第 526-532 行：

```python
assistant_msg: dict = {
    "role": "assistant",
    "content": content_text or None,
    "tool_calls": assistant_tc_list,
}
if thinking_text:
    assistant_msg["reasoning_content"] = thinking_text
messages.append(assistant_msg)
```

- 第 224-225 行加载历史时也恢复了 `reasoning_content`：
```python
if m.reasoning_content:
    msg_dict["reasoning_content"] = m.reasoning_content
```

**风险评级**：P0（阻断性缺陷，导致 API 调用失败）

**修复建议**：
1. 根据模型名称判断是否支持 reasoning（如 `deepseek-reasoner` 支持，`deepseek-v4-flash` 不支持）。
2. 非 reasoner 模型：剥离 `reasoning_content`，不传入 API，也不存入历史消息。
3. 或者更安全的做法：捕获 400 错误时，自动重试并剥离 `reasoning_content`。

---

## 三、安全漏洞分析

### SEC-01: JWT_SECRET_KEY 默认值启动校验

**现状**：`config.py` 第 35 行：
```python
JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
```

**问题**：无启动校验。若用户未设置环境变量且 `DEBUG=False`，应用仍使用弱密钥启动，JWT 可被伪造。

**风险评级**：P0

**修复建议**：在 `Settings.model_post_init()` 中添加校验：
```python
if self.JWT_SECRET_KEY == "your-secret-key-change-in-production" and not self.DEBUG:
    raise ValueError("JWT_SECRET_KEY must be changed from default in production")
```

---

### SEC-02: DEBUG 默认 True

**现状**：`config.py` 第 20 行：
```python
DEBUG: bool = True
```

**问题**：生产环境若未设置 `.env`，DEBUG 默认为 True，导致：
1. 全局异常处理器泄露堆栈（`main.py` 第 81-89 行）
2. SQLAlchemy echo 开启，SQL 语句泄露

**风险评级**：P0

**修复建议**：`DEBUG: bool = False`，通过 `.env` 覆盖为 True 用于开发。

---

### SEC-03: Cypher 查询标签参数化 + 白名单校验

**现状**：`graph.py` 导入端点（第 217-272 行）使用 f-string 拼接 Cypher 标签：
```python
session.run(
    f"""
    MERGE (n:`{src_type_sanitized}` {{id: $id}})
    SET n.name = $name
    """,
    id=src_id,
    name=triple["source_name"],
)
```

虽有 `sanitize_label()` 函数（仅保留 alnum + underscore），但：
1. `sanitize_label` 在 `_query_neo4j_base_layer`（`services/graph.py` 第 208-212 行）等查询中也使用 f-string 拼接标签。
2. 无白名单机制，任意合法字符组合均可作为标签。

**风险评级**：P1（有 sanitize，但 f-string 拼接仍有注入风险）

**修复建议**：
1. 建立标签白名单（`artifact`, `era`, `category`, `location`, `tag`, `material`, `museum`）。
2. 所有标签参数化：Neo4j 不支持参数化标签，但可通过 APOC 或白名单校验后拼接。

---

### SEC-04: repair.py 图片下载 SSRF 防护

**现状**：`E:\shared\workplace\ADD_new\backend\app\routers\repair.py` 第 22-36 行：
```python
def download_image(url: str) -> np.ndarray:
    resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    pil_img = Image.open(io.BytesIO(resp.content))
```

**问题**：
1. 无域名/URL 校验，可请求内网地址（`http://localhost:8000/internal`）。
2. 无文件大小限制，可能下载超大文件导致内存耗尽。
3. 无 Content-Type 校验，可能下载非图片文件。
4. 无 IP 黑名单，可能访问 `169.254.169.254`（AWS metadata）。

**风险评级**：P0（SSRF 可导致内网渗透、信息泄露）

**修复建议**：四重校验：
1. 域名白名单或禁止内网 IP（`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`）。
2. 文件大小限制（如 10MB）。
3. Content-Type 校验（`image/jpeg`, `image/png`, `image/webp`）。
4. 图片尺寸校验（防止 decompression bomb）。

---

### SEC-05: ReactMarkdown XSS 过滤

**现状**：`E:\shared\workplace\ADD_new\frontend\src\pages\Chat.tsx` 第 1155-1197 行使用 `ReactMarkdown` 渲染 AI 回答：
```tsx
<ReactMarkdown
  components={{
    p: ({ children }) => <p style={{ margin: 0, lineHeight: 1.7 }}>{children}</p>,
    a: ({ href, children }) => {
      if (href && href.startsWith('/artifacts/')) {
        return <Link to={href}>{children}</Link>;
      }
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  }}
>
  {linkifyArtifactNames(msg.content, buildArtifactNameMap(msg))}
</ReactMarkdown>
```

**问题**：
1. 未使用 `rehype-sanitize`，AI 返回的 Markdown 可包含恶意 HTML（如 `<img onerror=alert(1)>`）。
2. `linkifyArtifactNames` 使用正则替换文本，可能破坏已有 Markdown 链接语法。

**风险评级**：P1（XSS 通过 AI 输出注入）

**修复建议**：
1. 安装 `rehype-sanitize`：`npm install rehype-sanitize`
2. 在 `ReactMarkdown` 中添加 `rehypePlugins={[rehypeSanitize]}`。
3. 限制允许的 HTML 标签和属性。

---

### SEC-06: CORS 收紧为实际前端域名

**现状**：`config.py` 第 40 行：
```python
CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost"]
```

**问题**：生产环境若未覆盖，允许 `localhost` 跨域，CSRF 风险增加。

**风险评级**：P1

**修复建议**：默认值仅保留开发域名，生产环境通过 `.env` 设置实际域名。

---

### SEC-07: 管理员密码强制从环境变量读取

**现状**：`database.py` 第 55-81 行：
```python
default_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")
admin = User(
    username="admin",
    email="admin@heritage.cn",
    password_hash=hash_password(default_password),
    role="admin",
)
```

**问题**：环境变量未设置时回退到 `"admin123"`，弱密码且可预测。

**风险评级**：P0

**修复建议**：
1. 移除默认值，强制要求 `ADMIN_DEFAULT_PASSWORD` 环境变量。
2. 启动时若未设置则抛出异常。
3. 密码最小长度校验（如 12 位）。

---

## 四、可靠性问题分析

### REL-02: SQLite graph search 空指针修复

**现状**：`services/graph.py` 中多处访问 `n.properties` 未做空值保护：
- 第 262-278 行：`_query_neo4j_base_layer` 中 `props = dict(record.get("props", {}))`，但 `record.get("props")` 可能返回 `None`。
- 第 366-372 行：`_tool_query_knowledge_graph` 中 `desc = n.properties.get("description", "")`，若 `n.properties` 为 `None` 则 AttributeError。

**风险评级**：P1（运行时崩溃）

**修复建议**：统一使用 `(n.properties or {}).get("key")` 模式。

---

### REL-03: SSE 生成器与 Session 解耦

**现状**：`services/chat.py` 第 252-374 行 `stream_chat_response()` 接收 `db: Session` 并在生成器内部直接操作：
```python
def stream_chat_response(db: Session, query: str, session_id: int, new_session: bool = False):
    save_message(db, session_id, "user", query)  # 在生成器内直接 commit
    # ...
    save_message(db, session_id, "assistant", answer_text, ...)  # 再次 commit
```

**问题**：
1. SSE 生成器在异步上下文中运行，同步 ORM 操作可能阻塞事件循环。
2. Session 生命周期与生成器绑定，若客户端断开连接，Session 可能未正确关闭。

**风险评级**：P1（连接泄露、性能问题）

**修复建议**：
1. 在生成器外预处理（保存用户消息、加载历史）。
2. 生成器仅负责 yield SSE 事件，不直接操作 DB。
3. 或使用 `run_in_threadpool` 包裹 DB 操作。

---

### REL-04: 同步 ORM 临时方案

**现状**：FastAPI 路由使用同步 `def` 函数 + SQLAlchemy 同步 Session。这在 `chat.py` 的 SSE 端点中尤为危险，因为 `StreamingResponse` 的生成器内直接调用同步 DB 操作。

**风险评级**：P1（事件循环阻塞）

**修复建议**：
1. 短期：在 DB 操作处使用 `run_in_threadpool` 包裹。
2. 长期：迁移到 SQLAlchemy async ORM（Phase 2 或后续）。

---

### REL-05: docker-compose env_file 路径

**现状**：`docker-compose.yml` 第 21-22 行：
```yaml
backend:
  env_file:
    - .env
```

**问题**：`.env` 文件在 repo 根目录，`docker-compose.yml` 也在根目录，路径正确。但 `backend/Dockerfile` 构建时 `.env` 不会被复制进镜像（应通过 `env_file` 挂载）。

**风险评级**：P2（配置问题，当前路径正确但需确认构建流程）

**修复建议**：确认 `docker-compose` 运行时 `.env` 被正确挂载，无需修改路径。

---

### REL-06: Health check 深度探测

**现状**：`routers/health.py`：
```python
@router.get("/health")
def health_check():
    return {"status": "ok"}
```

**问题**：仅返回静态字符串，不检查 SQLite、Neo4j、AI API 连通性。K8s/Docker 无法感知真实服务状态。

**风险评级**：P1（运维盲区）

**修复建议**：
1. SQLite：执行 `SELECT 1`。
2. Neo4j：尝试连接并执行 `RETURN 1`。
3. AI API：可选探测（避免频繁调用消耗额度）。
4. 返回结构化状态：`{"status": "ok", "checks": {"sqlite": "ok", "neo4j": "ok"}}`。

---

## 五、测试现状分析

### 已有测试覆盖
| 模块 | 测试文件 | 覆盖率 |
|------|----------|--------|
| Auth | `test_auth.py` | 注册/登录/Token/Me |
| Artifacts | `test_artifacts.py` | CRUD/分页/筛选 |
| Stats | `test_stats.py` | 统计/词云 |
| Chat | `test_chat.py` | 会话管理（无 SSE 测试） |
| Graph | `test_graph_knowledge.py` | 提取/查询验证（mock） |

### 缺失测试
1. **SSE 流式响应**：无测试覆盖 `chat_service.stream_chat_response()` 的生成器逻辑。
2. **ReAct 循环**：无测试覆盖 tool calling 的完整流程。
3. **DeepSeek API 400 重试**：无测试覆盖 reasoning_content 剥离逻辑。
4. **repair.py 图片下载**：无测试。
5. **JWT 安全校验**：无测试覆盖默认值拒绝启动。
6. **Cypher 注入防护**：无测试覆盖 sanitize_label。
7. **Health check**：当前 health 过于简单，无深度探测测试。

### CI 现状
- 无 GitHub Actions workflow 文件扫描到（仅 `.github/workflows/pr-agent.yml` 存在）。
- 无 pytest CI 配置。

---

## 六、修复优先级汇总

| 需求 | 风险 | 根因 | 文件 |
|------|------|------|------|
| SEC-01 | P0 | JWT_SECRET_KEY 默认值无校验 | `config.py` |
| SEC-02 | P0 | DEBUG 默认 True | `config.py` |
| SEC-04 | P0 | repair.py 图片下载无 SSRF 防护 | `routers/repair.py` |
| SEC-07 | P0 | 管理员密码有弱默认 | `database.py` |
| REL-01 | P0 | reasoning_content 未区分模型类型 | `services/chat.py` |
| SEC-03 | P1 | Cypher f-string 拼接 | `routers/graph.py`, `services/graph.py` |
| SEC-05 | P1 | ReactMarkdown 无 XSS 过滤 | `pages/Chat.tsx` |
| SEC-06 | P1 | CORS 默认允许 localhost | `config.py` |
| REL-02 | P1 | n.properties 空指针 | `services/graph.py`, `ai/tools.py` |
| REL-03 | P1 | SSE 生成器内直接操作 DB | `services/chat.py` |
| REL-04 | P1 | 同步 ORM 阻塞事件循环 | 多处 |
| REL-06 | P1 | Health check 无深度探测 | `routers/health.py` |
| REL-05 | P2 | docker-compose 路径待确认 | `docker-compose.yml` |
| TEST | P1 | 无 pytest CI，SSE/ReAct 无测试 | `tests/`, `.github/workflows/` |

---

## 七、关键代码片段索引

### REL-01 (SEV-1) — reasoning_content 处理
```python
# E:\shared\workplace\ADD_new\backend\app\services\chat.py:526-532
assistant_msg: dict = {
    "role": "assistant",
    "content": content_text or None,
    "tool_calls": assistant_tc_list,
}
if thinking_text:
    assistant_msg["reasoning_content"] = thinking_text
messages.append(assistant_msg)
```

### SEC-01 — JWT 默认密钥
```python
# E:\shared\workplace\ADD_new\backend\app\config.py:35
JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
```

### SEC-04 — SSRF 风险
```python
# E:\shared\workplace\ADD_new\backend\app\routers\repair.py:25
resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
```

### SEC-05 — XSS 风险
```tsx
// E:\shared\workplace\ADD_new\frontend\src\pages\Chat.tsx:1155
<ReactMarkdown components={{...}}>{msg.content}</ReactMarkdown>
```

### SEC-07 — 管理员弱密码
```python
# E:\shared\workplace\ADD_new\backend\app\database.py:67
default_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")
```

### REL-02 — 空指针
```python
# E:\shared\workplace\ADD_new\backend\app\ai\tools.py:367
desc = n.properties.get("description", "")
```

### REL-03 — SSE 与 DB 耦合
```python
# E:\shared\workplace\ADD_new\backend\app\services\chat.py:272
save_message(db, session_id, "user", query)
# 在生成器内直接 commit
```
