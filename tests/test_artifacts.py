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
    await page.locator('#username').fill("admin")
    await page.locator('#password').fill("admin123")
    await page.locator('button[type="submit"]').click()
    # Wait for redirect
    for _ in range(10):
        await page.wait_for_timeout(1000)
        if "/login" not in page.url:
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
    """Test that clicking first artifact shows detail page with name."""
    test_name = "test_artifact_detail_page_shows_name"

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
            await page.wait_for_timeout(3000)  # Wait for data loading

            # Wait until table rows appear
            for _ in range(10):
                row_count = await page.locator('.ant-table-tbody tr').count()
                if row_count > 0:
                    break
                await page.wait_for_timeout(1000)

            # Find first clickable artifact link inside table rows
            # The artifact rows contain links that navigate to detail pages
            link_locator = page.locator('.ant-table-tbody tr a')
            link_count = await link_locator.count()

            assert link_count > 0, f"No artifact links found in table rows. Table rows: {await page.locator('.ant-table-tbody tr').count()}"

            # Get current URL before clicking
            initial_url = page.url

            # Click the first link inside a table row
            await link_locator.first.click()

            # Wait for navigation
            await page.wait_for_timeout(2000)
            await page.wait_for_load_state("networkidle")

            # Check URL changed to detail page
            new_url = page.url
            assert "/artifacts/" in new_url and new_url != initial_url, \
                f"Expected URL to change to detail page, got {new_url} (from {initial_url})"

            # Verify artifact ID in URL
            match = re.search(r'/artifacts/(\d+)', new_url)
            assert match, f"Expected artifact ID in URL, got {new_url}"

            # Look for artifact name on the page
            await page.wait_for_timeout(1000)

            name_selectors = [
                'h1', 'h2', 'h3',
                '.ant-typography',
                '[class*="title"]',
                '[class*="name"]'
            ]

            name_found = False
            for selector in name_selectors:
                elements = page.locator(selector)
                count = await elements.count()
                if count > 0:
                    text = await elements.first.text_content()
                    if text and len(text.strip()) > 0:
                        name_found = True
                        break

            assert name_found, "No artifact name found on detail page"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()