# Phase 2: 加固 — 详细执行计划

**Phase:** 2
**Name:** 加固
**Goal:** 核心功能有测试保护，架构债务得到缓解，代码可维护
**Type:** 架构优化与测试补全
**Duration:** 3-4 周
**Coverage Baseline:** 55% (123 tests passed)
**Coverage Target:** ≥ 60%

---

## Must Haves（阶段成功标准）

1. 后端测试覆盖率 ≥ 60%（当前 55%，新增 repair/SSE/graph 测试后预计可达）
2. CI 全绿（pytest + Playwright）
3. Chat.tsx < 500 行，Graph.tsx < 500 行
4. 无 E2E 硬等待（全部改为状态断言）
5. 部署文档可让新成员 1 天跑通环境

---

## Wave 1: 安全加固 + 测试基础设施 + Health Check（并行）

> **Risk:** P1 | **Requirements:** SEC-03, SEC-06, REL-02, REL-06, TEST-01

---

### Plan: fix-sec-03-cypher-whitelist

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/services/graph.py
  - backend/app/routers/graph.py
autonomous: true
requirements:
  - SEC-03
---
```

<Task>
  <id>SEC-03</id>
  <title>Cypher 查询标签参数化 + 白名单校验</title>
  <description>
    graph.py 导入端点使用 f-string 拼接 Cypher 标签，虽有 sanitize_label() 函数（仅保留 alnum + underscore），
    但无白名单机制，任意合法字符组合均可作为标签，仍有注入风险。
  </description>
  <read_first>
    backend/app/routers/graph.py（导入端点，搜索 sanitize_label 和 f-string 拼接 Cypher 的位置）
    backend/app/services/graph.py（_query_neo4j_base_layer 等查询函数中标签拼接位置）
  </read_first>
  <action>
    1. 在 services/graph.py 顶部定义标签白名单集合：
       ```python
       ALLOWED_LABELS = {"artifact", "era", "category", "location", "tag", "material", "museum"}
       ```
    2. 创建白名单校验函数：
       ```python
       def validate_label(label: str) -> str:
           sanitized = sanitize_label(label)
           if sanitized not in ALLOWED_LABELS:
               raise ValueError(f"Invalid label: {label}. Allowed: {ALLOWED_LABELS}")
           return sanitized
       ```
    3. 在 routers/graph.py 导入端点中，所有用户输入的标签（如 triple["source_type"]、triple["target_type"]）
       必须先经过 validate_label() 校验，通过后才允许进入 Cypher 查询拼接。
    4. 在 services/graph.py 的 _query_neo4j_base_layer 等函数中，同样对所有标签参数使用 validate_label()。
    5. 保留现有的 sanitize_label() 作为第一层过滤，白名单作为第二层校验。
  </action>
  <acceptance_criteria>
    - grep -n "ALLOWED_LABELS" backend/app/services/graph.py 返回定义行
    - grep -n "validate_label" backend/app/routers/graph.py 返回至少 2 处匹配（source_type、target_type 校验）
    - grep -n "validate_label" backend/app/services/graph.py 返回匹配行
    - 运行 cd backend && python -c "from app.services.graph import validate_label; validate_label('artifact')" 成功
    - 运行 cd backend && python -c "from app.services.graph import validate_label; validate_label('invalid')" 抛出 ValueError
    - 运行 pytest tests/ -v 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-06-cors-tighten

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/config.py
autonomous: true
requirements:
  - SEC-06
---
```

<Task>
  <id>SEC-06</id>
  <title>CORS 收紧为实际前端域名</title>
  <description>
    config.py 第 40 行 CORS_ORIGINS 默认包含 localhost 系列域名，生产环境若未覆盖则增加 CSRF 风险。
  </description>
  <read_first>
    backend/app/config.py（第 40 行 CORS_ORIGINS）
    backend/app/main.py（第 43-49 行 CORS 中间件配置）
  </read_first>
  <action>
    1. 将 CORS_ORIGINS 默认值改为仅保留开发域名：
       ```python
       CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
       ```
       移除 "http://localhost"（无端口，可能与生产冲突）。
    2. 在 .env.example 中添加注释说明生产环境应设置实际域名：
       ```
       # CORS_ORIGINS=http://your-domain.com,https://your-domain.com
       ```
    3. 不修改 main.py 的 CORS 中间件逻辑。
  </action>
  <acceptance_criteria>
    - grep -n "CORS_ORIGINS" backend/app/config.py 显示默认值仅包含 localhost:5173 和 127.0.0.1:5173
    - grep -n "http://localhost\"]" backend/app/config.py 返回空（无无端口 localhost）
    - 运行 cd backend && python -c "from app.config import settings; print(settings.CORS_ORIGINS)" 输出仅含开发域名
  </acceptance_criteria>
</Task>

---

### Plan: fix-rel-02-null-pointer-graph

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/services/graph.py
  - backend/app/ai/tools.py
autonomous: true
requirements:
  - REL-02
