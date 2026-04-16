#!/usr/bin/env python3
"""
过滤非文物条目脚本

功能：
1. 从 artifacts_list.json 中过滤黑名单条目，生成 artifacts_list_clean.json
2. 生成过滤报告
"""

import json
import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"


def load_blacklist() -> set[str]:
    """加载黑名单"""
    blacklist_file = DATA_DIR / "non_artifact_blacklist.json"
    with open(blacklist_file, encoding="utf-8") as f:
        data = json.load(f)
    return set(data["blacklist"])


def filter_artifacts_list(blacklist: set[str]) -> tuple[list, list, int]:
    """
    过滤 artifacts_list.json

    返回：(保留的条目列表, 被过滤的条目列表, 总条目数)
    """
    artifacts_file = DATA_DIR / "artifacts_list.json"
    with open(artifacts_file, encoding="utf-8") as f:
        artifacts = json.load(f)

    total = len(artifacts)
    kept = []
    filtered = []

    for item in artifacts:
        name = item.get("name", "")
        if name in blacklist:
            filtered.append(item)
        else:
            kept.append(item)

    return kept, filtered, total


def save_clean_artifacts(kept: list[dict]) -> None:
    """保存清理后的 artifacts_list"""
    output_file = DATA_DIR / "artifacts_list_clean.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(kept, f, ensure_ascii=False, indent=2)
    print(f"已保存清理后的数据到: {output_file}")
    print(f"保留条目数: {len(kept)}")


def generate_report(kept: list, filtered: list, total: int) -> None:
    """生成过滤报告"""
    report = {
        "total_artifacts": total,
        "kept_count": len(kept),
        "filtered_count": len(filtered),
        "filter_rate": f"{len(filtered) / total * 100:.2f}%",
        "filtered_items": [
            {
                "name": item["name"],
                "category": item["category"],
                "url": item["url"]
            }
            for item in filtered
        ]
    }

    report_file = DATA_DIR / "filter_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n过滤报告已保存到: {report_file}")
    print(f"过滤条目数: {len(filtered)}")
    print(f"过滤比例: {report['filter_rate']}")


def main():
    print("=" * 50)
    print("过滤非文物条目")
    print("=" * 50)

    # 加载黑名单
    blacklist = load_blacklist()
    print(f"黑名单条目数: {len(blacklist)}")

    # 过滤 artifacts_list
    kept, filtered, total = filter_artifacts_list(blacklist)

    # 保存清理后的数据
    save_clean_artifacts(kept)

    # 生成报告
    generate_report(kept, filtered, total)

    # 打印被过滤的条目
    print("\n被过滤的条目:")
    for item in filtered:
        print(f"  - {item['name']} ({item['category']})")

    print("\n" + "=" * 50)
    print("过滤完成!")
    print("=" * 50)


if __name__ == "__main__":
    main()