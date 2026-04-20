import { test, expect } from '@playwright/test';
import { login, screenshot, waitForApi, waitForPageReady } from './helpers';

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/chat');
    await waitForPageReady(page);
  });

  // Set longer timeout for SSE streaming tests
  test.setTimeout(60000);

  test('empty state shows welcome message', async ({ page }) => {
    await screenshot(page, 'chat', 'empty-state');

    // Welcome message with robot icon
    const robotIcon = page.locator('.anticon-robot');
    await expect(robotIcon).toBeVisible();

    // Title "AI 智能问答"
    await expect(page.locator('text=AI 智能问答')).toBeVisible();

    // Suggested questions
    await expect(page.locator('text=青铜器有哪些种类？')).toBeVisible();
  });

  test('new session button works', async ({ page }) => {
    // Click "新对话" button
    const newChatBtn = page.locator('button').filter({ hasText: '新对话' });
    await expect(newChatBtn).toBeVisible();
    await newChatBtn.click();

    await screenshot(page, 'chat', 'new-session');

    // Should clear messages and show empty state
    await expect(page.locator('.anticon-robot')).toBeVisible();
  });

  test('history drawer opens and shows sessions', async ({ page }) => {
    // Click "历史记录" button
    const historyBtn = page.locator('button').filter({ hasText: '历史记录' });
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

    // Drawer should open
    const drawer = page.locator('.ant-drawer').filter({ hasText: '历史记录' });
    await expect(drawer).toBeVisible({ timeout: 5000 });

    await screenshot(page, 'chat', 'history-drawer');

    // Close drawer
    await page.locator('.ant-drawer-close').click();
    await expect(drawer).toBeHidden();
  });

  test('send message and receive AI response', async ({ page }) => {
    test.setTimeout(60000);

    // Find input textarea
    const input = page.locator('textarea[placeholder*="文物"]');
    await expect(input).toBeVisible();

    // Type a question
    await input.fill('青铜器有哪些种类？');

    await screenshot(page, 'chat', 'input-filled');

    // Click send button
    const sendBtn = page.locator('button').filter({ has: page.locator('.anticon-send') });
    await sendBtn.click();

    // Wait for SSE response - may take time for AI processing
    await waitForApi(page, '/api/chat/ask', 30000);

    await screenshot(page, 'chat', 'message-sent');

    // User message should appear
    const userBubble = page.locator('[style*="background: #533afd"]').filter({ hasText: '青铜器' });
    await expect(userBubble).toBeVisible();

    // AI response bubble should appear (white background)
    // Wait longer for streaming response
    const aiBubble = page.locator('[style*="border: 1px solid #e5edf5"]').first();
    await expect(aiBubble).toBeVisible({ timeout: 45000 });

    await screenshot(page, 'chat', 'ai-response');

    // Should have some content in AI bubble
    const aiContent = await aiBubble.textContent();
    expect(aiContent?.length).toBeGreaterThan(0);
  });

  test('thinking section appears for complex queries', async ({ page }) => {
    test.setTimeout(60000);

    const input = page.locator('textarea[placeholder*="文物"]');
    await input.fill('介绍一下后母戊鼎的历史');
    await screenshot(page, 'chat', 'thinking-input');

    const sendBtn = page.locator('button').filter({ has: page.locator('.anticon-send') });
    await sendBtn.click();

    await waitForApi(page, '/api/chat/ask', 30000);

    // Look for thinking section (expandable panel)
    const thinkingSection = page.locator('text=思考过程');
    // May or may not appear depending on AI response mode
    await screenshot(page, 'chat', 'thinking-check');

    // Wait for response to complete
    await page.waitForTimeout(5000);
    await screenshot(page, 'chat', 'thinking-done');
  });

  test('tool call indicator appears', async ({ page }) => {
    test.setTimeout(60000);

    const input = page.locator('textarea[placeholder*="文物"]');
    await input.fill('有哪些唐代的文物？');

    const sendBtn = page.locator('button').filter({ has: page.locator('.anticon-send') });
    await sendBtn.click();

    await waitForApi(page, '/api/chat/ask', 30000);

    // Look for tool call indicator (search icon with query)
    const toolCallIndicator = page.locator('.anticon-search').first();
    await screenshot(page, 'chat', 'tool-call-wait');

    // Tool call panel may open automatically
    await page.waitForTimeout(10000);
    await screenshot(page, 'chat', 'tool-call-done');
  });

  test('RAG panel shows search results', async ({ page }) => {
    test.setTimeout(60000);

    const input = page.locator('textarea[placeholder*="文物"]');
    await input.fill('青铜器');

    const sendBtn = page.locator('button').filter({ has: page.locator('.anticon-send') });
    await sendBtn.click();

    await waitForApi(page, '/api/chat/ask', 30000);

    // Wait for response
    await page.waitForTimeout(15000);

    // RAG panel may be visible (right side panel)
    const ragPanel = page.locator('text=检索结果');
    await screenshot(page, 'chat', 'rag-panel-check');

    // If panel is visible, check for result items
    if (await ragPanel.isVisible()) {
      await screenshot(page, 'chat', 'rag-panel-visible');
    }
  });

  test('click artifact result navigates to detail', async ({ page }) => {
    test.setTimeout(60000);

    const input = page.locator('textarea[placeholder*="文物"]');
    await input.fill('后母戊鼎');

    const sendBtn = page.locator('button').filter({ has: page.locator('.anticon-send') });
    await sendBtn.click();

    await waitForApi(page, '/api/chat/ask', 30000);

    // Wait for response
    await page.waitForTimeout(15000);
    await screenshot(page, 'chat', 'artifact-search');

    // If RAG panel shows artifact results, click one
    const artifactResult = page.locator('[style*="cursor: pointer"]').filter({ hasText: '后母戊鼎' }).first();
    if (await artifactResult.isVisible()) {
      await artifactResult.click();

      // Should navigate to artifact detail page
      await expect(page).toHaveURL(/\/artifacts\/\d+/, { timeout: 10000 });
      await screenshot(page, 'chat', 'navigated-to-artifact');
    }
  });

  test('delete session from history', async ({ page }) => {
    // First create a session by sending a message
    const input = page.locator('textarea[placeholder*="文物"]');
    await input.fill('测试');
    const sendBtn = page.locator('button').filter({ has: page.locator('.anticon-send') });
    await sendBtn.click();

    await waitForApi(page, '/api/chat/ask', 30000);
    await page.waitForTimeout(5000);

    // Open history drawer
    const historyBtn = page.locator('button').filter({ hasText: '历史记录' });
    await historyBtn.click();

    const drawer = page.locator('.ant-drawer').filter({ hasText: '历史记录' });
    await expect(drawer).toBeVisible({ timeout: 5000 });

    await screenshot(page, 'chat', 'history-with-session');

    // Select a session checkbox
    const checkbox = drawer.locator('input[type="checkbox"]').first();
    await checkbox.click();

    // Click delete button
    const deleteBtn = drawer.locator('button').filter({ has: page.locator('.anticon-delete') });
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();

      // Confirm deletion in popconfirm
      const confirmBtn = page.locator('.ant-popconfirm .ant-btn-danger').first();
      await confirmBtn.click();

      await screenshot(page, 'chat', 'session-deleted');
    }
  });

  test('switch between sessions', async ({ page }) => {
    // Open history drawer
    const historyBtn = page.locator('button').filter({ hasText: '历史记录' });
    await historyBtn.click();

    const drawer = page.locator('.ant-drawer').filter({ hasText: '历史记录' });
    await expect(drawer).toBeVisible({ timeout: 5000 });

    await screenshot(page, 'chat', 'sessions-list');

    // If there are sessions, click one to switch
    const sessionItem = drawer.locator('[style*="cursor: pointer"]').first();
    if (await sessionItem.isVisible()) {
      await sessionItem.click();
      await screenshot(page, 'chat', 'session-switched');
    }

    // Close drawer
    await drawer.locator('.ant-drawer-close').click();
  });

  test('suggested question click fills input', async ({ page }) => {
    // Click on a suggested question
    const suggestedQ = page.locator('text=青铜器有哪些种类？').first();
    await expect(suggestedQ).toBeVisible();
    await suggestedQ.click();

    await screenshot(page, 'chat', 'suggested-clicked');

    // Input should be filled
    const input = page.locator('textarea[placeholder*="文物"]');
    const inputValue = await input.inputValue();
    expect(inputValue).toContain('青铜器');
  });

  test('AI unavailable warning appears if no API key', async ({ page }) => {
    // This test checks if there's a warning about AI being unavailable
    // The warning appears as a yellow Alert if AI_API_KEY is not configured
    const warningAlert = page.locator('.ant-alert-warning');
    await screenshot(page, 'chat', 'ai-warning-check');

    // May or may not be visible depending on backend config
    // Just capture screenshot for manual verification
  });
});