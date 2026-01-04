20××-20××学年秋季学期

《计算思维实训（2）》(0830A031)

课程报告

## Part 1. 本学期实训过程概述

进入计算思维实训2阶段，我的核心任务是解决实训1（repo1）版本遗留的问题，让项目从“只有基础架构”落地为可用系统。实训1在实际测试中暴露出接口缺少安全校验、数据批量管理能力弱、文物关联关系不直观三个问题。

本阶段我以“先补安全 → 再提效（查询/批量） → 再补关系表达（图谱） → 最后增强交互（问答）”的顺序推进，实现登录鉴权、关键词搜索分页、Excel导入导出、知识图谱可视化、智能问答功能，并补充真实数据源，形成完整业务闭环。

**技术栈与架构概览**

- 前端：React + axios（登录态与接口调用）
- 后端：Node.js（Express）提供 REST API + 中间件鉴权
- 数据：MySQL（业务表与检索） + Neo4j（关系图谱） + Redis（聊天记录缓存）
- 工程化：Docker Compose 一键启动多服务

## Part 2. 核心问题解决过程与实现细节

### 1. 认证与安全：补上接口安全漏洞（JWT）

实训1阶段我只关注了功能跑通，忽略了接口安全，导致“未登录即可直接访问数据接口”的风险。为实现无状态鉴权并为后续权限区分（管理员/普通用户）打基础，我选择使用 JWT（JSON Web Token）。

核心实现是编写认证与角色中间件：从请求头读取 `Authorization: Bearer <token>`，验证 token，解析用户信息并挂到 `req.user` 上；同时按用户角色控制接口访问权限。

代码节选：backend/src/middleware/auth.middleware.js（第1-35行）

```js
const jwt = require('jsonwebtoken');

// 认证中间件
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '未授权：无效的Token格式' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: '未授权：Token不存在' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '未授权：Token已过期' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: '未授权：无效的Token' });
    }

    console.error('认证中间件错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
};
```

省略：backend/src/middleware/auth.middleware.js（第36-54行）

后端将 token 有效期设置为 24 小时，并配套实现个人信息查询与角色区分；前端通过 axios 拦截器统一携带 token、并在遇到 401 时做跳转处理。JWT 密钥与 API 配置放入 `.env`，并补全 `.env.example`，降低部署出错概率。

### 2. 搜索与详情：关键词检索 + 分页（MySQL）

实训1阶段只能表格翻页浏览，缺少“快速定位目标文物”的能力。我将核心需求拆解为两点：关键词检索与分页。

后端使用 MySQL `LIKE` 做模糊匹配，并通过 `limit/offset` 控制每页数量。接口同时返回分页元数据（`total`、`page`、`limit`、`totalPages`、`keyword`）。

代码节选：backend/src/routes/artifact.routes.js（第247-258行）

```js
router.get('/search', async (req, res) => {
  try {
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    if (!keyword) {
      return res.status(400).json({ message: '搜索关键词为必填项' });
    }

    const page = clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 });
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 10 });
    const offset = (page - 1) * limit;

    const searchPattern = `%${keyword}%`;
```

省略：backend/src/routes/artifact.routes.js（第259-299行）

代码节选：backend/src/routes/artifact.routes.js（第300-328行）

```js
    const total = countRows?.[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    if (req.user && req.user.id) {
      try {
        await mysqlPool.execute(
          'INSERT INTO logs (user_id, action, target_id, timestamp, details) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, 'search', null, new Date(), JSON.stringify({ keyword })]
        );
      } catch (logError) {
        console.error('记录搜索日志错误:', logError);
      }
    }

    return res.status(200).json({
      data: artifacts,
      meta: {
        total,
        page,
        limit,
        totalPages,
        keyword
      }
    });
  } catch (error) {
    console.error('搜索文物错误:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});
```

前端在搜索页面增加搜索框、分页控件与详情展示，并处理“无结果”提示，避免空列表造成误解。

