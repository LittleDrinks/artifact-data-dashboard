# API 设计规范

## 概述

### 基础 URL
```
http://localhost:3000/api
```

### 认证方式
Bearer Token（JWT）
```
Authorization: Bearer <token>
```

### 响应格式
统一 JSON 格式：
```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

### 错误格式
```json
{
  "code": 400,
  "message": "参数错误",
  "error": "具体错误信息"
}
```

---

## URL 规范

### RESTful 设计原则
- 使用名词表示资源，复数形式
- 使用 HTTP 方法表示操作类型
- URL 层级表示资源关系

### HTTP 方法规范
| 方法 | 用途 | 幂等性 |
|------|------|--------|
| GET | 获取资源 | 是 |
| POST | 创建资源 | 否 |
| PUT | 全量更新 | 是 |
| PATCH | 部分更新 | 否 |
| DELETE | 删除资源 | 是 |

---

## 认证机制

### JWT Bearer Token

**Header 格式**：
```
Authorization: Bearer <token>
```

**Token 获取**：通过 `/auth/login` 接口获取

**Token 内容**：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**角色说明**：
- `admin`：系统管理员，拥有所有权限
- `user`：普通用户，只能访问授权资源

---

## 模块 API 定义

### 1. 认证相关

#### POST /auth/login
登录获取 Token。

**请求**：
```json
{
  "username": "admin",
  "password": "password123"
}
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

---

#### POST /auth/register
注册新用户（仅 admin 可调用）。

**请求**：
```json
{
  "username": "newuser",
  "password": "password123",
  "role": "user"
}
```

---

### 2. 文物管理

#### GET /artifacts
获取文物列表。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| page | int | 页码，默认 1 |
| pageSize | int | 每页条数，默认 20 |
| keyword | string | 关键词搜索（名称、描述） |
| era | string | 年代筛选 |
| category_id | int | 分类筛选 |
| folder_id | int | 文件夹筛选 |

**响应**：
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "青铜鼎",
        "era": "商代",
        "material": "青铜",
        "description": "...",
        "created_at": "2024-01-15T08:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150
    }
  }
}
```

---

#### GET /artifacts/:id
获取单个文物详情。

**响应**：
```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "青铜鼎",
    "era": "商代",
    "description": "...",
    "attachments": [
      {
        "id": 1,
        "original_name": "ding.jpg",
        "file_path": "/uploads/2024/01/uuid.jpg",
        "file_size": 2048000
      }
    ],
    "tags": ["青铜器", "商代"],
    "graph_data": {
      "nodes": [...],
      "relationships": [...]
    }
  }
}
```

---

#### POST /artifacts
创建新文物。

**请求**：
```json
{
  "name": "新文物",
  "era": "唐代",
  "category_id": 2,
  "material": "陶瓷",
  "description": "详细描述...",
  "folder_id": 5
}
```

---

#### PUT /artifacts/:id
更新文物信息。

---

#### DELETE /artifacts/:id
删除文物（软删除或硬删除，看配置）。

---

#### POST /artifacts/import
批量导入 Excel。

**Content-Type**: `multipart/form-data`

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| file | File | Excel 文件（.xlsx） |
| mapping | JSON | 字段映射配置 |

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/artifacts/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@artifacts.xlsx" \
  -F "mapping={\"名称\":\"name\",\"年代\":\"era\"}"
```

**响应**：
```json
{
  "code": 200,
  "data": {
    "task_id": "uuid",
    "status": "processing"
  }
}
```

---

#### GET /artifacts/import/:taskId/status
查询导入任务状态。

**响应**：
```json
{
  "code": 200,
  "data": {
    "status": "completed",
    "total": 1000,
    "success": 980,
    "failed": 20,
    "error_log": [...]
  }
}
```

---

#### POST /artifacts/export
导出数据为 Excel。

**请求**：
```json
{
  "ids": [1, 2, 3],
  "fields": ["name", "era", "material"]
}
```

**响应**：文件下载（Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet）

---

### 3. 附件管理（DAMS）

#### POST /attachments/upload
上传附件。

**Content-Type**: `multipart/form-data`

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| file | File | 文件 |
| ref_type | string | 关联类型：`artifact` \| `document` |
| ref_id | int | 关联对象 ID |

**响应**：
```json
{
  "code": 200,
  "data": {
    "id": 1,
    "original_name": "photo.jpg",
    "file_path": "/uploads/2024/01/uuid.jpg",
    "file_size": 1024000,
    "mime_type": "image/jpeg"
  }
}
```

