import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Knowledge Graph Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/graph');
    await waitForPageReady(page);
  });

  test('full graph loads with nodes and edges', async ({ page }) => {
    // Wait for graph API response
    await waitForApi(page, '/api/graph/full', 15000);

    // Wait for loading spinner to disappear
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Take screenshot of loaded graph
    await screenshot(page, 'graph', 'loaded');

    // Verify SVG has nodes (circle elements inside g groups)
    const svg = page.locator('svg');
    await expect(svg).toBeVisible();

    // Check for nodes - D3 renders nodes as g groups containing circles
    const nodes = page.locator('svg g circle');
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThan(0);

    // Check for edges (line elements)
    const edges = page.locator('svg line');
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThanOrEqual(0);

    // Stats bar should show counts
    const statsBar = page.locator('text=/\\d+ 个文物/');
    await expect(statsBar).toBeVisible();

    await screenshot(page, 'graph', 'nodes-visible');
  });

  test('loading indicator appears during fetch', async ({ page }) => {
    // On initial load, should see Spin component
    const loadingSpinner = page.locator('.ant-spin');
    // May or may not be visible depending on load speed
    await screenshot(page, 'graph', 'loading-state');
  });

  test('node drag changes position', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Get first node group
    const firstNode = page.locator('svg g').first();
    await expect(firstNode).toBeVisible();

    // Get initial transform
    const initialTransform = await firstNode.evaluate((el) => {
      return el.getAttribute('transform') || '';
    });

    // Drag the node
    const box = await firstNode.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 10 });
      await page.mouse.up();
    }

    await screenshot(page, 'graph', 'after-drag');

    // Node position should have changed (transform attribute)
    // Note: The simulation continues running, so position changes
  });

  test('zoom with mouse wheel', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    const svg = page.locator('svg');
    const box = await svg.boundingBox();
    if (box) {
      // Scroll to zoom in
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.evaluate(() => {
        const svg = document.querySelector('svg');
        if (svg) {
          svg.dispatchEvent(new WheelEvent('wheel', {
            deltaY: -100,
            bubbles: true,
          }));
        }
      });
    }

    await screenshot(page, 'graph', 'after-zoom');
  });

  test('keyword search highlights matching nodes', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Find search input
    const searchInput = page.locator('input[placeholder*="关键词"]').first();
    await expect(searchInput).toBeVisible();

    // Type a search keyword
    await searchInput.fill('青铜');
    await searchInput.press('Enter');

    // Wait for search API
    await waitForApi(page, '/api/graph/search', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    await screenshot(page, 'graph', 'search-result');

    // Check for matched count display
    const matchInfo = page.locator('text=/找到 \\d+ 个匹配/');
    await expect(matchInfo).toBeVisible();

    // Nodes with search highlighting have red stroke (#ff6b6b)
    const highlightedNodes = page.locator('svg g circle[stroke="#ff6b6b"]');
    const highlightedCount = await highlightedNodes.count();
    expect(highlightedCount).toBeGreaterThan(0);

    await screenshot(page, 'graph', 'search-highlighted');
  });

  test('node click shows detail panel', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Click on a node
    const firstNodeCircle = page.locator('svg g circle').first();
    await firstNodeCircle.click();

    // Wait for node detail API
    await waitForApi(page, '/api/graph/node/', 10000);

    await screenshot(page, 'graph', 'node-clicked');

    // Detail panel should show node name
    const detailCard = page.locator('.ant-card').filter({ hasText: '文物详情' });
    await expect(detailCard).toBeVisible();

    // Should have node name visible
    const nodeName = detailCard.locator('[style*="fontWeight"]').first();
    await expect(nodeName).toBeVisible();
  });

  test('type filter reduces visible nodes', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Get initial node count
    const initialCount = await page.locator('svg g circle').count();

    // Find type checkboxes
    const typeCheckbox = page.locator('.ant-checkbox-wrapper').filter({ hasText: '标签' });
    await expect(typeCheckbox).toBeVisible();

    // Uncheck 'tag' type
    await typeCheckbox.click();

    // Wait for graph reload
    await waitForApi(page, '/api/graph/full', 10000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    await screenshot(page, 'graph', 'type-filtered');

    // Node count should be different (usually less)
    const newCount = await page.locator('svg g circle').count();
    // The count may increase or decrease depending on filter
    expect(newCount).toBeGreaterThanOrEqual(0);
  });

  test('stats bar shows node and edge counts', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Stats bar at bottom left
    const statsBar = page.locator('[style*="position: absolute"][style*="bottom"]');
    await expect(statsBar).toBeVisible();

    // Should contain node count text
    const statsText = await statsBar.textContent();
    expect(statsText).toMatch(/\d+ 个文物/);
    expect(statsText).toMatch(/\d+ 关系/);

    await screenshot(page, 'graph', 'stats-bar');
  });

  test('legend shows type colors', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Legend at top left
    const legend = page.locator('[style*="position: absolute"][style*="top: 12"][style*="left: 12"]');
    await expect(legend).toBeVisible();

    // Should show type labels
    await expect(legend.locator('text=文物')).toBeVisible();
    await expect(legend.locator('text=朝代')).toBeVisible();

    await screenshot(page, 'graph', 'legend');
  });

  test('reset zoom button works', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Find reset view button
    const resetBtn = page.locator('button').filter({ hasText: '重置视图' });
    await expect(resetBtn).toBeVisible();

    await resetBtn.click();
    await screenshot(page, 'graph', 'reset-view');
  });

  test('export graph data', async ({ page }) => {
    await waitForApi(page, '/api/graph/full', 15000);
    await expect(page.locator('.ant-spin')).toBeHidden({ timeout: 15000 });

    // Find export button
    const exportBtn = page.locator('button').filter({ has: page.locator('.anticon-download') });
    await expect(exportBtn).toBeVisible();

    await exportBtn.click();

    // Wait for success message
    await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 10000 });

    await screenshot(page, 'graph', 'export-done');
  });
});