### 3. Excel 导入/导出：统一格式 + 严格校验（批量管理）

系统支持通过 Excel 批量导入/导出。导入时先读取 xlsx，再进行 schema 校验；校验通过后按固定 sheet 解析行数据并写入数据库。

代码节选：backend/src/services/excel-kg.service.js（第446-470行）

```js
const importKnowledgeGraphFromXlsxBuffer = async ({ buffer, strategy = 'append' }) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const validation = validateWorkbookSchema(workbook);
  if (!validation.ok) {
    const error = new Error('Excel schema 不匹配：请使用系统导出或按固定 schema 生成的文件');
    error.statusCode = 400;
    error.issues = validation.issues;
    throw error;
  }

  const sheetNameMap = toSheetNameMap(workbook);
  const getRowsByExpectedSheet = (expectedSheetName) => {
    const resolvedName = sheetNameMap[expectedSheetName.toLowerCase()];
    const worksheet = workbook.Sheets[resolvedName];
    return XLSX.utils.sheet_to_json(worksheet, { defval: null });
  };

  const rows = getRowsByExpectedSheet('Artifacts');
  if (!rows.length) {
    const error = new Error('Artifacts sheet 为空或无法解析');
    error.statusCode = 400;
    throw error;
  }
```

省略：backend/src/services/excel-kg.service.js（第471-486行）

代码节选：backend/src/services/excel-kg.service.js（第487-508行）

```js
  const normalizedStrategy = String(strategy || '').trim().toLowerCase();
  if (!['append', 'overwrite'].includes(normalizedStrategy)) {
    const error = new Error('strategy 无效，应为 append 或 overwrite');
    error.statusCode = 400;
    throw error;
  }

  const connection = await mysqlPool.getConnection();
  let transactionStarted = false;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    await ensureArtifactsTable(connection);
    await connection.beginTransaction();
    transactionStarted = true;

    if (normalizedStrategy === 'overwrite') {
      await connection.query('DELETE FROM artifacts');
      await connection.query('ALTER TABLE artifacts AUTO_INCREMENT = 1');
    }
```

省略：backend/src/services/excel-kg.service.js（第509-653行）

### 4. 知识图谱（Neo4j + D3-force）：结构化关系表达与可视化交互

表格能展示属性，但难以表达“文物—类别—年代”的多对多关系。我将关系建模为图：文物节点（Artifact）、类别节点（Category）、年代节点（Era），并通过关系边把多对多结构显式化。

本项目中 **Neo4j 的数据侧接口已完成**：后端对查询结果做裁剪，统一返回 `nodes/edges` 给前端渲染。

代码节选：backend/src/routes/graph.routes.js（第200-223行）

```js
    // 过滤掉指向被裁剪节点的边
    const keptEdges = allEdges.filter(e => keptIds.has(e.source) && keptIds.has(e.target));

    return res.status(200).json({
      nodes: keptNodes,
      edges: keptEdges
    });
```

前端通过图谱服务拉取数据并进入可视化页面。

代码节选：frontend/src/services/graph.service.js（第1-15行）

```js
import axios from 'axios';

const API_URL = '/api/graph/';

export const getGraphData = async (keyword = '', limit = 200) => {
  return axios.get(API_URL + 'artifacts', {
    params: { keyword, limit }
  });
};
```

知识图谱的重点实现落在前端：使用 **D3-force 力导向布局**，对 `nodes/edges` 进行布局计算，并配套缩放/拖拽/钉住等交互。

代码节选：frontend/src/pages/KnowledgeGraph.js（第488-556行）

