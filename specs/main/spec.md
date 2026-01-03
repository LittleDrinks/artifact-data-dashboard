# Specification: Artifact Data Dashboard v1.0.0

**范围说明**：本规格用于定义 v1.0.0 的业务能力边界与验收标准，面向产品/研发/测试共用。避免包含实现细节（框架、代码结构、具体库）。

## 1. 背景与目标

系统目标：提供文物（artifact）数据的检索与查看、知识图谱可视化、AI 问答，以及围绕数据导入与附件管理的基础能力。

## Clarifications

### Session 2026-01-03

- Q: 文档里是否提供“可直接运行脚本”？ → A: 不提供；文档仅提供关键函数 `derive_export_payload()` 与输入 JSON/dict 字段要求，用户在自己的脚本/Notebook 中直接复用。
- Q: AI 插件启用/禁用与配置的来源是什么？ → A: 采用后端配置文件（如 `backend/config/ai-plugins.json`），由服务启动时读取；修改后重启生效。
- Q: 附件独立管理界面的列表接口是否需要分页？ → A: 需要分页；`GET /attachments?page&limit`，默认 `limit=50`，按 `id DESC` 返回。

## 2. 角色与权限

### 2.1 角色
- `admin`：管理员
- `user`：普通用户

### 2.2 通用原则
- 所有需要鉴权的接口均基于登录态（Bearer Token）
- 写操作默认收敛为 `admin`，除非规格明确放开

## 3. 功能规格

### 3.1 附件管理（Attachment Management）

#### 3.1.1 核心能力
- 用户可以上传文件作为“附件”，并可选择关联到某个业务对象（如文物）。
- 用户可以查看与下载附件。
- 管理员可以删除附件。

#### 3.1.2 关联模型
- 附件可选地与一个“拥有者对象”关联：
  - `ownerType`: 任意字符串（不做枚举限制）
  - `ownerId`: 可为空的整数
- 典型用法：
  - 文物附件：`ownerType = "artifact"`，`ownerId = artifactId`

#### 3.1.3 权限规则（已确认）
- **读取/下载**：全体登录用户可读（list/get/download）
- **上传**：仅 `admin` 可上传
- **删除**：仅 `admin` 可删除

#### 3.1.4 UI 入口（已确认）
- 必须同时提供：
  1) 独立的“附件管理”页面：用于按条件查看附件、下载、（管理员）上传/删除。
  2) “文物详情”内的附件区：
     - 所有人可查看/下载该文物附件列表
     - 仅管理员可上传/删除该文物的附件

#### 3.1.5 需求与验收标准
- 上传附件
  - 输入：文件（必填），ownerType/ownerId（选填）
  - 行为：保存附件元数据，并返回可下载地址
  - 权限：非 admin 必须返回 403，并有清晰错误信息
- 列出附件
  - 支持分页：`page`/`limit`（默认 `limit=50`）
  - 返回按 `id DESC` 排序
  - 支持按 ownerType/ownerId 过滤
  - 权限：登录用户可用

  响应示例（200）：

  ```json
  {
    "data": [
      {
        "id": 123,
        "ownerType": "artifact",
        "ownerId": 456,
        "uploadedBy": 1,
        "originalName": "photo.png",
        "mimeType": "image/png",
        "sizeBytes": 204800,
        "createdAt": "2026-01-03T10:20:30.000Z",
        "downloadUrl": "/api/attachments/123/download"
      }
    ],
    "meta": {
      "total": 78,
      "page": 1,
      "limit": 50,
      "totalPages": 2
    }
  }
  ```
- 下载附件
  - 以文件流形式返回原始文件名
  - 权限：登录用户可用
- 删除附件
  - 行为：删除存储文件（如存在）与元数据记录
  - 权限：非 admin 必须返回 403
- 审计
  - 上传/删除附件应记录到日志（见 4.3）

#### 3.1.6 Excel 数据导入/导出（移自 System Debug）
- **目标**：提供基于 Excel 的批量数据管理能力，替代原有的调试接口。
- **导出 (Export)**：
  - 行为：生成包含当前全量数据的 Excel 文件（格式遵循 3.2 规范）。
  - 交付形式：生成的文件自动保存为“附件”，`ownerType="system_export"`，`ownerId=0`（或时间戳）。
  - 权限：仅 `admin` 可触发。
