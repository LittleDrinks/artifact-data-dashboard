#!/usr/bin/env python3
"""数据验收脚本

对 data/artifacts_detail/ 下的所有 JSON 文件进行全面检查：
1. JSON 格式完整性：每条必须有 name, url, category 非空
2. 字段填充率：统计各字段的填充情况
3. 非文物检测：名称含特定关键词的标记为疑似非文物
4. 年代异常：era 不在标准年代列表中的标记
5. 图片 URL：image_url 不是 upload.wikimedia.org 的标记
6. 文本质量：full_text 仍含维基标记的
7. 重复检测：按 name 或 url 去重
"""

import os
import sys
import re
import json
from pathlib import Path
from collections import defaultdict
from typing import Any

# 设置 UTF-8 输出编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 必填字段
REQUIRED_FIELDS = ['name', 'url', 'category']

# 统计字段
STAT_FIELDS = ['era', 'location', 'museum', 'material', 'dimensions', 'summary', 'full_text', 'infobox', 'image_url']

# 标准年代列表
STANDARD_ERAS = [
    '商', '商代', '西周', '东周', '春秋', '春秋时期', '战国', '战国时期',
    '秦', '秦代', '西汉', '东汉', '三国', '晋', '晋朝', '南北朝', '北齐',
    '隋', '唐', '唐代', '宋', '宋朝', '北宋', '南宋', '元', '元代', '元朝',
    '明', '明代', '明朝', '清', '清代', '清朝', '民国', '新石器时代',
    '商周', '商晚期', '西周早期', '西周中期', '西周晚期',
    '春秋战国', '汉', '汉代', '魏晋南北朝', '唐宋', '宋元', '明清',
]

# 疑似非文物关键词
NON_ARTIFACT_KEYWORDS = [
    '博物馆', '博物院', '列表', '文物局', '文物保护', '中华人民共和国',
    '中国', '朝代', '时期', '制度', '法', '学会', '名录', '预备名录',
    '遗产日', '建筑遗产', '考古大发现', '文化街区', '保护区',
    '陶瓷史', '陶瓷业', '货币', '钱币', '钱', '通宝', '银', '金', '币',
    '石窟', '摩崖', '造像', '墓', '塔', '寺', '教堂', '天主堂',
    '图录', '博古图', '营造学社', '世界遗产', '联合国',
]

def is_standard_era(era: str) -> bool:
    """检查年代是否在标准列表中"""
    if not era:
        return True  # 空值不标记为异常
    # 检查是否包含标准年代关键词
    for std in STANDARD_ERAS:
        if std in era or era in std:
            return True
    return False

def is_non_artifact(name: str) -> bool:
    """检查是否疑似非文物"""
    for keyword in NON_ARTIFACT_KEYWORDS:
        if keyword in name:
            return True
    return False

def has_wiki_markers(text: str) -> list[str]:
    """检查文本中是否还有维基标记"""
    if not text:
        return []
    patterns = [
        r'\[\d+\]',  # [1], [12]
        r'\[[a-z]+\]',  # [a], [b]
        r'\[note\s*\d*\]',  # [note 1]
        r':\s* \s*\d+',  # 残留页码 : 352
    ]
    markers = []
    for p in patterns:
        matches = re.findall(p, text)
        markers.extend(matches)
    return markers

def validate_file(filepath: str) -> dict[str, Any]:
    """验证单个JSON文件"""
    result = {
        'filepath': filepath,
        'valid': True,
        'issues': [],
        'fields': {},
    }

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        result['valid'] = False
        result['issues'].append(f"JSON解析错误: {e}")
        return result
    except FileNotFoundError:
        result['valid'] = False
        result['issues'].append("文件不存在")
        return result

    # 检查必填字段
    for field in REQUIRED_FIELDS:
        value = data.get(field)
        if not value or (isinstance(value, str) and not value.strip()):
            result['issues'].append(f"必填字段缺失或为空: {field}")
            result['valid'] = False

    # 统计字段填充情况
    for field in STAT_FIELDS:
        value = data.get(field)
        result['fields'][field] = bool(value and (isinstance(value, str) and value.strip() or isinstance(value, dict) and value))

    # 非文物检测
    name = data.get('name', '')
    if name and is_non_artifact(name):
        result['issues'].append(f"疑似非文物: 名称含关键词")

    # 年代异常检测
    era = data.get('era', '')
    if era and not is_standard_era(era):
        result['issues'].append(f"年代异常: '{era}'")

    # 图片 URL 检测
    image_url = data.get('image_url', '')
    if image_url and 'upload.wikimedia.org' not in image_url:
        result['issues'].append(f"图片URL异常: 非 Wikimedia 来源")

    # 文本质量检测
    full_text = data.get('full_text', '')
    markers = has_wiki_markers(full_text)
    if markers:
        result['issues'].append(f"文本质量: 仍有维基标记 {len(markers)} 个")
        result['valid'] = False

    return result

