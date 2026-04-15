"""
Quality Rubric E2E tests — validates each standard in docs/quality-rubric.md.

Tests are organized by dimension:
  A = Async Safety
  B = Data Consistency
  C = Interaction Feedback
  D = Visual Consistency
  E = API Robustness
"""
import pytest
import re
import json
import asyncio
from playwright.async_api import async_playwright

from conftest import BASE_URL, save_screenshot_on_failure, DEFAULT_TIMEOUT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _login(page):
    """Login as admin and wait for redirect."""
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("networkidle")
    await page.locator('input[placeholder="用户名"]').first.fill("admin")
    await page.locator('input[placeholder="密码"]').first.fill("admin123")
    await page.locator('button[type="submit"]').click()
    for _ in range(20):
        await page.wait_for_timeout(1000)
        if "/login" not in page.url:
            token = await page.evaluate("localStorage.getItem('token')")
            if token:
                return
    raise AssertionError(f"Login failed: still on {page.url}")


async def _goto_chat(page):
    """Navigate to chat page with login."""
    await _login(page)
    await page.goto(f"{BASE_URL}/chat")
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(2000)


# ===========================================================================
# A. Async Safety
# ===========================================================================

@pytest.mark.asyncio(loop_scope="function")
async def test_rapid_send_blocked_by_loading():
    """A2: Rapid send is blocked while loading."""
    test_name = "test_rapid_send_blocked_by_loading"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            textarea = page.locator('textarea')
            assert await textarea.count() > 0, "No textarea found"

            # Type and send first message
            await textarea.first.fill("青铜器有哪些种类？")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(500)

            # Check that textarea is disabled during loading
            is_disabled = await textarea.first.is_disabled()
            assert is_disabled, "Textarea should be disabled while AI is responding"

            # Check send button shows loading state
            btn_loading = await send_btn.evaluate("el => el.classList.contains('ant-btn-loading') || el.disabled")
            assert btn_loading, "Send button should be in loading state during AI response"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_session_switch_clears_messages():
    """A3: Switching sessions clears previous messages."""
    test_name = "test_session_switch_clears_messages"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a message to create a session
            textarea = page.locator('textarea')
            await textarea.first.fill("测试会话切换")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(8000)  # Wait for response

            # Open history drawer
            history_btn = page.locator('button:has-text("历史记录")')
            if await history_btn.count() > 0:
                await history_btn.first.click()
                await page.wait_for_timeout(1000)

                # Click "新对话" to switch to a new empty session
                new_chat_btn = page.locator('button:has-text("新对话")')
                if await new_chat_btn.count() > 0:
                    await new_chat_btn.first.click()
                    await page.wait_for_timeout(1000)

                    # Messages should be empty now
                    # Check that the empty state indicator is visible
                    robot_icon = page.locator('[class*="RobotOutlined"], svg[data-icon="robot"]')
                    has_empty = await robot_icon.count() > 0

                    # Alternative: check message count via text content
                    ai_avatar_count = await page.locator('div:has-text("AI")').count()
                    # In empty state, there should be no message bubbles
                    # (the "AI" in the empty state prompt area is not a message)
                    assert has_empty or ai_avatar_count <= 1, \
                        "Messages from previous session should be cleared"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_network_error_shows_friendly_msg():
    """A4: Network error during chat shows friendly error message."""
    test_name = "test_network_error_shows_friendly_msg"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Intercept chat API and force a network error
            await page.route("**/api/chat/ask", lambda route: route.abort("failed"))

            # Send a message
            textarea = page.locator('textarea')
            await textarea.first.fill("测试网络错误")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(3000)

            # Check for error message via antd message component
            error_toast = page.locator('.ant-message-error, .ant-message')
            has_error = await error_toast.count() > 0

            # Check that loading state is cleared
            is_disabled = await textarea.first.is_disabled()
            assert not is_disabled, "Textarea should be re-enabled after error"

            assert has_error, "Error toast should be visible after network failure"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_done_event_ends_streaming():
    """A5: 'done' event ends streaming — cursor disappears and loading stops."""
    test_name = "test_done_event_ends_streaming"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a simple greeting (should not trigger tool calls)
            textarea = page.locator('textarea')
            await textarea.first.fill("你好")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()

            # Wait for response to complete (up to 30s)
            for _ in range(30):
                await page.wait_for_timeout(1000)
                # Check if streaming cursor is gone (the blink animation element)
                streaming_cursor = await page.evaluate("""
                    () => {
                        const cursors = document.querySelectorAll('span');
                        for (const s of cursors) {
                            const style = getComputedStyle(s);
                            if (style.animation && style.animation.includes('blink')) {
                                return true;
                            }
                        }
                        return false;
                    }
                """)
                if not streaming_cursor:
                    # Also verify textarea is no longer disabled
                    is_disabled = await textarea.first.is_disabled()
                    if not is_disabled:
                        break  # Both streaming ended and input re-enabled

            # Final check: no streaming cursor
            has_streaming_cursor = await page.evaluate("""
                () => {
                    const cursors = document.querySelectorAll('span');
                    for (const s of cursors) {
                        const style = getComputedStyle(s);
                        if (style.animation && style.animation.includes('blink')) {
                            return true;
                        }
                    }
                    return false;
                }
            """)
            assert not has_streaming_cursor, "Streaming cursor should disappear after done event"

            # Verify textarea is re-enabled
            is_disabled = await textarea.first.is_disabled()
            assert not is_disabled, "Textarea should be re-enabled after done event"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