```js
  // D3力导向图初始化和更新
  useEffect(() => {
    if (!svgRef.current || displayedGraphData.nodes.length === 0) {
      return;
    }

    const width = 1000;
    const height = graphHeight || 600;
    
    // 清空之前的内容
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // 添加缩放功能
    const g = svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .wheelDelta((event) => {
        const modeScale = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 800 : 1);
        return (-event.deltaY * modeScale) / 1500;
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    // 准备数据
    const nodes = displayedGraphData.nodes.map(d => {
      const node = { ...d, x: width / 2, y: height / 2 };
      const id = String(node.id);
      const pinned = pinnedPositionsRef.current.get(id);
      if (pinned && Number.isFinite(pinned.x) && Number.isFinite(pinned.y)) {
        node.fx = pinned.x;
        node.fy = pinned.y;
      }
      return node;
    });
    const links = displayedGraphData.edges.map(d => ({ ...d }));

    // 创建力模拟
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(forceSettings.linkDistance)
        .strength(forceSettings.linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(forceSettings.chargeStrength)
        .distanceMax(forceSettings.chargeDistanceMax))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(forceSettings.centerStrength))
      .force('collision', d3.forceCollide().radius(forceSettings.collisionRadius))
      .force('x', d3.forceX(width / 2).strength(forceSettings.xStrength))
      .force('y', d3.forceY(height / 2).strength(forceSettings.yStrength))
      .alphaDecay(forceSettings.alphaDecay)
      .velocityDecay(forceSettings.velocityDecay);
```

为保证交互体验，图谱支持拖拽节点，并通过 Shift+拖拽将节点“钉住”（固定 `fx/fy`），从而在解释关系链路时保持布局稳定。

代码节选：frontend/src/pages/KnowledgeGraph.js（第722-772行）

```js
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.1).restart();
          d.__dragMoved = false;
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.__dragMoved = true;
          d.fx = event.x;
          d.fy = event.y;

          // 若已钉住，则实时更新固定位置
          const id = String(d.id);
          if (pinnedNodeIdsRef.current.has(id)) {
            pinnedPositionsRef.current.set(id, { x: d.fx, y: d.fy });
          }
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          const id = String(d.id);
          const pinnedSet = pinnedNodeIdsRef.current;

          // Shift+拖拽：松手时钉住（或更新钉住位置）；取消钉住请用 Shift+单击
          const shiftPressed = Boolean((event?.sourceEvent && event.sourceEvent.shiftKey) || event?.shiftKey);
          if (shiftPressed && d.__dragMoved) {
            pinnedSet.add(id);
            pinnedPositionsRef.current.set(id, { x: d.fx, y: d.fy });
            setPinnedCount(pinnedSet.size);
            updatePinnedStyles();
            return;
          }

          // 默认：拖拽松手释放（除非已钉住）
          if (!pinnedSet.has(id)) {
            d.fx = null;
            d.fy = null;
          } else {
            pinnedPositionsRef.current.set(id, { x: d.fx, y: d.fy });
          }
        }));
```

后端未实现“跳转到指定节点”的定位参数：后端只返回 `nodes/edges`，图谱页的 focus 节点由前端根据返回节点集合自行选取，并通过 `sessionStorage` 传递给图谱页面。

代码节选：frontend/src/pages/Chat.js（第198-234行）

```js
  const openGraphFromMessage = (message) => {
    try {
      if (message?.data) {
        sessionStorage.setItem('chatGraphData', JSON.stringify(message.data));

        const focusId =
          message.data.nodes?.find(n => n.type === 'artifact')?.id ||
          message.data.nodes?.[0]?.id ||
          null;
        if (focusId) {
          sessionStorage.setItem('chatGraphFocusNodeId', String(focusId));
        }

        const MAX_HIGHLIGHTS = 20;
        const artifactIds = (message.data.nodes || [])
          .filter(n => n && n.type === 'artifact' && n.id != null)
          .map(n => String(n.id));
        const highlightIds = (artifactIds.length > 0 ? artifactIds : (focusId ? [String(focusId)] : []))
          .filter(Boolean)
          .slice(0, MAX_HIGHLIGHTS);
        if (highlightIds.length > 0) {
          sessionStorage.setItem('chatGraphHighlightNodeIds', JSON.stringify(highlightIds));
        } else {
          sessionStorage.removeItem('chatGraphHighlightNodeIds');
        }
      }
    } catch (e) {
      // ignore
    }
    navigate('/knowledge-graph?from=chat');
  };
```