def main():
    """主函数"""
    base_dir = Path(__file__).parent.parent
    detail_dir = base_dir / 'data' / 'artifacts_detail'

    if not detail_dir.exists():
        print(f"目录不存在: {detail_dir}")
        return

    # 获取所有JSON文件
    json_files = list(detail_dir.glob('*.json'))
    print(f"找到 {len(json_files)} 个JSON文件")
    print("=" * 60)

    # 验证结果统计
    results = []
    valid_count = 0
    invalid_count = 0

    # 字段填充率统计
    field_stats = defaultdict(lambda: {'filled': 0, 'empty': 0})

    # 问题统计
    issue_stats = defaultdict(int)

    # 重复检测
    name_set = {}
    url_set = {}
    duplicates = []

    for filepath in json_files:
        result = validate_file(str(filepath))
        results.append(result)

        if result['valid']:
            valid_count += 1
        else:
            invalid_count += 1

        # 统计字段填充率
        for field, filled in result['fields'].items():
            if filled:
                field_stats[field]['filled'] += 1
            else:
                field_stats[field]['empty'] += 1

        # 统计问题类型
        for issue in result['issues']:
            issue_type = issue.split(':')[0]
            issue_stats[issue_type] += 1

        # 重复检测（需要先读取数据）
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            name = data.get('name', '')
            url = data.get('url', '')

            if name in name_set:
                duplicates.append({
                    'type': 'name',
                    'value': name,
                    'files': [name_set[name], str(filepath)]
                })
            else:
                name_set[name] = str(filepath)

            if url in url_set:
                duplicates.append({
                    'type': 'url',
                    'value': url,
                    'files': [url_set[url], str(filepath)]
                })
            else:
                url_set[url] = str(filepath)
        except:
            pass

    # 打印摘要
    print("\n【验证摘要】")
    print(f"  有效文件: {valid_count}")
    print(f"  无效文件: {invalid_count}")

    print("\n【字段填充率】")
    total = len(json_files)
    for field in STAT_FIELDS:
        filled = field_stats[field]['filled']
        rate = (filled / total * 100) if total > 0 else 0
        print(f"  {field}: {filled}/{total} ({rate:.1f}%)")

    print("\n【问题统计】")
    for issue_type, count in sorted(issue_stats.items(), key=lambda x: -x[1]):
        print(f"  {issue_type}: {count} 个")

    print("\n【重复检测】")
    if duplicates:
        print(f"  发现 {len(duplicates)} 个重复项:")
        for dup in duplicates[:10]:  # 只显示前10个
            print(f"    - {dup['type']}: {dup['value']}")
        if len(duplicates) > 10:
            print(f"    ... 还有 {len(duplicates) - 10} 个")
    else:
        print("  无重复")

    # 生成详细报告
    report = {
        'summary': {
            'total_files': len(json_files),
            'valid_files': valid_count,
            'invalid_files': invalid_count,
            'duplicate_count': len(duplicates),
        },
        'field_fill_rates': {
            field: {
                'filled': field_stats[field]['filled'],
                'empty': field_stats[field]['empty'],
                'rate': round(field_stats[field]['filled'] / total * 100, 1) if total > 0 else 0
            }
            for field in STAT_FIELDS
        },
        'issue_counts': dict(issue_stats),
        'duplicates': duplicates,
        'invalid_files': [r for r in results if not r['valid']],
    }

    report_path = base_dir / 'data' / 'validation_report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n详细报告已保存到: {report_path}")
    print("=" * 60)

if __name__ == '__main__':
    main()