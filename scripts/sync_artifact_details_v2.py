#!/usr/bin/env python3
"""
补全文物缺失数据（增强版）

功能：
1. 从 data/artifacts_detail/ JSON 文件补全缺失字段
2. 从 full_text 使用正则提取 location（针对出土地点）
3. 按 name 匹配，只更新 NULL/空值字段
4. 重点补全 location、description

验收目标：location > 60%, description > 90%

Usage:
    cd backend
    source .venv/Scripts/activate
    python ../scripts/sync_artifact_details_v2.py
"""

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

# Windows encoding fix
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Paths
BASE_DIR = Path(__file__).parent.parent
DB_PATH = BASE_DIR / "backend" / "data" / "app.db"
DETAIL_DIR = BASE_DIR / "data" / "artifacts_detail"

# Infobox key mappings
ERA_INFOBOX_KEYS = ["时代", "年代", "时期", "时期或古文明"]
LOCATION_INFOBOX_KEYS = ["出土", "发掘地点", "发掘于", "位置", "地址"]
MUSEUM_INFOBOX_KEYS = ["现藏", "收藏", "馆藏", "博物馆"]
MATERIAL_INFOBOX_KEYS = ["材质", "材料", "原料"]
DIMENSIONS_INFOBOX_KEYS = ["尺寸", "规格", "大小"]

# Regex patterns for extracting location from full_text
LOCATION_PATTERNS = [
    # 标准出土表述
    r"出土于\s*([^\n，。]{2,25}[县市镇村区省])",
    r"([^\n，。]{2,20}[省县市镇村区])\s*[出土发掘]",
    r"出土\s*[于在]\s*([^\n，。]{2,20})",
    r"发掘[于于]\s*([^\n，。]{2,20}[县市镇村])",
    r"发现[于于]\s*([^\n，。]{2,20}[县市镇村])",
    # 带年份的出土信息
    r"(\d{4}年)[，]?\s*[出土发掘发现][于于]\s*([^\n，。]{2,20})",
    # 省市县结构
    r"([^\n，。]{2,10}省[^\n，。]{2,10}[县市][^\n，。]{0,10}[镇村区])",
    r"([^\n，。]{2,10}省[^\n，。]{2,10}[县市])出土",
    # 县级出土
    r"([^\n，。]{2,10}[县市])[^\n，。]{0,5}出土",
    # 博物馆藏出土信息
    r"现藏[于于]\s*([^\n，。]{2,20}[博物馆院])",
    # 钱币铸造地点
    r"铸[于于]\s*([^\n，。]{2,20})",
    r"始铸[于于]\s*([^\n，。]{2,20})",
    r"铸造[于于]\s*([^\n，。]{2,20})",
    r"([^\n，。]{2,15}[省县市])铸",
    # 出现/发现地点
    r"出现[于于]\s*([^\n，。]{2,20})",
    # 流行于地区
    r"流行[于于]\s*([^\n，。]{2,15}[一带地区])",
]

# 绘画/书法类可用博物馆作为收藏地点（伪 location）
ART_COLLECTOR_CATEGORIES = ["绘画", "书法", "文献"]

# 货币类可用铸造地作为 location
MINT_CATEGORIES = ["货币", "中国古代货币"]

# 抽象概念类别（不应有 location）
ABSTRACT_INDICATORS = [
    "保护", "制度", "法", "列表", "学会", "名录", "遗产",
    "项目", "朝代", "时期", "文化", "人", "国", "代",
    "省", "市", "县", "博物馆", "研究院", "单位",
]

# 过滤掉一些不是地点的匹配结果
LOCATION_BLACKLIST = [
    "中华人民共和国",
    "中国",
    "北京",
    "上海",
    "南京",
    "故宫",
    "国家博物馆",
    "博物馆",
]


