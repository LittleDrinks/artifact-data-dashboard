# Phase 1: 止血 — 详细执行计划

**Phase:** 1
**Name:** 止血
**Goal:** 消除所有阻断性缺陷，建立安全的代码基线
**Type:** 棕地项目修复
**Duration:** 1-2 周

---

## Must Haves（阶段成功标准）

1. AI 问答功能恢复（DeepSeek 400 不再出现）
2. `docker-compose up` 一次启动成功
3. pytest 可运行（至少 10+ smoke 测试通过）
4. 安全扫描无 P0 级漏洞（JWT/SSRF/管理员密码已修复）
5. DEBUG 默认 False，生产环境不泄露堆栈
6. ReactMarkdown 有 XSS 过滤
7. CI 流水线包含 pytest + build 检查

---

## Wave 1: SEV-1 + 紧急安全修复（并行）

> **Risk:** P0 | **Requirements:** REL-01, SEC-01, SEC-02, SEC-07

---

### Plan: fix-rel-01-deepseek-400

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/services/chat.py
autonomous: true
requirements:
  - REL-01
---
```

<Task>
  <id>REL-01</id>
  <title>修复 DeepSeek API 400 — 剥离非 reasoner 模型的 reasoning_content</title>
  <description>
    非 reasoner 模型（如 deepseek-v4-flash）在流式响应中可能返回 reasoning_content 字段，
    但后端构建 assistant message 历史时未区分模型类型，一律将 reasoning_content 回传给 API，
    导致切换到非 reasoner 模型时 API 拒绝该字段返回 400。
  </description>
  <read_first>
    backend/app/services/chat.py（第 224-225 行历史加载，第 526-532 行 assistant_msg 构建）
  </read_first>
  <action>
    1. 在 config.py 或 chat.py 中定义 `REASONER_MODELS = {"deepseek-reasoner"}` 集合。
    2. 在 `load_history()` 第 224-225 行：仅在 `settings.AI_MODEL_NAME in REASONER_MODELS` 时才恢复 `reasoning_content` 到 msg_dict。
    3. 在 `_react_gen()` 第 531-532 行：仅在模型属于 REASONER_MODELS 时才将 `thinking_text` 放入 `assistant_msg["reasoning_content"]`。
    4. 非 reasoner 模型的 thinking_text 仍保存到数据库（供前端展示），但不传入 API 消息历史。
  </action>
  <acceptance_criteria>
    - grep -n "REASONER_MODELS" backend/app/services/chat.py 返回非空结果
    - grep -n "reasoning_content" backend/app/services/chat.py 显示条件判断包裹（如 `if thinking_text and settings.AI_MODEL_NAME in REASONER_MODELS:`）
    - 现有测试 `pytest backend/tests/test_chat.py -v` 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-01-jwt-default-key

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/config.py
autonomous: true
requirements:
  - SEC-01
---
```

<Task>
  <id>SEC-01</id>
  <title>JWT_SECRET_KEY 默认值启动校验</title>
  <description>
    config.py 中 JWT_SECRET_KEY 默认值为 "your-secret-key-change-in-production"，
    若用户未设置环境变量且 DEBUG=False，应用仍使用弱密钥启动，JWT 可被伪造。
  </description>
  <read_first>
    backend/app/config.py（第 35 行 JWT_SECRET_KEY，第 68-80 行 model_post_init）
  </read_first>
  <action>
    1. 在 `Settings.model_post_init()` 末尾添加校验逻辑：
       ```python
       if self.JWT_SECRET_KEY == "your-secret-key-change-in-production" and not self.DEBUG:
           raise ValueError("JWT_SECRET_KEY must be changed from default in production")
       ```
    2. 确保校验在 `super().model_post_init(__context)` 之后执行（若父类有调用）。
    3. 此修改与 SEC-02 不冲突，修改位置不重叠，可并行执行。
  </action>
  <acceptance_criteria>
    - grep -n "JWT_SECRET_KEY must be changed" backend/app/config.py 返回匹配行
    - grep -n "your-secret-key-change-in-production" backend/app/config.py 显示该字符串仅出现在默认值定义和校验条件中
    - 运行 `cd backend && python -c "from app.config import Settings; s = Settings(DEBUG=False); s.model_post_init(None)"` 抛出 ValueError
    - 运行 `cd backend && python -c "from app.config import Settings; s = Settings(DEBUG=True); s.model_post_init(None)"` 不抛出异常
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-02-debug-default-false

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/config.py
autonomous: true
requirements:
  - SEC-02
