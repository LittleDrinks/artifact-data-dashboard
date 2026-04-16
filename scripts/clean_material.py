#!/usr/bin/env python3
"""
Material cleaning: clean material values in artifacts table.

Problem: Some material values are descriptive sentences instead of standard material names.
Example: "鼓不但可用于音乐性质" → should be empty or proper material name

Usage:
    cd E:/shared/workplace/ADD_new
    backend/.venv/Scripts/python scripts/clean_material.py
"""

import os
import sys
import sqlite3
import re

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")

# ── Valid material keywords ──────────────────────────────────────────────
VALID_MATERIALS = [
    "青铜", "铜", "陶", "瓷", "玉", "金", "银", "石", "木", "丝",
    "纸", "绢", "竹", "骨", "漆", "铁", "锡", "铅", "琉璃", "珐琅",
    "水晶", "玛瑙", "琥珀", "翡翠", "珊瑚", "象牙", "犀角", "玳瑁",
    "宝石", "珍珠", "金丝楠", "楠木", "檀木", "红木", "黄花梨",
    "青铜器", "陶器", "瓷器", "玉器", "石器", "木器", "竹简", "竹器",
    "漆器", "铁器", "金银器", "玻璃", "珐琅器",
]


def clean_material(material: str) -> str | None:
    """Clean a material string, extracting valid material keywords."""
    if not material or not material.strip():
        return None

    material = material.strip()

    # If already a valid material, return as-is
    if material in VALID_MATERIALS:
        return material

    # Try to extract material keywords from descriptive sentences
    # e.g., "大玉戈是商前期的玉质" → "玉"
    # e.g., "文信圜钱采用石质" → "石"
    for valid in VALID_MATERIALS:
        if valid in material:
            return valid

    # Pattern: "XX质" / "XX材质" → extract XX
    match = re.search(r"(\w+)质|(\w+)材质", material)
    if match:
        extracted = match.group(1) or match.group(2)
        # Check if extracted is a valid material
        for valid in VALID_MATERIALS:
            if valid in extracted:
                return valid

    # If material is too long (>8 chars) and contains no keywords, likely a description
    if len(material) > 8:
        # Try one more time with relaxed matching
        for valid in VALID_MATERIALS:
            if valid[:2] in material:  # match first 2 chars
                return valid

        # If still no match, clear it
        return None

    # Short material value without keywords - might be valid, keep it
    # But check if it looks like a sentence (contains common sentence patterns)
    sentence_patterns = [
        "不但", "可以", "用于", "采用", "是一种", "主要", "描述",
        "是", "为", "有", "于", "等", "也",
    ]
    for pattern in sentence_patterns:
        if pattern in material:
            return None

    return material


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

    # ── Phase 1: Clean material values ──────────────────────────────────
    print("\n=== Phase 1: Clean material values ===")
    cursor.execute("SELECT id, material FROM artifacts WHERE material IS NOT NULL AND material != ''")
    rows = cursor.fetchall()
    print(f"Material fields to clean: {len(rows)}")

    cleaned_count = 0
    cleared_count = 0
    material_counts: dict[str, int] = {}

    for aid, material in rows:
        cleaned = clean_material(material)
        if cleaned != material:
            if cleaned is None:
                cursor.execute("UPDATE artifacts SET material = NULL WHERE id = ?", (aid,))
                cleared_count += 1
            else:
                cursor.execute("UPDATE artifacts SET material = ? WHERE id = ?", (cleaned, aid))
                cleaned_count += 1

        # 统计清洗后的材质
        final_material = cleaned or material
        material_counts[final_material] = material_counts.get(final_material, 0) + 1

    conn.commit()
    print(f"  Cleaned to valid material: {cleaned_count}")
    print(f"  Cleared (invalid description): {cleared_count}")

    # ── Final stats ────────────────────────────────────────────────────
    print("\n=== Final stats ===")
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE material IS NOT NULL AND material != ''")
    material_count = cursor.fetchone()[0]
    print(f"Artifacts with material: {material_count}/{total} ({material_count*100//total}%)")

    print("\nMaterial distribution:")
    sorted_materials = sorted(material_counts.items(), key=lambda x: -x[1])[:15]
    for material, cnt in sorted_materials:
        bar = "█" * (cnt // 3)
        print(f"  {material[:10]:10s} {cnt:4d}  {bar}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()