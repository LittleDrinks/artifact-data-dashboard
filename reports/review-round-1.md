# Review Round 1 — E2E 测试评审报告

**日期**: 2026-04-21
**模式**: DEGRADED (Self-Review)
**评审员**: auto-iterate-reviewer (Round 1)
**分支**: auto-iterate/round-1

---

## 测试结果概要

| 指标 | 数值 |
|------|------|
| 总测试数 | 56 |
| 通过 | 1 |
| 失败 | 52 |
| 跳过 | 3 |
| 通过率 | **1.8%** |

### 唯一通过的测试
- `login.spec.ts › 未登录访问首页跳转到登录页` — 因为不需要认证，直接测试路由守卫重定向

---

## 失败分类

### 类别 A：后端限流 429 (30 个测试)
**影响页面**: Dashboard (5), Artifacts (7), Chat (12), Knowledge (6)

**现象**: E2E helper 的 `login()` 函数调用 `POST /api/auth/login` 返回 **HTTP 429 Too Many Requests**，测试在 `helpers.ts:32` 处断言失败。

**根本原因**: 后端登录限流为 60s 内最多 5 次尝试（PRD §6.2），56 个测试顺序执行，每个测试至少调用 1 次 register + 1 次 login，远远超过限流阈值。前面的测试把限流配额耗尽后，后续测试全部无法登录。

### 类别 B：认证失败 401 (19 个测试)
**影响页面**: Artifact Detail (7), Graph (12)

**现象**: 与类别 A 类似，`login()` 返回 **HTTP 401 Unauthorized**。

**根本原因**: 测试用户 `testuser/testpass123` 可能因 register 被限流（429）从未成功创建，导致后续 login 请求找不到用户返回 401。

### 类别 C：登录页 UI / 选择器问题 (3 个测试)
**影响页面**: Login 页面本身

**现象详见下方 BUG 列表**

---

## BUG 列表

### BUG 1 [P0] — 后端登录限流策略过于激进，阻断 E2E 测试

- **页面**: Backend API `/api/auth/login`
- **位置**: 认证中间件限流逻辑
- **现象**: 60s 内 5 次登录尝试后返回 429，导致 30 个 E2E 测试在 login helper 处全部失败，无法到达实际页面
- **期望**: 测试环境下限流应放宽或禁用；生产环境 60s/5 次是合理的，但需要区分环境。建议在 `config.py` 中增加 `RATE_LIMIT_ENABLED` 环境变量，测试环境设为 false

### BUG 2 [P0] — E2E helpers.ts 登录函数不处理限流/注册失败

- **页面**: E2E 测试基础设施
- **位置**: `e2e/helpers.ts` login 函数
- **现象**: register 失败时（429 或其他错误），代码静默跳过（空 if 分支），然后继续 login，导致 login 也失败。没有任何重试或错误恢复逻辑
- **期望**: login helper 应当：(1) 支持重试机制（遇到 429 时等待后重试）；(2) 或者在全局 setup 中一次性创建测试用户，后续测试直接复用 token，避免每个测试都重复 register+login

### BUG 3 [P0] — 登录页按钮文本有空格，导致 E2E 选择器失配

- **页面**: Login
- **位置**: 登录表单提交按钮 + 注册表单提交按钮
- **现象**: 页面快照显示按钮文本为 "登 录" 和 "注 册"（字符间有空格），这是 Ant Design Button 组件对中文 2 字符自动插入空格的默认行为。测试选择器 `button:has-text("登录")` 无法匹配 "登 录"（has-text 是子串匹配，"登 录" 不包含连续子串 "登录"），导致 click 操作超时 30s
- **期望**: 两种修复方案：(1) 在 E2E 测试中使用正则匹配 `button:has-text(/登.*录/)` 或使用 data-testid；(2) 在 Button 组件上设置 `className` 移除空格

### BUG 4 [P0] — 登录/注册 Tab 共享相同 placeholder 导致元素选择歧义

- **页面**: Login
- **位置**: 登录和注册表单的用户名/密码输入框
- **现象**: 切换到注册 Tab 后，`input[placeholder="用户名"]` 匹配到 2 个元素（登录 Tab 的隐藏输入框 + 注册 Tab 的可见输入框）。Playwright 选择第一个（登录 Tab 的），该元素不可见，fill 操作报 "element is not visible" 超时
- **期望**: 注册 Tab 的表单输入框应使用不同选择器定位，如 `tabpanel:has-text("确认密码") input[placeholder="用户名"]` 或使用 data-testid 属性。或者登录/注册使用不同的表单组件，在 DOM 中完全卸载非活跃 Tab 的内容

### BUG 5 [P1] — 52/56 测试无法验证任何页面 UI 质量

- **页面**: 全部 (Dashboard, Artifacts, ArtifactDetail, Graph, Chat, Knowledge)
- **位置**: 所有需要认证的页面
- **现象**: 由于 BUG 1-2 导致的级联失败，52 个测试全部在登录阶段就挂了，从未到达目标页面。无法验证页面渲染、数据展示、交互功能是否正常
- **期望**: 修复登录问题后，重新运行测试以验证各页面功能

---

## 截图评估 (DEGRADED 模式)

由于大部分测试在 login helper 阶段就失败，截图多数显示的是登录页或空白页面。

### 可评估的截图

| 截图文件 | 评估 |
|----------|------|
| `login-register-tab-*.png` | 登录页注册 Tab 可见，页面布局正常 |
| `login-wrong-credentials-*.png` | 登录 Tab 填入了错误凭据，布局正常 |
| `login-unauth-redirect-*.png` | 未认证重定向到登录页，正常 |
| `login-Login-Page-未登录访问首页跳转到登录页-*finished*.png` | 唯一通过的测试截图，登录页正常渲染 |

### 无法评估

Dashboard、Artifacts、ArtifactDetail、Graph、Chat、Knowledge 页面的功能截图**全部缺失**，因为测试在 login 阶段就失败了。

---

## 建议修复优先级

1. **[P0]** 修复后端限流配置，测试环境禁用或放宽限流（~15min）
2. **[P0]** 重构 E2E login helper，支持全局 setup 创建测试用户 + token 复用（~20min）
3. **[P0]** 修复登录页 E2E 选择器：用正则或 data-testid 匹配按钮（~10min）
4. **[P0]** 修复注册 Tab 选择器歧义：用 scoped selector 或 data-testid（~10min）
5. **[P1]** 重新运行全部测试，收集真实页面截图进行第二轮评审

---

## 总结

本轮评审 **52/56 测试失败（FAIL）**，根本原因是后端限流策略和 E2E 测试基础设施的不匹配。这不是页面功能的问题，而是测试无法通过认证到达目标页面。需要先修复认证层面的阻塞问题，才能对 6 个页面的 UI 和功能进行有效评审。

**状态**: ❌ FAIL — 需要修复后重测