---
```

<Task>
  <id>SEC-02</id>
  <title>DEBUG 默认改为 False</title>
  <description>
    config.py 第 20 行 DEBUG 默认 True，生产环境若未设置 .env 则泄露堆栈和 SQL 语句。
  </description>
  <read_first>
    backend/app/config.py（第 20 行 DEBUG 定义）
    backend/app/main.py（第 81-89 行全局异常处理器 DEBUG 分支）
    .env（若存在，检查是否包含 DEBUG=true）
    backend/.env（若存在，检查是否包含 DEBUG=true）
  </read_first>
  <action>
    1. 将 `DEBUG: bool = True` 改为 `DEBUG: bool = False`。
    2. 检查 .env 和 backend/.env：若已存在且包含 `DEBUG=true`，不要覆盖，保持现有配置。
    3. 不修改 main.py 的异常处理器逻辑（它已正确处理 DEBUG=True/False 两种情况）。
    4. 此修改与 SEC-01 不冲突，修改位置不重叠，可并行执行。
  </action>
  <acceptance_criteria>
    - grep -n "DEBUG: bool = False" backend/app/config.py 返回匹配行
    - 运行 `cd backend && python -c "from app.config import settings; print(settings.DEBUG)"` 输出 `False`
    - 运行 `cd backend && DEBUG=true python -c "from app.config import settings; print(settings.DEBUG)"` 输出 `True`
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-07-admin-password-env

```yaml
---
wave: 1
depends_on: []
files_modified:
  - backend/app/database.py
autonomous: true
requirements:
  - SEC-07
---
```

<Task>
  <id>SEC-07</id>
  <title>管理员密码强制从环境变量读取</title>
  <description>
    database.py 第 67 行 `default_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")`
    在环境变量未设置时回退到弱密码 "admin123"。
  </description>
  <read_first>
    backend/app/database.py（第 55-81 行 _ensure_admin_user 函数）
  </read_first>
  <action>
    1. 将 `os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")` 改为 `os.environ.get("ADMIN_DEFAULT_PASSWORD")` 并移除默认值。
    2. 在 `_ensure_admin_user()` 开头添加校验：
       ```python
       default_password = os.environ.get("ADMIN_DEFAULT_PASSWORD")
       if not default_password:
           raise ValueError("ADMIN_DEFAULT_PASSWORD environment variable is required")
       if len(default_password) < 8:
           raise ValueError("ADMIN_DEFAULT_PASSWORD must be at least 8 characters")
       ```
    3. 在 .env.example 中添加 `ADMIN_DEFAULT_PASSWORD=change-me-in-production` 占位符。
  </action>
  <acceptance_criteria>
    - grep -n "ADMIN_DEFAULT_PASSWORD environment variable is required" backend/app/database.py 返回匹配行
    - grep -n "admin123" backend/app/database.py 返回空（无硬编码弱密码）
    - 运行 `cd backend && python -c "import os; os.environ.pop('ADMIN_DEFAULT_PASSWORD', None); from app.database import _ensure_admin_user; _ensure_admin_user()"` 抛出 ValueError
    - 运行 `cd backend && ADMIN_DEFAULT_PASSWORD=short python -c "from app.database import _ensure_admin_user; _ensure_admin_user()"` 抛出 ValueError（长度校验）
  </acceptance_criteria>
</Task>

---

## Wave 2: 安全加固 + 可靠性修复（并行）

> **Risk:** P1 | **Requirements:** SEC-03, SEC-04, SEC-05, SEC-06, REL-02, REL-05

---

### Plan: fix-sec-03-cypher-whitelist

