---
plan: fix-sec-06-cors-tighten
phase: 2
wave: 1
status: complete
completed: 2026-05-11
---

# SUMMARY: CORS 收紧为实际前端域名

## What Was Built

将 `config.py` 中 `CORS_ORIGINS` 的默认值从 `[]`（空列表）收紧为仅包含开发域名，
并创建 `.env.example` 指导生产环境配置。

## Key Changes

- `backend/app/config.py`: `CORS_ORIGINS` 默认值改为 `["http://localhost:5173", "http://127.0.0.1:5173"]`
- `backend/.env`: 同步更新 CORS_ORIGINS 包含 127.0.0.1:5173
- `backend/.env.example` (新建): 提供生产环境配置模板，注释说明需设置实际域名

## Verification

- `python -c "from app.config import settings; print(settings.CORS_ORIGINS)"` →
  `['http://localhost:5173', 'http://127.0.0.1:5173']`
- pytest 123 passed

## Self-Check

- [x] config.py 默认值仅含 localhost:5173 和 127.0.0.1:5173
- [x] .env.example 已创建并包含 CORS 配置说明
