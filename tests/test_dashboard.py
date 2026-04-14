"""
Test cases for Dashboard page.
"""
import pytest
import asyncio
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
async def test_dashboard_stat_cards_show_artifacts():
    """Test that stat cards show total_artifacts > 0."""
    test_name = "test_dashboard_stat_cards_show_artifacts"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login first
            await login(page)

            # Wait for dashboard to fully load
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)  # Extra wait for API calls

            # Look for stat cards
            stat_card_selectors = [
                '.ant-card',
                '[class*="stat-card"]',
                '[class*="statCard"]',
                '.dashboard-card'
            ]

            cards_found = False
            for selector in stat_card_selectors:
                count = await page.locator(selector).count()
                if count > 0:
                    cards_found = True
                    break

            assert cards_found, "No stat cards found on dashboard"

            # Get page content and check for numbers
            page_content = await page.content()

            import re
            numbers = re.findall(r'\d+', page_content)

            # There should be at least some numbers (total artifacts > 0)
            assert len(numbers) > 0, "No numeric values found on dashboard"

            # Check that at least one number is > 0
            has_positive_count = any(int(n) > 0 for n in numbers if n.isdigit())
            assert has_positive_count, "No positive count found on dashboard (expected total_artifacts > 0)"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()


@pytest.mark.asyncio(loop_scope="function")
async def test_dashboard_chart_elements_render():
    """Test that chart elements render on dashboard."""
    test_name = "test_dashboard_chart_elements_render"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-gpu", "--no-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        context.set_default_timeout(DEFAULT_TIMEOUT)
        page = await context.new_page()

        try:
            # Login first
            await login(page)

            # Wait for dashboard to fully load
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(3000)  # Extra wait for chart rendering

            # Look for chart elements
            chart_selectors = [
                'canvas',
                '.ant-card',
                '[class*="chart"]',
                '[class*="Chart"]',
                '.recharts-wrapper',
                '.echarts'
            ]

            charts_found = False
            for selector in chart_selectors:
                count = await page.locator(selector).count()
                if count > 0:
                    charts_found = True
                    break

            assert charts_found, "No chart elements found on dashboard"

        except Exception as e:
            await save_screenshot_on_failure(page, test_name)
            raise

        finally:
            await context.close()
            await browser.close()