---
```

<Task>
  <id>REL-02</id>
  <title>SQLite graph search 空指针修复</title>
  <description>
    services/graph.py 和 ai/tools.py 中多处访问 n.properties 未做空值保护：
    - graph.py 第 258 行：props = dict(record.get("props", {}))，但 record.get("props") 可能返回 None
    - tools.py 第 262 行：n.properties.get("description", "")，若 n.properties 为 None 则 AttributeError
    - tools.py 第 367 行：n.properties.get("description", "")，同上
  </description>
  <read_first>
    backend/app/services/graph.py（第 255-278 行 _query_neo4j_base_layer 中 props 访问）
    backend/app/ai/tools.py（第 260-263 行 Neo4j 实体查询，第 366-367 行 SQLite fallback 实体构建）
  </read_first>
  <action>
    1. 在 backend/app/services/graph.py 中：将 props = dict(record.get("props", {})) 改为 props = dict(record.get("props") or {})。
    2. 在 backend/app/ai/tools.py 中：将 n.properties.get("description", "") 改为 (n.properties or {}).get("description", "")。
    3. 在 backend/app/ai/tools.py 中：将 desc = n.properties.get("description", "") 改为 desc = (n.properties or {}).get("description", "")。
    4. 限定搜索范围为 backend/app/services/graph.py 和 backend/app/ai/tools.py，统一修复所有 .properties.get( 和 record.get("props" 模式。
  </action>
  <acceptance_criteria>
    - grep -n "record.get(\"props\") or {}" backend/app/services/graph.py 返回匹配行
    - grep -n "n.properties or {}" backend/app/ai/tools.py 返回至少 2 处匹配
    - grep -n "\.properties\.get(" backend/app/services/graph.py 返回空（无未保护的访问）
    - 运行 pytest tests/ -v 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-rel-06-health-check

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/routers/health.py
  - backend/app/config.py
autonomous: true
requirements:
  - REL-06
---
```

<Task>
  <id>REL-06</id>
  <title>Health check 深度探测</title>
  <description>
    routers/health.py 仅返回静态字符串 {"status": "ok"}，不检查 SQLite、Neo4j、AI API 连通性。
    health_check 保持同步 def，FastAPI 自动放入 threadpool，无需改为 async def。
  </description>
  <read_first>
    backend/app/routers/health.py（完整文件）
    backend/app/database.py（engine 定义，用于 SQLite 探测）
    backend/app/services/graph.py（_get_neo4j_driver, _check_neo4j_has_data）
    backend/app/config.py（AI_API_KEY 配置）
  </read_first>
  <action>
    1. 重写 health_check() 函数，返回结构化状态：
       ```python
       @router.get("/health")
       def health_check():
           checks = {}
           # SQLite check
           try:
               from app.database import engine
               with engine.connect() as conn:
                   conn.execute(text("SELECT 1"))
               checks["sqlite"] = "ok"
           except Exception as e:
               checks["sqlite"] = f"error: {str(e)[:100]}"

           # Neo4j check
           try:
               from app.services.graph import _get_neo4j_driver, _check_neo4j_has_data
               driver = _get_neo4j_driver()
               if driver and _check_neo4j_has_data(driver):
                   checks["neo4j"] = "ok"
               else:
                   checks["neo4j"] = "unavailable"
           except Exception as e:
               checks["neo4j"] = f"error: {str(e)[:100]}"

           # AI API check (optional, avoid consuming quota)
           if settings.AI_API_KEY:
               checks["ai_api"] = "configured"
           else:
               checks["ai_api"] = "not_configured"

           overall = "ok" if all(v == "ok" for v in checks.values() if v not in ("unavailable", "not_configured")) else "degraded"
           return {"status": overall, "checks": checks}
       ```
    2. 添加 from sqlalchemy import text import。
    3. 确保 Neo4j 不可用时不会导致 health check 返回 500（graceful degradation）。
  </action>
  <acceptance_criteria>
    - grep -n "checks\[" backend/app/routers/health.py 返回至少 3 处（sqlite, neo4j, ai_api）
    - grep -n "SELECT 1" backend/app/routers/health.py 返回匹配行
    - 运行 cd backend && uvicorn app.main:app --port 8000 & 后 curl -s http://localhost:8000/api/health | python -m json.tool 返回包含 status 和 checks 的 JSON
    - 返回的 JSON 中 checks.sqlite 值为 "ok"
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-01-python-env

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/requirements-dev.txt
autonomous: true
requirements:
  - TEST-01
