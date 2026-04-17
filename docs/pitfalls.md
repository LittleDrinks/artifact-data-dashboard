# 开发踩坑记录

> 开发过程中遇到的所有非显而易见的问题，实时追加。

---

*最后更新：2026-04-17*

### [2026-04-17] 新对话创建后 session_id 未传递给前端，导致后续消息发送到新会话而非当前会话
- **现象**：用户在无会话状态下发送第一条消息，后端创建新会话并流式返回 SSE，但前端 `activeSessionId` 仍为 null；发送第二条消息时，后端又创建另一个新会话，而非延续上一条消息的会话
- **原因**：后端在 `/ask` 路由中创建新会话，但 `stream_chat_response()` 未向前端传递新会话的 `session_id`；前端 `sendChatMessage()` 只发送 `session_id: undefined`，无法知道后端创建的会话 ID
- **解决**：在 `stream_chat_response()` 开始时，先 emit `session_created` SSE 事件（包含 `session_id`），前端收到后立即 `setActiveSessionId(event.session_id)`；同时在 `done` handler 中移除 `loadSessions()` 调用，避免触发 auto-restore race condition
- **教训**：POST SSE 创建新资源时，必须在流式响应的**最开始** emit 包含新资源 ID 的事件，让前端能立即更新状态

### [2026-04-17] ReAct 循环最后一轮 thinking 未保存到数据库
- **现象**：3轮 ReAct 循环（工具调用 + 最终回答）中，只有前2轮的 thinking 被保存到数据库，第3轮（最终回答前）的 thinking 文本丢失
- **原因**：`_react_gen()` 中，thinking_text 只在 `if in_thinking` 条件下保存；最后一轮 thinking 结束后立即进入 content 输出，`in_thinking` 被设为 False，循环结束后 `if in_thinking` 条件不满足，thinking_text 未保存
- **解决**：将 `thinking_rounds.append(thinking_text)` 移到 `if in_thinking` 条件块之外，确保每轮结束都保存 thinking_text（只要有内容）
- **教训**：循环中的状态变量（如 `in_thinking`）在循环结束时可能已改变，保存逻辑不应依赖中间状态

### [2026-04-17] get_artifact_detail 返回扁平对象而非 results 数组，前端 tool_call_result 解析失败
- **现象**：`get_artifact_detail` 工具调用后，右侧面板显示空结果，但后端日志显示确实返回了文物详情
- **原因**：`get_artifact_detail` 返回 `{id, name, description, ...}`（扁平对象），`tool_call_result` SSE 事件用 `result.get("results", [])` 提取，导致 `results` 为空数组
- **解决**：在 `_react_gen()` 中根据 `fn_name` 分支：`get_artifact_detail` 发送 `artifact_detail` 字段（完整对象），`query_knowledge_graph` 发送 `entities` 和 `relations` 字段；前端 `ToolCallEntry` 类型增加 `artifactDetail`、`entities`、`relations` 字段，面板根据 tool 类型渲染不同卡片
- **教训**：不同工具的返回格式不同，SSE event 和前端解析逻辑需按工具类型分支处理

### [2026-04-17] RTX 4060 8GB VRAM 无法运行 LightRAG 本地实体提取
- **现象**：qwen2.5:7b (5GB) + nomic-embed-text (0.3GB) = 5.3GB，理论显存足够，但跑 LightRAG entity extraction 时崩溃：`llama runner process has terminated: Error code: 500`
- **原因**：LightRAG 实体提取需要额外的显存用于 KV cache、中间计算、并行推理；qwen2.5:3b 虽然不崩溃但 600s 内无法完成任务
- **解决**：规则化图谱（import_to_neo4j.py）不需要 LLM，可以直接跑；LightRAG 索引等云 API 恢复后再跑
- **教训**：8GB VRAM 对复杂 LLM 任务（如知识图谱实体提取）不够用，建议 >= 12GB 或用云 API

### [2026-04-14] POST SSE 不能用 EventSource，必须用 fetch + ReadableStream
- **现象**：POST `/api/chat/ask` 需要发送 JSON body（question、session_id），但浏览器原生 `EventSource` 只支持 GET 请求，无法发送 body 和自定义 header
- **原因**：EventSource API 规范仅支持 GET 请求，不接受 method、headers、body 参数
- **解决**：使用 `fetch()` 发起 POST 请求，通过 `response.body.getReader()` 获取 ReadableStream，手动解析 `data: {...}\n\n` 格式的 SSE 事件
- **教训**：需要 POST body 的 SSE 流式接口，必须用 fetch + ReadableStream 手动解析，不能用 EventSource