def extract_from_infobox(infobox: dict, keys: list) -> str:
    """Try to extract a value from infobox using a list of possible keys."""
    if not isinstance(infobox, dict):
        return ""
    for key in keys:
        val = infobox.get(key, "")
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def extract_location_from_text(text: str) -> str:
    """Try to extract location information from full_text."""
    if not text:
        return ""

    for pattern in LOCATION_PATTERNS:
        match = re.search(pattern, text)
        if match:
            # 获取匹配组，有些模式有多个组
            groups = match.groups()
            # 如果有年份和地点两组，取地点
            if len(groups) >= 2 and groups[0].isdigit():
                loc = groups[1].strip()
            else:
                loc = groups[0].strip()

            # 过滤黑名单
            if any(bl in loc for bl in LOCATION_BLACKLIST):
                continue

            # 清理一些常见噪音
            loc = loc.replace("现在", "").replace("另在", "").strip()
            if len(loc) >= 2 and len(loc) <= 30:
                return loc

    return ""


def get_description(detail: dict) -> str:
    """从详情获取 description（优先 summary，其次 full_text 前300字）"""
    summary = detail.get("summary", "")
    if summary and summary.strip():
        return summary.strip()

    full_text = detail.get("full_text", "")
    if full_text and full_text.strip():
        return full_text[:300].strip()

    return ""


def add_columns_if_missing(conn):
    """检查并添加缺失的列"""
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(artifacts)")
    existing_columns = {col[1] for col in cursor.fetchall()}

    new_columns = ["material", "museum", "dimensions"]
    added = []

    for col in new_columns:
        if col not in existing_columns:
            cursor.execute(f"ALTER TABLE artifacts ADD COLUMN {col} TEXT")
            added.append(col)

    if added:
        conn.commit()
        print(f"添加新字段: {added}")

    return added


def get_field_stats(conn):
    """获取各字段的空值统计"""
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM artifacts")
    total = cursor.fetchone()[0]

    fields = [
        "name",
        "description",
        "category",
        "era",
        "location",
        "material",
        "museum",
        "dimensions",
        "image_url",
        "tags",
    ]

    stats = {}
    for field in fields:
        try:
            cursor.execute(
                f"SELECT COUNT(*) FROM artifacts WHERE {field} IS NULL OR {field} = ''"
            )
            null_count = cursor.fetchone()[0]
            coverage = (total - null_count) / total * 100 if total > 0 else 0
            stats[field] = {"null_count": null_count, "coverage": coverage}
        except Exception:
            stats[field] = {"null_count": total, "coverage": 0}

    return total, stats


def print_stats(total, stats, title=""):
    """打印统计信息"""
    if title:
        print(f"\n{title}")
        print("=" * 50)

    print(f"总记录数: {total}")
    for field, data in stats.items():
        coverage = data["coverage"]
        null_count = data["null_count"]
        status = "✓" if coverage >= 60 else "⚠" if coverage >= 30 else "✗"
        print(f"  {field}: {coverage:.1f}% ({null_count} null) {status}")


