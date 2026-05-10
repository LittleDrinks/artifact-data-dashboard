---
phase: 02-hardening
created: 2026-05-10T15:45:00Z
resolves_phase: ""
type: bug
priority: P1
source: UAT-Phase-01
---

# Chat 页面 UI/UX 体验问题

Phase 1 UAT 验证过程中发现 3 个 UI/UX 问题，不影响系统可用性但影响演示体验。

## 1. ReAct 流式输出分组跳动

**现象：** AI 回复的 thinking、tool_calling、answer 内容被分组显示，导致流式输出时内容不是连续向下滚动，而是整块跳动。

**根因：** Chat.tsx 中消息渲染逻辑将不同类型的 SSE 事件（thinking_start/thinking_delta/thinking_end、tool_call_start/tool_call_result、answer_start/answer_delta/answer_end）渲染为独立的 UI 组件，每次新组件出现时页面跳动。

**期望：** 内容像普通聊天一样连续流式输出，不同类型的内容用视觉区分但不造成页面跳动。

**涉及文件：** `frontend/src/pages/Chat.tsx`

## 2. Markdown 表格未渲染

**现象：** AI 回复中的 Markdown 表格（`| 列1 | 列2 |` 语法）以原始文本显示，没有渲染为 HTML `<table>`。

**根因：** ReactMarkdown 缺少 `remark-gfm` 插件，不支持 GitHub Flavored Markdown 的表格语法。

**期望：** Markdown 表格正确渲染为带边框的 HTML 表格。

**涉及文件：** `frontend/src/pages/Chat.tsx`

## 3. 长回答挤走输入框

**现象：** AI 生成超长回答时，整个页面滚动条下移，输入框被挤出视口。用户需要手动滚动到底部才能继续输入。

**根因：** 对话区域没有独立的滚动容器，页面滚动是针对整个 `document.body` 的。

**期望：** 对话区域独立滚动，新消息自动滚动到底部，输入框固定在视口底部不动。

**涉及文件：** `frontend/src/pages/Chat.tsx`（布局 CSS）
