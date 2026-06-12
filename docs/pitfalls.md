# 开发踩坑记录

> 仅记录未解决或需持续注意的坑。已修复的条目已移除。
> 最后更新：2026-04-17

---

### [2026-04-14] POST SSE 不能用 EventSource，必须用 fetch + ReadableStream

- **现象**：POST `/api/chat/ask` 需要发送 JSON body，但浏览器原生 `EventSource` 只支持 GET 请求，无法发送 body 和自定义 header
- **原因**：EventSource API 规范仅支持 GET 请求，不接受 method、headers、body 参数
- **解决**：使用 `fetch()` 发起 POST 请求，通过 `response.body.getReader()` 获取 ReadableStream，手动解析 `data: {...}\n\n` 格式的 SSE 事件
- **教训**：需要 POST body 的 SSE 流式接口，必须用 fetch + ReadableStream 手动解析，不能用 EventSource

### [2026-04-14] SSE 流式响应需要禁用 Nginx/代理缓冲

- **现象**：SSE 事件在开发环境中延迟到达或一次性全部到达，无法实现流式效果
- **原因**：反向代理（Nginx）或 ASGI 服务器可能对响应进行缓冲
- **解决**：在 StreamingResponse 的 headers 中添加 `Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`
- **教训**：SSE 流式接口必须设置正确的响应头来禁用各级缓冲

### [2026-04-14] Windows 下 Python open() 读取含中文 JSON 必须指定 encoding

- **现象**：`open('artifacts_list.json')` 在 Windows 上默认用 GBK 编码，读取含中文的 JSON 抛 UnicodeDecodeError
- **原因**：Windows 系统 locale 默认编码不是 UTF-8
- **解决**：所有 `open()` 调用都加 `encoding='utf-8'` 参数
- **教训**：Windows 环境下处理中文文件，永远显式指定 encoding='utf-8'

### [2026-04-14] recharts Tooltip formatter 和 Pie label 的 TypeScript 类型严格检查

- **现象**：`formatter={(value: number) => ...}` 报 TS2322，`label={({ name, percent }) => ...}` 报 TS2769
- **原因**：recharts 的 Tooltip formatter 参数类型是 `ValueType | undefined`，Pie label 参数类型是 `PieLabelRenderProps`（name 为 `string | undefined`），不能窄化为非可选类型
- **解决**：formatter 去掉类型标注用隐式推断，Pie label 导入 `PieLabelRenderProps` 类型并正确处理可选属性
- **教训**：recharts v2 的 TypeScript 类型定义很严格，不要给回调参数手动标注更窄的类型

### [2026-04-17] RTX 4060 8GB VRAM 无法运行 LightRAG 本地实体提取

- **现象**：qwen2.5:7b (5GB) + nomic-embed-text (0.3GB) = 5.3GB，理论显存足够，但跑 LightRAG entity extraction 时崩溃：`llama runner process has terminated: Error code: 500`
- **原因**：LightRAG 实体提取需要额外的显存用于 KV cache、中间计算、并行推理；qwen2.5:3b 虽然不崩溃但 600s 内无法完成任务
- **解决**：规则化图谱（import_to_neo4j.py）不需要 LLM，可以直接跑；LightRAG 索引等云 API 恢复后再跑
- **教训**：8GB VRAM 对复杂 LLM 任务（如知识图谱实体提取）不够用，建议 >= 12GB 或用云 API
