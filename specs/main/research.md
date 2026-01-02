# Research: Artifact Data Dashboard v1.0.0

## Decisions & Rationale

### 1. 范围收敛（Scope Reduction）
- **Decision**: 将 "Predictive Model" 从 v1 范围中移除。
- **Rationale**: 优先稳定核心功能（Knowledge Graph、Chat）；预测相关需求较模糊。
- **Alternatives**: 保留为实验功能（为避免 scope creep 而拒绝）。

### 2. 用户权限（User Permissions）
- **Decision**: 仅 Admin 允许 CUD（Create/Update/Delete），普通 User 仅只读。
- **Rationale**: 确保数据的完整性与权威性。
- **Alternatives**: 允许所有用户编辑（出于数据质量风险而拒绝）。

### 3. 知识图谱性能（Knowledge Graph Performance）
- **Decision**: 初次加载图谱限制为 Top 100 nodes。
- **Rationale**: 避免大数据量（上千节点）导致浏览器卡顿。
- **Alternatives**: 加载全部节点（性能风险过高而拒绝）。

### 4. Chat 历史存储（Chat History Storage）
- **Decision**: 混合存储：metadata 放 MySQL，完整内容放 Redis（7-day TTL）。
- **Rationale**: 兼顾隐私与存储成本；v1 不需要长期保存全部历史。
- **Alternatives**: 全量持久化到 MySQL（基于隐私/存储原因拒绝）。

### 5. 语言支持（Language Support）
- **Decision**: v1 仅支持中文（Chinese only）。
- **Rationale**: 项目数据与目标用户以中文为主。
- **Alternatives**: 多语言（为降低 v1 复杂度而拒绝）。

### 6. 数据导入校验（Data Import Validation）
- **Decision**: 强制 Excel schema 严格匹配 `debug.routes.js`。
- **Rationale**: 保证批量导入与手工录入的一致性。
- **Alternatives**: 宽松的 CSV 导入（出于数据一致性/完整性而拒绝）。

## Unknowns & Clarifications
- **Resolved**: 主要范围与架构问题已在 2026-01-02 的澄清会上确认。
