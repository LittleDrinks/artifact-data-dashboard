# Dashboard 统计模块规格说明

> 最后更新：2026-04-16
> 当前实现状态：**核心统计功能已完成，词云效果待优化**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 统计卡片 | ✅ 已实现 | 文物总数、分类统计 |
| 按年代柱状图 | ✅ 已实现 | Ant Design Bar |
| 按类别饼图 | ✅ 已实现 | Ant Design Pie |
| 词云展示 | ⚠️ 已实现 | 使用 HTML span flex 布局，非传统词云效果 |
| 按地点统计 | ✅ 已实现 | API 已提供，前端可选展示 |

---

## 1. 需求概述

Dashboard 是系统的首页入口，展示文物数据的统计概览，为用户提供数据全貌的直观视图。

### 1.1 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| Dashboard | `/` | 统计卡片 + 柱状图 + 饼图 + 词云 |

### 1.2 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 统计概览 | 文物总数、分类统计 | P0 |
| 年代分布 | 柱状图展示各朝代文物数量 | P0 |
| 类别分布 | 饼图展示文物类别占比 | P0 |
| 词云展示 | 基于文物描述的词云 | P1 |

---

## 2. API 接口

### 2.1 端点列表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/stats/overview` | GET | 统计概览（总数、分类统计） |
| `/api/stats/by-era` | GET | 按朝代统计文物数量 |
| `/api/stats/by-category` | GET | 按类别统计文物数量 |
| `/api/stats/by-location` | GET | 按出土地点统计 |
| `/api/stats/wordcloud` | GET | 词云数据（jieba 分词） |

### 2.2 响应格式

**Overview**：
```json
{
  "total_artifacts": 771,
  "categories": [
    {"category": "青铜器", "count": 100},
    {"category": "陶瓷", "count": 50}
  ]
}
```

**by-era**：
```json
[
  {"era": "商", "count": 50},
  {"era": "唐", "count": 30},
  {"era": "宋", "count": 40}
]
```

**wordcloud**：
```json
[
  {"word": "青铜", "frequency": 100},
  {"word": "纹饰", "frequency": 80}
]
```

---

## 3. 前端实现

### 3.1 页面组件

**位置**：`frontend/src/pages/Dashboard.tsx`

布局：
- 顶部：统计卡片（Row + Col）
- 中部：柱状图（年代分布）
- 下部：饼图（类别分布）+ 词云

### 3.2 统计卡片

使用 Ant Design `Statistic` 或自定义卡片：
- 文物总数
- 类别数量
- 年代数量

### 3.3 柱状图（年代分布）

使用 Ant Design `Bar` 图表：
- X 轴：朝代名称
- Y 轴：文物数量
- 颜色：主色 #533afd

### 3.4 饼图（类别分布）

使用 Ant Design `Pie` 图表：
- 展示各类别占比
- 颜色方案：Ant Design 默认色系

### 3.5 词云实现

**位置**：`frontend/src/pages/Dashboard.tsx:345-406`

当前实现：
```tsx
// 使用 HTML span + flex 布局
<span style={{
  fontSize: fontSize,
  fontWeight: fontWeight,
  margin: '4px',
}}>
  {word}
</span>
```

> **已知问题**：排列是顺序的，不是传统词云的密集/交错排列。

---

## 4. 词云数据生成

### 4.1 后端实现

**位置**：`backend/app/services/stats.py`

```python
def get_wordcloud_data(db: Session, limit: int = 100):
    """使用 jieba 分词统计词频。"""
    # 合并所有文物描述
    # jieba 分词
    # 统计词频，返回 top N
```

### 4.2 分词策略

- 使用 jieba TF-IDF 提取关键词
- 过滤停用词（需要优化）

---

## 5. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| WORDCLOUD-1 | 词云含垃圾词 | [设计] | P2 | 停用词未过滤完全，如"一种"、"位于"、"称为"、"可能"等高频无意义词 |
| WORDCLOUD-2 | 词云非传统效果 | [review-round-1 P2-5] | P2 | 使用 HTML span flex 布局，排列顺序，不是传统密集词云。建议使用 `react-wordcloud` 或 `d3-cloud`。 |
| CHART-1 | 朝代柱状图排序不按时间 | [设计] | ✅ 已修复 | 已在 `Dashboard.tsx:129-152, 158-168` 实现 `ERA_ORDER` 历史排序，柱状图按朝代时间顺序展示 |
| UX-1 | 无"最近活动表" | [PRD] | P3 | PRD 要求展示最近操作记录，当前未实现 |

---

## 6. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 统计卡片 | 显示总数和分类统计 | ✅ 已实现 |
| 年代柱状图 | 各朝代数量分布 | ✅ 已实现 |
| 类别饼图 | 类别占比展示 | ✅ 已实现 |
| 词云 | 基于描述的分词统计 | ⚠️ 效果待优化 |
| API 响应 | < 500ms | ✅ 统计聚合高效 |

---

## 7. 设计系统遵循

Dashboard 遵循 Stripe 风格设计系统：
- 白色背景 #ffffff
- 深色标题 #061b31
- 紫色主色 #533afd
- 卡片阴影和圆角

---

## 8. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/services/stats.py` | 统计数据计算 |
| `backend/app/routers/stats.py` | API 路由 |
| `frontend/src/pages/Dashboard.tsx` | 页面组件 |
| `frontend/src/api/stats.ts` | API 调用 |

---

*最后更新：2026-04-16*