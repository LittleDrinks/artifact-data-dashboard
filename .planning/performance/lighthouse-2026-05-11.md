# Lighthouse 性能审计报告

**日期**: 2026-05-11
**页面**: http://localhost:4173/login
**报告来源**: CI Lighthouse run (PR #26)
**原始报告**: https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/1778459333987-78948.report.html

---

## 总分

| 维度 | 分数 | 状态 |
|------|------|------|
| Performance | 83 | 需优化 |
| Accessibility | 96 | 良好 |
| Best Practices | 100 | 优秀 |
| SEO | 82 | 需优化 |

---

## P1 — Performance 问题

### 1. Largest Contentful Paint (LCP): 3599ms
- **阈值**: ≤ 2500ms
- **现状**: 超出 44%
- **根因**: 字体/资源加载阻塞首屏渲染
- **优化建议**: 预连接 Google Fonts (`<link rel="preconnect">`)

### 2. First Contentful Paint (FCP): 3143ms
- **阈值**: ≤ 1800ms
- **现状**: 超出 75%
- **关联**: 与 LCP 同根因

### 3. Speed Index: 3143ms
- **阈值**: ≤ 3400ms (刚好在边缘)

### 4. Time to Interactive (TTI): 3701ms
- **阈值**: ≤ 3800ms (接近阈值)

### 5. Unused CSS (Ant Design)
- `.ant-col` 样式: 99.6% 未使用 (14.6KB 浪费)
- `.ant-btn` 样式: 98.5% 未使用 (13.7KB 浪费)
- **优化建议**: 启用 Ant Design 的按需加载 + CSS tree-shaking

### 6. Unused JavaScript
- `client-DLW7xrWn.js`: 60KB 总量，36KB 未使用 (60%)
- `index-BwOz4RPR.js`: 66KB 总量，25KB 未使用 (38%)
- **优化建议**: 代码分割，延迟加载非首屏路由

### 7. Legacy JavaScript
- Babel `@babel/plugin-transform-classes` 残留
- 影响: 极小 (仅 ~60 bytes)
- **优先级**: P3 (可延后处理)

### 8. Missing Preconnect
- `https://fonts.googleapis.com` 未预连接
- **优化**: 添加 `<link rel="preconnect" href="https://fonts.googleapis.com">`

---

## P2 — Accessibility 问题

### 9. Color Contrast (1 item)
- Ant Design Tabs 导航组件某个元素对比度不足
- **修复**: 检查并调整 Tabs 组件的配色

---

## P3 — SEO 问题

### 10. Missing Meta Description
- login 页面缺少 `<meta name="description">`
- **修复**: 在 `index.html` 或路由组件中添加动态 meta

### 11. Invalid robots.txt
- robots.txt 返回的是 HTML 页面而非纯文本
- 33 行语法错误 (`<!doctype html>` 等被解析为 robots.txt 内容)
- **根因**: 前端 dev server / 部署配置未正确处理 `/robots.txt`
- **修复**: 添加静态 `robots.txt` 文件到 `public/` 目录

---

## 优化优先级

| 优先级 | 项目 | 预计收益 | 涉及文件 |
|--------|------|----------|----------|
| P1 | 添加 Google Fonts preconnect | +3-5 Performance | `index.html` |
| P1 | AntD CSS 按需加载 | +5-10 Performance | vite.config.ts, main.tsx |
| P1 | JS 代码分割 | +3-5 Performance | vite.config.ts |
| P2 | 修复颜色对比度 | +2 Accessibility | Chat.tsx / 全局样式 |
| P3 | 添加 meta description | +5 SEO | `index.html` 或路由组件 |
| P3 | 添加 robots.txt | +5 SEO | `public/robots.txt` |

---

## 关联 Issue

- GitHub Issue: #27
- 优化目标: Performance ≥ 90, SEO ≥ 90
