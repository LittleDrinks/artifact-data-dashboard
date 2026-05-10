"""Health check router with deep dependency probing."""

import logging

import requests
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.services.graph import _get_neo4j_driver

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_sqlite() -> bool:
    """Probe SQLite connectivity by executing SELECT 1."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("Health check: SQLite probe failed: %s", exc)
        return False


def _check_neo4j() -> bool:
    """Probe Neo4j driver availability and connectivity."""
    try:
        driver = _get_neo4j_driver()
        if driver is None:
            return False
        # Verify the driver can actually reach the server
        driver.verify_connectivity()
        return True
    except Exception as exc:
        logger.warning("Health check: Neo4j probe failed: %s", exc)
        return False


def _check_ai_api() -> bool:
    """Probe AI API base URL reachability via HEAD request (5s timeout)."""
    if not settings.AI_API_BASE:
        # No AI API configured — treat as unavailable but not a hard failure
        logger.info("Health check: AI_API_BASE not configured")
        # NOTE: Returning False when AI_API_BASE is unconfigured is intentional.
        # The health endpoint reports "degraded" so operators know the AI feature is disabled.
        return False
    try:
        response = requests.head(
            settings.AI_API_BASE,
            timeout=5,
            allow_redirects=True,
        )
        # Accept any 2xx or 3xx as "reachable"
        return response.status_code < 400
    except requests.RequestException as exc:
        logger.warning("Health check: AI API probe failed: %s", exc)
        return False


@router.get("/health")
def health_check():
    """Return service health status with deep dependency checks."""
    checks = {
        "sqlite": _check_sqlite(),
        "neo4j": _check_neo4j(),
        "ai_api": _check_ai_api(),
    }

    all_ok = all(checks.values())
    status = "ok" if all_ok else "degraded"

    return {
        "status": status,
        "checks": checks,
    }
