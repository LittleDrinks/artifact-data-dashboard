---
name: playwright-mcp-login-testing
description: 使用 Playwright MCP 测试登录流程的完整指南，包含避免测试卡住的最佳实践和可复用代码模板。
---

# Playwright MCP 登录测试指南

## 快速开始

```bash
# 1. 初始化浏览器并导航到登录页
init-browser --url http://localhost:5173/login

# 2. 获取页面快照（查看可交互元素）
get-interactive-snapshot

# 3. 执行登录测试（推荐用 execute-code 获得最大控制力）
execute-code --code "async (page) => { ... }"
```

## 实战验证的登录测试脚本

### 完整登录成功流

```javascript
async function run(page) {
  // 清除之前的登录状态（确保测试独立）
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:5173/login');

  // 等待关键元素出现（带超时，避免无限等待）
  await page.waitForSelector('input[placeholder="用户名"]', { timeout: 5000 });

  // 填写表单
  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'admin123');

  // 点击登录 + 等待导航完成
  await page.click('button:has-text("登 录")');
  await page.waitForURL('http://localhost:5173/', { timeout: 10000 });

  // 断言：验证登录成功
  const username = await page.locator('text=admin').first().textContent();
  return { success: true, loggedInAs: username, url: page.url() };
}
```

### 错误凭据测试

```javascript
async function run(page) {
  await page.goto('http://localhost:5173/login');
  await page.waitForSelector('input[placeholder="用户名"]', { timeout: 5000 });

  await page.fill('input[placeholder="用户名"]', 'admin');
  await page.fill('input[placeholder="密码"]', 'wrongpassword');

  // 等待错误API响应（精准等待，不盲等）
  const responsePromise = page.waitForResponse(
    resp => resp.url().includes('/auth/login') && resp.status() === 401,
    { timeout: 10000 }
  );

  await page.click('button:has-text("登 录")');
  const response = await responsePromise;

  // 等待UI错误提示渲染
  await page.waitForSelector('.ant-alert-error', { timeout: 5000 });
  const errorText = await page.locator('.ant-alert-error').textContent();

  return {
    success: false,
    errorMessage: errorText,
    apiStatus: response.status(),
    url: page.url()    // 应仍为 /login
  };
}
```

### 已登录状态自动跳转测试

```javascript
async function run(page) {
  // 模拟已登录（直接设置token）
  await page.evaluate(() => {
    localStorage.setItem('token', 'mock_token_for_testing');
  });
  await page.goto('http://localhost:5173/login');

  // 页面应自动跳转到首页
  await page.waitForURL('http://localhost:5173/', { timeout: 5000 });

  return { redirected: true, currentUrl: page.url() };
}
```

---

## 核心问题：如何避免测试卡住？

### ❌ 会卡住的写法

| 反模式 | 问题 | 后果 |
|--------|------|------|
| `await page.waitForSelector('.btn')` | 无超时参数 | 元素不存在时默认卡30秒 |
| `await page.click('.btn')` | 不等待元素可见 | 可能点到错误元素或报错 |
| `await page.waitForTimeout(5000)` | 固定等待 | 网络快时浪费时间，慢时不够 |
| 连续操作无状态检查 | 假设上一步一定成功 | 前面失败后后续全部超时 |

### ✅ 不会卡住的写法

| 模式 | 正确写法 | 优势 |
|------|----------|------|
| 显式超时 | `waitForSelector('...', { timeout: 5000 })` | 可控最大等待时间 |
| 条件等待 | `waitForResponse(resp => ...)` | 精准等待异步完成 |
| 导航等待 | `waitForURL('...')` | 等待路由跳转完成 |
| 非阻塞检查 | `await locator.isVisible().catch(() => false)` | 立即返回，不阻塞 |
| 元素计数 | `await locator.count()` | 安全判断元素是否存在 |

### 决策树：选择正确的等待策略

```
需要等待某个结果？
├── 是网络API响应？ → waitForResponse() / waitForRequest()
├── 是页面跳转？   → waitForURL()
├── 是元素出现？   → waitForSelector({ timeout })
├── 是元素消失？   → waitForSelector('...', { state: 'detached', timeout })
├── 只是检查状态？ → isVisible() / count()（不阻塞，立即返回）
└── 需要等一会儿？ → 尽量避免，用上述条件等待替代
```

---

## Playwright MCP 工具选型

### 工具对比

| 工具 | 适用场景 | 控制力 | 卡住风险 |
|------|----------|--------|----------|
| `execute-code` | 复杂逻辑、条件等待、批量断言 | ⭐⭐⭐ 最高 | 低（代码自主控制） |
| `fill` / `click` | 简单单步操作 | ⭐⭐ 中等 | 中（依赖当前快照） |
| `type_text` | 键盘输入 | ⭐⭐ 中等 | 中 |
| `get-interactive-snapshot` | 查看可交互元素 | ⭐ 只读 | 无 |
| `get-full-snapshot` | 查看完整DOM | ⭐ 只读 | 无 |