问答模块在检索阶段会将问题拆成多个关键词，逐个检索并合并去重后的图谱节点与关系。

代码节选：backend/src/routes/chat.routes.js（第537-559行）

```js
    } else {
      // 通用检索：将问题拆成多个关键词，分别检索并汇总结果
      const extraction = extractKeywordsService(question, {
        maxKeywords: 4,
        keepIntent: true,
        debug: process.env.DEBUG_KEYWORDS === 'true',
        logSource: 'graph'
      });
      const keywords = extraction.keywords || [];
      if (keywords.length === 0) return null;

      cypherQuery = `
        MATCH (a:Artifact)
        WHERE a.name CONTAINS $keyword OR a.description CONTAINS $keyword
        OPTIONAL MATCH (a)-[r]-(n)
        RETURN a, r, n LIMIT 10
      `;

      responseText = `以下是与"${keywords.join('、')}"相关的文物信息，您可以在图谱中探索它们的关系。`;

      // 逐关键词查询并合并结果（去重）
      const nodes = new Set();
      const edges = new Set();
```

省略：backend/src/routes/chat.routes.js（第560-605行）

### 5. 智能问答：自然语言 → 分词/意图 → 结构化查询 → 生成回答

为降低普通用户的使用门槛，我实现了智能问答能力，让用户用自然语言提问即可获得系统回答。整体流程按“计算思维的抽象与分解”展开：先抽取关键词并检索知识图谱/关系库，取回结构化信息，再把检索结果作为上下文交给大模型生成最终回答。

核心思路是：

1) 对用户问题进行分词并抽取关键词（后端使用 nodejieba，即 jieba 的 Node.js 版本）
2) 在关键词抽取阶段记录疑问词类型（who/when/where/how/why/what），用于日志与调试
3) 基于关键词检索知识图谱（Neo4j）与关系型库（MySQL），得到结构化证据
4) 将结构化信息整理为“上下文”，再调用大模型生成回答并返回前端

代码节选：backend/src/services/keyword.service.js（第125-145行）

```js
function detectIntent(question) {
  const q = String(question || '');
  if (!q) return undefined;

  // 粗粒度意图分类：只在明确出现疑问词时返回
  const intentMap = [
    { intent: 'who', patterns: ['谁', '哪位'] },
    { intent: 'when', patterns: ['何时', '什么时候', '哪年', '哪一年', '年代', '朝代'] },
    { intent: 'where', patterns: ['哪里', '何处', '在哪', '地点', '出土', '发现于'] },
    { intent: 'how', patterns: ['如何', '怎么', '怎样'] },
    { intent: 'why', patterns: ['为什么', '为何'] },
    { intent: 'what', patterns: ['什么', '是啥', '是什么'] }
  ];

  for (const item of intentMap) {
    if (item.patterns.some(p => q.includes(p))) return item.intent;
  }

  return undefined;
}
```

省略：backend/src/services/keyword.service.js（第118-124行）

代码节选：backend/src/services/keyword.service.js（第184-219行）

```js
function extractKeywords(text, options = {}) {
  const {
    keepIntent = true,
    debug = false,
    maxKeywords = DEFAULT_MAX_KEYWORDS,
    phraseMergeMode = process.env.PHRASE_MERGE_MODE || 'conservative',
    logSource,
    requestId
  } = options;

  const startedAt = Date.now();
  const raw = String(text || '').trim();
  if (!raw) {
    return { keywords: [], intent: keepIntent ? detectIntent(raw) : undefined, rawTokens: [], debug: debug ? { reason: 'empty' } : undefined };
  }

  loadJiebaOnce();
  const stopwords = loadStopwords();
  const phraseSet = loadPhraseDictionary();
  const quoted = extractQuotedPhrases(raw);

  let tokens = [];
  let tokenizer = 'nodejieba';

  try {
    const normalized = normalizeText(raw);
    if (!normalized) {
      tokens = [];
    } else {
      tokens = nodejieba.cut(normalized, true);
    }
  } catch {
    tokenizer = 'fallback';
    tokens = fallbackTokenize(raw);
  }
```