def main():
    db_path = DB_PATH.resolve()
    detail_dir = DETAIL_DIR.resolve()

    if not db_path.exists():
        print(f"数据库不存在: {db_path}")
        sys.exit(1)

    if not detail_dir.exists():
        print(f"详情目录不存在: {detail_dir}")
        sys.exit(1)

    # 连接数据库
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    # 1. 添加缺失的列
    add_columns_if_missing(conn)

    # 2. 统计初始状态
    total, before_stats = get_field_stats(conn)
    print_stats(total, before_stats, "初始状态")

    # 3. 加载所有文物记录
    cursor.execute(
        """
        SELECT id, name, description, era, location, material, museum, dimensions
        FROM artifacts
        """
    )
    db_artifacts = {}
    for row in cursor.fetchall():
        (
            aid,
            name,
            desc,
            era,
            loc,
            mat,
            mus,
            dims,
        ) = row
        db_artifacts[name] = {
            "id": aid,
            "description": desc,
            "era": era,
            "location": loc,
            "material": mat,
            "museum": mus,
            "dimensions": dims,
        }

    print(f"\n数据库文物数: {len(db_artifacts)}")

    # 4. 处理详情文件
    detail_files = [f for f in os.listdir(detail_dir) if f.endswith(".json")]
    print(f"详情文件数: {len(detail_files)}")

    # 统计更新计数
    update_counts = {
        "description": 0,
        "era": 0,
        "location": 0,
        "location_from_text": 0,
        "material": 0,
        "museum": 0,
        "dimensions": 0,
    }
    not_in_db = 0
    no_update_needed = 0

    for filename in detail_files:
        filepath = detail_dir / filename
        try:
            with open(filepath, encoding="utf-8") as f:
                detail = json.load(f)
        except Exception as e:
            continue

        name = detail.get("name", "")
        if name not in db_artifacts:
            not_in_db += 1
            continue

        artifact = db_artifacts[name]
        artifact_id = artifact["id"]

        # 提取各字段（优先 top-level，fallback 到 infobox，最后尝试 full_text）
        infobox = detail.get("infobox", {})
        full_text = detail.get("full_text", "")

        new_values = {}

        # description
        if not artifact["description"]:
            desc = get_description(detail)
            if desc:
                new_values["description"] = desc

        # era
        if not artifact["era"]:
            era = detail.get("era", "").strip()
            if not era:
                era = extract_from_infobox(infobox, ERA_INFOBOX_KEYS)
            if era:
                new_values["era"] = era

        # location - 多级 fallback
        if not artifact["location"]:
            # Level 1: top-level location
            loc = detail.get("location", "").strip()
            # Level 2: infobox
            if not loc:
                loc = extract_from_infobox(infobox, LOCATION_INFOBOX_KEYS)
            # Level 3: full_text regex
            if not loc and full_text:
                loc = extract_location_from_text(full_text)
                if loc:
                    update_counts["location_from_text"] += 1
            if loc:
                new_values["location"] = loc

        # material
        if not artifact["material"]:
            mat = detail.get("material", "").strip()
            if not mat:
                mat = extract_from_infobox(infobox, MATERIAL_INFOBOX_KEYS)
            if mat:
                new_values["material"] = mat

        # museum
        if not artifact["museum"]:
            mus = detail.get("museum", "").strip()
            if not mus:
                mus = extract_from_infobox(infobox, MUSEUM_INFOBOX_KEYS)
            if mus:
                new_values["museum"] = mus

        # dimensions
        if not artifact["dimensions"]:
            dims = detail.get("dimensions", "").strip()
            if not dims:
                dims = extract_from_infobox(infobox, DIMENSIONS_INFOBOX_KEYS)
            if dims:
                new_values["dimensions"] = dims

        # 执行更新
        if new_values:
            set_clauses = ", ".join(f"{k} = ?" for k in new_values)
            values = list(new_values.values()) + [artifact_id]
            cursor.execute(f"UPDATE artifacts SET {set_clauses} WHERE id = ?", values)

            for field in new_values:
                if field in update_counts:
                    update_counts[field] += 1
        else:
            no_update_needed += 1

    conn.commit()

    # 5. 统计最终状态
    total, after_stats = get_field_stats(conn)
    print_stats(total, after_stats, "最终状态")

    # 6. 打印更新统计
    print("\n更新统计:")
    print("-" * 30)
    for field, count in update_counts.items():
        if count > 0 and field != "location_from_text":
            before_cov = before_stats.get(field, {}).get("coverage", 0)
            after_cov = after_stats.get(field, {}).get("coverage", 0)
            delta = after_cov - before_cov
            print(f"  {field}: 更新 {count} 条, 覆盖率 {before_cov:.1f}% -> {after_cov:.1f}% (+{delta:.1f}%)")

    if update_counts["location_from_text"] > 0:
        print(f"  从 full_text 提取 location: {update_counts['location_from_text']} 条")

    print(f"\n未在数据库找到: {not_in_db}")
    print(f"无需更新: {no_update_needed}")

    # 7. 验收检查
    print("\n验收检查:")
    print("-" * 30)
    location_cov = after_stats.get("location", {}).get("coverage", 0)
    desc_cov = after_stats.get("description", {}).get("coverage", 0)

    location_pass = location_cov >= 60
    desc_pass = desc_cov >= 90

    print(f"  location 覆盖率: {location_cov:.1f}% {'✓ PASS' if location_pass else '✗ FAIL (目标 60%)'}")
    print(f"  description 覆盖率: {desc_cov:.1f}% {'✓ PASS' if desc_pass else '✗ FAIL (目标 90%)'}")

    conn.close()

    if location_pass and desc_pass:
        print("\n✓ 验收通过!")
        return 0
    else:
        print("\n✗ 验收未通过")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)