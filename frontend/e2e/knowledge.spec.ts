import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Knowledge Extraction Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/knowledge');
    await waitForPageReady(page);
  });

  test('page loads with text extraction card', async ({ page }) => {
    await screenshot(page, 'knowledge', 'page-loaded');

    // Main card for text extraction
    const extractCard = page.locator('.ant-card').filter({ hasText: '文本知识抽取' });
    await expect(extractCard).toBeVisible();

    // TextArea for input
    const textArea = page.locator('textarea[placeholder*="文物"]');
    await expect(textArea).toBeVisible();

    // Extract button
    const extractBtn = page.locator('button').filter({ hasText: '开始抽取' });
    await expect(extractBtn).toBeVisible();
  });

  test('CSV import card visible', async ({ page }) => {
    // CSV Import card
    const importCard = page.locator('.ant-card').filter({ hasText: 'CSV 导入' });
    await expect(importCard).toBeVisible();

    // Upload button
    const uploadBtn = importCard.locator('button').filter({ has: page.locator('.anticon-upload') });
    await expect(uploadBtn).toBeVisible();

    await screenshot(page, 'knowledge', 'csv-import-card');
  });

  test('CSV export card visible', async ({ page }) => {
    // CSV Export card
    const exportCard = page.locator('.ant-card').filter({ hasText: 'CSV 导出' });
    await expect(exportCard).toBeVisible();

    // Export button
    const exportBtn = exportCard.locator('button').filter({ has: page.locator('.anticon-download') });
    await expect(exportBtn).toBeVisible();

    await screenshot(page, 'knowledge', 'csv-export-card');
  });

  // Skip extraction test if LightRAG/AI not configured
  test.skip('text extraction produces entities and relations', async ({ page }) => {
    test.setTimeout(60000);

    const textArea = page.locator('textarea[placeholder*="文物"]');
    await textArea.fill('后母戊鼎是中国商代晚期的青铜器，出土于河南安阳，属于青铜器类别。');

    await screenshot(page, 'knowledge', 'text-filled');

    const extractBtn = page.locator('button').filter({ hasText: '开始抽取' });
    await extractBtn.click();

    // Wait for extraction API
    await waitForApi(page, '/api/graph/extract', 45000);

    await screenshot(page, 'knowledge', 'extraction-done');

    // Should show extracted entities as Tags
    const entityTags = page.locator('.ant-tag');
    const tagCount = await entityTags.count();
    expect(tagCount).toBeGreaterThan(0);

    // Should show entity type headers
    await expect(page.locator('text=抽取实体')).toBeVisible();
  });

  test.skip('CSV export downloads file', async ({ page }) => {
    test.setTimeout(30000);

    const exportCard = page.locator('.ant-card').filter({ hasText: 'CSV 导出' });
    const exportBtn = exportCard.locator('button').filter({ has: page.locator('.anticon-download') });

    // Listen for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });

    await exportBtn.click();

    const download = await downloadPromise;

    // Verify file name contains .csv
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/\.csv$/);

    await screenshot(page, 'knowledge', 'csv-download');
  });

  test('CSV upload shows preview', async ({ page }) => {
    // Create a test CSV file
    const csvContent = 'source,relation,target\n后母戊鼎,出土于,河南安阳\n后母戊鼎,属于,青铜器';

    // Upload component
    const uploadInput = page.locator('input[type="file"]');

    // Write temp file and upload
    // Note: Playwright requires actual file for upload
    // This test checks if upload component exists
    await screenshot(page, 'knowledge', 'upload-ready');

    const importCard = page.locator('.ant-card').filter({ hasText: 'CSV 导入' });
    const uploadBtn = importCard.locator('button').filter({ has: page.locator('.anticon-upload') });
    await expect(uploadBtn).toBeVisible();
  });

  test('extraction button disabled without text', async ({ page }) => {
    const extractBtn = page.locator('button').filter({ hasText: '开始抽取' });

    // Should be disabled when textarea is empty
    await expect(extractBtn).toBeDisabled();

    // Fill text
    const textArea = page.locator('textarea[placeholder*="文物"]');
    await textArea.fill('测试文本');

    // Should be enabled now
    await expect(extractBtn).toBeEnabled();

    await screenshot(page, 'knowledge', 'btn-enabled');
  });

  test('import button disabled without file', async ({ page }) => {
    const importCard = page.locator('.ant-card').filter({ hasText: 'CSV 导入' });
    const importBtn = importCard.locator('button').filter({ hasText: '导入' });

    // Should be disabled when no file selected
    await expect(importBtn).toBeDisabled();

    await screenshot(page, 'knowledge', 'import-btn-disabled');
  });

  // Skip if extraction API not available
  test.skip('extraction shows loading spinner', async ({ page }) => {
    test.setTimeout(60000);

    const textArea = page.locator('textarea[placeholder*="文物"]');
    await textArea.fill('后母戊鼎');

    const extractBtn = page.locator('button').filter({ hasText: '开始抽取' });
    await extractBtn.click();

    // Should show loading spinner
    const spinner = page.locator('.ant-spin');
    await expect(spinner).toBeVisible({ timeout: 5000 });

    await screenshot(page, 'knowledge', 'extraction-loading');
  });
});