---
```

<Task>
  <id>TEST-01</id>
  <title>Python 3.12 环境统一 + pytest/httpx 写入 requirements-dev.txt</title>
  <description>
    当前 requirements.txt 无 pytest、httpx 等测试依赖，测试环境不统一。
  </description>
  <read_first>
    backend/requirements.txt（完整文件）
    backend/tests/conftest.py（确认测试所需依赖）
  </read_first>
  <action>
    1. 确认 backend/requirements-dev.txt 已存在且包含：
       ```
       -r requirements.txt
       pytest>=8.0.0
       pytest-asyncio>=0.23.0
       httpx>=0.27.0
       ```
    2. 若不存在则创建。若已存在但内容不完整则补充。
    3. 确认 requirements.txt 中已有 fastapi（包含 starlette/httpx 测试客户端依赖）。
    4. 在 README 或 CLAUDE.md 中更新测试命令说明（使用 requirements-dev.txt）。
  </action>
  <acceptance_criteria>
    - 文件 backend/requirements-dev.txt 存在且包含 pytest、httpx
    - grep -n "pytest" backend/requirements-dev.txt 返回匹配行
    - 运行 cd backend && pip install -r requirements-dev.txt 成功安装
    - 运行 cd backend && pytest --version 显示 pytest 版本 >= 8.0.0
  </acceptance_criteria>
</Task>

---

## Wave 2: 后端架构重构（SSE 解耦）+ 测试补全（并行）

> **Risk:** P1 | **Requirements:** REL-03, TEST-02, TEST-04
> **注意:** REL-03 是 Phase 2 改动面最大的任务，需单独 PR

---

### Plan: fix-rel-03-sse-decouple

```yaml
---
wave: 2
depends_on:
  - fix-test-01-python-env
files_modified:
  - backend/app/services/chat.py
  - backend/app/routers/chat.py
autonomous: false
requirements:
  - REL-03
---
```

<Task>
  <id>REL-03</id>
  <title>SSE 生成器与 Session 解耦（方案 A：BackgroundTask）</title>
  <description>
    services/chat.py 第 252-374 行 stream_chat_response() 接收 db: Session 并在生成器内部直接操作：
    save_message(db, ...) 在生成器内直接 commit。SSE 生成器在异步上下文中运行，同步 ORM 操作可能阻塞事件循环，
    且 Session 生命周期与生成器绑定，客户端断开时 Session 可能未正确关闭。
  </description>
  <read_first>
    backend/app/services/chat.py（第 252-374 行 stream_chat_response，第 272 行 save_message 调用）
    backend/app/routers/chat.py（第 160-168 行 StreamingResponse 构造）
  </read_first>
  <action>
    采用方案 A：生成器仅 yield SSE 事件，路由器在 StreamingResponse 完成后通过后台任务保存 assistant 消息。

    具体代码结构：
    ```python
    async def chat_endpoint(...):
        # 1. 准备（DB 查询等，在生成器外完成）
        save_message(db, session_id, "user", query)  # 保存用户消息
        history = load_history(db, session_id)       # 加载历史
        db.close()  # 或 commit

        # 2. 启动生成器（纯 yield，无 DB 操作）
        answer_parts = []
        async def sse_generator():
            for event in stream_chat_response(history, session_id):
                if event["type"] == "answer_delta":
                    answer_parts.append(event["delta"])
                yield _sse_event(event)

        # 3. 流式返回 + 后台保存
        async def on_complete():
            answer_text = "".join(answer_parts)
            with SessionLocal() as db2:
                save_message(db2, session_id, "assistant", answer_text)

        return StreamingResponse(
            sse_generator(),
            media_type="text/event-stream",
            background=BackgroundTask(on_complete)
        )
    ```

    实施步骤：
    1. 重构 stream_chat_response() 签名：移除 db: Session 参数，改为接收预处理后的 history: list[dict]、session_id: int、new_session: bool。
    2. 在 routers/chat.py 的 ask_question() 中，在返回 StreamingResponse 之前预处理：
       - 保存用户消息到数据库
       - 加载历史消息
       - 关闭/提交 Session
    3. 生成器内部不再直接调用 save_message，仅负责 yield SSE 事件。
    4. 在生成过程中拼接 answer_text（在 routers/chat.py 中维护 answer_parts 列表）。
    5. 使用 FastAPI BackgroundTask 在 StreamingResponse 完成后保存 assistant 消息。
    6. 预计算 answer_text：生成器 yield 的 answer_delta 事件在路由器端累积，最终传给 BackgroundTask。
  </action>
  <acceptance_criteria>
    - grep -n "stream_chat_response" backend/app/routers/chat.py 显示调用处不再直接传入 db Session
    - grep -n "save_message" backend/app/services/chat.py 显示生成器内无 save_message 调用（排除函数定义行，grep -n 结果应为空或仅 import/注释）
    - grep -n "save_message" backend/app/routers/chat.py 显示路由器负责保存 assistant 消息
    - grep -n "BackgroundTask" backend/app/routers/chat.py 返回匹配行
    - 运行 pytest tests/test_chat.py -v 全部通过
    - 运行 cd backend && uvicorn app.main:app --reload --port 8000 可正常启动（后台运行 5 秒后检查无异常退出）
    - **浏览器验证**: 登录 → AI 问答 → 发送消息 → 确认流式输出正常 → 刷新页面 → 确认历史消息保存成功
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-02-repair-unit-test

```yaml
---
wave: 2
depends_on:
  - fix-test-01-python-env
files_modified:
  - backend/tests/test_repair.py
autonomous: true
requirements:
  - TEST-02
