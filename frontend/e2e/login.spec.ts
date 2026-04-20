import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);
  });

  test('注册后登录成功', async ({ page }) => {
    // 切换到注册 tab
    await page.click('text=注册');
    await screenshot(page, 'login', 'register-tab');

    // 填写注册表单
    const timestamp = Date.now();
    const username = `testuser_${timestamp}`;
    await page.fill('input[placeholder="用户名"]', username);
    await page.fill('input[placeholder="邮箱"]', `${username}@test.com`);
    await page.fill('input[placeholder="密码"]', 'testpass123');
    await page.fill('input[placeholder="确认密码"]', 'testpass123');
    await screenshot(page, 'login', 'register-filled');

    // 提交注册
    await page.click('button:has-text("注册")');

    // 等待注册成功消息或直接跳转
    await page.waitForURL('/', { timeout: 10000 });
    await screenshot(page, 'login', 'after-register');

    // 验证 localStorage 有 token
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('登录失败显示错误提示', async ({ page }) => {
    // 填写错误密码
    await page.fill('input[placeholder="用户名"]', 'nonexistent');
    await page.fill('input[placeholder="密码"]', 'wrongpassword');
    await screenshot(page, 'login', 'wrong-credentials');

    // 提交登录
    await page.click('button:has-text("登录")');

    // 等待错误消息出现（Ant Design message）
    await page.waitForSelector('.ant-message-error', { timeout: 5000 });
    await screenshot(page, 'login', 'login-error');

    // 验证还在登录页
    expect(page.url()).toContain('/login');
  });

  test('已登录用户访问登录页自动跳转', async ({ page }) => {
    // 先登录
    await login(page, 'testuser', 'testpass123');
    await screenshot(page, 'login', 'already-logged-in');

    // 访问登录页
    await page.goto('/login');

    // 应该自动跳转到首页
    await page.waitForURL('/', { timeout: 5000 });
    await screenshot(page, 'login', 'auto-redirect');

    expect(page.url()).not.toContain('/login');
  });

  test('未登录访问首页跳转到登录页', async ({ page }) => {
    // 清除 token
    await page.evaluate(() => localStorage.removeItem('token'));

    // 访问首页
    await page.goto('/');

    // 应该跳转到登录页
    await page.waitForURL(/\/login/, { timeout: 5000 });
    await screenshot(page, 'login', 'unauth-redirect');

    expect(page.url()).toContain('/login');
  });

  test('表单验证：空表单提交显示错误', async ({ page }) => {
    // 不填写任何内容，直接点击登录
    await page.click('button:has-text("登录")');
    await screenshot(page, 'login', 'empty-submit');

    // 等待验证错误提示
    await page.waitForSelector('.ant-form-item-explain-error', { timeout: 3000 });

    // 应该看到"请输入用户名"或类似提示
    const errorVisible = await page.locator('.ant-form-item-explain-error').isVisible();
    expect(errorVisible).toBe(true);
    await screenshot(page, 'login', 'validation-error');
  });
});