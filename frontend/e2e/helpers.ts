import { Page, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const API_BASE = 'http://localhost:8000/api';

/**
 * 登录辅助函数
 * 先用 API 注册（如果不存在）/登录获取 token，然后设置 localStorage
 */
export async function login(
  page: Page,
  username: string = 'testuser',
  password: string = 'testpass123'
): Promise<void> {
  // 尝试注册
  const registerRes = await page.request.post(`${API_BASE}/auth/register`, {
    data: { username, email: `${username}@test.com`, password, confirm_password: password },
    failOnStatusCode: false,
  });

  // 如果注册失败（用户已存在），则直接登录
  if (registerRes.status() !== 200 && registerRes.status() !== 201) {
    // 用户可能已存在，尝试登录
  }

  // 登录获取 token
  const loginRes = await page.request.post(`${API_BASE}/auth/login`, {
    data: { username, password },
  });

  expect(loginRes.status()).toBe(200);
  const loginData = await loginRes.json();
  const token = loginData.access_token;

  // 设置 localStorage token
  await page.goto('/');
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
  }, token);

  // 刷新页面使 token 生效
  await page.reload();
}

/**
 * 等待特定 API 请求完成
 * @param urlPattern - URL 正则匹配模式
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForApi(
  page: Page,
  urlPattern: string | RegExp,
  timeout: number = 10000
): Promise<void> {
  await page.waitForResponse(
    (response) => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout }
  );
}

/**
 * 统一截图命名规范
 * 格式：{pageName}-{action}-{timestamp}.png
 */
export async function screenshot(
  page: Page,
  pageName: string,
  action: string
): Promise<string> {
  const timestamp = Date.now();
  const filename = `${pageName}-${action}-${timestamp}.png`;
  const screenshotsDir = path.join(process.cwd(), 'e2e', 'screenshots');

  // 确保目录存在
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const filepath = path.join(screenshotsDir, filename);
  await page.screenshot({ path: filepath, fullPage: false });

  return filepath;
}

/**
 * 等待页面加载完成（网络空闲）
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30000 });
}

/**
 * 等待特定元素出现并可见
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 10000
): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}