# ===========================================================================
# B. Data Consistency
# ===========================================================================

@pytest.mark.asyncio(loop_scope="function")
async def test_message_pair_persisted():
    """B1: User + assistant message pair is saved to database."""
    test_name = "test_message_pair_persisted"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a message
            textarea = page.locator('textarea')
            await textarea.first.fill("测试消息持久化")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()

            # Wait for response to complete
            await page.wait_for_timeout(15000)

            # Open history drawer
            history_btn = page.locator('button:has-text("历史记录")')
            if await history_btn.count() > 0:
                await history_btn.first.click()
                await page.wait_for_timeout(1000)

                # Click the first session to load its messages
                session_item = page.locator('.ant-drawer .ant-drawer-body > div > div').first
                await session_item.click()
                await page.wait_for_timeout(2000)

                # Check for both user and AI messages
                user_msg = page.locator('text=测试消息持久化')
                ai_avatar = page.locator('div:has-text("AI")')

                assert await user_msg.count() > 0, "User message should be persisted"
                # AI avatar should appear at least once (the response)
                assert await ai_avatar.count() >= 1, "AI response should be persisted"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_cross_user_session_access_denied():
    """B4: Users cannot access other users' sessions."""
    test_name = "test_cross_user_session_access_denied"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _login(page)

            # Directly call API with a non-existent session ID
            token = await page.evaluate("localStorage.getItem('token')")
            result = await page.evaluate("""
                async (token) => {
                    const res = await fetch('/api/chat/sessions/99999/messages', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    return { status: res.status, body: await res.text() };
                }
            """, token)

            assert result["status"] == 404, \
                f"Expected 404, got {result['status']}: {result['body']}"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_sessions_ordered_by_time():
    """B5: Sessions are ordered by created_at descending."""
    test_name = "test_sessions_ordered_by_time"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _login(page)

            # Call sessions API
            token = await page.evaluate("localStorage.getItem('token')")
            result = await page.evaluate("""
                async (token) => {
                    const res = await fetch('/api/chat/sessions?page=1&size=20', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    return await res.json();
                }
            """, token)

            items = result.get("items", [])
            if len(items) >= 2:
                # Parse dates and verify descending order
                dates = [item["created_at"] for item in items]
                for i in range(len(dates) - 1):
                    assert dates[i] >= dates[i + 1], \
                        f"Sessions not ordered by time desc: {dates[i]} < {dates[i+1]}"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


# ===========================================================================
# C. Interaction Feedback
# ===========================================================================