---
```

<Task>
  <id>TEST-02</id>
  <title>repair 核心功能单元测试（mock cv2.inpaint）</title>
  <description>
    repair.py 无测试覆盖，需为图片下载 SSRF 校验和修复逻辑添加单元测试。
    **注意:** 当前代码中已存在 test_repair.py 且测试通过，本任务为确认覆盖完整性。
  </description>
  <read_first>
    backend/app/routers/repair.py（完整文件）
    backend/tests/test_repair.py（现有测试内容）
    backend/tests/conftest.py（fixture 模式）
  </read_first>
  <action>
    1. 检查现有 test_repair.py 覆盖情况：
       - SSRF 防护：内网 IP 拒绝（127.0.0.1, 10.0.0.1, 192.168.1.1, 169.254.169.254）
       - 非 http/https 协议拒绝
       - 超大 Content-Length 拒绝
       - 非图片 Content-Type 拒绝
       - 修复端点 mock（cv2.inpaint, cv2.cvtColor）
    2. 若 coverage 未达 100%，补充缺失用例。
    3. 确保所有测试使用 client fixture 和 auth_header fixture。
  </action>
  <acceptance_criteria>
    - 文件 backend/tests/test_repair.py 存在
    - 运行 cd backend && pytest tests/test_repair.py -v 全部通过
    - coverage 显示 routers/repair.py 覆盖率 ≥ 90%
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-04-graph-api-test

```yaml
---
wave: 2
depends_on:
  - fix-test-01-python-env
  - fix-rel-02-null-pointer-graph
files_modified:
  - backend/tests/test_graph_api.py
autonomous: true
requirements:
  - TEST-04
---
```

<Task>
  <id>TEST-04</id>
  <title>graph 查询/导入/导出端点单元测试</title>
  <description>
    graph 路由的查询、导入、导出端点需要测试覆盖。
    **注意:** 当前代码中已存在 test_graph.py，本任务为确认覆盖完整性和补充缺失用例。
  </description>
  <read_first>
    backend/app/routers/graph.py（完整文件）
    backend/tests/test_graph.py（现有测试内容）
    backend/tests/test_graph_knowledge.py（现有测试模式）
  </read_first>
  <action>
    1. 检查现有 test_graph.py 覆盖情况：
       - /api/graph/full：验证返回 200，包含 nodes 和 links 数组
       - /api/graph/search：带 keyword 参数查询，验证返回匹配节点
       - /api/graph/export：验证返回 text/csv Content-Type，CSV 包含 header 行
       - /api/graph/import：上传有效 CSV 文件，验证返回 success=True
    2. 若缺少以下用例则补充：
       - 上传非 CSV 文件，验证返回 400
       - 上传缺少必需列的 CSV，验证返回 400
       - depth 参数（1 和 2）
    3. 所有测试使用 client 和 auth_header fixture。
  </action>
  <acceptance_criteria>
    - 运行 cd backend && pytest tests/test_graph.py -v 全部通过
    - coverage 显示 routers/graph.py 覆盖率 ≥ 85%
  </acceptance_criteria>
</Task>

---

## Wave 3: ORM 包裹 + SSE 测试（REL-03 完成后）

> **Risk:** P1 | **Requirements:** REL-04, TEST-03
> **依赖:** REL-03 完成后实施

---

### Plan: fix-rel-04-sync-orm-wrap

```yaml
---
wave: 3
depends_on:
  - fix-rel-03-sse-decouple
files_modified:
  - backend/app/routers/chat.py
  - backend/app/routers/graph.py
autonomous: true
requirements:
  - REL-04
---
```

<Task>
  <id>REL-04</id>
  <title>同步 ORM 临时方案（run_in_threadpool 包裹）</title>
  <description>
    FastAPI 路由使用同步 def 函数 + SQLAlchemy 同步 Session。在 chat.py 的 SSE 端点中尤为危险，
    StreamingResponse 的生成器内直接调用同步 DB 操作。短期方案：在 DB 操作处使用 run_in_threadpool 包裹。
    **注意:** REL-03 解耦后，chat.py 的生成器内已无 DB 操作，本任务主要处理 routers/chat.py 中 ask_question 的 async 化。
  </description>
  <read_first>
    backend/app/routers/chat.py（完整文件，特别是 ask_question）
    backend/app/routers/graph.py（extract 和 knowledge-query 端点）
  </read_first>
  <action>
    1. 在 routers/chat.py 中，将 ask_question 从 def 改为 async def。
    2. 在 ask_question 中，所有同步 DB 操作（create_session, query session, save_message）
       使用 from starlette.concurrency import run_in_threadpool 包裹：
       ```python
       session = await run_in_threadpool(chat_service.create_session, db, current_user.id, ChatSessionCreate(title=title))
       ```
    3. 在 routers/graph.py 中，确认 extract_triples 和 knowledge_query 已经是 async def（若否则修改）。
    4. 若 graph.py 中有同步 DB 操作，同样用 run_in_threadpool 包裹。
    5. 确保 get_db() dependency 返回的 Session 在 async 路由中仍能正确关闭（FastAPI 的 Depends 会自动处理生成器关闭）。
  </action>
  <acceptance_criteria>
    - grep -n "async def ask_question" backend/app/routers/chat.py 返回匹配行
    - grep -n "run_in_threadpool" backend/app/routers/chat.py 返回至少 3 处匹配（create_session, query, save_message）
    - 运行 pytest tests/test_chat.py -v 全部通过
    - 运行 pytest tests/test_graph_knowledge.py -v 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-03-chat-sse-test

```yaml
---
wave: 3
depends_on:
  - fix-rel-03-sse-decouple
  - fix-test-01-python-env