### 推荐组合

**复杂测试流程** → 使用 `execute-code`：
```javascript
async function run(page) {
  // 所有逻辑在一个代码块内，状态连贯
  await page.goto('...');
  await page.waitForSelector('...', { timeout: 5000 });
  // ... 完整流程
  return results;
}
```

**快速探索/调试** → 快照 + 单步操作：
```bash
get-interactive-snapshot   # 查看当前可点击元素
click <uid>                # 单步执行
```

---

## 最佳实践清单

### 1. 始终设置超时
```javascript
// ❌ 不要
await page.waitForSelector('.btn');

// ✅ 要
await page.waitForSelector('.btn', { timeout: 5000 });
```

### 2. 等待具体条件，而非固定时间
```javascript
// ❌ 不要
await page.waitForTimeout(3000);

// ✅ 要
await page.waitForResponse(resp => resp.url().includes('/api/login'));
```

### 3. 操作前确认元素就绪
```javascript
// ✅ 等待可见后再交互
const btn = page.locator('button:has-text("登录")');
await btn.waitFor({ state: 'visible', timeout: 5000 });
await btn.click();
```

### 4. 处理可能不存在的元素
```javascript
// ✅ 非阻塞检查
const hasError = await page.locator('.error').isVisible().catch(() => false);
if (hasError) {
  // 处理错误
}

// ✅ 或计数判断
const errorCount = await page.locator('.error').count();
```

### 5. 隔离测试状态
```javascript
// ✅ 每个测试前清理状态
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
```

### 6. 使用响应断言替代UI轮询
```javascript
// ✅ 等待并验证API响应
const response = await page.waitForResponse(
  resp => resp.url().includes('/auth/me'),
  { timeout: 5000 }
);
const body = await response.json();
expect(body.username).toBe('admin');
```

### 7. 导航操作后等待URL变化
```javascript
// ✅ 登录后等待跳转
await page.click('button[type="submit"]');
await page.waitForURL('/dashboard', { timeout: 10000 });
```

### 8. 为SPA应用等待加载状态消失
```javascript
// ✅ 等待加载指示器消失
await page.locator('.loading').waitFor({ state: 'hidden', timeout: 10000 });
```

---

## 常见问题速查

| 现象 | 原因 | 解决 |
|------|------|------|
| 测试卡在 `waitForSelector` | 元素不存在，无超时 | 添加 `{ timeout: 5000 }` |
| `fill`/`click` 报错 "No snapshot" | 页面已刷新/跳转 | 重新获取快照，或用 `execute-code` |
| 登录成功但断言失败 | 断言在导航完成前执行 | 使用 `waitForURL` 后再断言 |
| 测试偶发失败 | 网络波动导致时间不确定 | 用 `waitForResponse` 替代固定等待 |
| 测试间状态污染 | localStorage未清理 | 每个测试前执行 `localStorage.clear()` |

---

## 可复用测试模板

```typescript
// login-test-template.ts
export async function testLoginFlow(page, credentials: { username: string; password: string }) {
  // 清理状态
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:5173/login');

  // 等待页面就绪
  await page.waitForSelector('input[placeholder="用户名"]', { timeout: 5000 });

  // 填写表单
  await page.fill('input[placeholder="用户名"]', credentials.username);
  await page.fill('input[placeholder="密码"]', credentials.password);

  // 点击登录并等待响应
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/auth/login'), { timeout: 10000 }),
    page.click('button:has-text("登 录")'),
  ]);

  const status = response.status();

  if (status === 200) {
    // 成功：等待跳转
    await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
    return { success: true, url: page.url() };
  } else {
    // 失败：等待错误提示
    await page.waitForSelector('.ant-alert-error', { timeout: 5000 });
    const errorText = await page.locator('.ant-alert-error').textContent();
    return { success: false, error: errorText, url: page.url() };
  }
}
```

---

## 本项目验证结果

| 测试场景 | 结果 | 关键观察 |
|----------|------|----------|
| 正确凭据登录 | ✅ 成功跳转 Dashboard | `waitForURL` 准确捕获导航 |
| 错误密码登录 | ✅ 显示"用户名或密码错误" | `waitForResponse(401)` 精准等待 |
| 等待不存在元素 | ✅ 2秒后正确超时 | 显式 timeout 防止无限阻塞 |
| 非阻塞检查 | ✅ `isVisible()` 立即返回 false | 不引发异常，不阻塞流程 |
