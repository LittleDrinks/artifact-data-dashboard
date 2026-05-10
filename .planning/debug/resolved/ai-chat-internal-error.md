---
status: resolved
trigger: "AI问答无法正常使用，发送任何消息都返回 Internal server error"
created: 2026-05-10T12:50:00Z
updated: 2026-05-10T14:20:00Z
---

## Current Focus

hypothesis: "The chat_messages table is missing the reasoning_content column that was added to the ChatMessage model during Phase 1 fixes (REL-01/REL-03/REL-04)"
test: "Tested chat endpoint with curl and examined backend error response"
expecting: "Database schema mismatch between model and actual table"
next_action: "Root cause confirmed - return diagnosis"

## Symptoms

expected: "AI Chat 能正常回复，流式输出无卡顿，无 400/500 错误"
actual: "发送任何消息都返回 Internal server error，AI 无法回复"
errors: "Internal server error"
reproduction: "登录后进入 AI 问答页面，输入任意消息（如'你好'或'<img src=x onerror=alert(1)>')，发送后显示 Internal server error"
started: "Phase 1 修复后（REL-01, REL-03, REL-04 修改了 chat.py）"

## Eliminated

[none yet]

## Evidence

- timestamp: 2026-05-10T12:33:51Z
  checked: "Backend error response from POST /api/chat/ask"
  found: "sqlite3.OperationalError: table chat_messages has no column named reasoning_content"
  implication: "The ChatMessage SQLAlchemy model has a reasoning_content column, but the existing SQLite database table was never migrated to add it"

- timestamp: 2026-05-10T12:33:51Z
  checked: "backend/app/models/chat.py"
  found: "ChatMessage model defines reasoning_content: Mapped[str | None] = mapped_column(Text, nullable=True)"
  implication: "The model expects this column to exist"

- timestamp: 2026-05-10T12:33:51Z
  checked: "backend/app/database.py _ensure_new_columns()"
  found: "Migration function only handles artifacts table columns (material, museum, source_url, dimensions), does NOT handle chat_messages table"
  implication: "There is no automated migration for chat_messages schema changes"

- timestamp: 2026-05-10T12:33:51Z
  checked: "backend/app/services/chat.py save_message()"
  found: "save_message() creates ChatMessage with reasoning_content parameter, which triggers INSERT with reasoning_content column"
  implication: "Every message save fails because the column doesn't exist in the database"

## Resolution

root_cause: "The ChatMessage SQLAlchemy model was updated to add a reasoning_content column (for DeepSeek v4-flash thinking content) during Phase 1 fixes, but the existing SQLite database was never migrated. The _ensure_new_columns() function in database.py only migrates the artifacts table, not chat_messages. When save_message() tries to INSERT a new chat message, SQLAlchemy generates SQL including the reasoning_content column, which causes sqlite3.OperationalError."
fix: ""
verification: ""
files_changed: []