files_modified:
  - backend/tests/test_chat_sse.py
autonomous: true
requirements:
  - TEST-03
---
```

<Task>
  <id>TEST-03</id>
  <title>chat/ask SSE 端点单元测试（mock stream_chat_response）</title>
  <description>
    chat/ask SSE 端点无测试覆盖，需验证 SSE 流式响应格式正确。
  </description>
  <read_first>
    backend/app/routers/chat.py（ask_question 端点）
    backend/app/services/chat.py（stream_chat_response 和 _sse_event）
    backend/tests/test_chat.py（现有测试模式）
  </read_first>
  <action>
    1. 创建 backend/tests/test_chat_sse.py。
    2. mock chat_service.stream_chat_response 为生成器，yield 以下事件：
       - session_created
       - thinking_start, thinking_delta, thinking_end
       - answer_start, answer_delta, answer_end
       - done
    3. 使用 TestClient POST /api/chat/ask，验证：
       - 响应状态码 200
       - Content-Type 包含 text/event-stream
       - 响应体包含所有预期 SSE 事件（data: {...} 格式）
       - 每个事件为有效的 JSON
    4. 测试无 session_id 时自动创建新 session（验证 session_created 事件返回 session_id）。
    5. 测试无效 session_id 返回 404。
  </action>
  <acceptance_criteria>
    - 文件 backend/tests/test_chat_sse.py 存在
    - 运行 cd backend && pytest tests/test_chat_sse.py -v 全部通过（至少 3 个测试用例）
    - grep -n "text/event-stream" backend/tests/test_chat_sse.py 返回匹配行
    - grep -n "session_created\|thinking_start\|answer_delta" backend/tests/test_chat_sse.py 返回匹配行
  </acceptance_criteria>
</Task>

---

## Wave 4: 前端拆分 + 体验修复 + CI 完善 + 文档（并行）

> **Risk:** P1-P2 | **Requirements:** FE-01, FE-02, TD-02, TD-03, TD-04, FE-03, TEST-05, TEST-06, DOC-01

---

### Plan: fe-01-chat-split

```yaml
---
wave: 4
depends_on: []
files_modified:
  - frontend/src/pages/Chat.tsx
  - frontend/src/pages/chat/ChatContainer.tsx（新建）
  - frontend/src/pages/chat/MessageList.tsx（新建）
  - frontend/src/pages/chat/useSSE.ts（新建）
autonomous: false
requirements:
  - FE-01
---
```

<Task>
  <id>FE-01</id>
  <title>Chat.tsx 拆分 — ChatContainer + MessageList + useSSE</title>
  <description>
    Chat.tsx 当前约 1200 行，职责过重：状态管理、SSE 连接、消息渲染、输入框、Markdown 处理全部耦合。
    拆分后便于维护，也为 TD-02/03/04 修复提供清晰边界。
  </description>
  <read_first>
    frontend/src/pages/Chat.tsx（完整文件，标记各职责边界）
  </read_first>
  <action>
    1. 创建 frontend/src/pages/chat/ 目录。
    2. 提取 useSSE.ts：
       - 管理 EventSource / fetch + ReadableStream 连接
       - 事件解析（session_created, thinking_*, answer_*, done, error）
       - 自动重连逻辑
       - 返回: { messages, isLoading, error, sendMessage, abort }
    3. 提取 MessageList.tsx：
       - 消息列表渲染（含 Markdown、分组、滚动）
       - 接收 messages 数组，内部处理 thinking/answer/tool 分组显示
       - 返回: JSX.Element
    4. 创建 ChatContainer.tsx：
       - 页面级状态管理（session 切换、输入框状态）
       - 组合 useSSE + MessageList + 输入框
       - 返回: JSX.Element
    5. 重写 Chat.tsx：
       - 页面级组件，仅 import ChatContainer 并渲染
       - 目标: < 100 行
    6. 所有现有功能保持：
       - 文物名称 linkify
       - rehype-sanitize
       - 图片懒加载
       - 会话侧边栏
       - 模型切换
  </action>
  <acceptance_criteria>
    - wc -l frontend/src/pages/Chat.tsx < 100
    - wc -l frontend/src/pages/chat/ChatContainer.tsx < 400
    - wc -l frontend/src/pages/chat/MessageList.tsx < 300
    - wc -l frontend/src/pages/chat/useSSE.ts < 250
    - npm run build 通过
    - npm run lint 无新错误
    - **浏览器验证**: 登录 → AI 问答 → 发送消息 → 流式输出正常 → 切换模型 → Markdown 渲染正常 → 会话历史正常
  </acceptance_criteria>
</Task>

---

### Plan: fe-02-graph-split

```yaml
---
wave: 4
depends_on: []
files_modified:
  - frontend/src/pages/Graph.tsx
  - frontend/src/pages/graph/useGraphSimulation.ts（新建）
  - frontend/src/pages/graph/CanvasRenderer.tsx（新建）
