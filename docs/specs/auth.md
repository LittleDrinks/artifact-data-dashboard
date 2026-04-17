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
| 路由守卫 | ✅ 已实现 | ProtectedRoute 组件 |
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

### 2.2 注册请求

```json
POST /api/auth/register
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123"
}
```

响应：
```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "role": "user",
  "created_at": "2026-04-16T..."
}
```

### 2.3 登录请求

```json
POST /api/auth/login
{
  "username": "testuser",  // 或 email
  "password": "password123"
}
```

响应：
```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer"
}
```

### 2.4 当前用户

```json
GET /api/auth/me
Authorization: Bearer eyJhbG...

响应：
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "role": "user"
}
```

---

## 3. 后端实现

### 3.1 JWT 认证

**位置**：`backend/app/services/auth.py`

使用：
- `python-jose` — JWT 编解码
- `passlib[bcrypt]` — 密码哈希

Token 配置：
- 算法：HS256
- 过期时间：24h（配置可调）
- 密钥：`JWT_SECRET_KEY`（从 settings 读取）

### 3.2 登录限流

**位置**：`backend/app/routers/auth.py:18-43`

```python
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 5  # attempts per window

def _check_rate_limit(client_ip: str):
    # 60s 内超过 5 次尝试 → 429 Too Many Requests
```

### 3.3 管理员账户

**位置**：`backend/app/database.py:64`

```python
admin_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")
```

管理员账户在数据库初始化时自动创建：
- username: "admin"
- role: "admin"
- 密码从环境变量读取，回退值 "admin123"

> **修复历史**：Round 2 审查发现密码硬编码，已改为环境变量读取。

### 3.4 get_current_user 依赖

**位置**：`backend/app/routers/auth.py:46-93`

```python
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    # 解析 Bearer token
    # 验证有效性
    # 返回 User 对象
```

用于保护需要认证的端点，如 `/api/chat/sessions`、`/api/artifacts/:id/repair-image`。

---

## 4. 前端实现

### 4.1 useAuth Hook

**位置**：`frontend/src/hooks/useAuth.ts`

```typescript
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 登录
  const login = async (username: string, password: string) => { ... }
  
  // 注册
  const register = async (data: RegisterData) => { ... }
  
  // 登出
  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return { user, loading, login, register, logout }
}
```

### 4.2 Token 存储

```typescript
// 登录成功后存储 token
localStorage.setItem('token', response.access_token)

// 请求时携带
headers: { Authorization: `Bearer ${token}` }
```

### 4.3 axios 拦截器

**位置**：`frontend/src/api/client.ts`

```typescript
// 请求拦截器：添加 Authorization header
client.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：401 自动跳转登录
client.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

### 4.4 ProtectedRoute 组件

**位置**：`frontend/src/router/ProtectedRoute.tsx`

```tsx
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  
  if (loading) return <Spin />
  if (!user) return <Navigate to="/login" />
  
  return children
}
```

### 4.5 SSE 401 处理

**位置**：`frontend/src/api/chat.ts:107-110`

```typescript
// SSE fetch 需手动处理 401（不经过 axios 拦截器）
if (response.status === 401) {
  localStorage.removeItem('token')
  window.location.href = '/login'
  return
}
```

---

## 5. 用户角色

| 角色 | 标识 | 权限 |
|------|------|------|
| admin | `admin` | 全部权限 + 系统配置 |
| user | `user` | 文物查看、图谱、问答、图像修复 |

### 5.1 角色字段

```python
# backend/app/models/user.py
role: Mapped[str] = mapped_column(String(20), default="user")
# CHECK(role IN ('admin', 'user'))
```

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

## 8. 数据模型

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. 关键文件索引

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

*最后更新：2026-04-16*