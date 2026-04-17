"""
Test cases for Artifacts list and detail pages.
"""
import pytest
import asyncio
import re
from playwright.async_api import async_playwright

from conftest import BASE_URL, save_screenshot_on_failure, DEFAULT_TIMEOUT


async def login(page):
    """Helper to log in."""
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("networkidle")

    # Wait for login form to be visible
    await page.wait_for_selector('input[placeholder="用户名"]', timeout=10000)
    await page.wait_for_selector('input[placeholder="密码"]', timeout=10000)

    # Fill in credentials
    await page.locator('input[placeholder="用户名"]').first.fill("admin")
    await page.locator('input[placeholder="密码"]').first.fill("admin123")

    # Click login button
    await page.locator('button[type="submit"]').click()

    # Wait for redirect - check both URL change and token storage
    for _ in range(20):
        await page.wait_for_timeout(1000)
        current_url = page.url
        if "/login" not in current_url:
            # Also verify token is stored
            token = await page.evaluate("localStorage.getItem('token')")
            if token:
                break


@pytest.mark.asyncio(loop_scope="function")
async def test_artifacts_list_loads_with_items():
    """Test that artifacts list loads with at least 1 item visible."""
    test_name = "test_artifacts_list_loads_with_items"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login first
            await login(page)

            # Navigate to artifacts page
            await page.goto(f"{BASE_URL}/artifacts")
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)  # Wait for data loading

            # Look for artifact items
            item_selectors = [
                '.ant-table-row',
                '.ant-card',
                '.artifact-item',
                '.ant-table-tbody tr'
            ]

            items_found = False
            item_count = 0

            for selector in item_selectors:
                count = await page.locator(selector).count()
                if count > 0:
                    items_found = True
                    item_count = count
                    break

            assert items_found, "No artifact items found on artifacts page"
            assert item_count >= 1, f"Expected at least 1 artifact item, found {item_count}"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_artifacts_search_returns_results():
    """Test that searching for '鼎' returns results."""
    test_name = "test_artifacts_search_returns_results"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login first
            await login(page)

            # Navigate to artifacts page
            await page.goto(f"{BASE_URL}/artifacts")
            await page.wait_for_load_state("networkidle")

            # Find search input
            search_selectors = [
                'input[placeholder*="搜索"]',
                'input[placeholder*="关键词"]',
                '.ant-input-search input',
                '.ant-input'
            ]

            search_input = None
            for selector in search_selectors:
                elements = page.locator(selector)
                count = await elements.count()
                if count > 0:
                    search_input = elements.first
                    break

            assert search_input is not None, "No search input found"

            # Type search term
            await search_input.fill("鼎")
            await search_input.press("Enter")

            # Wait for results
            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")

            # Check for results
            result_selectors = [
                '.ant-table-row',
                '.ant-card',
                '.ant-table-tbody tr'
            ]

            results_found = False
            for selector in result_selectors:
                count = await page.locator(selector).count()
                if count > 0:
                    results_found = True
                    break

            assert results_found, "No search results found for '鼎'"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_artifact_detail_page_shows_name():
    """Test that artifact detail page shows artifact name."""
    test_name = "test_artifact_detail_page_shows_name"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login - ensure success with retry
            login_success = False
            for attempt in range(3):
                try:
                    await page.goto(f"{BASE_URL}/login", timeout=30000)
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_selector('input[placeholder="用户名"]', timeout=10000)

                    await page.locator('input[placeholder="用户名"]').first.fill("admin")
                    await page.locator('input[placeholder="密码"]').first.fill("admin123")
                    await page.locator('button[type="submit"]').click()

                    # Wait for redirect
                    for _ in range(25):
                        await page.wait_for_timeout(1000)
                        if "/login" not in page.url:
                            token = await page.evaluate("localStorage.getItem('token')")
                            if token:
                                login_success = True
                                break

                    if login_success:
                        break
                except Exception as login_err:
                    print(f"Login attempt {attempt + 1} failed: {login_err}")
                    await page.wait_for_timeout(2000)

            if not login_success:
                await save_screenshot_on_failure(page, test_name + "_login_failed")
                assert False, f"Login failed after 3 attempts. URL: {page.url}"

            # Now navigate to artifact detail page
            await page.goto(f"{BASE_URL}/artifacts/1")
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)

            # Check current URL - should not be login
            current_url = page.url
            assert "/login" not in current_url, f"Unexpected redirect to login: {current_url}"

            # Check for 404 page
            result_404 = await page.locator('.ant-result-404').count()
            if result_404 > 0:
                # Artifact 1 doesn't exist, try ID 2
                await page.goto(f"{BASE_URL}/artifacts/2")
                await page.wait_for_load_state("networkidle")
                await page.wait_for_timeout(2000)
                current_url = page.url

                # If still 404, go to list and click first item
                if await page.locator('.ant-result').count() > 0:
                    await page.goto(f"{BASE_URL}/artifacts")
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(2000)

                    # Wait for table to load
                    for _ in range(10):
                        row_count = await page.locator('.ant-table-tbody tr').count()
                        if row_count > 0:
                            break
                        await page.wait_for_timeout(1000)

                    # Click first artifact link
                    link_count = await page.locator('.ant-table-tbody tr a').count()
                    if link_count > 0:
                        await page.locator('.ant-table-tbody tr a').first.click()
                        await page.wait_for_load_state("networkidle")
                        await page.wait_for_timeout(2000)
                        current_url = page.url

            # Verify we're on detail page
            assert "/artifacts/" in current_url and re.search(r'/artifacts/\d+', current_url), \
                f"Expected artifact detail page, got {current_url}"

            # Look for artifact name on the page
            await page.wait_for_timeout(1000)

            # Check for h2 containing the artifact name
            h2_elements = page.locator('h2')
            h2_count = await h2_elements.count()

            name_found = False
            if h2_count > 0:
                h2_text = await h2_elements.first.text_content()
                if h2_text and len(h2_text.strip()) > 0 and '文物管理' not in h2_text:
                    name_found = True

            # Fallback: check for description content
            if not name_found:
                desc_count = await page.locator('.ant-descriptions-item-content').count()
                if desc_count > 0:
                    name_found = True

            assert name_found, "No artifact name found on detail page"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()