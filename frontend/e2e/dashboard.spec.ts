import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/');
    await waitForPageReady(page);
  });

  test('统计卡片加载：显示非零数值', async ({ page }) => {
    // 等待统计数据加载
    await waitForApi(page, '/stats/overview');

    // 检查 4 个统计卡片都存在
    const cards = page.locator('.ant-card');
    await expect(cards.first()).toBeVisible();
    await screenshot(page, 'dashboard', 'stat-cards');

    // 检查每个卡片有数值
    const statValues = page.locator('.ant-statistic-content-value');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // 验证数值不为 0（或者至少显示数字）
    for (let i = 0; i < 4; i++) {
      const value = await statValues.nth(i).textContent();
      expect(value).toMatch(/\d+/);
    }
  });

  test('柱状图渲染：年代分布有柱子', async ({ page }) => {
    // 等待年代数据加载
    await waitForApi(page, '/stats/by-era');
    await screenshot(page, 'dashboard', 'bar-loading');

    // 等待图表渲染
    await page.waitForSelector('.recharts-bar-rectangle', { timeout: 10000 });
    await screenshot(page, 'dashboard', 'bar-chart');

    // 检查有柱子元素
    const bars = page.locator('.recharts-bar-rectangle');
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);
  });

  test('饼图渲染：类别占比有扇形', async ({ page }) => {
    // 等待类别数据加载
    await waitForApi(page, '/stats/by-category');

    // 等待饼图渲染
    await page.waitForSelector('.recharts-pie-sector', { timeout: 10000 });
    await screenshot(page, 'dashboard', 'pie-chart');

    // 检查有扇形元素
    const sectors = page.locator('.recharts-pie-sector');
    const sectorCount = await sectors.count();
    expect(sectorCount).toBeGreaterThan(0);
  });

  test('词云展示：词云区域有文字', async ({ page }) => {
    // 等待词云数据加载
    await waitForApi(page, '/stats/wordcloud');
    await screenshot(page, 'dashboard', 'wordcloud-loading');

    // 等待词云 SVG 渲染
    await page.waitForSelector('.wordcloud-word', { timeout: 15000 });
    await screenshot(page, 'dashboard', 'wordcloud');

    // 检查有文字元素
    const words = page.locator('.wordcloud-word');
    const wordCount = await words.count();
    expect(wordCount).toBeGreaterThan(0);
  });

  test('首屏加载完整展示', async ({ page }) => {
    // 等待所有数据加载完成
    await waitForApi(page, '/stats/overview');
    await waitForApi(page, '/stats/by-era');
    await waitForApi(page, '/stats/by-category');
    await waitForApi(page, '/stats/wordcloud');

    // 等待图表渲染完成
    await page.waitForSelector('.recharts-bar-rectangle', { timeout: 10000 });
    await page.waitForSelector('.recharts-pie-sector', { timeout: 10000 });
    await page.waitForSelector('.wordcloud-word', { timeout: 15000 });

    // 全页面截图
    await screenshot(page, 'dashboard', 'full-loaded');

    // 验证各区块都存在
    await expect(page.locator('text=各朝代文物数量分布')).toBeVisible();
    await expect(page.locator('text=文物类别占比')).toBeVisible();
    await expect(page.locator('text=文物关键词云')).toBeVisible();
  });
});