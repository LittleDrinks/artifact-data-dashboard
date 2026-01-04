# Implementation Plan — 改进搜索分词（fix-search-tokenization）

概要
- 目标：修复并增强后端关键词抽取流程（`extractKeywords`），提升中文分词与短语识别精度，减少停用词干扰，并增加测试与调试能力。
- 交付物：后端分词模块实现、可配置停用词表、短语词典、单元测试、DEBUG 日志切换、API 合约（若需）。

阶段与任务

Phase 0 — 评估（0.5 天）
- 定位当前实现：在 `backend/src/routes/chat.routes.js` 中找到 `extractKeywords` 的实现与调用点。
- 收集样本：从 Chat 日志中提取 50 条实际问句作为测试集（包括示例）。

Phase 1 — 设计（0.5 天）
- 定义停用词表与配置位置（`config/stopwords.json`），包含默认短语前缀。
- 设计短语词典格式（`config/phrase-dict.txt`），与 `nodejieba` 的自定义词典兼容。
- 定义 `KeywordExtractionResult` 返回结构与 debug 标志。

Phase 2 — 实现（1-2 天）
- 在 `backend/src/services` 新增 `keyword.service.js`（封装 nodejieba 与停用词/短语合并逻辑）。
- 重构 `chat.routes.js` 以调用 `keyword.service.extractKeywords(question, options)`；保留原有回退逻辑。
- 实现配置加载与热重载（如在开发模式下重新读取词典）。
- 添加 DEBUG 可选输出：当 `process.env.DEBUG_KEYWORDS=true` 时在日志中打印原始问题与分词结果。

Phase 3 — 测试与验证（1 天）
- 编写单元测试覆盖：停用词过滤、短语合并、意图保留、回退策略。
- 在 Docker 环境内跑一次构建并手动触发 Chat 场景，验证输出。

Phase 4 — 部署与回归（0.5 天）
- 合并 PR 并由 CI 在 Docker 环境中运行构建（已在本地验证）。
- 观察生产日志并根据真实查询扩充短语词典与停用词表。

风险与缓解
- 如果短语词典引入过多规则可能产生过拟合，应默认使用 conservative 策略并提供管理员可编辑字典。

操作细节示例（代码骨架）
- `keyword.service.js`:
  - load stopwords
  - load custom phrase dictionary into nodejieba
  - function `extractKeywords(text, { keepIntent=true, debug=false })` -> returns `{ keywords, intent, rawTokens }`

验收标准
- 按 spec 中的 AT1/AT2/AT3 通过。

下一步建议
- 我可以现在：
  1) 在本地仓库创建 feature 分支并实现 `keyword.service.js` 的雏形；或
  2) 先在仓库中添加默认停用词表与短语词典样例并提交为起点。

