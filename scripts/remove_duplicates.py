#!/usr/bin/env python3
"""处理繁简体重复文件

对重复的文件，比较内容丰富程度，保留更丰富的那个，删除另一个。
"""

import os
import sys
import json
from pathlib import Path

# 设置 UTF-8 输出编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 重复文件列表（繁简体重复）
DUPLICATES = [
    ("五牛图.json", "五牛圖.json"),
    ("伯远帖.json", "伯遠帖.json"),
    ("张好好诗.json", "張好好詩.json"),
    ("景云钟.json", "景雲鐘.json"),
    ("清明上河图.json", "清明上河圖.json"),
    ("竹林七贤与荣启期.json", "竹林七賢與榮啟期.json"),
    ("赵佶草书千字文.json", "趙佶草書千字文.json"),
    ("铸客铜鼎.json", "鑄客銅鼎.json"),
]

def get_content_score(filepath: str) -> int:
    """计算文件内容丰富程度评分"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return 0

    score = 0
    # 基础字段
    if data.get('name'): score += 1
    if data.get('url'): score += 1
    if data.get('category'): score += 1
    if data.get('era'): score += 2
    if data.get('location'): score += 2
    if data.get('museum'): score += 2
    if data.get('material'): score += 1
    if data.get('dimensions'): score += 1
    if data.get('infobox'): score += 3

    # 文本字段按长度评分
    summary = data.get('summary', '')
    if summary: score += min(len(summary) // 50, 10)

    full_text = data.get('full_text', '')
    if full_text: score += min(len(full_text) // 200, 20)

    return score

def compare_and_remove(filepath1: str, filepath2: str) -> tuple[str, str]:
    """比较两个文件，返回要保留的和要删除的"""
    score1 = get_content_score(filepath1)
    score2 = get_content_score(filepath2)

    if score1 >= score2:
        return filepath1, filepath2
    else:
        return filepath2, filepath1

def main():
    """主函数"""
    base_dir = Path(__file__).parent.parent
    detail_dir = base_dir / 'data' / 'artifacts_detail'

    print("处理繁简体重复文件")
    print("=" * 50)

    removed_count = 0

    for file1, file2 in DUPLICATES:
        path1 = detail_dir / file1
        path2 = detail_dir / file2

        if not path1.exists() or not path2.exists():
            print(f"  跳过: {file1} 或 {file2} 不存在")
            continue

        keep, remove = compare_and_remove(str(path1), str(path2))
        keep_name = Path(keep).name
        remove_name = Path(remove).name

        # 删除内容较少的文件
        os.remove(remove)
        removed_count += 1
        print(f"  保留: {keep_name} (评分 {get_content_score(keep)})")
        print(f"  删除: {remove_name} (评分 {get_content_score(str(path1) if remove == str(path2) else str(path2))})")

    print("=" * 50)
    print(f"处理完成，删除了 {removed_count} 个重复文件")

if __name__ == '__main__':
    main()