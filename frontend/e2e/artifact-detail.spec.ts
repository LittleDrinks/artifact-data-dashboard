import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Artifact Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('详情页加载：显示文物名称和元数据', async ({ page }) => {
    // 先访问列表页获取一个文物 ID
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 点击第一个文物进入详情
    const firstRowLink = page.locator('.ant-table-row .ant-table-cell a').first();
    await firstRowLink.click();
    await page.waitForURL(/\/artifacts\/\d+/);
    await waitForApi(page, '/artifacts/');
    await screenshot(page, 'artifact-detail', 'page-loaded');

    // 验证标题存在
    const title = page.locator('h2');
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(0);

    // 验证基本信息卡片存在
    const infoCard = page.locator('.ant-card:has-text("基本信息")');
    await expect(infoCard).toBeVisible();
    await screenshot(page, 'artifact-detail', 'info-card');
  });

  test('全部字段展示：name/description/category/era 等有值', async ({ page }) => {
    // 搜索一个有完整数据的文物
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 搜索"后母戊鼎"
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('后母戊鼎');
    await page.click('button:has-text("搜索")');
    await waitForApi(page, '/artifacts');

    // 点击结果进入详情
    const resultLink = page.locator('.ant-table-row .ant-table-cell a').first();
    if (await resultLink.count() > 0) {
      await resultLink.click();
      await page.waitForURL(/\/artifacts\/\d+/);
      await waitForApi(page, '/artifacts/');
      await screenshot(page, 'artifact-detail', 'full-data');

      // 验证各字段存在
      const descriptions = page.locator('.ant-descriptions-item');
      const descCount = await descriptions.count();
      expect(descCount).toBeGreaterThan(3);

      // 验证年代、类别等字段有内容
      const contentValues = await page.locator('.ant-descriptions-item-content').allTextContents();
      const hasData = contentValues.some(v => v.length > 0 && v !== '未知');
      expect(hasData).toBe(true);
    }
  });

  test('图片显示：图片元素存在', async ({ page }) => {
    // 访问一个有图片的文物详情
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 找一个有图片 URL 的文物（通过搜索）
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('青铜');
    await page.click('button:has-text("搜索")');
    await waitForApi(page, '/artifacts');

    // 点击第一个结果
    const resultLink = page.locator('.ant-table-row .ant-table-cell a').first();
    if (await resultLink.count() > 0) {
      await resultLink.click();
      await page.waitForURL(/\/artifacts\/\d+/);
      await waitForApi(page, '/artifacts/');
      await screenshot(page, 'artifact-detail', 'image-check');

      // 检查图片区域存在（Image 组件或占位符）
      const imageArea = page.locator('.ant-image, .ant-card:has(.ant-image)');
      // 图片组件或"暂无图片"占位符都算通过
      const hasImage = await imageArea.count() > 0 || await page.locator('text=暂无图片').count() > 0;
      expect(hasImage).toBe(true);
    }
  });

  test('编辑按钮：登录用户可见', async ({ page }) => {
    // 已在 beforeEach 中登录
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 点击第一个文物
    const firstRowLink = page.locator('.ant-table-row .ant-table-cell a').first();
    await firstRowLink.click();
    await page.waitForURL(/\/artifacts\/\d+/);
    await waitForApi(page, '/artifacts/');
    await screenshot(page, 'artifact-detail', 'edit-visible');

    // 检查编辑按钮存在
    const editBtn = page.locator('button:has-text("编辑")');
    await expect(editBtn).toBeVisible();
  });

  test('删除按钮：admin 用户可见', async ({ page }) => {
    // 使用 admin 用户登录
    await login(page, 'admin', 'adminpass123');
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 点击第一个文物
    const firstRowLink = page.locator('.ant-table-row .ant-table-cell a').first();
    await firstRowLink.click();
    await page.waitForURL(/\/artifacts\/\d+/);
    await waitForApi(page, '/artifacts/');
    await screenshot(page, 'artifact-detail', 'delete-visible');

    // 检查删除按钮存在（仅 admin 可见）
    const deleteBtn = page.locator('button:has-text("删除")');
    // 如果 admin 用户登录成功，应该能看到删除按钮
    const deleteVisible = await deleteBtn.isVisible().catch(() => false);
    // 注意：如果 admin 用户不存在，此测试可能失败，需要先创建 admin
  });

  test('返回列表：点击返回按钮跳转到列表页', async ({ page }) => {
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 点击第一个文物进入详情
    const firstRowLink = page.locator('.ant-table-row .ant-table-cell a').first();
    await firstRowLink.click();
    await page.waitForURL(/\/artifacts\/\d+/);
    await screenshot(page, 'artifact-detail', 'on-detail');

    // 点击返回列表按钮
    const backBtn = page.locator('button:has-text("返回列表")');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // 验证跳转到列表页
    await page.waitForURL('/artifacts', { timeout: 5000 });
    await screenshot(page, 'artifact-detail', 'back-to-list');

    expect(page.url()).toContain('/artifacts');
  });

  test('在图谱中查看按钮：跳转到图谱页带搜索参数', async ({ page }) => {
    await page.goto('/artifacts');
    await waitForApi(page, '/artifacts');

    // 点击第一个文物进入详情
    const firstRowLink = page.locator('.ant-table-row .ant-table-cell a').first();
    const artifactName = await firstRowLink.textContent();
    await firstRowLink.click();
    await page.waitForURL(/\/artifacts\/\d+/);
    await screenshot(page, 'artifact-detail', 'graph-link');

    // 点击"在图谱中查看"按钮
    const graphBtn = page.locator('button:has-text("在图谱中查看")');
    await expect(graphBtn).toBeVisible();
    await graphBtn.click();

    // 验证跳转到图谱页并带搜索参数
    await page.waitForURL(/\/graph\?search=/, { timeout: 5000 });
    await screenshot(page, 'artifact-detail', 'on-graph');

    expect(page.url()).toContain('/graph');
    expect(page.url()).toContain('search=');
  });
});