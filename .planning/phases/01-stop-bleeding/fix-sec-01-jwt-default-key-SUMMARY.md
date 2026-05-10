# fix-sec-01-jwt-default-key — SUMMARY

## Task
SEC-01: JWT_SECRET_KEY 默认值启动校验

## Changes
- **File**: `backend/app/config.py`
- **Lines**: 81-82
- **What**: 在 `Settings.model_post_init()` 末尾添加校验逻辑，当 `JWT_SECRET_KEY` 仍为默认值 `"your-secret-key-change-in-production"` 且 `DEBUG=False` 时，抛出 `ValueError`，阻止应用在生产环境使用弱密钥启动。

## Verification

```
$ cd backend && python -c "from app.config import Settings; s = Settings(DEBUG=False); s.model_post_init(None)"
ValueError: JWT_SECRET_KEY must be changed from default in production

$ cd backend && python -c "from app.config import Settings; s = Settings(DEBUG=True); s.model_post_init(None)"
(no output, no exception)
```

## Commit
- `fix(config): add JWT_SECRET_KEY default value validation in production`