autonomous: true
requirements:
  - FE-02
---
```

<Task>
  <id>FE-02</id>
  <title>Graph.tsx 拆分 — useGraphSimulation + CanvasRenderer</title>
  <description>
    Graph.tsx 包含 D3 simulation 逻辑、Canvas 渲染、事件处理、Tooltip 显示，职责过重。
  </description>
  <read_first>
    frontend/src/pages/Graph.tsx（完整文件）
  </read_first>
  <action>
    1. 创建 frontend/src/pages/graph/ 目录。
    2. 提取 useGraphSimulation.ts：
       - D3 force simulation 初始化与配置
       - 节点/连线数据变换
       - simulation 生命周期管理（start/stop/restart）
       - 返回: { simulation, nodes, links, restart }
    3. 提取 CanvasRenderer.tsx：
       - Canvas 绘制逻辑（节点、连线、标签）
       - 鼠标事件处理（hover、click、drag）
       - Tooltip 触发
       - 接收 simulation 数据，内部处理绘制
    4. 重写 Graph.tsx：
       - 页面级组件，组合 useGraphSimulation + CanvasRenderer + 控制面板
       - 目标: < 200 行
    5. 保持现有功能：
       - 节点拖拽
       - 悬停高亮
       - 缩放/平移
       - 信息面板
  </action>
  <acceptance_criteria>
    - wc -l frontend/src/pages/Graph.tsx < 200
    - wc -l frontend/src/pages/graph/useGraphSimulation.ts < 300
    - wc -l frontend/src/pages/graph/CanvasRenderer.tsx < 350
    - npm run build 通过
    - npm run lint 无新错误
    - **浏览器验证**: 进入知识图谱 → 节点和连线正常显示 → 悬停高亮正常 → 拖拽正常 → 无反复重新加载
  </acceptance_criteria>
</Task>

---

### Plan: fix-td-02-03-04-chat-experience

```yaml
---
wave: 4
depends_on:
  - fe-01-chat-split
files_modified:
  - frontend/src/pages/chat/MessageList.tsx
  - frontend/src/pages/chat/ChatContainer.tsx
  - frontend/package.json
autonomous: true
requirements:
  - TD-02, TD-03, TD-04
---
```

<Task>
  <id>TD-02/03/04</id>
  <title>Chat 体验修复 — 跳动 + Markdown 表格 + 输入框固定</title>
  <description>
    三个技术债务均在 Chat 页面，拆分后修复：
    - TD-02: thinking/tool_calling/answer 分组渲染导致流式输出时整块跳动
    - TD-03: Markdown 表格语法以原始文本显示，缺少 remark-gfm
    - TD-04: 超长回答时输入框被挤出视口，缺少独立滚动容器
  </description>
  <read_first>
    frontend/src/pages/chat/MessageList.tsx（拆分后的文件）
    frontend/src/pages/chat/ChatContainer.tsx（拆分后的文件）
  </read_first>
  <action>
    1. **TD-02 修复跳动**:
       - 使用固定高度的消息块占位，新内容从底部向上填充
       - 或：为 thinking/answer 区域设置 min-height，避免高度突变
       - 或：使用 CSS transition 平滑高度变化
    2. **TD-03 修复 Markdown 表格**:
       - 安装 remark-gfm: npm install remark-gfm
       - 在 ReactMarkdown 中添加 remarkPlugins={[remarkGfm]}
       - 添加表格样式（边框、padding）
    3. **TD-04 修复输入框固定**:
       - ChatContainer 使用 flex 布局: flex-col, h-screen
       - MessageList: flex-1, overflow-y-auto（独立滚动）
       - 输入框区域: fixed 高度，始终在底部可见
       - 新消息自动滚动到底部
  </action>
  <acceptance_criteria>
    - grep -n "remark-gfm" frontend/package.json 返回匹配行
    - grep -n "remarkPlugins" frontend/src/pages/chat/MessageList.tsx 返回匹配行
    - npm run build 通过
    - npm run lint 无新错误
    - **浏览器验证**:
      - 发送消息后输入框始终在底部可见（TD-04）
      - AI 回复中包含表格时正确渲染为 HTML 表格（TD-03）
      - 流式输出时页面无剧烈跳动（TD-02）
  </acceptance_criteria>
</Task>

---

### Plan: fe-03-private-route-enhance

```yaml
---
wave: 4
depends_on: []
files_modified:
  - frontend/src/components/PrivateRoute.tsx
  - frontend/src/api/auth.ts
autonomous: true
requirements:
  - FE-03
