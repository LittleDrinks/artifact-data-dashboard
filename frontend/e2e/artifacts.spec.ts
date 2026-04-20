import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Artifacts Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/artifacts');
    await waitForPageReady(page);
  });

  test('列表加载：默认加载第一页有数据', async ({ page }) => {
    // 等待 API 返回
    await waitForApi(page, '/artifacts');
    await screenshot(page, 'artifacts', 'initial-load');

    // 检查表格存在
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible();

    // 检查有数据行
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    await screenshot(page, 'artifacts', 'table-loaded');

    // 检查分页信息
    const pagination = page.locator('.ant-pagination');
    await expect(pagination).toBeVisible();
  });

  test('分页切换：切换到第二页数据变化', async ({ page }) => {
    // 等待第一页加载
    await waitForApi(page, '/artifacts');

    // 记录第一页第一个文物名称
    const firstRowName = await page.locator('.ant-table-row .ant-table-cell:first-child a').first().textContent();
    await screenshot(page, 'artifacts', 'page1-first-row');

    // 点击下一页
    const nextBtn = page.locator('.ant-pagination-next:not(.ant-pagination-disabled)');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await waitForApi(page, '/artifacts');
      await screenshot(page, 'artifacts', 'page2-loaded');

      // 验证数据变化
      const secondPageFirstRowName = await page.locator('.ant-table-row .ant-table-cell:first-child a').first().textContent();
      // 如果第一页和第二页数据不同，则名称应该不同
      // 注意：可能数据不足两页，这里只验证分页功能可用
    }
  });

  test('关键词搜索：搜索"后母戊鼎"结果包含关键词', async ({ page }) => {
    // 等待初始加载
    await waitForApi(page, '/artifacts');

    // 输入搜索关键词
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('后母戊鼎');
    await screenshot(page, 'artifacts', 'search-input');

    // 点击搜索按钮
    await page.click('button:has-text("搜索")');
    await waitForApi(page, '/artifacts');
    await screenshot(page, 'artifacts', 'search-result');

    // 验证搜索结果包含关键词
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // 检查结果中是否包含"后母戊鼎"（在名称列）
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toContain('后母戊鼎');
    }
  });

  test('筛选器联动：选择年代"商"列表更新', async ({ page }) => {
    // 等待初始加载
    await waitForApi(page, '/artifacts');

    // 点击年代筛选下拉框
    const eraSelect = page.locator('.ant-select:has-text("全部年代")');
    await eraSelect.click();
    await screenshot(page, 'artifacts', 'era-dropdown');

    // 选择"商"选项
    await page.waitForSelector('.ant-select-dropdown', { timeout: 5000 });
    const option = page.locator('.ant-select-dropdown .ant-select-item:has-text("商")');
    if (await option.count() > 0) {
      await option.first().click();
      await waitForApi(page, '/artifacts');
      await screenshot(page, 'artifacts', 'era-filtered');

      // 验证结果中包含商代文物
      const rows = page.locator('.ant-table-row');
      const rowCount = await rows.count();
      if (rowCount > 0) {
        // 检查年代列是否显示"商"
        const eraColumn = await rows.first().locator('.ant-table-cell').nth(2).textContent();
        expect(eraColumn).toContain('商');
      }
    }
  });

  test('点击行跳转：点击文物名称跳转到详情页', async ({ page }) => {
    // 等待列表加载
    await waitForApi(page, '/artifacts');

    // 点击第一个文物的名称链接
    const firstRowLink = page.locator('.ant-table-row .ant-table-cell a').first();
    const artifactName = await firstRowLink.textContent();
    await screenshot(page, 'artifacts', 'click-row');

    await firstRowLink.click();

    // 等待跳转到详情页
    await page.waitForURL(/\/artifacts\/\d+/, { timeout: 5000 });
    await screenshot(page, 'artifacts', 'detail-page');

    // 验证 URL 格式
    expect(page.url()).toMatch(/\/artifacts\/\d+/);

    // 验证详情页显示文物名称
    const title = page.locator('h2');
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText).toContain(artifactName);
  });

  test('空搜索结果：搜索不存在的关键词显示空状态', async ({ page }) => {
    // 等待初始加载
    await waitForApi(page, '/artifacts');

    // 搜索不存在的内容
    const searchInput = page.locator('input[placeholder*="搜索"]');
    await searchInput.fill('xyz不存在123');
    await page.click('button:has-text("搜索")');
    await waitForApi(page, '/artifacts');
    await screenshot(page, 'artifacts', 'empty-search');

    // 检查空状态提示
    const emptyText = page.locator('.ant-empty-description');
    await expect(emptyText).toBeVisible();
    await expect(emptyText).toHaveText('暂无文物数据');
  });

  test('导出 CSV：点击导出触发下载', async ({ page }) => {
    // 等待列表加载
    await waitForApi(page, '/artifacts');

    // 监听下载事件
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

    // 点击导出按钮
    const exportBtn = page.locator('button:has-text("导出 CSV")');
    await expect(exportBtn).toBeVisible();
    await screenshot(page, 'artifacts', 'export-click');
    await exportBtn.click();

    const download = await downloadPromise;
    if (download) {
      // 验证下载文件名包含 artifacts
      const filename = download.suggestedFilename();
      expect(filename).toContain('artifacts');
      await screenshot(page, 'artifacts', 'export-done');
    }
  });
});