"""
Shared fixtures for E2E tests.
"""
import asyncio
from datetime import datetime
from pathlib import Path

import pytest
from playwright.async_api import async_playwright, Page


# Constants
BASE_URL = "http://localhost:5173"
SCREENSHOT_DIR = Path(__file__).parent / "screenshots"
DEFAULT_TIMEOUT = 30000  # 30 seconds
NAVIGATION_TIMEOUT = 60000  # 60 seconds

# Credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


async def login(page: Page) -> None:
    """Helper function to log in as admin."""
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("networkidle")

    # Fill login form
    username_input = page.locator('input[id="username"], input[placeholder*="用户名"], input[placeholder*="username"]').first
    password_input = page.locator('input[id="password"], input[placeholder*="密码"], input[placeholder*="password"]').first

    await username_input.fill(ADMIN_USERNAME)
    await password_input.fill(ADMIN_PASSWORD)

    # Click login button
    login_button = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Login")').first
    await login_button.click()

    # Wait for redirect to dashboard
    await page.wait_for_url("**/", timeout=NAVIGATION_TIMEOUT)
    await page.wait_for_load_state("networkidle")


async def save_screenshot_on_failure(page: Page, test_name: str) -> str:
    """Save screenshot and return the path."""
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{test_name}_{timestamp}.png"
    filepath = SCREENSHOT_DIR / filename
    await page.screenshot(path=str(filepath), full_page=True)
    return str(filepath)