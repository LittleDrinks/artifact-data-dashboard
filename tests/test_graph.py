"""
Test cases for Knowledge Graph page.
"""
import pytest
import asyncio
from playwright.async_api import async_playwright

from conftest import BASE_URL, save_screenshot_on_failure, DEFAULT_TIMEOUT


async def login(page):
    """Helper to log in."""
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("networkidle")
    await page.locator('input[placeholder="用户名"]').first.fill("admin")
    await page.locator('input[placeholder="密码"]').first.fill("admin123")
    await page.locator('button[type="submit"]').click()
    # Wait for redirect
    for _ in range(15):
        await page.wait_for_timeout(1000)
        if "/login" not in page.url:
            break


@pytest.mark.asyncio(loop_scope="function")
async def test_graph_page_has_search_input():
    """Test that graph page renders with search input."""
    test_name = "test_graph_page_has_search_input"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login first
            await login(page)

            # Navigate to graph page
            await page.goto(f"{BASE_URL}/graph")
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)

            # Look for search input
            search_selectors = [
                'input[placeholder*="搜索"]',
                'input[placeholder*="search"]',
                'input[placeholder*="查询"]',
                'input[type="text"]',
                '.ant-input'
            ]

            search_found = False
            for selector in search_selectors:
                count = await page.locator(selector).count()
                if count > 0:
                    search_found = True
                    break

            assert search_found, "No search input found on graph page"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_graph_visualization_area_visible():
    """Test that graph visualization area is visible."""
    test_name = "test_graph_visualization_area_visible"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login first
            await login(page)

            # Navigate to graph page
            await page.goto(f"{BASE_URL}/graph")
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(3000)  # Wait for graph rendering

            # Look for graph visualization elements
            graph_selectors = [
                'svg',
                'canvas',
                '[class*="graph"]',
                '[class*="Graph"]',
                '[class*="force"]',
                '[class*="network"]',
                '.ant-card',
                '[id*="graph"]'
            ]

            graph_found = False
            for selector in graph_selectors:
                count = await page.locator(selector).count()
                if count > 0:
                    graph_found = True
                    break

            assert graph_found, "No graph visualization area found on graph page"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()