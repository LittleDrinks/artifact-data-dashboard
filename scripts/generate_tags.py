#!/usr/bin/env python3
"""
Tags generation: auto-generate tags from category/era/material/location.

Usage:
    cd E:/shared/workplace/ADD_new
    backend/.venv/Scripts/python scripts/generate_tags.py
"""

import os
import sys
import sqlite3
import re

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")

# ── Province extraction patterns ──────────────────────────────────────────
PROVINCE_PATTERNS = [
    ("北京", r"北京"),
    ("上海", r"上海"),
    ("天津", r"天津"),
    ("重庆", r"重庆"),
    ("河北", r"河北"),
    ("山西", r"山西"),
    ("辽宁", r"辽宁"),
    ("吉林", r"吉林"),
    ("黑龙江", r"黑龙江"),
    ("江苏", r"江苏"),
    ("浙江", r"浙江"),
    ("安徽", r"安徽"),
    ("福建", r"福建"),
    ("江西", r"江西"),
    ("山东", r"山东"),
    ("河南", r"河南"),
    ("湖北", r"湖北"),
    ("湖南", r"湖南"),
    ("广东", r"广东"),
    ("广西", r"广西"),
    ("海南", r"海南"),
    ("四川", r"四川"),
    ("贵州", r"贵州"),
    ("云南", r"云南"),
    ("陕西", r"陕西|陕西"),
    ("甘肃", r"甘肃"),
    ("青海", r"青海"),
    ("宁夏", r"宁夏"),
    ("新疆", r"新疆"),
    ("内蒙古", r"内蒙古"),
    ("西藏", r"西藏"),
    ("台湾", r"台湾"),
    ("香港", r"香港"),
    ("澳门", r"澳门"),
]


def extract_province(location: str) -> str | None:
    """Extract province name from location string."""
    if not location:
        return None

    for province, pattern in PROVINCE_PATTERNS:
        if re.search(pattern, location):
            return province

    return None


def generate_tags(category: str | None, era: str | None, material: str | None, location: str | None) -> str:
    """Generate tags from available fields."""
    tags = []

    # Category tag
    if category:
        # Clean up category - remove redundant prefixes
        cat_clean = category.replace("中国", "").replace("古代", "").strip()
        if cat_clean:
            tags.append(cat_clean)

    # Era tag (朝代)
    if era:
        tags.append(era)

    # Material tag
    if material:
        # Clean material - standardize
        mat_clean = material.replace("器", "").strip()
        if mat_clean and mat_clean not in tags:
            tags.append(mat_clean)

    # Province tag from location
    if location:
        province = extract_province(location)
        if province and province not in tags:
            tags.append(province)

    # Remove duplicates while preserving order
    seen = set()
    unique_tags = []
    for tag in tags:
        if tag not in seen and len(tag) <= 10:  # skip overly long tags
            seen.add(tag)
            unique_tags.append(tag)

    return ",".join(unique_tags)


def main():
    db_path = os.path.abspath(DB_PATH)
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM artifacts")
    total = cursor.fetchone()[0]
    print(f"Total artifacts: {total}")

    # ── Phase 1: Generate tags for all artifacts ──────────────────────────────
    print("\n=== Phase 1: Generate tags ===")

    cursor.execute("""
        SELECT id, category, era, material, location, tags
        FROM artifacts
    """)
    rows = cursor.fetchall()
    print(f"Artifacts to process: {len(rows)}")

    generated_count = 0
    updated_count = 0
    empty_tags_count = 0

    for aid, category, era, material, location, existing_tags in rows:
        # Only generate if tags is empty or very short
        if existing_tags and len(existing_tags) > 3:
            continue

        new_tags = generate_tags(category, era, material, location)

        if new_tags:
            cursor.execute("UPDATE artifacts SET tags = ? WHERE id = ?", (new_tags, aid))
            generated_count += 1
            if new_tags != (existing_tags or ""):
                updated_count += 1
        else:
            empty_tags_count += 1

    conn.commit()
    print(f"  Tags generated: {generated_count}")
    print(f"  Tags updated: {updated_count}")
    print(f"  No tags (empty data): {empty_tags_count}")

    # ── Final stats ────────────────────────────────────────────────────
    print("\n=== Final stats ===")
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE tags IS NOT NULL AND tags != ''")
    tags_count = cursor.fetchone()[0]
    coverage = tags_count * 100 // total if total > 0 else 0
    print(f"Artifacts with tags: {tags_count}/{total} ({coverage}%)")

    # 统计标签分布
    cursor.execute("SELECT tags FROM artifacts WHERE tags IS NOT NULL AND tags != ''")
    all_tags = cursor.fetchall()

    tag_counts: dict[str, int] = {}
    for tags_str in all_tags:
        for tag in tags_str[0].split(","):
            tag = tag.strip()
            if tag:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    print("\nTop tags:")
    sorted_tags = sorted(tag_counts.items(), key=lambda x: -x[1])[:15]
    for tag, cnt in sorted_tags:
        bar = "█" * (cnt // 5)
        print(f"  {tag[:10]:10s} {cnt:4d}  {bar}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()