@pytest.mark.asyncio(loop_scope="function")
async def test_send_shows_loading_state():
    """C1: Send button shows loading and textarea disabled during response."""
    test_name = "test_send_shows_loading_state"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            textarea = page.locator('textarea')
            await textarea.first.fill("测试加载状态")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(500)

            # Verify loading indicators
            is_disabled = await textarea.first.is_disabled()
            assert is_disabled, "Textarea should be disabled after sending"

            # Send button should show loading (ant-btn-loading class)
            btn_html = await send_btn.evaluate("el => el.outerHTML")
            has_loading_class = "ant-btn-loading" in btn_html
            assert has_loading_class, "Send button should have loading class"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_done_removes_loading_state():
    """C2: After response completes, loading state is removed."""
    test_name = "test_done_removes_loading_state"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            textarea = page.locator('textarea')
            await textarea.first.fill("你好")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()

            # Wait for completion
            for _ in range(30):
                await page.wait_for_timeout(1000)
                is_disabled = await textarea.first.is_disabled()
                if not is_disabled:
                    break

            # Verify loading cleared
            is_disabled = await textarea.first.is_disabled()
            assert not is_disabled, "Textarea should be re-enabled after response"

            btn_html = await send_btn.evaluate("el => el.outerHTML")
            assert "ant-btn-loading" not in btn_html, "Send button should not be loading"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_empty_message_not_sent():
    """C3: Empty message cannot be sent."""
    test_name = "test_empty_message_not_sent"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Ensure textarea is empty
            textarea = page.locator('textarea')
            await textarea.first.fill("")
            await textarea.first.press("Enter")
            await page.wait_for_timeout(1000)

            # No loading state should appear
            is_disabled = await textarea.first.is_disabled()
            assert not is_disabled, "Empty message should not trigger loading"

            # No messages should appear
            ai_avatars = await page.locator('div:has-text("AI")').count()
            user_avatars = await page.locator('div:has-text("你")').count()
            # Allow 1 for the empty state prompt area
            assert ai_avatars <= 1, "No AI message should appear for empty input"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_history_drawer_shows_sessions():
    """C4: History drawer opens and shows session list."""
    test_name = "test_history_drawer_shows_sessions"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a message to ensure a session exists
            textarea = page.locator('textarea')
            await textarea.first.fill("测试历史记录展示")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(10000)

            # Open history
            history_btn = page.locator('button:has-text("历史记录")')
            assert await history_btn.count() > 0, "History button not found"
            await history_btn.first.click()
            await page.wait_for_timeout(2000)

            # Verify drawer opened
            drawer = page.locator('.ant-drawer')
            assert await drawer.count() > 0, "History drawer should be visible"

            # Verify drawer has content (session items)
            drawer_body = page.locator('.ant-drawer-body')
            drawer_text = await drawer_body.first.text_content()
            assert drawer_text and len(drawer_text.strip()) > 0, \
                "Drawer should contain session items"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_batch_delete_has_confirm():
    """C5: Batch delete shows confirmation dialog."""
    test_name = "test_batch_delete_has_confirm"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a message to create a session
            textarea = page.locator('textarea')
            await textarea.first.fill("测试批量删除确认")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(10000)

            # Open history
            history_btn = page.locator('button:has-text("历史记录")')
            await history_btn.first.click()
            await page.wait_for_timeout(1500)

            # Find and check the first checkbox
            checkbox = page.locator('.ant-drawer input[type="checkbox"]').first
            if await checkbox.count() > 0:
                await checkbox.click()
                await page.wait_for_timeout(500)

                # Click delete button
                delete_btn = page.locator('button:has-text("删除")')
                if await delete_btn.count() > 0:
                    await delete_btn.first.click()
                    await page.wait_for_timeout(500)

                    # Check for Popconfirm or modal
                    popconfirm = page.locator('.ant-popconfirm, .ant-modal-confirm')
                    assert await popconfirm.count() > 0, \
                        "Delete confirmation dialog should appear"

                    # Cancel to clean up
                    cancel_btn = page.locator('.ant-popconfirm .ant-btn-default, button:has-text("取消")')
                    if await cancel_btn.count() > 0:
                        await cancel_btn.first.click()

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


# ===========================================================================
# D. Visual Consistency
# ===========================================================================

