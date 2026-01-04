# Implementation Plan — 知识图谱节点高亮（kg-node-highlight）

概要
- 作者: Copilot
- 目标: 在前端图谱中实现多节点高亮（放大 + 荧光色 + 其它节点灰化缩小），并将 LLM 问答与图谱搜索结果以高亮节点集合形式呈现。
- 约束: 以现有前端画布组件为基础（单视图），不改后端问答算法（如需持久化/跨设备须另行评估）。

交付物
- `data-model.md`（高亮集合与事件契约）
- `/contracts/highlight-api.yaml`（前端-后端/持久化契约，若需要）
- 前端实现：`HighlightManager`（逻辑）、样式/主题、UI 控件（清除/保存/样式切换）
- 集成代码：接收 LLM/search 输出并调用 `setHighlight(ids, source)`
- 测试：单元测试、集成测试、性能测试脚本
- 文档：`quickstart.md`、实现说明

时间估计（粗略）
- Phase 0 研究：1-2 天
- Phase 1 设计 & 合同：1-2 天
- Phase 2 实现（前端 + 集成 + 测试）：3-7 天
- 总计：约 1–2 周（单人）

阶段与任务

Phase 0 — 研究与确认（输出: `research.md`）
1. 确认现有前端画布库（d3/cytoscape/visx/其他）与节点渲染管线：读取 `frontend/src` 中图谱相关代码，记录可插入点。
2. 确认性能基线：在本地画布上测量节点数量与渲染延迟的关系，定义性能阈值（例如 200ms 响应）。
3. 可访问性方法：调查色盲/弱视替代方案和动画禁用模式的最佳实践。

Phase 1 — 设计与契约（输出: `data-model.md`, `/contracts/*`, `quickstart.md`）
1. 定义 `HighlightSet` 数据模型：
   - 字段: ids: string[], source: string, timestamp, priorityMap?: {id: score}
   - 事件: `HighlightEvent`（source, ids, userId?, persistentFlag）
2. 设计前端 API（示例）:
   - `setHighlight(ids: string[], options?: {source?:string, focus?:boolean, save?:boolean})`
   - `clearHighlight(ids?: string[])`
   - `clearAllHighlights()`
   - `onHighlightChange(callback)`
3. 设计 UI 控件：
   - 全局工具栏按钮：`清除全部高亮`、`保存当前高亮（本地）`、`样式切换（荧光/边框/图标）`
   - 结果列表与侧栏联动高亮（列表 hover/点击触发画布高亮）
4. 定义性能策略：默认上限 20（configurable），超出按相关度/优先级截断并提示用户。
5. 生成契约草案：`/contracts/highlight-api.yaml`（若需后端保存/分享），包含 PUT/POST 获取/保存高亮集合接口。

Phase 2 — 实现与集成（输出: 代码 + 测试）
1. 新增 `HighlightManager` 模块（前端）：
   - 负责维护 `HighlightSet`、触发画布刷新、提供 API 给其它模块调用。
   - 提供 debounce/throttle 以保证高频调用时的稳定性。
2. 在渲染管线中增加视觉状态映射：
   - 节点渲染根据状态（default/highlighted/focused/disabled）调整 scale、fill、stroke、opacity。
   - 在设置中支持 `reduced-motion` 快速切换（无动画）。
3. 样式与主题：
   - 默认荧光色 `#FFEA00`，发光效果用 CSS/SVG filter 或 canvas glow 技术实现（依渲染库而定）。
   - 提供 color-blind 友好替代（图标、形状或笔触）；把配色放入主题变量。
4. UI 控件实现：工具栏按钮、右侧结果列表联动、保存/清除功能。
5. 集成 LLM/search：
   - 在问答结果处理路径中调用 `setHighlight(resultIds, {source:'llm'})`
   - 在搜索结果点击触发 `setHighlight(searchIds, {source:'search'})`
6. 测试与性能调优：
   - 单元测试 `HighlightManager`（状态变更、事件触发）
   - 集成测试（search/llm -> 高亮 -> UI 可见）
   - 性能测试：在 N=1/10/50/100 节点高亮场景下测量帧率与响应时延，调整上限或视觉特效降级策略。

验收测试（从 spec 继承）
- AT1/AT2/AT3（见 spec.md）必须全部通过。
- 性能门槛：结果集合 ≤ 20 时，视觉响应 < 200ms。

风险与缓解
- 风险：大量同时高亮导致重绘/回流，影响帧率。
  - 缓解：限制默认高亮数量、使用 GPU 加速（WebGL）、在高负载下禁用发光效果。
- 风险：色彩对比不足影响可访问性。
  - 缓解：提供图标替代/高对比主题选项、在设置里提供“无动画/高对比/色盲”切换。

后续动作（建议顺序）
1. 我可以先定位前端画布实现点并生成 `data-model.md` 与 contracts 草案（Phase0->Phase1 的开始任务）。
2. 您确认优先级与是否需要我创建 feature 分支并开始实现（我可以执行创建分支命令）。

文件位置
- 规范: `specs/1-kg-node-highlight/spec.md`
- 检查表: `specs/1-kg-node-highlight/checklists/requirements.md`
- 本计划: `specs/1-kg-node-highlight/impl_plan.md`

完成时间: 预计 1–2 周（单人，含测试与文档）