代码节选：backend/src/services/keyword.service.js（第220-250行）

```js
  // 额外合并：仅在 max-match 时做 token 级合并
  const mergeMode = phraseMergeMode === 'max-match' ? 'max-match' : 'conservative';
  if (mergeMode === 'max-match') {
    tokens = maxMatchMerge(tokens, phraseSet);
  }

  // 过滤：停用词、长度、标点
  const filtered = tokens
    .map(t => String(t).trim())
    .filter(Boolean)
    .filter(t => !stopwords.has(t))
    .filter(t => t.length <= 30);

  // candidates = quoted 优先 + filtered
  const candidates = [...quoted, ...filtered];

  // 去重保序，并默认过滤 1 字（除 quoted 中 CJK 单字）
  const seen = new Set();
  const keywords = [];
  for (const t of candidates) {
    if (!t) continue;
    const isQuoted = quoted.includes(t);
    if (t.length === 1 && !(isQuoted && isCjkSingleChar(t))) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    keywords.push(t);
    if (keywords.length >= Number(maxKeywords) || keywords.length >= DEFAULT_MAX_KEYWORDS) break;
  }

  const intent = keepIntent ? detectIntent(raw) : undefined;
```

省略：backend/src/services/keyword.service.js（第251-278行）

代码节选：backend/src/services/keyword.service.js（第279-286行）

```js
  return {
    keywords,
    intent,
    rawTokens: debug ? tokens : undefined,
    debug: debugObj
  };
}
```

代码节选：backend/src/routes/chat.routes.js（第100-106行）

```js
    const graphResponse = await handleGraphQueries(question);
    // 尝试获取关系型数据库数据
    const relationalData = await handleRelationalQueries(question);

    let context = '';
    let graphData = null;
    let sources = [];
```

省略：backend/src/routes/chat.routes.js（第107-119行）

代码节选：backend/src/routes/chat.routes.js（第120-127行）

```js
        const entities = nodes.map(n => `${n.label}(${n.type})`).join('、');
        const relations = edges.map(e => {
          const source = nodeMap[e.source] || '未知';
          const target = nodeMap[e.target] || '未知';
          return `${source} ${e.label} ${target}`;
        }).join('；');
        
        context += `【知识图谱信息】：\n实体：${entities}\n关系：${relations}\n参考说明：${graphResponse.text}\n\n`;
```

省略：backend/src/routes/chat.routes.js（第128-130行）

代码节选：backend/src/routes/chat.routes.js（第131-134行）

```js
    if (relationalData) {
      sources.push('relational_db');
      context += `【文物档案信息】：\n${relationalData}\n\n`;
    }
```

代码节选：backend/src/routes/chat.routes.js（第136-138行）

```js
    if (sources.length > 0) {
      context += `【检索提示】：本次已从 ${sources.join('、')} 检索到相关信息。请务必基于以上检索内容作答，不要回答“未在数据中找到相关信息”。如信息不足，请明确说明不足之处。\n\n`;
    }
```

省略：backend/src/routes/chat.routes.js（第139-150行）

代码节选：backend/src/services/mcp.service.js（第90-102行）

```js
      const messages = [];

      // 添加系统提示词和上下文
      messages.push({
        role: 'system',
        content: this.buildSystemPrompt(context)
      });

      // 添加历史记录
      messages.push(...history);

      // 添加当前问题
      messages.push({ role: 'user', content: question });
```

代码节选：backend/src/services/mcp.service.js（第104-116行）

