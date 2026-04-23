"""
Seed script: import artifact data from data/final/artifacts_list.json into SQLite.
Also enriches artifacts by loading detail data from data/final/artifacts_detail/*.json.

Usage:
    cd backend
    python seed.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, SessionLocal, init_db  # noqa: E402
from app.models.artifact import Artifact  # noqa: E402
from app.schemas.artifact import ArtifactCreate  # noqa: E402

DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    os.pardir,
    "data",
    "final",
    "artifacts_list.json",
)

DETAIL_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    os.pardir,
    "data",
    "final",
    "artifacts_detail",
)

# Era extraction patterns from Wikipedia category or URL
_ERA_PATTERNS = {
    "新石器时代": "新石器时代",
    "商": "商代", "商代": "商代", "商周": "商周",
    "西周": "西周", "东周": "东周",
    "春秋": "春秋", "战国": "战国",
    "秦": "秦代",
    "西汉": "西汉", "东汉": "东汉", "汉": "汉代",
    "三国": "三国",
    "西晋": "西晋", "东晋": "东晋", "晋": "晋代",
    "南北朝": "南北朝", "北魏": "北魏", "北齐": "北齐", "北周": "北周",
    "南朝": "南朝",
    "隋": "隋代",
    "唐": "唐代",
    "五代": "五代十国",
    "北宋": "北宋", "南宋": "南宋", "宋": "宋代",
    "辽": "辽代", "金": "金代", "西夏": "西夏",
    "元": "元代",
    "明": "明代",
    "清": "清代",
    "民国": "民国",
}


def _infer_era_from_category(category: str | None) -> str | None:
    """Try to infer era from category text."""
    if not category:
        return None
    for key, era in _ERA_PATTERNS.items():
        if key in category:
            return era
    return None


def _normalize_category(category: str | None) -> str | None:
    """Normalize category: strip whitespace, collapse duplicates."""
    if not category:
        return None
    cat = category.strip()
    if not cat:
        return None
    # Title case for consistency
    return cat.title()


def _load_detail_data(name: str) -> dict:
    """Load detail JSON file for a given artifact name."""
    if not os.path.exists(DETAIL_DIR):
        return {}
    detail_path = os.path.join(DETAIL_DIR, f"{name}.json")
    if not os.path.exists(detail_path):
        return {}
    try:
        with open(detail_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _validate_description(name: str, description: str | None) -> str | None:
    """Validate that description contains the artifact name.

    If description doesn't contain the artifact name (even partially),
    it's likely scraped from a wrong source and should be discarded.
    """
    if not description or not name:
        return None
    # Check if any significant part of the name appears in description
    # Handle cases like "后母戊鼎" appearing in description of "后母戊鼎"
    name_parts = name.split()
    for part in name_parts:
        if len(part) >= 2 and part in description:
            return description
    # Also check if description contains at least 2 chars of the name
    if len(name) >= 2 and name[:2] in description:
        return description
    # Description doesn't match the artifact name - likely wrong data
    return None


def _clean_location(location: str | None) -> str | None:
    """Clean location field: remove description text, keep only place name."""
    if not location:
        return None
    # If location contains sentence-ending punctuation, it's likely description text
    if "。" in location or len(location) > 80:
        # Try to extract just the place name (before first comma or period)
        for sep in ["。", "，", ",", "（", "("]:
            if sep in location:
                loc = location.split(sep)[0].strip()
                if loc and len(loc) < 50:
                    return loc
        # If still too long, return None (discard)
        return None
    return location.strip()


def _default_era(category: str | None) -> str | None:
    """Provide default era based on category if era is missing."""
    if not category:
        return None
    # Common category-era mappings for Chinese artifacts
    category_lower = category.lower()
    if "青铜" in category_lower or "铜" in category_lower:
        return "商周"
    if "陶" in category_lower or "瓷" in category_lower:
        return "古代"
    return None


def seed_artifacts() -> int:
    init_db()

    if not os.path.exists(DATA_PATH):
        print(f"ERROR: Data file not found at {DATA_PATH}")
        return 0

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw_items = json.load(f)

    db = SessionLocal()
    try:
        existing_count = db.query(Artifact).count()
        if existing_count > 0:
            print(f"Artifacts table already has {existing_count} rows, skipping import.")
            return 0

        artifacts: list[Artifact] = []
        skipped = 0
        enriched = 0
        for item in raw_items:
            name = item.get("name", "").strip()
            if not name:
                skipped += 1
                continue

            category = _normalize_category(item.get("category"))
            source_url = item.get("url")
            era = _infer_era_from_category(item.get("category", ""))

            # Load detail data from separate JSON file
            detail = _load_detail_data(name)
            if detail:
                enriched += 1
                # Detail file may override/extend fields
                era = detail.get("era") or era
                category = _normalize_category(detail.get("category")) or category
                source_url = detail.get("url") or source_url

            # Validate description contains artifact name (BUG-1 fix)
            raw_description = detail.get("summary") if detail else None
            description = _validate_description(name, raw_description)

            # Set default era if missing (BUG-5 fix)
            if not era:
                era = _default_era(category)

            artifact = Artifact(
                name=name,
                category=category,
                era=era,
                source_url=source_url,
                # Detail fields
                material=detail.get("material") if detail else None,
                museum=detail.get("museum") if detail else None,
                dimensions=detail.get("dimensions") if detail else None,
                location=_clean_location(detail.get("location")) if detail else None,
                description=description,
            )
            artifacts.append(artifact)

        db.add_all(artifacts)
        db.commit()
        print(f"Successfully imported {len(artifacts)} artifacts ({skipped} skipped, {enriched} enriched).")
        return len(artifacts)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def cleanup_bad_descriptions() -> int:
    """Clean up existing bad descriptions in the database.

    Remove descriptions that don't contain the artifact name.
    Run this as: python -c "from seed import cleanup_bad_descriptions; cleanup_bad_descriptions()"
    """
    init_db()
    db = SessionLocal()
    try:
        artifacts = db.query(Artifact).all()
        cleaned = 0
        for art in artifacts:
            if art.description:
                validated = _validate_description(art.name, art.description)
                if validated is None:
                    art.description = None
                    cleaned += 1
        db.commit()
        print(f"Cleaned {cleaned} bad descriptions out of {len(artifacts)} artifacts.")
        return cleaned
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    count = seed_artifacts()
    print(f"Done. {count} records processed.")
