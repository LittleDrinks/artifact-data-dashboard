---
phase: 01-stop-bleeding
plan: 20
subsystem: auth
autonomous: true
gap_closure: true
requirements:
  - SEC-07
tags:
  - security
  - admin
  - env-var
  - pydantic-settings
dependency_graph:
  requires: []
  provides:
    - SEC-07
  affects:
    - backend/app/config.py
    - backend/app/database.py
tech_stack:
  added: []
  patterns:
    - pydantic-settings BaseSettings with declared fields for .env loading
    - verify_password + hash_password for password change detection
key_files:
  created: []
  modified:
    - backend/app/config.py
    - backend/app/database.py
decisions:
  - "Use verify_password to detect env var changes instead of storing a plaintext comparison hash"
  - "Import verify_password alongside hash_password in _ensure_admin_user() for single-import pattern"
  - "Keep ADMIN_DEFAULT_PASSWORD default as empty string to fail-fast with clear error when not configured"
metrics:
  duration_minutes: 5
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_modified: 2
  lines_changed: 12
---

# Phase 01 Plan 20: Fix Admin Password Env Var Loading

**One-liner:** Fix pydantic-settings `extra="ignore"` causing `ADMIN_DEFAULT_PASSWORD` from `.env` to be silently discarded, making admin password updates impossible.

## What Was Done

### Task 1: Add ADMIN_DEFAULT_PASSWORD to Settings and update _ensure_admin_user()

**Problem:** `_ensure_admin_user()` read `os.environ.get("ADMIN_DEFAULT_PASSWORD")` directly, but `ADMIN_DEFAULT_PASSWORD` was never declared in `Settings`. With `extra="ignore"`, pydantic-settings only loads `.env` values for declared fields — undeclared fields are silently ignored. The `.env` value never entered `os.environ`, so `os.environ.get()` always returned `None`. The admin user was created on 2026-04-14 with a hardcoded fallback password and never updated since.

**Fix (backend/app/config.py):**
- Added `ADMIN_DEFAULT_PASSWORD: str = ""` to the `Settings` class in the Application section (line 21).
- pydantic-settings now loads the `.env` value into `settings.ADMIN_DEFAULT_PASSWORD`.

**Fix (backend/app/database.py):**
- Replaced `import os` and `os.environ.get("ADMIN_DEFAULT_PASSWORD")` with `settings.ADMIN_DEFAULT_PASSWORD`.
- Added `verify_password` import alongside existing `hash_password` import.
- Added password update logic in the `else` branch: when admin exists with correct role, verify the current password hash against the env var value; if mismatch, re-hash and update.
- Removed the now-unused `import os` line.

**Verification:**
- `settings.ADMIN_DEFAULT_PASSWORD` loads `"admin12345678"` from `.env` (verified: `True adm`).
- `_ensure_admin_user()` completed without error.
- Admin user's `password_hash` was updated to match the `.env` password.
- Old hardcoded password `"admin123"` no longer verifies (`False`).
- New `.env` password `"admin12345678"` verifies successfully (`True`).

### Task 2: Verify admin password update works end-to-end

- Ran full end-to-end verification script confirming:
  1. `settings.ADMIN_DEFAULT_PASSWORD` is populated from `.env`
  2. `_ensure_admin_user()` runs without `ValueError`
  3. Admin password hash matches current env var value
  4. Old hardcoded password no longer works

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | backend/app/config.py | ADMIN_DEFAULT_PASSWORD loaded from `.env`; same trust boundary as other secrets (JWT_SECRET_KEY, AI_API_KEY) — accepted per threat model T-01-20-01 |
| threat_flag: elevation_of_privilege | backend/app/database.py | Password update only applies to `username="admin"`; no arbitrary user modification — mitigated per threat model T-01-20-02 |

## Self-Check: PASSED

- [x] `grep -n "ADMIN_DEFAULT_PASSWORD: str" backend/app/config.py` returns line 21
- [x] `grep -n "os.environ" backend/app/database.py` returns empty
- [x] `grep -n "settings.ADMIN_DEFAULT_PASSWORD" backend/app/database.py` returns line 60
- [x] `grep -n "verify_password" backend/app/database.py` returns lines 58 and 85
- [x] Admin password hash in DB matches current env var value
- [x] Old hardcoded password no longer verifies

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `2fe7d00` | feat(phase-01-20): fix admin password env var loading |