---
```

<Task>
  <id>FE-03</id>
  <title>PrivateRoute 增强 — Token 有效性预热校验</title>
  <description>
    当前 PrivateRoute 仅检查 localStorage 中是否有 token，不验证 token 是否有效。
    过期 token 仍可进入页面，直到 API 调用返回 401 才跳转登录页。
  </description>
  <read_first>
    frontend/src/components/PrivateRoute.tsx（完整文件）
    frontend/src/api/auth.ts（token 相关 API）
  </read_first>
  <action>
    1. 在 PrivateRoute 中添加挂载时的 token 校验：
       - 调用 GET /api/auth/me（轻量级校验端点）
       - 若返回 401/403，清除 localStorage token 并跳转登录页
       - 若返回 200，正常渲染子路由
    2. 添加 loading 状态：校验期间显示 loading spinner，避免闪烁。
    3. 缓存校验结果：在校验通过后 5 分钟内不再重复校验（减少 API 调用）。
    4. 或使用 token 解码（若 JWT 含 exp 声明）：本地检查 exp，仅在接近过期时调用 API 刷新。
  </action>
  <acceptance_criteria>
    - grep -n "validateToken\|checkAuth\|/api/auth/me" frontend/src/components/PrivateRoute.tsx 返回匹配行
    - npm run build 通过
    - npm run lint 无新错误
    - **浏览器验证**:
      - 登录后进入页面正常
      - 清除 localStorage token 后刷新页面，自动跳转登录页
      - 使用过期 token 访问，自动跳转登录页
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-05-ci-coverage

```yaml
---
wave: 4
depends_on:
  - fix-test-01-python-env
  - fix-test-02-repair-unit-test
  - fix-test-03-chat-sse-test
  - fix-test-04-graph-api-test
files_modified:
  - .github/workflows/ci.yml
autonomous: true
requirements:
  - TEST-05
---
```

<Task>
  <id>TEST-05</id>
  <title>CI 完善 — 覆盖率上报 + Playwright E2E 接入</title>
  <description>
    当前 ci.yml 已包含 pytest，但缺少覆盖率上报和 Playwright E2E 测试。
  </description>
  <read_first>
    .github/workflows/ci.yml（完整文件内容）
    frontend/package.json（确认 Playwright 和 build 脚本）
  </read_first>
  <action>
    1. 在 backend job 中添加覆盖率上报：
       ```yaml
       - run: pytest tests/ -v --cov=app --cov-report=xml --cov-fail-under=60
       - uses: actions/upload-artifact@v4
         if: failure()
         with:
           name: pytest-report
           path: backend/pytest-report.xml
       ```
    2. 在 frontend job 中添加 Playwright 步骤：
       ```yaml
       - run: npx playwright install --with-deps chromium
       - run: npm run test:e2e
       ```
    3. 确保 CI 在 PR 和 push 到 main 时触发（已有 on: 配置，确认无误）。
    4. 可选：添加覆盖率 badge 到 README。
  </action>
  <acceptance_criteria>
    - grep -n "pytest.*--cov" .github/workflows/ci.yml 返回匹配行
    - grep -n "playwright install" .github/workflows/ci.yml 返回匹配行
    - grep -n "test:e2e" .github/workflows/ci.yml 返回匹配行
    - grep -n "cov-fail-under" .github/workflows/ci.yml 返回匹配行（值为 60）
    - 文件 .github/workflows/ci.yml 语法有效
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-06-e2e-hard-wait

```yaml
---
wave: 4
depends_on: []
files_modified:
  - frontend/e2e/*.spec.ts
autonomous: true
requirements:
  - TEST-06
---
```

<Task>
  <id>TEST-06</id>
  <title>E2E 优化 — 硬等待 → 状态等待</title>
  <description>
    Playwright E2E 测试中若有 page.waitForTimeout 硬等待，改为状态断言（如 waitForSelector、expect().toBeVisible()）。
  </description>
  <read_first>
    frontend/e2e/*.spec.ts（所有 spec 文件，搜索 waitForTimeout）
  </read_first>
  <action>
    1. 搜索所有 page.waitForTimeout 调用：
       ```bash
       grep -rn "waitForTimeout" frontend/e2e/
       ```
    2. 对每个硬等待，分析其等待目的，替换为对应的状态断言：
       - 等待页面加载完成 → page.waitForSelector('某个加载完成后才出现的元素')
       - 等待动画完成 → expect(element).toBeVisible() 或 expect(element).toHaveClass('动画完成后的类名')
       - 等待 API 响应 → page.waitForResponse('**/api/...')
       - 等待导航完成 → page.waitForURL('**/expected-path')
    3. 恢复任何被 skip 的用例（搜索 test.skip、describe.skip）。
  </action>
  <acceptance_criteria>
    - grep -rn "waitForTimeout" frontend/e2e/ 返回空（无硬等待）
    - 运行 cd frontend && npx playwright test 全部通过
    - grep -rn "test.skip\|describe.skip" frontend/e2e/ 返回空（无 skip 用例，或已恢复并注释说明原因）
  </acceptance_criteria>
</Task>

---

### Plan: doc-01-deployment-testing-security

```yaml
---
wave: 4
depends_on: []
files_modified:
  - docs/deployment.md（新建）
  - docs/testing.md（新建）
  - docs/security.md（新建）
autonomous: true
requirements:
  - DOC-01
---
```

