Implementation Plan (Actionable) — fix-search-tokenization

目标：将规范转为可执行任务清单，方便在 feature 分支上直接实施与验证。

快速步骤（可直接执行）

1) 确认分支
- 确认你已在 feature 分支（例如 `feature/2-fix-search-tokenization`）：
  ```bash
  git status
  git branch --show-current
  ```

2) 添加配置与词典样例（快速产物，便于迭代）
- 创建文件：
  - `backend/config/stopwords.json`：默认中文停用词（示例包含“请问”“介绍”“一下”等）。
  - `backend/config/phrase-dict.txt`：短语词典样例（每行一个短语，nodejieba 自定义词典格式）。
- 提交：
  ```bash
  git add backend/config/stopwords.json backend/config/phrase-dict.txt
  git commit -m "feat(keyword): add stopwords and phrase dictionary samples"
  ```

3) 实现核心服务 `keyword.service.js`
- 路径：`backend/src/services/keyword.service.js`
- 要点：
  - 初始化与加载 `nodejieba`，并加载 `backend/config/phrase-dict.txt`（若存在）。
  - 加载 `backend/config/stopwords.json`。
  - 导出 `extractKeywords(text, { keepIntent=true, debug=false })`，返回：
    ```js
    { keywords: string[], intent?: string, rawTokens?: string[], debug?: object }
    ```
  - 在异常时退化为简单分割策略（基于标点/空格）。

4) 集成到 `chat.routes.js`
- 用法示例：
  ```js
  const { extractKeywords } = require('../services/keyword.service');
  const result = extractKeywords(question, { keepIntent: true, debug: process.env.DEBUG_KEYWORDS === 'true' });
  // 使用 result.keywords 构建 Cypher / MySQL 查询
  ```
- 在 DEBUG 模式下记录原始问题与 result 到日志。

5) 单元测试
- 增加测试文件：`backend/__tests__/keyword.service.test.js`。
- 至少包含示例：
  - "介绍一下彩绘釉陶人物俑" -> keywords 不含 "介绍"/"一下"；包含 "彩绘釉陶人物俑" 或合理拆分。
  - 问句/陈述/复杂短语等 12+ 条样例。
- 运行：
  ```bash
  npm -C backend test
  ```

6) 本地快速调试脚本（可选）
- 新建：`backend/src/scripts/debug-keyword.js`：从 CLI 读取一句话，调用 service 并打印结果。
- 运行示例：
  ```bash
  node backend/src/scripts/debug-keyword.js "介绍一下彩绘釉陶人物俑"
  ```
- 或在 Docker 中：
  ```bash
  docker compose -f docker-compose.yml run --rm --no-deps backend node src/scripts/debug-keyword.js "介绍一下彩绘釉陶人物俑"
  ```

7) 验证与提交
- 本地运行测试并构建（或在 Docker 中）：
  ```bash
  docker compose -f docker-compose.yml run --rm backend npm test
  docker compose -f docker-compose.yml run --rm backend npm run build || true
  ```
