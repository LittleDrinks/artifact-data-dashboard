#!/usr/bin/env python3
"""
过滤 benchmark QA 中非文物相关条目

功能：
1. 加载黑名单
2. 过滤 benchmark_qa.json 中 source_artifact 为黑名单条目的 QA
3. 生成 benchmark_qa_clean.json
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


def filter_benchmark_qa(blacklist: set[str]) -> tuple[list, list, int]:
    """
    过滤 benchmark_qa.json

    返回：(保留的QA列表, 被过滤的QA列表, 总QA数)
    """
    qa_file = DATA_DIR / "benchmark_qa.json"
    with open(qa_file, encoding="utf-8") as f:
        qa_data = json.load(f)

    total = len(qa_data)
    kept = []
    filtered = []

    for qa in qa_data:
        source = qa.get("source_artifact", "")
        # 过滤黑名单条目，但保留 source_artifact 为 "multiple" 的QA
        if source in blacklist:
            filtered.append(qa)
        else:
            kept.append(qa)

    # 重新编号保留的QA
    for i, qa in enumerate(kept, start=1):
        qa["id"] = i

    return kept, filtered, total


def save_clean_qa(kept: list[dict]) -> None:
    """保存清理后的 benchmark_qa"""
    output_file = DATA_DIR / "benchmark_qa_clean.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(kept, f, ensure_ascii=False, indent=2)
    print(f"已保存清理后的 QA 数据到: {output_file}")
    print(f"保留 QA 数: {len(kept)}")


def generate_report(kept: list, filtered: list, total: int) -> None:
    """生成过滤报告"""
    report = {
        "total_qa": total,
        "kept_count": len(kept),
        "filtered_count": len(filtered),
        "filter_rate": f"{len(filtered) / total * 100:.2f}%",
        "filtered_qa": [
            {
                "id": qa["id"],
                "question": qa["question"],
                "source_artifact": qa["source_artifact"]
            }
            for qa in filtered
        ]
    }

    report_file = DATA_DIR / "qa_filter_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nQA 过滤报告已保存到: {report_file}")
    print(f"过滤 QA 数: {len(filtered)}")
    print(f"过滤比例: {report['filter_rate']}")


def main():
    print("=" * 50)
    print("过滤 benchmark QA 中非文物相关条目")
    print("=" * 50)

    # 加载黑名单
    blacklist = load_blacklist()
    print(f"黑名单条目数: {len(blacklist)}")

    # 过滤 benchmark_qa
    kept, filtered, total = filter_benchmark_qa(blacklist)

    # 保存清理后的数据
    save_clean_qa(kept)

    # 生成报告
    generate_report(kept, filtered, total)

    # 打印被过滤的 QA
    print("\n被过滤的 QA:")
    for qa in filtered:
        print(f"  - #{qa['id']}: {qa['question']} (source: {qa['source_artifact']})")

    print("\n" + "=" * 50)
    print("QA 过滤完成!")
    print("=" * 50)


if __name__ == "__main__":
    main()