---

#### GET /attachments/:id/download
下载附件。

**响应**：文件流

---

#### DELETE /attachments/:id
删除附件。

---

### 4. 文件夹管理

#### GET /folders
获取文件夹树。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| parent_id | int | 父文件夹 ID，null 表示根目录 |

**响应**：
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "青铜器",
      "children": [
        {
          "id": 2,
          "name": "商代青铜器",
          "children": []
        }
      ]
    }
  ]
}
```

---

#### POST /folders
创建文件夹。

**请求**：
```json
{
  "name": "新文件夹",
  "parent_id": 1
}
```

---

#### PUT /folders/:id
重命名文件夹。

---

#### DELETE /folders/:id
删除文件夹（如果有子文件夹或内容，会失败）。

---

### 5. 知识图谱

#### GET /graph/search
搜索实体。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| keyword | string | 搜索关键词 |
| type | string | 实体类型：Artifact/Person/Location/... |

**响应**：
```json
{
  "code": 200,
  "data": [
    {
      "id": "a123",
      "type": "Artifact",
      "name": "青铜鼎",
      "properties": { "era": "商代" }
    }
  ]
}
```

---

#### GET /graph/relations/:entityId
获取实体的关联网络。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| depth | int | 关系深度，默认 2，最大 3 |

**响应**：
```json
{
  "code": 200,
  "data": {
    "nodes": [
      { "id": "a123", "label": "Artifact", "name": "青铜鼎" },
      { "id": "p456", "label": "Person", "name": "张三" }
    ],
    "relationships": [
      { "source": "a123", "target": "p456", "type": "COLLECTED_BY" }
    ]
  }
}
```

---

#### POST /graph/relations
手动添加关系。

**请求**：
```json
{
  "source_id": "a123",
  "target_id": "p456",
  "relation_type": "COLLECTED_BY",
  "properties": { "date": "2020-01-01" }
}
```

---

### 6. AI 问答

#### POST /chat
发送消息给 AI（流式响应）。

**请求**：
```json
{
  "message": "介绍一下商代的青铜器",
  "session_id": "uuid",
  "mode": "auto"
}
```

**响应**：SSE (Server-Sent Events)

```
event: message
data: {"type": "thinking", "content": "正在查询知识图谱..."}

event: message
data: {"type": "tool_call", "tool": "query_graph", "params": {...}}

event: message
data: {"type": "content", "content": "商代青铜器以..."}

event: done
data: {}
```

---

#### GET /chat/history
获取对话历史。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| session_id | string | 会话 ID |
| limit | int | 返回条数 |

---

#### DELETE /chat/history/:sessionId
清空对话历史。

---

### 7. AI 管理

#### GET /ai/status
获取 AI 服务状态。

**响应**：
```json
{
  "code": 200,
  "data": {
    "current_mode": "LOCAL",
    "available_modes": ["ONLINE", "LOCAL", "MOCK"],
    "health": {
      "online": false,
      "local": true,
      "mock": true
    },
    "locked": false,
    "last_check": "2024-01-15T10:30:00Z"
  }
}
```

---

#### POST /ai/mode
切换 AI 模式（仅 admin）。

**请求**：
```json
{
  "mode": "LOCAL",
  "lock": true
}
```

---

#### POST /ai/health-check
手动触发健康检查。

---

### 8. 系统管理（Admin）

#### GET /admin/users
获取用户列表。

---

#### PUT /admin/users/:id
修改用户信息（重置密码、修改角色）。

---

#### DELETE /admin/users/:id
删除用户。

---

#### GET /admin/logs
获取系统日志。

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| level | string | 日志级别：debug/info/warn/error |
| start_date | date | 开始日期 |
| end_date | date | 结束日期 |
| limit | int | 返回条数 |

---

## 错误码定义

| Code | 含义 | 场景 |
|------|------|------|
| 200 | 成功 | - |
| 400 | 参数错误 | 缺少必填字段、格式错误 |
| 401 | 未认证 | Token 缺失或过期 |
| 403 | 无权限 | 非 admin 访问 admin 接口 |
| 404 | 资源不存在 | ID 找不到 |
| 409 | 资源冲突 | 用户名已存在 |
| 422 | 业务逻辑错误 | 文件夹不为空不能删除 |
| 500 | 服务器错误 | 数据库连接失败等 |
