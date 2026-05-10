# fix-sec-07-admin-password-env — Summary

## Task
SEC-07: 管理员密码强制从环境变量读取

## Changes

### 1. backend/app/database.py
- `_ensure_admin_user()` 开头新增环境变量校验：
  - `ADMIN_DEFAULT_PASSWORD` 必须设置，否则抛出 `ValueError`
  - 密码长度必须 >= 8，否则抛出 `ValueError`
- 移除 `os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")` 中的硬编码弱密码 `"admin123"`

### 2. .env.example
- 新增 `ADMIN_DEFAULT_PASSWORD=change-me-in-production` 占位符

## Verification

| Check | Command | Result |
|-------|---------|--------|
| ValueError message exists | `grep -n "ADMIN_DEFAULT_PASSWORD environment variable is required" backend/app/database.py` | Line 64 matched |
| No hardcoded "admin123" | `grep -n "admin123" backend/app/database.py` | No output (clean) |
| Missing env var raises ValueError | `JWT_SECRET_KEY=... python -c "..._ensure_admin_user()"` | `ValueError: ADMIN_DEFAULT_PASSWORD environment variable is required` |
| Short password raises ValueError | `JWT_SECRET_KEY=... ADMIN_DEFAULT_PASSWORD=short python -c "..._ensure_admin_user()"` | `ValueError: ADMIN_DEFAULT_PASSWORD must be at least 8 characters` |

## Commit
- `git commit` with message: `fix(sec): force admin password from env var, remove hardcoded default`
