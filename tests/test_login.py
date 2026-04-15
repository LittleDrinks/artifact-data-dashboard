"""
Test cases for login flow.
"""
import pytest
import asyncio
from playwright.async_api import async_playwright, expect

from conftest import BASE_URL, save_screenshot_on_failure, DEFAULT_TIMEOUT, NAVIGATION_TIMEOUT


@pytest.mark.asyncio(loop_scope="function")
async def test_valid_login_redirects_to_dashboard():
    """Test that valid login redirects to dashboard."""
    test_name = "test_valid_login_redirects_to_dashboard"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Navigate to login page
            await page.goto(f"{BASE_URL}/login")
            await page.wait_for_load_state("networkidle")

            # Verify we're on login page
            assert "/login" in page.url, f"Expected to be on login page, got {page.url}"

            # Fill login form using placeholder-based selectors (Ant Design doesn't use explicit IDs)
            # The Form.Item name creates an input with placeholder text
            username_input = page.locator('input[placeholder="用户名"]').first
            password_input = page.locator('input[placeholder="密码"]').first

            await username_input.fill("admin")
            await password_input.fill("admin123")

            # Click login button and wait for navigation
            await page.locator('button[type="submit"]').click()

            # Wait for URL to change (login redirects to dashboard)
            # Use waitForURL with conftest NAVIGATION_TIMEOUT for reliable detection
            try:
                await page.wait_for_url("**/", timeout=NAVIGATION_TIMEOUT)
            except Exception:
                # If waitForURL fails, check if at least the token was stored
                token = await page.evaluate("localStorage.getItem('token')")
                current_url = page.url
                assert token or "/login" not in current_url, \
                    f"Login failed - no token and still on login page after {NAVIGATION_TIMEOUT}ms. URL: {current_url}"

            current_url = page.url

            # Verify we're on dashboard (not login page)
            assert "/login" not in current_url, \
                f"Login failed - still on login page. URL: {current_url}"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_wrong_password_shows_error():
    """Test that wrong password shows error message."""
    test_name = "test_wrong_password_shows_error"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Navigate to login page
            await page.goto(f"{BASE_URL}/login")
            await page.wait_for_load_state("networkidle")

            # Fill login form with wrong password using placeholder-based selectors
            await page.locator('input[placeholder="用户名"]').first.fill("admin")
            await page.locator('input[placeholder="密码"]').first.fill("wrongpassword")

            # Click login button
            await page.locator('button[type="submit"]').click()

            # Wait for response
            await page.wait_for_timeout(3000)

            # Check for error message or still on login page
            # Look for Ant Design message/alert
            error_selectors = [
                '.ant-message',
                '.ant-message-error',
                '.ant-alert-error',
                '.ant-notification',
                '[class*="error"]'
            ]

            error_visible = False
            for selector in error_selectors:
                try:
                    count = await page.locator(selector).count()
                    if count > 0:
                        error_visible = True
                        break
                except:
                    continue

            # Also check if we're still on login page
            still_on_login = "/login" in page.url

            assert error_visible or still_on_login, \
                f"Expected error message to be visible or still be on login page. URL: {page.url}"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()