```yaml
---
wave: 2
depends_on: []
files_modified:
  - backend/app/routers/graph.py
  - backend/app/services/graph.py
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
       必须先经过 `validate_label()` 校验，通过后才允许进入 Cypher 查询拼接。
    4. 在 services/graph.py 的 `_query_neo4j_base_layer` 等函数中，同样对所有标签参数使用 `validate_label()`。
    5. 保留现有的 `sanitize_label()` 作为第一层过滤，白名单作为第二层校验。
  </action>
  <acceptance_criteria>
    - grep -n "ALLOWED_LABELS" backend/app/services/graph.py 返回定义行
    - grep -n "validate_label" backend/app/routers/graph.py 返回至少 2 处匹配（source_type、target_type 校验）
    - grep -n "validate_label" backend/app/services/graph.py 返回匹配行
    - 运行 `cd backend && python -c "from app.services.graph import validate_label; validate_label('artifact')"` 成功
    - 运行 `cd backend && python -c "from app.services.graph import validate_label; validate_label('invalid')"` 抛出 ValueError
    - 运行 `pytest backend/tests/ -v` 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-04-repair-ssrf

```yaml
---
wave: 2
depends_on: []
files_modified:
  - backend/app/routers/repair.py
autonomous: true
requirements:
  - SEC-04
---
```

<Task>
  <id>SEC-04</id>
  <title>repair.py 图片下载 SSRF 防护（四重校验）</title>
  <description>
    repair.py 第 22-36 行 `download_image()` 无域名/URL 校验、无文件大小限制、无 Content-Type 校验、无 IP 黑名单，
    可导致 SSRF 内网渗透、超大文件下载耗尽内存、非图片文件处理。
  </description>
  <read_first>
    backend/app/routers/repair.py（第 22-36 行 download_image 函数）
  </read_first>
  <action>
    1. 将 URL 校验逻辑提取为独立函数 `_validate_image_url(url: str) -> bool`，便于单元测试调用：
       ```python
       import ipaddress
       from urllib.parse import urlparse

       def _validate_image_url(url: str) -> bool:
           parsed = urlparse(url)
           if parsed.scheme not in {"http", "https"}:
               return False
           hostname = parsed.hostname
           if not hostname:
               return False
           # 检查纯 IP
           try:
               ip = ipaddress.ip_address(hostname)
               if ip.is_private or ip.is_loopback or ip.is_link_local:
                   return False
               if str(ip) == "169.254.169.254":
                   return False
           except ValueError:
               pass  # 不是 IP，是域名
           # 拒绝内网域名模式
           blocked_patterns = ["localhost", ".local", "127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31."]
           for pattern in blocked_patterns:
               if hostname == pattern or hostname.startswith(pattern):
                   return False
           return True
       ```
    2. 在 download_image() 开头调用 `_validate_image_url(url)`，失败时抛出 HTTPException(status_code=400, detail="Invalid URL")。
    3. 添加文件大小限制：响应 Content-Length > 10MB 时拒绝（10 * 1024 * 1024 bytes）。
    4. 添加 Content-Type 校验：仅允许 image/jpeg, image/png, image/webp, image/gif。
    5. 添加图片尺寸校验：使用 Pillow 检查图片尺寸，拒绝 width * height > 10000 * 10000（防 decompression bomb）。
    6. 所有校验失败时抛出 HTTPException(status_code=400, detail="具体原因")。
  </action>
  <acceptance_criteria>
    - grep -n "_validate_image_url" backend/app/routers/repair.py 返回函数定义行
    - grep -n "ipaddress" backend/app/routers/repair.py 返回匹配行（IP 校验）
    - grep -n "urlparse" backend/app/routers/repair.py 返回匹配行（URL 解析）
    - grep -n "10 \* 1024 \* 1024\|10485760" backend/app/routers/repair.py 返回匹配行（大小限制）
    - grep -n "image/jpeg\|image/png\|image/webp" backend/app/routers/repair.py 返回匹配行（Content-Type 校验）
    - grep -n "decompression\|10000 \* 10000" backend/app/routers/repair.py 返回匹配行（尺寸校验）
    - grep -n "localhost\|127\.\|10\.\|192\.168\|169\.254" backend/app/routers/repair.py 返回匹配行（域名/IP 黑名单）
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-05-reactmarkdown-xss

```yaml
---
wave: 2
depends_on: []
files_modified:
  - frontend/src/pages/Chat.tsx
  - frontend/package.json
  - frontend/package-lock.json