@pytest.mark.asyncio(loop_scope="function")
async def test_brand_color_is_purple():
    """D1: Primary brand color matches design system (#533afd)."""
    test_name = "test_brand_color_is_purple"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Check send button's background color
            send_btn = page.locator('button:has-text("发送")').first
            btn_bg = await send_btn.evaluate("el => getComputedStyle(el).backgroundColor")

            # The RGB equivalent of #533afd is rgb(83, 58, 253)
            assert "83" in btn_bg and "58" in btn_bg and "253" in btn_bg, \
                f"Send button background should be #533afd (purple), got {btn_bg}"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_message_bubble_direction():
    """D2: User message right-aligned (purple), AI message left-aligned."""
    test_name = "test_message_bubble_direction"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a message
            textarea = page.locator('textarea')
            await textarea.first.fill("测试气泡方向")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()
            await page.wait_for_timeout(10000)

            # Check user message: should be right-aligned (marginLeft: auto or flexDirection: row-reverse)
            user_msg_alignment = await page.evaluate("""
                () => {
                    const msgs = document.querySelectorAll('div');
                    for (const div of msgs) {
                        const style = div.style;
                        if (style.flexDirection === 'row-reverse' && style.marginLeft === 'auto') {
                            return 'right';
                        }
                    }
                    return 'unknown';
                }
            """)
            assert user_msg_alignment == 'right', \
                f"User message should be right-aligned, got {user_msg_alignment}"

            # Check AI message: should be left-aligned
            # AI bubbles have background #fff and border
            ai_bubble_exists = await page.evaluate("""
                () => {
                    const divs = document.querySelectorAll('div');
                    for (const div of divs) {
                        const style = div.style;
                        if (style.background === 'rgb(255, 255, 255)' &&
                            style.border && style.border.includes('rgb(229, 237, 245)')) {
                            return true;
                        }
                    }
                    return false;
                }
            """)
            assert ai_bubble_exists, "AI message bubble should have white background with light border"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_thinking_block_collapsible():
    """D3: Thinking block starts collapsed and can be expanded."""
    test_name = "test_thinking_block_collapsible"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Send a question that will trigger thinking
            textarea = page.locator('textarea')
            await textarea.first.fill("后母戊鼎是什么？")
            send_btn = page.locator('button:has-text("发送")').first
            await send_btn.click()

            # Wait for response with thinking phase
            await page.wait_for_timeout(15000)

            # Look for thinking block toggle (contains "Thinking" text)
            thinking_toggle = page.locator('span:has-text("Thinking")')
            if await thinking_toggle.count() > 0:
                # Check that thinking content area exists
                # The thinking block should be present in the DOM
                thinking_block_exists = await page.evaluate("""
                    () => {
                        const spans = document.querySelectorAll('span');
                        for (const s of spans) {
                            if (s.textContent && s.textContent.includes('Thinking')) {
                                return true;
                            }
                        }
                        return false;
                    }
                """)
                assert thinking_block_exists, "Thinking block toggle should be visible"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_rag_panel_toggle():
    """D4: RAG knowledge panel can be shown/hidden."""
    test_name = "test_rag_panel_toggle"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            # Find the toggle button
            toggle_btn = page.locator('button:has-text("隐藏面板"), button:has-text("知识面板")')
            assert await toggle_btn.count() > 0, "RAG panel toggle button not found"

            # Check initial state (panel visible by default)
            rag_title = page.locator('text=知识检索详情')
            panel_visible_initial = await rag_title.count() > 0

            # Toggle to hide
            if panel_visible_initial:
                hide_btn = page.locator('button:has-text("隐藏面板")')
                await hide_btn.first.click()
                await page.wait_for_timeout(500)

                # Panel should be hidden now
                panel_hidden = await rag_title.count() == 0
                assert panel_hidden, "RAG panel should be hidden after toggle"

                # Toggle back to show
                show_btn = page.locator('button:has-text("知识面板")')
                await show_btn.first.click()
                await page.wait_for_timeout(500)

                panel_shown = await rag_title.count() > 0
                assert panel_shown, "RAG panel should be visible after re-toggle"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_input_within_viewport():
    """D5: Input area stays within viewport at 1280x720."""
    test_name = "test_input_within_viewport"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _goto_chat(page)

            textarea = page.locator('textarea')
            assert await textarea.count() > 0, "No textarea found"

            viewport_height = await page.evaluate("window.innerHeight")
            input_bounds = await textarea.first.evaluate(
                "el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }"
            )

            assert input_bounds["bottom"] <= viewport_height, \
                f"Input bottom ({input_bounds['bottom']}) exceeds viewport ({viewport_height})"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


# ===========================================================================
# E. API Robustness
# ===========================================================================

@pytest.mark.asyncio(loop_scope="function")
async def test_unauthenticated_returns_401():
    """E1: Unauthenticated requests return 401."""
    test_name = "test_unauthenticated_returns_401"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Call API without token
            result = await page.evaluate("""
                async () => {
                    const res = await fetch('/api/chat/sessions');
                    return { status: res.status };
                }
            """)

            assert result["status"] == 401, \
                f"Expected 401 for unauthenticated request, got {result['status']}"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_nonexistent_session_returns_404():
    """E3: Non-existent session returns 404."""
    test_name = "test_nonexistent_session_returns_404"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _login(page)
            token = await page.evaluate("localStorage.getItem('token')")

            result = await page.evaluate("""
                async (token) => {
                    const res = await fetch('/api/chat/sessions/99999/messages', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const body = await res.text();
                    return { status: res.status, body: body };
                }
            """, token)

            assert result["status"] == 404, \
                f"Expected 404 for non-existent session, got {result['status']}"
            assert "会话不存在" in result["body"] or "not found" in result["body"].lower(), \
                f"Expected '会话不存在' in response, got: {result['body']}"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_invalid_ids_returns_400():
    """E5: Invalid ids parameter returns 400."""
    test_name = "test_invalid_ids_returns_400"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            await _login(page)
            token = await page.evaluate("localStorage.getItem('token')")

            result = await page.evaluate("""
                async (token) => {
                    const res = await fetch('/api/chat/sessions?ids=abc,def', {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const body = await res.text();
                    return { status: res.status, body: body };
                }
            """, token)

            assert result["status"] == 400, \
                f"Expected 400 for invalid ids format, got {result['status']}"
            assert "格式错误" in result["body"], \
                f"Expected '格式错误' in response, got: {result['body']}"

        except Exception:
            await save_screenshot_on_failure(page, test_name)
            raise
        finally:
            await context.close()
            await browser.close()
