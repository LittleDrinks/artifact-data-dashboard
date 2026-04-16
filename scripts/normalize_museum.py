#!/usr/bin/env python3
"""
Museum normalization: standardize museum names in artifacts table.

Usage:
    cd E:/shared/workplace/ADD_new
    backend/.venv/Scripts/python scripts/normalize_museum.py
"""

import os
import sys
import sqlite3

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")

# ── Museum mapping: variant → standardized ──────────────────────────────
MUSEUM_MAPPING: dict[str, str] = {
    # 故宫博物院 variants
    "故宫博物院": "故宫博物院",
    "北京故宫博物院": "故宫博物院",
    "北京市东城区故宫博物院": "故宫博物院",
    "北京故宫": "故宫博物院",

    # 台北故宫博物院 variants
    "台北市士林区国立故宫博物院": "台北故宫博物院",
    "国立故宫博物院": "台北故宫博物院",
    "台北故宫": "台北故宫博物院",
    "台湾故宫博物院": "台北故宫博物院",
    "中华民国（台湾）": "台北故宫博物院",

    # 上海博物馆 variants
    "于上海博物馆": "上海博物馆",
    "上海博物馆": "上海博物馆",

    # 湖南博物院 variants（2022年改名）
    "湖南省博物馆": "湖南博物院",
    "湖南博物院": "湖南博物院",

    # 其他博物馆标准化
    "中国国家博物馆": "中国国家博物馆",
    "国家博物馆": "中国国家博物馆",

    "南京博物院": "南京博物院",
    "江苏省南京市南京博物院": "南京博物院",

    "河南博物院": "河南博物院",
    "河南省博物院": "河南博物院",

    "陕西历史博物馆": "陕西历史博物馆",
    "陕西省历史博物馆": "陕西历史博物馆",

    "安徽博物院": "安徽博物院",
    "安徽省博物馆": "安徽博物院",

    "四川博物院": "四川博物院",
    "四川省博物馆": "四川博物院",

    "甘肃省博物馆": "甘肃省博物馆",
    "甘肃省": "甘肃省博物馆",

    "西安碑林博物馆": "西安碑林博物馆",
    "碑林博物馆": "西安碑林博物馆",

    "宝鸡青铜器博物院": "宝鸡青铜器博物院",
    "宝鸡市青铜器博物馆": "宝鸡青铜器博物院",

    "广汉三星堆博物馆": "三星堆博物馆",
    "三星堆博物馆": "三星堆博物馆",

    # 省级博物馆统一命名
    "浙江省博物馆": "浙江省博物馆",
    "浙江省": "浙江省博物馆",

    "广东省博物馆": "广东省博物馆",
    "广东省": "广东省博物馆",

    # 海外博物馆
    "美国堪萨斯城纳尔逊艺术博物馆": "纳尔逊艺术博物馆",
    "大英博物馆": "大英博物馆",
    "英国大英博物馆": "大英博物馆",
    "美国纽约大都会艺术博物馆": "大都会艺术博物馆",
    "大都会艺术博物馆": "大都会艺术博物馆",
}


def normalize_museum(museum: str) -> str | None:
    """Try to normalize a museum string using the mapping table."""
    if not museum or not museum.strip():
        return None

    museum = museum.strip()

    # Direct lookup
    if museum in MUSEUM_MAPPING:
        return MUSEUM_MAPPING[museum]

    # Remove common prefixes/suffixes
    # "于XXX博物馆" → "XXX博物馆"
    if museum.startswith("于"):
        museum = museum[1:]

    # Try again after cleaning
    if museum in MUSEUM_MAPPING:
        return MUSEUM_MAPPING[museum]

    # Pattern: "XXX省博物馆" → "XXX博物院" if it's a known provincial museum
    # 但现在大多数省级博物馆已改为"博物院"
    import re
    # "XX省博物馆" → "XX博物院"
    match = re.match(r"^(.+省)博物馆$", museum)
    if match:
        province = match.group(1)
        # 检查是否在映射中
        new_name = f"{province}博物院"
        if new_name in MUSEUM_MAPPING.values():
            return new_name

    return museum  # 如果不在映射中，返回原值（不修改）


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

    # ── Phase 1: Apply mapping table ──────────────────────────────────
    print("\n=== Phase 1: Apply museum mapping ===")
    cursor.execute("SELECT id, museum FROM artifacts WHERE museum IS NOT NULL AND museum != ''")
    rows = cursor.fetchall()
    print(f"Museum fields to normalize: {len(rows)}")

    mapping_updated = 0
    museum_counts: dict[str, int] = {}

    for aid, museum in rows:
        normalized = normalize_museum(museum)
        if normalized and normalized != museum:
            cursor.execute("UPDATE artifacts SET museum = ? WHERE id = ?", (normalized, aid))
            mapping_updated += 1

        # 统计标准化后的博物馆
        final_museum = normalized or museum
        museum_counts[final_museum] = museum_counts.get(final_museum, 0) + 1

    conn.commit()
    print(f"  Normalized via mapping: {mapping_updated}")

    # ── Final stats ────────────────────────────────────────────────────
    print("\n=== Final stats ===")
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE museum IS NOT NULL AND museum != ''")
    museum_count = cursor.fetchone()[0]
    print(f"Artifacts with museum: {museum_count}/{total} ({museum_count*100//total}%)")

    print("\nMuseum distribution (top 20):")
    sorted_museums = sorted(museum_counts.items(), key=lambda x: -x[1])[:20]
    for museum, cnt in sorted_museums:
        bar = "█" * (cnt // 3)
        print(f"  {museum[:20]:20s} {cnt:4d}  {bar}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()