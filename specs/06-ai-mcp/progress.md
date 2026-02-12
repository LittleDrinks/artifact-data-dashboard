# AI 与 MCP - 实现进度

## AI 功能实现状态

### ✅ 已实现

| 功能 | 实现状态 | 关键文件 | 备注 |
|------|----------|----------|------|
| AI 三级模式（云端/本地/模拟） | ✅ 完成 | `backend/src/services/ai/` | 自动降级逻辑 |
| MCP 工具注册框架 | ✅ 完成 | `backend/src/services/tools/` | 6 个工具 |
| 流式响应（SSE） | ✅ 完成 | `backend/src/routes/chat.routes.js` | 打字机效果 |
| 工具调用执行 | ✅ 完成 | `backend/src/services/mcp.service.js` | - |
| Cypher 安全规则 | ✅ 完成 | `backend/config/cypher-rules.js` | 黑白名单 |
| 健康检查 | ✅ 完成 | `backend/src/services/ai/health-check.js` | 30秒间隔 |

### 🚧 部分实现

| 功能 | 状态 | 问题 | 计划 |
|------|------|------|------|
| **AI 配置面板** | 🚧 **未开始** | 用户无法在界面切换模型、模式、工具开关 | v0.6（最高优先级） |
| 问答模式区分 | 🚧 只有通用模式 | 缺少图谱模式、知识模式的系统提示词区分 | v0.6 |
| 工具动态启用/禁用 | 🚧 硬编码 | 工具列表固定，未根据用户配置动态调整 | v0.6 |
| 会话级配置存储 | 🚧 未实现 | 用户配置只在内存，刷新丢失 | v0.6 |

### ❌ 未实现

| 功能 | 优先级 | 计划版本 |
|------|--------|----------|
| 图谱数据支撑通用知识（知识模式） | 🔴 高 | v0.6 |
| 严格图谱模式（强制工具调用） | 🔴 高 | v0.6 |
| 工具调用结果可视化 | 🟡 中 | v0.7 |
| 多轮对话上下文优化 | 🟡 中 | v0.7 |

---

## 工具实现清单

| 工具名 | 状态 | 所在文件 | 说明 |
|--------|------|----------|------|
| `query_graph` | ✅ 完成 | `tools/query-graph.tool.js` | 查询知识图谱 |
| `search_artifacts` | ✅ 完成 | `tools/search-artifacts.tool.js` | 搜索文物 |
| `get_artifact_detail` | ✅ 完成 | `tools/artifact-detail.tool.js` | 获取文物详情 |
| `search_documents` | ✅ 完成 | `tools/search-documents.tool.js` | 搜索文献 |
| `create_entity` | ⏸️ 暂停 | - | 待权限细化后开放 |
| `create_relation` | ⏸️ 暂停 | - | 待权限细化后开放 |
| `data_analysis` | ❌ 未开始 | - | v0.7 规划 |
| `inpaint_image` | 📝 规划中 | - | 图像修复 MCP 工具 |

---

## 前端界面进度

### AI 配置面板（聊天界面）

**设计稿**：
```
┌─────────────────────────────────────────────────────────────┐
│  AI 配置面板（可折叠）                                       │
├─────────────────────────────────────────────────────────────┤
│  模型: [云端 ▼]  [锁定] 健康: ●                              │
│  模式: ○ 图谱  ● 知识  ○ 通用                                │
│  工具: ☑图谱 ☑搜索 ☐分析                                     │
└─────────────────────────────────────────────────────────────┘
```

**实现状态**：
- [ ] 模型选择下拉框（云端/本地/模拟）
- [ ] 锁定按钮（无视自动降级）
- [ ] 模式单选组（图谱/知识/通用）
- [ ] 工具开关组（可勾选启用/禁用）
- [ ] 配置变更实时生效
- [ ] 配置持久化（Redis 存储）

**优先级**：🔴 **最高**

---

## 用户自定义 API 配置

**文档**：[08-external-apis/user-api-config.md](../08-external-apis/user-api-config.md)