- **导入 (Import)**：
  - 前置条件：用户需先上传 Excel 文件作为附件（`ownerType="system_import"`）。
  - 行为：针对指定附件 ID 触发“执行导入”。
  - 逻辑：解析 Excel（遵循 3.2 规范），更新数据库（v1.0.0 策略：**全量覆盖** 或 **仅新增**，需在触发时指定或默认仅新增）。
  - 权限：仅 `admin` 可触发。

---

### 3.2 Excel 数据规范（原：数据流水线）

#### 3.2.1 目标
定义系统支持的标准 Excel 数据交换格式，用于：
1. 爬虫数据清洗后的输出（作为导入源）。
2. 系统数据的批量导出（作为备份或离线编辑）。
3. 系统数据的批量导入。

#### 3.2.2 输入/输出格式
- **文件格式**：`.xlsx`
- **结构**：包含固定 Sheet 与列顺序（见 3.2.3）。

#### 3.2.3 Sheet 与列定义（必须固定）
输出/输入为一个 xlsx，包含固定 sheet 与固定列顺序：

- 节点（Nodes）sheet：
  - Artifacts: `artifact_id, name, description, tags, isCataloged, isDigitized, needsRepair`
  - Categories: `name, description`
  - Eras: `name, startYear, endYear`
  - Locations: `name, region, longitude, latitude`
  - Materials: `name, description`
  - Dimensions: `label, value, unit`
  - DamageTypes: `name, severity, description`
  - RestorationMethods: `name, description`
  - ReinforcementMethods: `name, description`
  - InspectionTechniques: `name, description`
  - ProtectiveMaterials: `name, description`
  - InspectionMetrics: `name, unit, idealRange`

- 关系（Relations）sheet：
  - REL_HAS_CATEGORY: `artifact_id, category_name`
  - REL_BELONGS_TO_ERA: `artifact_id, era_name`
  - REL_STORED_AT: `artifact_id, location_name`
  - REL_MADE_OF: `artifact_id, material_name`
  - REL_HAS_DIMENSION: `artifact_id, dimension_label`
  - REL_HAS_DAMAGE: `artifact_id, damage_name`
  - REL_USES_RESTORATION: `artifact_id, restoration_name`
  - REL_USES_REINFORCEMENT: `artifact_id, reinforcement_name`
  - REL_INSPECTED_BY: `artifact_id, technique_name`
  - REL_PROTECTED_WITH: `artifact_id, protective_material_name`
  - REL_MEASURED_BY: `artifact_id, metric_name`

#### 3.2.4 值归一化规则（安全简便）
- `None/null` -> 空字符串
- `bool` -> `TRUE` / `FALSE`
- `list/tuple` -> 使用 `; ` 拼接（元素递归归一化）
- 其他 -> 转为字符串

#### 3.2.5 需求与验收标准
- 同一输入文件多次转换，输出应满足：
  - sheet 名集合不变
  - 列名与列顺序不变
  - 缺失字段以空字符串补齐
- 任何 list/tuple 字段必须按 `; ` 规则写入
- 输出 xlsx 可被后续导入流程消费（导入流程不在本条规格中定义实现，但要求格式稳定）

#### 3.2.6 可直接运行的脚本（只做导出，不做抓取）

为便于用户直接“套用并添加自己的逻辑”，文档只提供关键函数 `derive_export_payload()` 的输入规范与用法说明；不提供独立的可运行导出脚本。

依赖安装：

```bash
python -m pip install pandas openpyxl
```

输入 JSON/dict 支持两种形态（`derive_export_payload()` 会自动识别）：

1) **预制的工作簿 payload（推荐用于高级用法）**：顶层 key 直接是 sheet 名（如 `Artifacts`、`REL_HAS_CATEGORY` 等），value 是“行对象”的 list。示例结构：

```json
{
  "Artifacts": [{"artifact_id": "1", "name": "..."}],
  "Categories": [{"name": "...", "description": "..."}],
  "REL_HAS_CATEGORY": [{"artifact_id": "1", "category_name": "..."}]
}
```