<Task>
  <id>DOC-01</id>
  <title>文档补齐 — deployment.md + testing.md + security.md</title>
  <description>
    当前 docs/ 目录已有 pitfalls.md 等，但缺少部署、测试、安全专题文档。
  </description>
  <read_first>
    docs/（现有文档列表）
    README.md（已有内容，避免重复）
  </read_first>
  <action>
    1. 创建 docs/deployment.md：
       - Docker 部署说明（docker-compose up）
       - 环境变量清单（.env 模板）
       - 生产环境注意事项（DEBUG=False, JWT_SECRET_KEY, CORS_ORIGINS）
       - 数据备份（SQLite + Neo4j volumes）
    2. 创建 docs/testing.md：
       - 测试策略（单元测试、E2E 测试）
       - 运行命令（pytest, playwright）
       - 测试数据准备（fixtures）
       - Mock 策略（LightRAG, DeepSeek API）
    3. 创建 docs/security.md：
       - 威胁模型（STRIDE 简述）
       - 已修复漏洞清单（Phase 1 + Phase 2）
       - 安全编码规范（输入校验、参数化查询、XSS 防护）
       - 依赖安全（dependabot 配置建议）
  </action>
  <acceptance_criteria>
    - 文件 docs/deployment.md 存在且包含 docker-compose 启动命令
    - 文件 docs/testing.md 存在且包含 pytest 和 playwright 命令
    - 文件 docs/security.md 存在且包含已修复漏洞清单
    - 三个文件均有清晰的目录结构和代码示例
  </acceptance_criteria>
</Task>

---

## 依赖关系图

```
Wave 1（并行）:
  SEC-03  SEC-06  REL-02  REL-06  TEST-01

Wave 2（并行，REL-03 单独 PR）:
  REL-03  TEST-02  TEST-04
  [TEST-02 depends on TEST-01]
  [TEST-04 depends on TEST-01 + REL-02]

Wave 3（REL-03 完成后）:
  REL-04  TEST-03
  [REL-04 depends on REL-03]
  [TEST-03 depends on REL-03 + TEST-01]

Wave 4（并行）:
  FE-01  FE-02  FE-03  TEST-05  TEST-06  DOC-01
  [fix-td-02-03-04 depends on FE-01]
  [TEST-05 depends on TEST-01~04]
```

---

## 验收矩阵

| Requirement | Plan | Wave | 验证命令 |
|-------------|------|------|----------|
| SEC-03 | fix-sec-03-cypher-whitelist | 1 | `grep ALLOWED_LABELS backend/app/services/graph.py` |
| SEC-06 | fix-sec-06-cors-tighten | 1 | `grep CORS_ORIGINS backend/app/config.py` |
| REL-02 | fix-rel-02-null-pointer-graph | 1 | `grep "n.properties or {}" backend/app/ai/tools.py` |
| REL-06 | fix-rel-06-health-check | 1 | `curl http://localhost:8000/api/health` 返回 checks 字段 |
| TEST-01 | fix-test-01-python-env | 1 | `pytest --version` |
| REL-03 | fix-rel-03-sse-decouple | 2 | `grep -n "save_message" backend/app/services/chat.py` 排除函数定义行后无匹配 |
| TEST-02 | fix-test-02-repair-unit-test | 2 | `pytest tests/test_repair.py -v` |
| TEST-04 | fix-test-04-graph-api-test | 2 | `pytest tests/test_graph.py -v` |
| REL-04 | fix-rel-04-sync-orm-wrap | 3 | `grep "run_in_threadpool" backend/app/routers/chat.py` |
| TEST-03 | fix-test-03-chat-sse-test | 3 | `pytest tests/test_chat_sse.py -v` |
| FE-01 | fe-01-chat-split | 4 | `wc -l frontend/src/pages/Chat.tsx` < 100 |
| FE-02 | fe-02-graph-split | 4 | `wc -l frontend/src/pages/Graph.tsx` < 200 |
| TD-02/03/04 | fix-td-02-03-04-chat-experience | 4 | 浏览器验证 |
| FE-03 | fe-03-private-route-enhance | 4 | 浏览器验证过期 token 跳转 |
| TEST-05 | fix-test-05-ci-coverage | 4 | `grep "cov-fail-under=60" .github/workflows/ci.yml` |
| TEST-06 | fix-test-06-e2e-hard-wait | 4 | `grep -r "waitForTimeout" frontend/e2e/` 返回空 |
| DOC-01 | doc-01-deployment-testing-security | 4 | `ls docs/deployment.md docs/testing.md docs/security.md` |

---

## 退出标准（Phase 2 Complete 条件）

- [ ] 后端测试覆盖率 ≥ 60%（当前 55%，Wave 2-3 新增测试后预计可达）
- [ ] CI 全绿（pytest + Playwright）
- [ ] Chat.tsx < 500 行（实际目标 < 100 行，拆分到子组件）
- [ ] Graph.tsx < 500 行（实际目标 < 200 行）
- [ ] 无 E2E 硬等待（全部改为状态断言）
- [ ] 部署文档可让新成员 1 天跑通环境

---

*Plan created: 2026-05-11*
*Coverage baseline: 55% (123 tests passed)*
*For: /gsd-execute-phase consumption*
