# 文物大数据与人工智能集成系统 API 文档

## 概述

本文档详细说明了文物大数据与人工智能集成系统的API接口，包括用户认证、文物管理、知识图谱查询和智能问答等功能。

## 基本信息

- 基础URL: `http://localhost:3000/api`
- 所有需要认证的API都需要在请求头中包含有效的JWT令牌: `Authorization: Bearer <token>`
- 除非特别说明，所有请求和响应均使用JSON格式

## 认证接口

### 用户注册

- **URL**: `/auth/register`
- **方法**: `POST`
- **描述**: 新用户注册
- **请求体**:
  ```json
  {
    "username": "string",
    "email": "string",
    "password": "string"
  }
  ```
- **成功响应** (200):
  ```json
  {
    "success": true,
    "message": "注册成功",
    "user": {
      "id": "number",
      "username": "string",
      "email": "string",
      "role": "string"
    }
  }
  ```

### 用户登录

- **URL**: `/auth/login`
- **方法**: `POST`
- **描述**: 用户登录获取JWT令牌
- **请求体**:
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **成功响应** (200):
  ```json
  {
    "success": true,
    "token": "string",
    "user": {
      "id": "number",
      "username": "string",
      "email": "string",
      "role": "string"
    }
  }
  ```

## 文物管理接口

### 获取文物列表

- **URL**: `/artifacts`
- **方法**: `GET`
- **描述**: 获取文物列表，支持分页、排序和筛选
- **参数**: 
  - `page`: 页码 (默认1)
  - `limit`: 每页数量 (默认10)
  - `sort`: 排序字段
  - `order`: 排序方向 (asc/desc)
  - `search`: 搜索关键词
  - `category`: 分类筛选
  - `era`: 年代筛选
- **成功响应** (200):
  ```json
  {
    "success": true,
    "data": {
      "artifacts": [
        {
          "id": "number",
          "name": "string",
          "description": "string",
          "category": "string",
          "era": "string",
          "location": "string",
          "image_url": "string",
          "tags": "string",
          "is_cataloged": "boolean",
          "is_digitized": "boolean",
          "needs_repair": "boolean",
          "created_at": "string",
          "updated_at": "string"
        }
      ],
      "pagination": {
        "total": "number",
        "page": "number",
        "limit": "number",
        "totalPages": "number"
      }
    }
  }
  ```

### 获取单个文物详情

- **URL**: `/artifacts/:id`
- **方法**: `GET`
- **描述**: 获取指定ID的文物详情
- **成功响应** (200):
  ```json
  {
    "success": true,
    "data": {
      "id": "number",
      "name": "string",
      "description": "string",
      "category": "string",
      "era": "string",
      "location": "string",
      "image_url": "string",
      "tags": "string",
      "is_cataloged": "boolean",
      "is_digitized": "boolean",
      "needs_repair": "boolean",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```

## 统计分析接口

### 获取文物分类统计

- **URL**: `/stats/categories`
- **方法**: `GET`
- **描述**: 获取各分类文物的数量统计
- **成功响应** (200):
  ```json
  {
    "success": true,
    "data": [
      {
        "category": "string",
        "count": "number"
      }
    ]
  }
  ```

### 获取文物年代统计

- **URL**: `/stats/eras`
- **方法**: `GET`
- **描述**: 获取各年代文物的数量统计
- **成功响应** (200):
  ```json
  {
    "success": true,
    "data": [
      {
        "era": "string",
        "count": "number"
      }
    ]
  }
  ```

## 知识图谱接口

### 获取知识图谱数据

- **URL**: `/graph`
- **方法**: `GET`
- **描述**: 获取知识图谱数据，支持筛选
- **参数**:
  - `query`: 搜索关键词
  - `type`: 节点类型筛选
  - `limit`: 返回结果数量限制
- **成功响应** (200):
  ```json
  {
    "success": true,
    "data": {
      "nodes": [
        {
          "id": "string",
          "label": "string",
          "type": "string",
          "properties": {}
        }
      ],
      "edges": [
        {
          "id": "string",
          "source": "string",
          "target": "string",
          "label": "string"
        }
      ]
    }
  }
  ```

### 获取节点详情

- **URL**: `/graph/node/:id`
- **方法**: `GET`
- **描述**: 获取知识图谱中指定节点的详细信息
- **成功响应** (200):
  ```json
  {
    "success": true,
    "data": {
      "id": "string",
      "label": "string",
      "type": "string",
      "properties": {},
      "relationships": [
        {
          "id": "string",
          "source": "string",
          "target": "string",
          "label": "string",
          "node": {}
        }
      ]
    }
  }
  ```

## 智能问答接口

### 发送问题

- **URL**: `/chat/ask`
- **方法**: `POST`
- **描述**: 向AI提问并获取智能回答
- **请求体**:
  ```json
  {
    "question": "string",
    "conversationId": "string" // 可选，用于维持对话上下文
  }
  ```
- **成功响应** (200):
  ```json
  {
    "answer": "string",
    "conversationId": "string",
    "source": "string", // 'knowledge_graph', 'mcp_model', 'simulation'
    "intent": "string", // 识别的问题意图
    "data": {  // 可选，当source为knowledge_graph时包含图谱数据
      "nodes": [],
      "edges": []
    }
  }
  ```

### 获取对话历史

- **URL**: `/chat/history`
- **方法**: `GET`
- **描述**: 获取当前用户的对话历史
- **参数**:
  - `conversationId`: 会话ID (可选，不提供则返回所有会话)
- **成功响应** (200):
  当提供conversationId时:
  ```json
  {
    "conversationId": "string",
    "messages": [
      {
        "role": "string", // 'user' 或 'bot'
        "content": "string",
        "timestamp": "string"
      }
    ]
  }
  ```
  当不提供conversationId时:
  ```json
  [
    {
      "conversationId": "string",
      "createdAt": "string",
      "messagesCount": "number"
    }
  ]
  ```

## 错误响应格式

所有API错误将返回统一的错误响应格式:

```json
{
  "success": false,
  "error": {
    "message": "string",
    "details": "string" // 可选
  },
  "timestamp": "string"
}
```

常见HTTP状态码:
- 400: 请求参数错误
- 401: 未认证或认证失败
- 403: 权限不足
- 404: 资源不存在
- 500: 服务器内部错误
