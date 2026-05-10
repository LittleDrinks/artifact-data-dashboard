---
status: resolved
trigger: "admin/admin123 可以登录，admin/admin12345678 无法登录"
created: 2026-05-10T12:50:00Z
updated: 2026-05-10T14:20:00Z
---

## Current Focus

hypothesis: "ADMIN_DEFAULT_PASSWORD is in .env file but NOT in os.environ because it's not a field in the pydantic Settings class, so _ensure_admin_user() sees None and raises ValueError on startup; the existing admin user (created before SEC-07 with hardcoded 'admin123') remains unchanged, allowing old password to work but new env var password to fail"
test: "Verified by checking os.environ before/after imports, database record creation date, and password hash verification"
expecting: "Confirmed - admin user's password_hash matches 'admin123', created on 2026-04-14 (before SEC-07). os.environ has no ADMIN_DEFAULT_PASSWORD."
next_action: "Return ROOT CAUSE FOUND diagnosis"

## Symptoms

expected: "使用环境变量 ADMIN_DEFAULT_PASSWORD=admin12345678 配置的密码能正常登录"
actual: "admin/admin123 可以登录，admin/admin12345678 无法登录（旧硬编码密码仍可登录）"
errors: "登录失败（密码错误）"
reproduction: "1. 确保 .env 中 ADMIN_DEFAULT_PASSWORD=admin12345678；2. 启动后端；3. 用 admin/admin12345678 登录失败；4. 用 admin/admin123 登录成功"
started: "SEC-07 修复后（移除硬编码密码，改为环境变量）"

## Eliminated

[none yet]

## Evidence

- timestamp: 2026-05-10T12:55:00Z
  checked: backend/app/database.py _ensure_admin_user function
  found: Function reads os.environ.get("ADMIN_DEFAULT_PASSWORD") directly, NOT from pydantic settings
  implication: The env var must be in os.environ, not just in .env file

- timestamp: 2026-05-10T12:56:00Z
  checked: backend/app/config.py Settings class
  found: Settings class does NOT define ADMIN_DEFAULT_PASSWORD as a field. Has extra='ignore' in Config
  implication: pydantic_settings will ignore ADMIN_DEFAULT_PASSWORD from .env and NOT load it into os.environ

- timestamp: 2026-05-10T12:57:00Z
  checked: backend/data/app.db admin user record
  found: Admin user created_at=2026-04-14 00:25:52 (before SEC-07 fix). password_hash matches 'admin123', NOT 'admin12345678'
  implication: Admin was created with old hardcoded password and was never updated after SEC-07

- timestamp: 2026-05-10T12:58:00Z
  checked: os.environ.get('ADMIN_DEFAULT_PASSWORD') in fresh Python process
  found: Returns 'NOT SET' even though .env file contains ADMIN_DEFAULT_PASSWORD=admin12345678
  implication: .env file is NOT automatically loaded into os.environ by pydantic_settings because ADMIN_DEFAULT_PASSWORD is not a Settings field

- timestamp: 2026-05-10T12:59:00Z
  checked: SEC-07 commit (d2a753e)
  found: Commit removed hardcoded fallback "admin123" and added os.environ.get() with validation. But did not add ADMIN_DEFAULT_PASSWORD to Settings class or use python-dotenv
  implication: The fix is incomplete - it assumes the env var is in os.environ but never ensures it gets there

## Resolution

root_cause: "_ensure_admin_user() reads os.environ.get('ADMIN_DEFAULT_PASSWORD') directly, but ADMIN_DEFAULT_PASSWORD is not defined as a field in app.config.Settings. Since Settings.Config has extra='ignore', pydantic_settings loads .env values only for declared fields. Therefore ADMIN_DEFAULT_PASSWORD from .env never enters os.environ. When the app starts, init_db() -> _ensure_admin_user() sees default_password=None and raises ValueError. The admin user in the database was created on 2026-04-14 (before SEC-07 fix) with the hardcoded password 'admin123', so the old password still works while the new env var password does not."
fix: ""
verification: ""
files_changed: []