**规格**：
- 支持 AI 问答（LLM）和图像修复（Inpainting）两类 API
- 支持阿里云、百度智能云、Replicate、DeepSeek、OpenAI 等服务商
- API Key 加密存储（AES-256）
- 月度预算控制
- 使用统计和审计日志

**实现状态**：
- [ ] 数据库表设计（user_api_configs, api_usage_logs）
- [ ] API Key 加密工具函数
- [ ] API CRUD 接口
- [ ] API Key 验证接口
- [ ] 前端配置管理页面
- [ ] LLM 服务接入用户配置
- [ ] 图像修复服务接入用户配置

**优先级**：🟡 中（v0.7）

---

## 已知问题

### 高优先级

#### 1. 用户无法控制 AI 行为

**现象**：AI 模型、问答模式、工具启用状态完全由系统决定，用户无控制权。

**影响**：
- 用户无法强制使用本地模型保护隐私
- 无法切换问答模式获得不同类型的回答
- 无法禁用可能不准确的工具

**解决**：实现 AI 配置面板（v0.6 最高优先级）

#### 2. 问答模式未区分

**现象**：目前只有一种通用模式，没有严格区分图谱模式、知识模式、通用模式。

**影响**：
- AI 回答质量不稳定
- 无法保证"基于图谱事实"的准确性
- 无法通过实例归纳通用知识

**解决**：
- 定义三种模式的系统提示词
- 根据用户选择切换提示词
- 图谱模式强制调用工具

### 中优先级

#### 3. 工具调用超时

**现象**：Neo4j 查询慢时，AI 等待工具结果超时。

**解决**：
```javascript
// 添加超时控制
const TOOL_TIMEOUT = 5000; // 5秒

async function executeToolWithTimeout(tool, params) {
  return Promise.race([
    tool.execute(params),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('工具执行超时')), TOOL_TIMEOUT)
    )
  ]);
}
```

#### 4. Ollama 本地模型不响应

**排查**：
```bash
# 进入容器检查
docker exec -it artifact-dashboard-ollama bash
ollama list
ollama ps
```

**常见原因**：
- 模型未下载完全
- 内存不足（8B 模型需要至少 8GB 内存）
- GPU 未正确映射（如启用 GPU）

---

## AI 问答"我不知道"排查

如果 AI 回答"我不知道"或"图谱中未找到"：

1. **检查图谱模式设置**
   - 如果开了图谱模式，必须有对应数据
   - 当前只有 2485 条文物数据，专业问题可能查不到

2. **检查工具是否启用**
   - 确认 `query_graph` 工具已启用
   - 查看后端日志确认工具是否被调用

3. **检查 Cypher 查询**
   - 在后端日志中查看实际生成的 Cypher
   - 在 Neo4j Browser 中手动执行验证

4. **检查知识图谱数据**
   ```cypher
   // 统计各类型节点数量
   MATCH (n) RETURN labels(n) as type, count(n) as count
   ```

---

## 扩展指南

### 添加新问答模式

1. 在 `backend/config/ai-plugins.json` 中添加模式配置：
```json
"modes": {
  "my_mode": {
    "systemPrompt": "你的角色和要求...",
    "requiredTools": ["tool1"],
    "temperature": 0.5
  }
}
```

2. 在前端 `ChatModeSelector` 组件中添加选项

3. 重启后端服务（配置热加载规划中）

### 添加新工具

1. 创建工具文件：
```javascript
// backend/src/services/tools/my-tool.tool.js
module.exports = {
  name: 'my_tool',
  description: '工具描述',
  parameters: { ... },
  isEnabled: (context) => true, // 动态启用条件
  async execute(params, context) { ... }
};
```

2. 注册到 `backend/src/services/tools/index.js`

3. 在 `ai-plugins.json` 中设置默认启用状态

4. 在前端工具开关组件中添加选项

---

*最后更新：2026-02-13*
*当前最高优先级：AI 配置面板*
