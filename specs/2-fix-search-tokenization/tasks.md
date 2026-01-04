# Tasks: fix-search-tokenization

目标：实现后端可配置的关键词抽取管线（基于 `nodejieba`），包含停用词、短语字典、意图分离、单元测试与可选的 MCP 增强路径。

注：此文件仅列出任务；实际实现文件按任务完成时创建。

## 总体原则
- 以可测试、可回退、低延迟的本地 pipeline 为主；MCP 仅作可选增强（rerank/重写）。
- 所有新代码需带单元测试并能在 `backend` 下运行。

## Phase 0 — 准备（0.5 天）
- [ ] T0.1：在 feature 分支确认当前基线分支与 CI 要求（`git branch`/`git status`）。
- [ ] T0.2：收集 50 条混合测试样本（生产抽样 + 人工合成），放入 `specs/2-fix-search-tokenization/samples/`（仅清单，文件按需要添加）。

## Phase 1 — 配置与字典（可并行）
- [ ] T1.1：定义并记录停用词文件规范：`backend/config/stopwords.json`（默认词表示例）。
- [ ] T1.2：定义短语字典规范：`backend/config/phrase-dict.txt`（nodejieba 自定义词典格式示例）。
- [P] T1.3：定义配置项与环境变量：`DEBUG_KEYWORDS`, `USE_MCP_FOR_RERANK`, `PHRASE_MERGE_MODE`（值：`conservative|max-match`）。

## Phase 2 — 实现核心服务（1-2 天）
- [ ] T2.1：实现 `backend/src/services/keyword.service.js`（核心）——导出 `extractKeywords(text, { keepIntent=true, debug=false })`：
  - 加载 `stopwords.json` 与 `phrase-dict.txt`（支持热重载/开发模式）。
  - 使用 `nodejieba` 做分词与短语合并（遵循保守合并默认策略，受 `PHRASE_MERGE_MODE` 控制）。
  - 去除停用词；单独抽取疑问词并返回 `intent` 字段（不计入 `keywords`）。
  - 异常退化为按空格/标点拆分的回退逻辑。

- [ ] T2.2：实现并导出小型 API：`keywordService.loadDictionaries()`、`keywordService.extractKeywords()`、`keywordService.debugDump()`。

## Phase 3 — 集成与日志（0.5 天）
- [ ] T3.1：在 `backend/src/routes/chat.routes.js` 中集成 `extractKeywords`：
  - 将 `keywords` 与 `intent` 传入查询构建流程；
  - 当 `DEBUG_KEYWORDS=true` 时打印原始问题与分词结果。
- [ ] T3.2：在适当位置添加度量/日志点用于后续监控（命中率、退化次数、未知短语频次）。

## Phase 4 — 测试与调试（0.5-1 天）
- [ ] T4.1：新增单元测试 `backend/__tests__/keyword.service.test.js`，覆盖至少 12 条示例（包括 spec 示例与边界情况）。
- [ ] T4.2：添加调试脚本 `backend/src/scripts/debug-keyword.js`（CLI 调用 `extractKeywords` 并打印结果）。
- [ ] T4.3：在本地运行 `npm test`（或 CI）并修复失败。

## Phase 5 — MCP 增强（可选，0.5 天）
- [ ] T5.1：实现可选 rerank 路径：当 `USE_MCP_FOR_RERANK=true` 且本地置信度低时，调用 `backend/src/services/mcp.service.js` 获取候选短语/重写建议并融合（需人工策略设计）。

## Phase 6 — 交付与文档（0.5 天）
- [ ] T6.1：更新 `specs/2-fix-search-tokenization/spec.md`，记录实现细节与如何调整 `stopwords`/`phrase-dict`。
- [ ] T6.2：准备 PR 描述、变更列表与回滚说明。

## 风险与回退任务
- [ ] R1：若短语字典导致误合并，提供快速配置路径关闭短语合并并回滚字典更新。
- [ ] R2：保证 `extractKeywords` 在异常时退化为可用分词以避免上游空查询。

## 交付物清单（预期）
- `backend/config/stopwords.json`（示例）
- `backend/config/phrase-dict.txt`（示例）
- `backend/src/services/keyword.service.js`
- `backend/src/scripts/debug-keyword.js`
- `backend/__tests__/keyword.service.test.js`

---
估时为粗略预估；实施时可按小步提交并保持 CI 绿色。