autonomous: true
requirements:
  - SEC-05
---
```

<Task>
  <id>SEC-05</id>
  <title>ReactMarkdown XSS 过滤（rehype-sanitize）</title>
  <description>
    Chat.tsx 第 1155-1197 行使用 ReactMarkdown 渲染 AI 回答，未使用 rehype-sanitize，
    AI 返回的 Markdown 可包含恶意 HTML（如 `<img onerror=alert(1)>`）。
  </description>
  <read_first>
    frontend/src/pages/Chat.tsx（搜索 ReactMarkdown 组件使用位置，确认 import 和组件调用）
    frontend/package.json（确认 rehype-sanitize 未安装）
  </read_first>
  <action>
    1. 运行 `cd frontend && npm install rehype-sanitize`。
    2. 在 Chat.tsx 顶部添加 `import rehypeSanitize from 'rehype-sanitize';`。
    3. 在 ReactMarkdown 组件上添加 `rehypePlugins={[rehypeSanitize]}` 属性。
    4. 保留现有 components 自定义（p, a, strong, em, ul, ol, li, code），rehype-sanitize 会在此基础上过滤危险标签/属性。
  </action>
  <acceptance_criteria>
    - grep -n "rehype-sanitize" frontend/package.json 返回匹配行
    - grep -n "rehypeSanitize\|rehype-sanitize" frontend/src/pages/Chat.tsx 返回 import 和使用行
    - grep -n "rehypePlugins=\{\[rehypeSanitize\]\}" frontend/src/pages/Chat.tsx 返回匹配行
    - 运行 `cd frontend && npm run build` 成功（无 TypeScript 编译错误）
  </acceptance_criteria>
</Task>

---

### Plan: fix-sec-06-cors-tighten

```yaml
---
wave: 2
depends_on:
  - fix-sec-02-debug-default-false
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
    - grep -n "http://localhost\"\]" backend/app/config.py 返回空（无无端口 localhost）
    - 运行 `cd backend && python -c "from app.config import settings; print(settings.CORS_ORIGINS)"` 输出仅含开发域名
  </acceptance_criteria>
</Task>

---

### Plan: fix-rel-02-null-pointer-graph