```js
      // 构建请求体
      const requestBody = {
        model: this.model,
        messages: messages,
        temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.2,
        max_tokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1200
      };

      // 发送请求到MCP API
      const response = await axios.post(this.apiEndpoint, requestBody, {
        headers: this.headers,
        timeout: 30000 // 30秒超时
      });
```

省略：backend/src/services/mcp.service.js（第117-125行）

前端提供 Chat 页面交互，并用 Redis 保存 7 天内聊天记录。针对“中文分词与关键词抽取”的效果问题，我维护自定义词典与停用词表，提升检索命中率。

**对话展示截图（占位）**

![智能问答对话截图（请替换为你的图片路径）](./images/chat-demo.png)

### 6. 附件与调试：统一文件管理流程与权限控制

实训1阶段文件上传下载缺少规范，难以追踪与管理。为支撑 Excel 导入/导出、系统附件沉淀与运维排查，我实现统一的附件管理能力：分页查询、上传、下载、删除，并将敏感操作（上传、删除、系统导入）限制为管理员。

省略：backend/src/routes/attachment.routes.js（第1-18行）

代码节选：backend/src/routes/attachment.routes.js（第19-23行）

```js
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const RESOLVED_UPLOAD_DIR = path.resolve(UPLOAD_DIR);
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 20);
const MAX_UPLOAD_SIZE_BYTES = Math.max(1, MAX_UPLOAD_SIZE_MB) * 1024 * 1024;
```

代码节选：backend/src/routes/attachment.routes.js（第24-39行）

```js
const ensureUploadDir = async () => {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir()
      .then(() => cb(null, UPLOAD_DIR))
      .catch((error) => cb(error));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 20);
    const random = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}_${random}${ext}`);
  }
});
```

代码节选：backend/src/routes/attachment.routes.js（第41-48行）

```js
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  }
});

const isAdmin = (req) => req.user && req.user.role === 'admin';
```

省略：backend/src/routes/attachment.routes.js（第49-60行）

代码节选：backend/src/routes/attachment.routes.js（第157-166行）

```js
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: '权限不足：仅管理员可上传附件' });
    }

    if (!req.file) {
      return res.status(400).json({ message: '未找到上传文件' });
    }
```

省略：backend/src/routes/attachment.routes.js（第167-178行）

代码节选：backend/src/routes/attachment.routes.js（第179-189行）

```js
    // 统一走附件处理逻辑（hash/缩略图/去重）
    const result = await attachmentService.ingestLocalFile({
      uploadedBy: req.user.id,
      ownerType,
      ownerId,
      filePath: req.file.path,
      originalName: normalizeOriginalName(req.file.originalname),
      mimeType: req.file.mimetype || 'application/octet-stream'
    });

    const attachmentId = result.id;
```

省略：backend/src/routes/attachment.routes.js（第190-203行）

代码节选：backend/src/routes/attachment.routes.js（第204-213行）

```js
    return res.status(201).json({
      id: attachmentId,
      ownerType,
      ownerId,
      originalName: normalizeOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      createdAt: new Date().toISOString(),
      downloadUrl: `/api/attachments/${attachmentId}/download`
    });
```

省略：backend/src/routes/attachment.routes.js（第214-223行）

## 结语

总体来看，实训2阶段我围绕“安全不足、查询低效、数据匮乏、管理不规范”四类问题展开：先补齐安全与权限，再提升检索与批量能力，随后引入知识图谱表达关系，最后用智能问答降低使用门槛，并通过真实数据补全业务闭环。

通过本阶段实训，我对计算思维中“问题拆解—抽象建模—迭代验证”的方法有了更深体会：将复杂系统拆成可验证的小目标，逐个实现并回归测试，最终整合成稳定可用的产品。

参考：具体实现可查看仓库中 `backend/src`、`frontend/src` 与 `build_kg/` 目录下的对应文件，以及 `specs/main/` 中的相关文档。
