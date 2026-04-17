#!/usr/bin/env python3
"""清除维基百科引用标记脚本

清理规则：
- [1], [2], [12] 等数字引用 → 删除
- [a], [b] 等字母引用 → 删除
- [note 1], [note 2] 等注释引用 → 删除
- [3]: 352 等带页码的引用 → 删除整个标记
"""

import os
import sys
import re
import json
from pathlib import Path

# 设置 UTF-8 输出编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 清理正则表达式
PATTERNS = [
    # 数字引用 [1], [12], [123]
    r'\[\d+\]',
    # 字母引用 [a], [b], [abc]
    r'\[[a-z]+\]',
    # 注释引用 [note 1], [note], [note 2]
    r'\[note\s*\d*\]',
    # 带页码的引用 [3]: 352 或 [3]: 352（整个删除）
    r'\[\d+\]:\s*[ \s]*\d+',
    # 带页码的字母引用 [a]: 123
    r'\[[a-z]+\]:\s*[ \s]*\d+',
    # 残留的页码引用（[n] 已删除后留下的）: 123 或 : 123
    r':\s* \s*\d+',
]

# 二次清理：处理残留的空格和格式问题
CLEANUP_PATTERNS = [
    # 清理多余的空格（连续两个以上空格变成一个）
    (r'\s{2,}', ' '),
]

def clean_text(text: str) -> str:
    """清除文本中的维基标记"""
    if not text:
        return text

    cleaned = text
    for pattern in PATTERNS:
        cleaned = re.sub(pattern, '', cleaned)

    # 二次清理多余空格
    for pattern, replacement in CLEANUP_PATTERNS:
        cleaned = re.sub(pattern, replacement, cleaned)

    return cleaned

def process_file(filepath: str) -> tuple[bool, int]:
    """处理单个JSON文件

    Returns:
        (是否修改, 删除的标记数)
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"  错误: {filepath} - {e}")
        return False, 0

    markers_removed = 0

    # 处理 summary 字段
    if 'summary' in data and data['summary']:
        original = data['summary']
        cleaned = clean_text(original)
        if cleaned != original:
            # 计算删除了多少标记
            original_markers = sum(len(re.findall(p, original)) for p in PATTERNS)
            data['summary'] = cleaned
            markers_removed += original_markers

    # 处理 full_text 字段
    if 'full_text' in data and data['full_text']:
        original = data['full_text']
        cleaned = clean_text(original)
        if cleaned != original:
            original_markers = sum(len(re.findall(p, original)) for p in PATTERNS)
            data['full_text'] = cleaned
            markers_removed += original_markers

    if markers_removed > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True, markers_removed

    return False, 0

def main():
    """主函数"""
    base_dir = Path(__file__).parent.parent
    detail_dir = base_dir / 'data' / 'final' / 'artifacts_detail'

    if not detail_dir.exists():
        print(f"目录不存在: {detail_dir}")
        return

    # 获取所有JSON文件
    json_files = list(detail_dir.glob('*.json'))
    print(f"找到 {len(json_files)} 个JSON文件")
    print("开始清理维基标记...")
    print("-" * 50)

    files_modified = 0
    total_markers_removed = 0

    for filepath in json_files:
        modified, markers = process_file(str(filepath))
        if modified:
            files_modified += 1
            total_markers_removed += markers
            print(f"  [OK] {filepath.name}: 删除 {markers} 个标记")

    print("-" * 50)
    print(f"\n清理完成!")
    print(f"  处理文件总数: {len(json_files)}")
    print(f"  修改文件数: {files_modified}")
    print(f"  删除标记总数: {total_markers_removed}")

if __name__ == '__main__':
    main()