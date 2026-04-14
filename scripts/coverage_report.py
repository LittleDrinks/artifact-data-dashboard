#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
对照 195 件禁止出境展览文物名单与现有数据集，输出覆盖率报告
"""

import json
import os
from difflib import SequenceMatcher

def load_official_list():
    """加载官方195件名单"""
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'official_195_list.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_existing_artifacts():
    """加载现有文物数据"""
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'artifacts_list.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def normalize_name(name):
    """标准化文物名称，便于匹配"""
    # 移除常见前缀/后缀
    name = name.replace('出土', '')
    name = name.replace('《', '').replace('》', '')
    name = name.replace('卷', '')
    name = name.replace('(一套14件)', '')
    name = name.replace('(组)', '')
    name = name.replace('(吴)', '').replace('三国吴', '')
    # 处理一些别名
    if '玉琮王' in name or '良渚出土玉琮王' in name:
        return '良渚出土玉琮王'
    if '司母戊鼎' in name:
        return '后母戊鼎'
    return name.strip()

def similar(a, b, threshold=0.85):
    """检查两个字符串是否相似"""
    # 先尝试标准化后直接匹配
    na = normalize_name(a)
    nb = normalize_name(b)
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    # 使用序列匹配
    return SequenceMatcher(None, na, nb).ratio() >= threshold

def main():
    official = load_official_list()
    existing = load_existing_artifacts()

    # 提取现有数据中的文物名称（排除非文物条目）
    existing_names = set()
    for item in existing:
        name = item['name']
        # 排除明显的非文物条目（如省份、时代、博物馆等）
        if any(kw in name for kw in ['省', '市', '县', '时代', '朝', '博物馆', '国家', '文物局', '中华人民共和国']):
            continue
        existing_names.add(name)

    # 检查每件官方文物是否在现有数据中
    matched = []
    unmatched = []

    for item in official:
        name = item['name']
        found = False
        matched_name = None

        # 直接匹配
        if name in existing_names:
            found = True
            matched_name = name
        else:
            # 模糊匹配
            for ex_name in existing_names:
                if similar(name, ex_name):
                    found = True
                    matched_name = ex_name
                    break

        if found:
            matched.append({
                'official': name,
                'existing': matched_name,
                'batch': item['batch'],
                'category': item['category']
            })
        else:
            unmatched.append({
                'name': name,
                'batch': item['batch'],
                'category': item['category'],
                'era': item['era']
            })

    # 生成报告
    print("=" * 60)
    print("禁止出境展览文物覆盖率报告")
    print("=" * 60)
    print(f"\n官方名单总数: {len(official)}")
    print(f"现有数据总数: {len(existing)}")
    print(f"现有文物条目: {len(existing_names)}")
    print(f"\n匹配成功: {len(matched)} ({len(matched)/len(official)*100:.1f}%)")
    print(f"缺失文物: {len(unmatched)} ({len(unmatched)/len(official)*100:.1f}%)")

    # 按批次统计
    print("\n--- 按批次统计 ---")
    for batch in [1, 2, 3]:
        batch_name = {1: '第一批(2002)', 2: '第二批(2012)', 3: '第三批(2013)'}
        matched_count = len([m for m in matched if m['batch'] == batch])
        unmatched_count = len([u for u in unmatched if u['batch'] == batch])
        total = matched_count + unmatched_count
        print(f"{batch_name[batch]}: 已有 {matched_count}/{total}, 缺失 {unmatched_count}")

    # 按类别统计缺失
    print("\n--- 缺失文物按类别统计 ---")
    category_missing = {}
    for item in unmatched:
        cat = item['category']
        category_missing[cat] = category_missing.get(cat, 0) + 1
    for cat, count in sorted(category_missing.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    # 输出缺失文物列表
    print("\n--- 缺失文物详细列表 ---")
    for item in unmatched:
        batch_name = {1: '第一批', 2: '第二批', 3: '第三批'}
        print(f"  [{batch_name[item['batch']]}] {item['name']} ({item['category']}, {item['era']})")

    # 保存报告到文件
    report_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'coverage_report.md')
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# 禁止出境展览文物覆盖率报告\n\n")
        f.write(f"- **官方名单总数**: {len(official)}\n")
        f.write(f"- **现有数据总数**: {len(existing)}\n")
        f.write(f"- **现有文物条目**: {len(existing_names)}\n")
        f.write(f"- **匹配成功**: {len(matched)} ({len(matched)/len(official)*100:.1f}%)\n")
        f.write(f"- **缺失文物**: {len(unmatched)} ({len(unmatched)/len(official)*100:.1f}%)\n\n")

        f.write("## 按批次统计\n\n")
        f.write("| 批次 | 已有 | 缺失 | 覆盖率 |\n")
        f.write("|------|------|------|--------|\n")
        for batch in [1, 2, 3]:
            batch_name = {1: '第一批(2002年)', 2: '第二批(2012年)', 3: '第三批(2013年)'}
            matched_count = len([m for m in matched if m['batch'] == batch])
            unmatched_count = len([u for u in unmatched if u['batch'] == batch])
            total = matched_count + unmatched_count
            f.write(f"| {batch_name[batch]} | {matched_count} | {unmatched_count} | {matched_count/total*100:.1f}% |\n")

        f.write("\n## 缺失文物详细列表\n\n")
        for item in unmatched:
            batch_name = {1: '第一批', 2: '第二批', 3: '第三批'}
            f.write(f"- [{batch_name[item['batch']]}] **{item['name']}** ({item['category']}, {item['era']})\n")

    print(f"\n报告已保存到: {report_path}")

    # 保存缺失文物JSON（供后续爬取使用）
    missing_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'missing_artifacts.json')
    with open(missing_path, 'w', encoding='utf-8') as f:
        json.dump(unmatched, f, ensure_ascii=False, indent=2)
    print(f"缺失文物列表已保存到: {missing_path}")

if __name__ == '__main__':
    main()