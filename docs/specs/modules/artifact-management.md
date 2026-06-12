# 文物管理模块规格说明

> 最后更新：2026-04-17
> 当前实现状态：**核心 CRUD 已完成，搜索筛选已实现，related_artifacts 字段已添加**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 文物列表 | ✅ 已实现 | 分页、搜索、筛选、排序 |
| 文物详情 | ✅ 已实现 | 全字段展示 + 图片 |
| 文物创建 | ✅ 已实现 | 表单提交 |
| 文物更新 | ✅ 已实现 | 编辑表单 |
| 文物删除 | ✅ 已实现 | 删除确认 |
| 新字段展示 | ✅ 已实现 | material、museum、dimensions 在详情页显示 |
| 全文搜索 | ⚠️ 使用 ILIKE | 未使用 FTS5，性能受限 |

---

## 1. 需求概述

文物管理是系统的基础模块，提供文物数据的 CRUD 操作和检索能力。

### 1.1 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| 文物列表 | `/artifacts` | 搜索、筛选、分页列表 |
| 文物详情 | `/artifacts/:id` | 元数据 + 图片 + 图像修复入口 |

### 1.2 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 文物搜索 | 关键词搜索（name、description） | P0 |
| 字段筛选 | 按 era、category、location 筛选 | P0 |
| 分页展示 | 每页 10-50 条，支持页码切换 | P0 |
| 详情查看 | 展示全部字段和图片 | P0 |
| CRUD 操作 | 创建、更新、删除 | P0 |

---

## 2. API 接口

### 2.1 端点列表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/artifacts` | GET | 文物列表（分页+搜索+筛选） |
| `/api/artifacts` | POST | 创建文物 |
| `/api/artifacts/:id` | GET | 文物详情 |
| `/api/artifacts/:id` | PUT | 更新文物 |
| `/api/artifacts/:id` | DELETE | 删除文物 |

### 2.2 列表接口参数

```
GET /api/artifacts
  ?page=1              # 页码，默认 1
  &page_size=10        # 每页数量，默认 10
  &keyword=青铜        # 搜索关键词
  &era=商              # 年代筛选
  &category=青铜器     # 类别筛选
  &location=河南       # 出土地点筛选
  &sort_by=name        # 排序字段
  &sort_order=asc      # 排序方向
```

### 2.3 搜索实现

当前使用 SQLAlchemy ILIKE 模糊匹配 `name`、`description`、`tags` 字段。

> **已知限制**：未使用 SQLite FTS5 全文检索，大数据量时性能可能下降。

---

## 3. 前端实现

### 3.1 文物列表页

**位置**：`frontend/src/pages/Artifacts.tsx`

- Ant Design `Table` — 分页列表
- `Input.Search` — 搜索栏
- `Select` 筛选器 — era、category、location 下拉选择
- `Button` 操作栏 — 新建、编辑、删除
- 点击行跳转详情页

### 3.2 文物详情页

**位置**：`frontend/src/pages/ArtifactDetail.tsx`

- Ant Design `Descriptions` — 元数据展示
- `Image` 组件 — 图片预览
- `Button` 操作栏 — 编辑、删除、图像修复入口
- 新字段显示：material（材质）、museum（馆藏）、dimensions（尺寸）

### 3.3 API 调用层

**位置**：`frontend/src/api/artifacts.ts`

接口：`getArtifacts`、`getArtifactById`、`createArtifact`、`updateArtifact`、`deleteArtifact`。

---

## 4. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| SEARCH-1 | 未使用 FTS5 全文检索 | [实现] | P2 | 当前使用 ILIKE，大数据量性能受限。SQLite FTS5 可提供更快的全文搜索。 |
| DATA-1 | Description 覆盖率 ~73% | [data-quality-report] | P2 | 约 27% 条目缺少完整描述文本 |
| DATA-2 | image_url 可能是占位图 | [data-quality-report] | P2 | Wikipedia URL 可能指向占位图片 |
| UX-1 | 新建文物表单无校验 | [设计] | P3 | 未实现必填字段校验和格式校验 |

---

## 5. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 列表分页 | 正常分页切换 | ✅ 已实现 |
| 关键词搜索 | 匹配 name/description/tags | ✅ 已实现（ILIKE） |
| 筛选器 | era/category/location 联动 | ✅ 已实现 |
| 详情页 | 展示全部 14 字段 | ✅ 已实现 |
| CRUD 操作 | 创建/更新/删除正常 | ✅ 已实现 |
| 图片显示 | 正常预览 | ⚠️ 部分 URL 为占位图 |

---

## 6. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/models/artifact.py` | 数据模型 |
| `backend/app/schemas/artifact.py` | Pydantic schema |
| `backend/app/services/artifact.py` | CRUD 业务逻辑 |
| `backend/app/routers/artifacts.py` | API 路由 |
| `frontend/src/pages/Artifacts.tsx` | 文物列表页 |
| `frontend/src/pages/ArtifactDetail.tsx` | 文物详情页 |
| `frontend/src/api/artifacts.ts` | API 调用层 |

---

*最后更新：2026-04-18*