```yaml
---
wave: 2
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
    - graph.py 第 258 行：`props = dict(record.get("props", {}))`，但 record.get("props") 可能返回 None
    - tools.py 第 262 行：`n.properties.get("description", "")`，若 n.properties 为 None 则 AttributeError
    - tools.py 第 367 行：`n.properties.get("description", "")`，同上
  </description>
  <read_first>
    backend/app/services/graph.py（第 255-278 行 _query_neo4j_base_layer 中 props 访问）
    backend/app/ai/tools.py（第 260-263 行 Neo4j 实体查询，第 366-367 行 SQLite fallback 实体构建）
  </read_first>
  <action>
    1. 在 backend/app/services/graph.py 中：将 `props = dict(record.get("props", {}))` 改为 `props = dict(record.get("props") or {})`。
    2. 在 backend/app/ai/tools.py 中：将 `n.properties.get("description", "")` 改为 `(n.properties or {}).get("description", "")`。
    3. 在 backend/app/ai/tools.py 中：将 `desc = n.properties.get("description", "")` 改为 `desc = (n.properties or {}).get("description", "")`。
    4. 限定搜索范围为 backend/app/services/graph.py 和 backend/app/ai/tools.py，统一修复所有 `.properties.get(` 和 `record.get("props"` 模式。
  </action>
  <acceptance_criteria>
    - grep -n "record.get(\"props\") or {}" backend/app/services/graph.py 返回匹配行
    - grep -n "n.properties or {}" backend/app/ai/tools.py 返回至少 2 处匹配
    - grep -n "\.properties\.get(" backend/app/services/graph.py 返回空（无未保护的访问）
    - 运行 `pytest backend/tests/ -v` 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-rel-05-docker-compose-env

```yaml
---
wave: 2
depends_on: []
files_modified:
  - docker-compose.yml
autonomous: true
requirements:
  - REL-05
---
```

<Task>
  <id>REL-05</id>
  <title>docker-compose env_file 路径修正确认</title>
  <description>
    docker-compose.yml 第 21-22 行 env_file 指向 `.env`，文件在 repo 根目录，路径正确。
    但需确认 backend 构建时 .env 不会被复制进镜像（应通过 env_file 挂载），且前端服务也应有适当配置。
  </description>
  <read_first>
    docker-compose.yml（完整文件）
    backend/Dockerfile（若存在）
  </read_first>
  <action>
    1. 检查 docker-compose.yml 中 backend 服务的 env_file 配置，确认路径为 `./.env` 或 `.env`（相对 compose 文件）。
    2. 若 backend/Dockerfile 存在 COPY .env 指令，移除它（.env 不应进入镜像）。
    3. 在 docker-compose.yml 中添加注释说明 `.env` 文件需手动创建。
    4. 检查 docker-compose.yml 中 frontend 服务是否已有 env_file 配置，若无则添加 `env_file: - ./frontend/.env`。
  </action>
  <acceptance_criteria>
    - grep -n "env_file" docker-compose.yml 返回匹配行（backend 和 frontend 服务各至少一处）
    - 若 backend/Dockerfile 存在：grep -n "COPY.*\.env" backend/Dockerfile 返回空（无 .env 复制进镜像）
    - docker-compose.yml 语法有效：使用 `python -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"` 验证（不使用 docker 命令，本地开发不用 Docker）
  </acceptance_criteria>
</Task>

---

## Wave 3: 架构缓解（SSE 解耦 + ORM 包裹 + Health Check）

> **Risk:** P1 | **Requirements:** REL-03, REL-04, REL-06

---

### Plan: fix-rel-03-sse-decouple

```yaml
---
wave: 3
depends_on:
  - fix-rel-01-deepseek-400
files_modified:
  - backend/app/services/chat.py
  - backend/app/routers/chat.py
autonomous: true
requirements:
  - REL-03
---
```

<Task>
  <id>REL-03</id>
  <title>SSE 生成器与 Session 解耦</title>
  <description>
    services/chat.py 第 252-374 行 `stream_chat_response()` 接收 `db: Session` 并在生成器内部直接操作：
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
    1. 重构 `stream_chat_response()` 签名：移除 `db: Session` 参数，改为接收预处理后的 `history: list[dict]`、`session_id: int`、`new_session: bool`。
    2. 在 routers/chat.py 的 `ask_question()` 中，在返回 StreamingResponse 之前预处理：
       - 保存用户消息到数据库
       - 加载历史消息
       - 关闭/提交 Session
    3. 生成器内部不再直接调用 save_message，仅负责 yield SSE 事件。
    4. 在生成过程中拼接 answer_text（在 routers/chat.py 中维护 answer_parts 列表）。
    5. 使用 FastAPI `BackgroundTask` 在 StreamingResponse 完成后保存 assistant 消息。
    6. 预计算 answer_text：生成器 yield 的 answer_delta 事件在路由器端累积，最终传给 BackgroundTask。
  </action>
  <acceptance_criteria>
    - grep -n "stream_chat_response" backend/app/routers/chat.py 显示调用处不再直接传入 db Session
    - grep -n "save_message" backend/app/services/chat.py 显示生成器内无 save_message 调用（排除函数定义行，grep -n 结果应为空或仅 import/注释）
    - grep -n "save_message" backend/app/routers/chat.py 显示路由器负责保存 assistant 消息
    - grep -n "BackgroundTask" backend/app/routers/chat.py 返回匹配行
    - 运行 `pytest backend/tests/test_chat.py -v` 全部通过
    - 运行 `cd backend && uvicorn app.main:app --reload --port 8000` 可正常启动（后台运行 5 秒后检查无异常退出）
  </acceptance_criteria>
</Task>

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
    FastAPI 路由使用同步 `def` 函数 + SQLAlchemy 同步 Session。在 chat.py 的 SSE 端点中尤为危险，
    StreamingResponse 的生成器内直接调用同步 DB 操作。短期方案：在 DB 操作处使用 run_in_threadpool 包裹。
  </description>
  <read_first>
    backend/app/routers/chat.py（完整文件，特别是 ask_question）
    backend/app/routers/graph.py（extract 和 knowledge-query 端点使用 threading）
  </read_first>
  <action>
    1. 在 routers/chat.py 中，将 `ask_question` 从 `def` 改为 `async def`。
    2. 在 `ask_question` 中，所有同步 DB 操作（create_session, query session, save_message）
       使用 `from starlette.concurrency import run_in_threadpool` 包裹：
       ```python
       session = await run_in_threadpool(chat_service.create_session, db, current_user.id, ChatSessionCreate(title=title))
       ```
    3. 在 routers/graph.py 中，将 `extract_triples` 和 `knowledge_query` 从 `def` 改为 `async def`（它们已经是 async def，确认无误）。
    4. 若 graph.py 中有同步 DB 操作，同样用 run_in_threadpool 包裹。
    5. 确保 `get_db()` dependency 返回的 Session 在 async 路由中仍能正确关闭（FastAPI 的 Depends 会自动处理生成器关闭）。
  </action>
  <acceptance_criteria>
    - grep -n "async def ask_question" backend/app/routers/chat.py 返回匹配行
    - grep -n "run_in_threadpool" backend/app/routers/chat.py 返回至少 3 处匹配（create_session, query, save_message）
    - 运行 `pytest backend/tests/test_chat.py -v` 全部通过
    - 运行 `pytest backend/tests/test_graph_knowledge.py -v` 全部通过
  </acceptance_criteria>
</Task>

---

### Plan: fix-rel-06-health-check

```yaml
---
wave: 3
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
    2. 添加 `from sqlalchemy import text` import。
    3. 确保 Neo4j 不可用时不会导致 health check 返回 500（ graceful degradation）。
  </action>
  <acceptance_criteria>
    - grep -n "checks\[" backend/app/routers/health.py 返回至少 3 处（sqlite, neo4j, ai_api）
    - grep -n "SELECT 1" backend/app/routers/health.py 返回匹配行
    - 运行 `cd backend && uvicorn app.main:app --port 8000 &` 后 `curl -s http://localhost:8000/api/health | python -m json.tool` 返回包含 status 和 checks 的 JSON
    - 返回的 JSON 中 checks.sqlite 值为 "ok"
  </acceptance_criteria>
</Task>

---

## Wave 4: 测试补全 + CI 搭建（并行）

> **Risk:** P1 | **Requirements:** TEST-01, TEST-02, TEST-03, TEST-04, TEST-05

---

### Plan: fix-test-01-python-env

```yaml
---
wave: 4
depends_on: []
files_modified:
  - backend/requirements-dev.txt
  - backend/requirements.txt
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
    1. 创建 `backend/requirements-dev.txt`，内容：
       ```
       -r requirements.txt
       pytest>=8.0.0
       pytest-asyncio>=0.23.0
       httpx>=0.27.0
       ```
    2. 确认 requirements.txt 中已有 `fastapi`（包含 starlette/httpx 测试客户端依赖）。
    3. 在 README 或 CLAUDE.md 中更新测试命令说明（使用 requirements-dev.txt）。
  </action>
  <acceptance_criteria>
    - 文件 backend/requirements-dev.txt 存在且包含 pytest、httpx
    - grep -n "pytest" backend/requirements-dev.txt 返回匹配行
    - 运行 `cd backend && pip install -r requirements-dev.txt` 成功安装
    - 运行 `cd backend && pytest --version` 显示 pytest 版本 >= 8.0.0
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-02-repair-unit-test

```yaml
---
wave: 4
depends_on:
  - fix-sec-04-repair-ssrf
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
  </description>
  <read_first>
    backend/app/routers/repair.py（完整文件）
    backend/tests/conftest.py（fixture 模式）
  </read_first>
  <action>
    1. 创建 `backend/tests/test_repair.py`。
    2. 测试 SSRF 防护：
       - 测试内网 IP 被拒绝（127.0.0.1, 10.0.0.1, 192.168.1.1, 169.254.169.254）
       - 测试非 http/https 协议被拒绝
       - 测试超大 Content-Length 被拒绝
       - 测试非图片 Content-Type 被拒绝
    3. 测试修复端点（mock）：
       - mock `cv2.inpaint` 和 `cv2.cvtColor`
       - mock `artifact_service.get_artifact_by_id` 返回有 image_url 的文物
       - mock `download_image` 返回固定 numpy 数组
       - 验证返回 JSON 包含 success=True, repaired_image（base64 字符串）
    4. 所有测试使用 `client` fixture 和 `auth_header` fixture。
  </action>
  <acceptance_criteria>
    - 文件 backend/tests/test_repair.py 存在
    - 运行 `cd backend && pytest tests/test_repair.py -v` 全部通过（至少 4 个测试用例）
    - grep -n "test_ssrf\|test_inpaint\|test_repair" backend/tests/test_repair.py 返回匹配行
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-03-chat-sse-test

```yaml
---
wave: 4
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
    1. 创建 `backend/tests/test_chat_sse.py`。
    2. mock `chat_service.stream_chat_response` 为生成器，yield 以下事件：
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
    - 运行 `cd backend && pytest tests/test_chat_sse.py -v` 全部通过（至少 3 个测试用例）
    - grep -n "text/event-stream" backend/tests/test_chat_sse.py 返回匹配行
    - grep -n "session_created\|thinking_start\|answer_delta" backend/tests/test_chat_sse.py 返回匹配行
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-04-graph-api-test

```yaml
---
wave: 4
depends_on:
  - fix-rel-02-null-pointer-graph
  - fix-test-01-python-env
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
  </description>
  <read_first>
    backend/app/routers/graph.py（完整文件）
    backend/tests/test_graph_knowledge.py（现有测试模式）
  </read_first>
  <action>
    1. 创建 `backend/tests/test_graph_api.py`。
    2. 测试 /api/graph/full：
       - 验证返回 200，包含 nodes 和 links 数组
       - 验证 total_nodes, total_links 为整数
    3. 测试 /api/graph/search：
       - 带 keyword 参数查询，验证返回匹配节点
       - 验证 depth 参数（1 和 2）
    4. 测试 /api/graph/export：
       - 验证返回 text/csv Content-Type
       - 验证 CSV 包含 header 行（source_name, relation, target_name）
    5. 测试 /api/graph/import：
       - 上传有效 CSV 文件，验证返回 success=True
       - 上传非 CSV 文件，验证返回 400
       - 上传缺少必需列的 CSV，验证返回 400
    6. 所有测试使用 `client` 和 `auth_header` fixture（导入/导出可能需要认证，根据路由实际配置调整）。
  </action>
  <acceptance_criteria>
    - 文件 backend/tests/test_graph_api.py 存在
    - 运行 `cd backend && pytest tests/test_graph_api.py -v` 全部通过（至少 6 个测试用例）
    - grep -n "test_full\|test_search\|test_export\|test_import" backend/tests/test_graph_api.py 返回匹配行
  </acceptance_criteria>
</Task>

---

### Plan: fix-test-05-ci-setup

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
  <title>GitHub Actions CI 搭建（PR 触发 pytest + Playwright）</title>
  <description>
    当前 ci.yml 仅包含 ruff lint 和前端 tsc/build，无 pytest 和 Playwright E2E 测试。
  </description>
  <read_first>
    .github/workflows/ci.yml（完整文件内容）
    backend/requirements-dev.txt（确认测试依赖）
    frontend/package.json（确认 Playwright 和 build 脚本）
  </read_first>
  <action>
    1. 读取 `.github/workflows/ci.yml` 完整内容，确认现有结构（backend job、frontend job、现有步骤）。
    2. 在现有 backend job 的 ruff 步骤之后添加 pytest 步骤：
       ```yaml
       - run: pip install -r requirements-dev.txt
       - run: pytest tests/ -v --tb=short
       ```
    3. 保留现有 ruff check 和 ruff format --check 步骤。
    4. frontend job 中添加 Playwright 步骤：
       ```yaml
       - run: npx playwright install --with-deps chromium
       - run: npm run test:e2e
       ```
    5. frontend job 保留现有 lint 和 tsc --noEmit 步骤。
    6. 确保 CI 在 PR 和 push 到 main 时触发（已有 `on:` 配置，确认无误）。
    7. 添加 pytest 失败时上传测试报告（可选但推荐）：
       ```yaml
       - uses: actions/upload-artifact@v4
         if: failure()
         with:
           name: pytest-report
           path: backend/pytest-report.xml
       ```
  </action>
  <acceptance_criteria>
    - grep -n "pytest" .github/workflows/ci.yml 返回匹配行（backend job 中）
    - grep -n "playwright install" .github/workflows/ci.yml 返回匹配行（frontend job 中）
    - grep -n "test:e2e" .github/workflows/ci.yml 返回匹配行
    - 文件 `.github/workflows/ci.yml` 语法有效（可通过在线 YAML 校验器或 `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` 验证）
    - CI workflow 文件无语法错误：`python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` 成功执行
  </acceptance_criteria>
</Task>

---

## 依赖关系图

```
Wave 1 (并行):
  REL-01  SEC-01  SEC-02  SEC-07

Wave 2 (并行):
  SEC-03  SEC-04  SEC-05  SEC-06  REL-02  REL-05
  [SEC-06 depends on SEC-02]

Wave 3 (并行):
  REL-03  REL-04  REL-06
  [REL-03 depends on REL-01]
  [REL-04 depends on REL-03]

Wave 4 (并行):
  TEST-01  TEST-02  TEST-03  TEST-04  TEST-05
  [TEST-02 depends on SEC-04 + TEST-01]
  [TEST-03 depends on REL-03 + TEST-01]
  [TEST-04 depends on REL-02 + TEST-01]
  [TEST-05 depends on TEST-01~04]
```

---

## 验收矩阵

| Requirement | Plan | Wave | 验证命令 |
|-------------|------|------|----------|
| REL-01 | fix-rel-01-deepseek-400 | 1 | `grep REASONER_MODELS backend/app/services/chat.py` |
| SEC-01 | fix-sec-01-jwt-default-key | 1 | `python -c "from app.config import Settings; Settings(DEBUG=False).model_post_init(None)"` |
| SEC-02 | fix-sec-02-debug-default-false | 1 | `python -c "from app.config import settings; print(settings.DEBUG)"` |
| SEC-07 | fix-sec-07-admin-password-env | 1 | `grep "admin123" backend/app/database.py` 返回空 |
| SEC-04 | fix-sec-04-repair-ssrf | 2 | `grep "_validate_image_url" backend/app/routers/repair.py` |
| SEC-05 | fix-sec-05-reactmarkdown-xss | 2 | `grep "rehypePlugins" frontend/src/pages/Chat.tsx` |
| SEC-06 | fix-sec-06-cors-tighten | 2 | `grep CORS_ORIGINS backend/app/config.py` |
| REL-02 | fix-rel-02-null-pointer-graph | 2 | `grep "n.properties or {}" backend/app/ai/tools.py` |
| REL-05 | fix-rel-05-docker-compose-env | 2 | `docker compose config` |
| REL-03 | fix-rel-03-sse-decouple | 3 | `grep -n "save_message" backend/app/services/chat.py` 排除函数定义行后无匹配 |
| REL-04 | fix-rel-04-sync-orm-wrap | 3 | `grep "run_in_threadpool" backend/app/routers/chat.py` |
| REL-06 | fix-rel-06-health-check | 3 | `curl http://localhost:8000/api/health` 返回 checks 字段 |
| TEST-01 | fix-test-01-python-env | 4 | `pytest --version` |
| TEST-02 | fix-test-02-repair-unit-test | 4 | `pytest tests/test_repair.py -v` |
| TEST-03 | fix-test-03-chat-sse-test | 4 | `pytest tests/test_chat_sse.py -v` |
| TEST-04 | fix-test-04-graph-api-test | 4 | `pytest tests/test_graph_api.py -v` |
| TEST-05 | fix-test-05-ci-setup | 4 | `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` |

---

*Plan created: 2026-05-10*
*For: /gsd-execute-phase consumption*
