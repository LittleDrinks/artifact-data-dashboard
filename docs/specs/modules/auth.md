# 用户认证模块规格说明

> 最后更新：2026-04-17
> 当前实现状态：**JWT 认证已完成，登录限流已实现**

---

## 当前实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 用户注册 | ✅ 已实现 | 用户名 + 邮箱 + 密码 |
| 用户登录 | ✅ 已实现 | 返回 JWT token |
| Token 验证 | ✅ 已实现 | Bearer header 解析 |
| 当前用户信息 | ✅ 已实现 | `/api/auth/me` |
| 登录限流 | ✅ 已实现 | 60s 内最多 5 次尝试 |
| 路由守卫 | ✅ 已实现 | PrivateRoute 组件（App.tsx 内联） |
| 管理员默认密码 | ✅ 已改进 | 从环境变量读取 |

---

## 1. 需求概述

用户认证模块提供基础的注册、登录和权限管理功能。

### 1.1 页面

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录/注册 | `/login` | 登录/注册 Tab 切换 |

### 1.2 业务需求

| 需求 | 描述 | 优先级 |
|------|------|--------|
| 用户注册 | 用户名 + 邮箱 + 密码 | P0 |
| 用户登录 | 用户名/邮箱 + 密码，返回 JWT | P0 |
| Token 管理 | localStorage 存储，请求携带 | P0 |
| 权限区分 | admin / user 两级角色 | P1 |
| 登录限流 | 防止暴力破解 | P1 |

---

## 2. API 接口

### 2.1 端点列表

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/auth/register` | POST | 无 | 用户注册 |
| `/api/auth/login` | POST | 无 | 用户登录，返回 JWT |
| `/api/auth/me` | GET | 需要 | 获取当前用户信息 |

### 2.2 注册与登录

- **注册**：POST `/api/auth/register`，Body 包含 `username`、`email`、`password`
- **登录**：POST `/api/auth/login`，Body 包含 `username`（或 `email`）、`password`
- **响应**：`{ access_token, token_type: "bearer" }`

### 2.3 当前用户

- **请求**：GET `/api/auth/me`，Header 携带 `Authorization: Bearer <token>`
- **响应**：`{ id, username, email, role }`

---

## 3. 后端实现

### 3.1 JWT 认证

**位置**：`backend/app/services/auth.py`

- 算法：HS256
- 过期时间：24h（配置可调）
- 密钥：`JWT_SECRET_KEY`（从 settings 读取）

### 3.2 登录限流

**位置**：`backend/app/routers/auth.py:18-43`

- 60s 内超过 5 次尝试 → 429 Too Many Requests

### 3.3 管理员账户

**位置**：`backend/app/database.py:64`

- 初始化时自动创建 username="admin"、role="admin"
- 密码从环境变量 `ADMIN_DEFAULT_PASSWORD` 读取，回退值 "admin123"

### 3.4 get_current_user 依赖

**位置**：`backend/app/routers/auth.py:46-93`

用于保护需要认证的端点，如 `/api/chat/sessions`、`/api/artifacts/:id/repair-image`。

---

## 4. 前端实现

### 4.1 useAuth Hook

**位置**：`frontend/src/hooks/useAuth.ts`

管理登录、注册、登出，以及用户状态。

### 4.2 Token 存储

- 登录成功后：`localStorage.setItem('token', response.access_token)`
- 请求时携带：`headers: { Authorization: Bearer ${token} }`

### 4.3 axios 拦截器

**位置**：`frontend/src/api/client.ts`

- 请求拦截器：自动附加 Authorization header
- 响应拦截器：401 时清除 token 并跳转登录页

### 4.4 PrivateRoute 组件

**位置**：`frontend/src/App.tsx:33-39`（内联定义）

基于 `localStorage.getItem('token')` 检查，未登录则跳转 `/login`。

### 4.5 SSE 401 处理

**位置**：`frontend/src/api/chat.ts:142-147`

SSE fetch 需手动处理 401（不经过 axios 拦截器），清除 token 并跳转登录页。

---

## 5. 用户角色

| 角色 | 标识 | 权限 |
|------|------|------|
| admin | `admin` | 全部权限 + 系统配置 |
| user | `user` | 文物查看、图谱、问答、图像修复 |

---

## 6. 已知问题

| ID | 问题 | 来源 | 优先级 | 说明 |
|-----|------|------|--------|------|
| AUTH-1 | 无注册限流 | [设计] | P2 | 注册接口无速率限制，可能被滥用创建大量账户 |
| AUTH-2 | CORS 配置宽松 | [review-round-1 P2-2] | P2 | `allow_methods=["*"]`、`allow_headers=["*"]`，建议收紧 |
| AUTH-3 | Token 无法主动失效 | [ADR-011] | P3 | JWT 无状态，24h 过期前无法主动登出其他设备 |
| UX-1 | 注册流程两次 API 调用 | [review-round-1 P2-7] | P3 | 注册成功后又调用 login，可合并为 register 返回 token |

---

## 7. 验收标准

| 检查项 | 标准 | 当前状态 |
|--------|------|---------|
| 注册功能 | 创建用户账户 | ✅ 已实现 |
| 登录功能 | 返回 JWT token | ✅ 已实现 |
| Token 验证 | Bearer header 解析 | ✅ 已实现 |
| 登录限流 | 60s 内 5 次限制 | ✅ 已实现 |
| 路由守卫 | 未登录跳转登录页 | ✅ 已实现 |
| 401 处理 | 自动清除 token 跳转 | ✅ 已实现（axios + SSE） |
| 管理员密码 | 环境变量读取 | ✅ 已实现 |

---

## 8. 关键文件索引

| 文件 | 负责内容 |
|------|---------|
| `backend/app/services/auth.py` | JWT 编解码、密码哈希、用户 CRUD |
| `backend/app/routers/auth.py` | API 端点、登录限流、get_current_user |
| `backend/app/models/user.py` | 用户模型 |
| `backend/app/database.py` | 管理员账户初始化 |
| `frontend/src/hooks/useAuth.ts` | 认证 Hook |
| `frontend/src/api/auth.ts` | 认证 API 调用 |
| `frontend/src/api/client.ts` | axios 拦截器 |
| `frontend/src/pages/Login.tsx` | 登录/注册页面 |

---

*最后更新：2026-04-18*