2) **爬虫/原始 dict（常见）**：顶层为 `artifact_id -> payload` 的 dict。

```json
{
  "1789": {
    "name": "某文物",
    "note": "...",
    "sourceDetail": "...",
    "deptSizeInfo": "...",
    "explainTxt": "<p>...</p>",
    "categoryName": "青铜器",
    "categoryInfo": "...",
    "levelName": "一级",
    "yearInfo": "商代",
    "yearStartName": "商代",
    "yearStart": "-1600",
    "yearEnd": "-1046"
  }
}
```

当输入为第 2 种形态时，payload 里会被读取/使用的字段如下（其余字段会被忽略，不影响导出）：

- **Artifacts 行（必需/建议）**
  - `name`：文物名称（建议提供，缺失则为空字符串）
- **description 聚合字段（可选）**：按顺序拼接到 `Artifacts.description`
  - `note`
  - `sourceDetail`
  - `deptSizeInfo`
  - `explainTxt`（允许 HTML，会被简单去标签）
- **tags 字段（可选）**：写入 `Artifacts.tags`，使用 `; ` 拼接
  - `categoryName`
  - `levelName`
  - `yearInfo`
- **类别与关系（可选）**
  - `categoryName` 或 `categoryInfo`：用于生成 `Categories.name`，并写入 `REL_HAS_CATEGORY.category_name`
  - `categoryInfo`：若存在则作为 `Categories.description`
- **年代与关系（可选）**
  - `yearStartName` 或 `yearInfo`：用于生成 `Eras.name`，并写入 `REL_BELONGS_TO_ERA.era_name`
  - `yearStart` / `yearEnd`：写入 `Eras.startYear` / `Eras.endYear`

最小调用方式（用户在自己的脚本/Notebook 里直接复用）：

```python
from pathlib import Path

from build_kg.convert_artifact_to_excel import derive_export_payload, load_json, write_workbook

raw_payload = load_json(Path("artifact.json"))
prepared_payload = derive_export_payload(raw_payload)
write_workbook(prepared_payload, Path("output.xlsx"))
```

同时建议直接阅读与复用源码实现（含值归一化规则与固定 sheet/列顺序）：

- `build_kg/convert_artifact_to_excel.py` 中的 `derive_export_payload()` / `write_workbook()`

---

### 3.3 AI 扩展能力插件化（Plugin-based AI Extensions）

#### 3.3.1 目标
在不影响核心业务逻辑（文物检索/图谱/聊天主路径）的前提下，支持未来扩展 AI 能力：
- Provider 插件：支持多模型服务提供方
- Capability 插件：支持多模态与功能插件

#### 3.3.2 生效方式与管理
- 插件开关通过配置管理
- **改配置 + 重启后生效**（不要求运行时热插拔）
- **仅管理员**可以管理是否开启

配置来源（已确认）：
- 使用后端配置文件（例如 `backend/config/ai-plugins.json`），服务启动时读取并构建启用/禁用状态；修改配置后通过重启生效。

#### 3.3.3 日志与审计（已确认）
- 尽量把每次插件/模型调用写入日志（见 4.3）：
  - plugin/provider 标识
  - 是否启用
  - 是否成功、错误信息
  - 关键元信息（如模型名、耗时等）

#### 3.3.4 需求与验收标准
- 当插件被禁用时：
  - 系统核心路径不受影响
  - 调用方获得可理解的“未启用/不可用”反馈
- 插件启用/禁用的变更必须可追溯（通过 logs）

## 4. 数据与日志

### 4.1 MySQL
- `users` / `artifacts` / `logs` / `attachments`（详见 data-model.md）

### 4.2 资源存储
- 附件文件以服务端存储名落盘（或等价存储），元数据写 MySQL。

### 4.3 日志（logs）约定
- 附件相关：
  - `upload_attachment`
  - `delete_attachment`
- AI 插件相关（建议约定，便于审计）：
  - `ai_provider_call`
  - `ai_plugin_call`
  - `ai_plugin_error`

## 5. 兼容性与非功能性要求
- 中文为主的用户体验
- Docker Compose 可一键启动
- 权限错误必须明确（403）
- 失败要可观测（日志）