### [2026-04-14] SSE 流式响应需要禁用 Nginx/代理缓冲
- **现象**：SSE 事件在开发环境中延迟到达或一次性全部到达，无法实现流式效果
- **原因**：反向代理（Nginx）或 ASGI 服务器可能对响应进行缓冲
- **解决**：在 StreamingResponse 的 headers 中添加 `Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`
- **教训**：SSE 流式接口必须设置正确的响应头来禁用各级缓冲

### [2026-04-14] 默认 Python 3.9 无法创建兼容的虚拟环境
- **现象**：`python -m venv .venv` 创建了 Python 3.9 的虚拟环境，安装 SQLAlchemy 时 greenlet 编译失败（需要 MSVC 14.0+），且项目使用了 `X | None` 语法（3.10+）
- **原因**：系统中 `python` 命令指向 Python 3.9.13，而 miniforge 安装了 Python 3.12.12
- **解决**：使用 `E:/miniforge3/python.exe -m venv .venv` 创建基于 Python 3.12 的虚拟环境
- **教训**：Windows 系统可能安装多个 Python 版本，创建虚拟环境前先确认目标 Python 路径和版本

### [2026-04-14] Python 3.9 不支持 `str | None` 联合类型语法
- **现象**：SQLAlchemy model 中使用 `Mapped[str | None]` 语法，运行时报 `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`
- **原因**：`X | None` 联合类型语法是 Python 3.10+ 才引入的，当前环境是 Python 3.9.13
- **解决**：所有模型和配置中的 `str | None` / `list[str]` 替换为 `Optional[str]` / `List[str]`（from typing import Optional, List）
- **教训**：开发前先确认 Python 版本，3.9 环境下必须用 `typing` 模块的兼容写法

### [2026-04-14] Windows 下 Python open() 读取含中文 JSON 必须指定 encoding
- **现象**：`open('artifacts_list.json')` 在 Windows 上默认用 GBK 编码，读取含中文的 JSON 抛 UnicodeDecodeError
- **原因**：Windows 系统 locale 默认编码不是 UTF-8
- **解决**：所有 `open()` 调用都加 `encoding='utf-8'` 参数
- **教训**：Windows 环境下处理中文文件，永远显式指定 encoding='utf-8'

### [2026-04-17] admin 用户创建时 role 字段默认为 'user' 而非 'admin'
- **现象**：创建 admin 用户时，数据库中 role 字段值为 'user'，导致登录后无法访问需 admin 权限的端点
- **原因**：用户表 model 定义中 `role` 字段 default 值为 'user'，创建逻辑未显式指定 role='admin'
- **解决**：在 create_admin_user.py 中显式设置 `role='admin'`，确保管理员用户拥有正确权限
- **教训**：创建特殊权限用户时，必须显式指定 role 字段，不能依赖 model default 值

### [2026-04-17] category 字段被 Wikipedia 分类数据污染
- **现象**：部分文物 category 字段包含多个分类，用竖线分隔如 "青铜器|礼器|容器"，导致前端筛选和统计失效
- **原因**：原始数据来自 Wikipedia 抓取，分类字段直接复制了 Wikipedia 的多分类格式
- **解决**：编写 Ollama LLM 批量清洗脚本，对每条记录调用 LLM 判断最匹配的标准类别（青铜器、陶瓷、玉器等 8 种）
- **教训**：外部数据源的字段格式可能不符合预期，导入前需验证字段结构和内容

### [2026-04-17] image_url 存储了 Wikipedia 页面链接而非图片 URL
- **现象**：约 140 条记录 image_url 字段存储的是 Wikipedia 页面 URL（如 https://zh.wikipedia.org/wiki/xxx），而非图片链接
- **原因**：数据抓取脚本在页面无图片时，错误地将页面 URL 作为 fallback 写入 image_url 字段
- **解决**：编写批量清洗脚本，检测 image_url 是否包含 wikipedia.org/wiki，若为页面链接则置空
- **教训**：数据导入时需严格校验字段类型，页面 URL 和图片 URL 是不同概念，不能混用

### [2026-04-14] recharts Tooltip formatter 和 Pie label 的 TypeScript 类型严格检查
- **现象**：`formatter={(value: number) => ...}` 报 TS2322，`label={({ name, percent }) => ...}` 报 TS2769
- **原因**：recharts 的 Tooltip formatter 参数类型是 `ValueType | undefined`，Pie label 参数类型是 `PieLabelRenderProps`（name 为 `string | undefined`），不能窄化为非可选类型
- **解决**：formatter 去掉类型标注用隐式推断，Pie label 导入 `PieLabelRenderProps` 类型并正确处理可选属性
- **教训**：recharts v2 的 TypeScript 类型定义很严格，不要给回调参数手动标注更窄的类型
