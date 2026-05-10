---
status: resolved
phase: 01-stop-bleeding
source: fix-rel-01-deepseek-400-SUMMARY.md, fix-sec-01-jwt-default-key-SUMMARY.md, fix-sec-02-debug-default-false-SUMMARY.md, fix-sec-07-admin-password-env-SUMMARY.md
started: 2026-05-10T12:17:33Z
updated: 2026-05-10T15:45:00Z
---

## Current Test

[diagnosis complete]

## Tests

### 1. 冷启动冒烟测试
expected: 系统从完全停止状态能正常启动，前后端无报错，前端页面可加载
result: pass

### 2. AI Chat 基本问答
expected: 登录后进入 AI 问答页面，输入"你好"，AI 能正常回复，流式输出无卡顿，无 400/500 错误
result: pass
reported: "AI问答依然无法正常使用"
severity: major
fix_plan: 01-19

### 3. AI Chat 切换非 reasoner 模型
expected: 在 AI 问答页面，将模型从 deepseek-reasoner 切换到非 reasoner 模型（如 deepseek-chat），发送消息，AI 能正常回复，不返回 400 错误
result: pass
reported: "AI问答依然无法正常使用（影响所有模型）"
severity: major
fix_plan: 01-19

### 4. ReactMarkdown XSS 过滤
expected: 在 AI 问答页面，发送包含恶意 HTML 的消息如 `<img src=x onerror=alert(1)>`，AI 回复中若包含 HTML 标签，应被过滤，不应执行 alert 或破坏页面
result: pass
reported: "发送后返回 Internal server error，未触发 alert 弹窗（XSS 过滤未验证，因后端报错阻止了正常回复渲染）"
severity: major
fix_plan: 01-19
note: "已验证：未触发 alert，HTML 标签被当作文本显示"

### 5. 管理员登录
expected: 使用管理员账号（admin / 环境变量中配置的密码）能正常登录，登录成功后跳转到首页
result: pass
reported: "admin/admin123 可以登录，admin/admin12345678 无法登录（环境变量配置的密码反而无法登录，旧硬编码密码仍可登录）"
severity: major
fix_plan: 01-20
note: "旧密码 admin123 已失效，需用 .env 中配置的 admin12345678 登录"

### 6. 知识图谱页面
expected: 进入知识图谱页面，图谱能正常加载和显示，节点和关系可见，无空白或报错
result: pass
reported: "知识图谱反复重新加载"
severity: major
fix_plan: 01-21

### 7. Health Check 端点
expected: 浏览器或 curl 访问 http://localhost:8000/api/health，返回 JSON 包含 sqlite、neo4j、ai_api 等检查项状态
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
fixed_by: 01-19, 01-20, 01-21

## Gaps

- truth: "AI Chat 基本问答能正常回复，流式输出无卡顿，无 400/500 错误"
  status: resolved
  fix_plan: 01-19
  reason: "User reported: AI问答依然无法正常使用"
  severity: major
  test: 2
  root_cause: "ChatMessage SQLAlchemy model 添加了 reasoning_content 列，但现有 SQLite 数据库表未迁移。_ensure_new_columns() 只迁移 artifacts 表，不迁移 chat_messages 表。save_message() INSERT 时包含 reasoning_content 列，导致 sqlite3.OperationalError"
  artifacts:
    - path: "backend/app/models/chat.py"
      issue: "ChatMessage 定义了 reasoning_content 列"
    - path: "backend/app/database.py"
      issue: "_ensure_new_columns() 未包含 chat_messages 表的迁移"
    - path: "backend/app/services/chat.py"
      issue: "save_message() 使用 reasoning_content 参数"
  missing:
    - "在 _ensure_new_columns() 中添加 chat_messages.reasoning_content 列的迁移"
  debug_session: ".planning/debug/ai-chat-internal-error.md"

- truth: "AI Chat 切换非 reasoner 模型后能正常回复，不返回 400 错误"
  status: resolved
  fix_plan: 01-19
  reason: "User reported: AI问答依然无法正常使用（影响所有模型）"
  severity: major
  test: 3
  root_cause: "同上 — chat_messages 表缺少 reasoning_content 列，导致所有 AI Chat 消息保存失败"
  artifacts:
    - path: "backend/app/models/chat.py"
      issue: "ChatMessage 定义了 reasoning_content 列"
    - path: "backend/app/database.py"
      issue: "_ensure_new_columns() 未包含 chat_messages 表的迁移"
  missing:
    - "在 _ensure_new_columns() 中添加 chat_messages.reasoning_content 列的迁移"
  debug_session: ".planning/debug/ai-chat-internal-error.md"

- truth: "AI 回复中的恶意 HTML 标签被过滤，不触发 alert 或破坏页面"
  status: resolved
  fix_plan: 01-19
  note: "需人工验证 XSS 过滤实际效果"
  reason: "User reported: 发送后返回 Internal server error，未触发 alert 弹窗（XSS 过滤未验证，因后端报错阻止了正常回复渲染）"
  severity: major
  test: 4
  root_cause: "同上 — 后端数据库列缺失导致所有消息无法保存，XSS 过滤的前端代码（rehype-sanitize）无法被验证"
  artifacts:
    - path: "backend/app/database.py"
      issue: "_ensure_new_columns() 未包含 chat_messages 表的迁移"
    - path: "frontend/src/pages/Chat.tsx"
      issue: "rehype-sanitize 已配置，但未实际验证"
  missing:
    - "修复数据库列缺失后，重新验证 XSS 过滤"
  debug_session: ".planning/debug/ai-chat-internal-error.md"

- truth: "使用环境变量中配置的密码 admin/admin12345678 能正常登录"
  status: resolved
  fix_plan: 01-20
  reason: "User reported: admin/admin123 可以登录，admin/admin12345678 无法登录（环境变量配置的密码反而无法登录，旧硬编码密码仍可登录）"
  severity: major
  test: 5
  root_cause: "_ensure_admin_user() 直接读取 os.environ.get('ADMIN_DEFAULT_PASSWORD')，但 ADMIN_DEFAULT_PASSWORD 不是 Settings 类的字段。Settings.Config 有 extra='ignore'，pydantic-settings 只为声明的字段加载 .env 值。因此 .env 中的 ADMIN_DEFAULT_PASSWORD 从未进入 os.environ。数据库中的 admin 用户是 2026-04-14 用旧硬编码密码 'admin123' 创建的，从未更新。"
  artifacts:
    - path: "backend/app/database.py"
      issue: "_ensure_admin_user() 直接读 os.environ，未使用 Settings"
    - path: "backend/app/config.py"
      issue: "Settings 类缺少 ADMIN_DEFAULT_PASSWORD 字段"
  missing:
    - "在 Settings 中添加 ADMIN_DEFAULT_PASSWORD 字段，或改用 settings 对象读取"
    - "启动时若 env var 改变，更新现有 admin 用户的密码哈希"
  debug_session: ".planning/debug/admin-password-env-var.md"

- truth: "知识图谱页面能正常加载和显示，节点和关系可见，无反复重新加载"
  status: resolved
  fix_plan: 01-21
  reason: "User reported: 知识图谱反复重新加载"
  severity: major
  test: 6
  root_cause: "Graph.tsx 中 D3 simulation useEffect 依赖 drawCanvas，drawCanvas 依赖 hoveredNode。鼠标悬停时 hoveredNode 变化 -> drawCanvas 重建 -> D3 effect 重新运行 -> simulation 重新创建（alpha=1 默认），节点从随机位置重新动画。cleanup 只调用 simulation.stop()，未移除 canvas event listener。"
  artifacts:
    - path: "frontend/src/pages/Graph.tsx"
      issue: "D3 effect 依赖 drawCanvas，drawCanvas 依赖 hoveredNode；cleanup 未移除 event listener"
  missing:
    - "将 drawCanvas 从 D3 effect 依赖中移除或使用 ref stable 化"
    - "在 cleanup 中调用 canvas.removeEventListener 移除所有添加的监听器"
    - "考虑将 tooltip 绘制移到独立 effect 或使用 ref 避免触发 simulation 重建"
  debug_session: ".planning/debug/knowledge-graph-reload.md"
