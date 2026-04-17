#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据清洗脚本 - 清洗和验证文物数据

任务：
1. 过滤零文本条目（full_text少于100字的条目）
2. 去重检查（检查artifacts_list.json中的重复name）
3. QA验证（验证benchmark_qa.json的source_artifact字段）
4. 修复benchmark_source.json
5. 更新validation_report.md
"""

import os
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

# 设置stdout编码为utf-8（Windows兼容）
sys.stdout.reconfigure(encoding='utf-8')

# Windows环境必须指定encoding
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
DETAIL_DIR = os.path.join(DATA_DIR, 'artifacts_detail')

def load_json(filepath):
    """加载JSON文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    """保存JSON文件"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def task1_filter_zero_text():
    """任务1：过滤零文本条目"""
    print("\n=== 任务1：过滤零文本条目 ===")

    # 获取所有detail文件
    detail_files = [f for f in os.listdir(DETAIL_DIR) if f.endswith('.json')]
    print(f"总共发现 {len(detail_files)} 个detail文件")

    valid_artifacts = []
    invalid_artifacts = []
    length_distribution = defaultdict(int)

    for filename in detail_files:
        filepath = os.path.join(DETAIL_DIR, filename)
        try:
            data = load_json(filepath)
            full_text = data.get('full_text', '')
            text_len = len(full_text) if full_text else 0

            # 统计长度分布
            if text_len == 0:
                length_distribution['0'] += 1
            elif text_len < 100:
                length_distribution['1-99'] += 1
            elif text_len < 500:
                length_distribution['100-499'] += 1
            elif text_len < 1000:
                length_distribution['500-999'] += 1
            elif text_len < 2000:
                length_distribution['1000-1999'] += 1
            else:
                length_distribution['2000+'] += 1

            # 过滤条件：full_text少于100字
            if text_len < 100:
                invalid_artifacts.append({
                    'filename': filename,
                    'name': data.get('name', ''),
                    'category': data.get('category', ''),
                    'text_length': text_len,
                    'reason': 'zero_text' if text_len == 0 else 'short_text'
                })
            else:
                valid_artifacts.append({
                    'filename': filename,
                    'name': data.get('name', ''),
                    'category': data.get('category', ''),
                    'text_length': text_len,
                    'era': data.get('era', ''),
                    'museum': data.get('museum', ''),
                    'material': data.get('material', ''),
                    'summary': data.get('summary', '')
                })
        except Exception as e:
            print(f"  错误处理文件 {filename}: {e}")

    print(f"  有效条目: {len(valid_artifacts)}")
    print(f"  无效条目: {len(invalid_artifacts)}")

    # 保存无效条目清单
    invalid_file = os.path.join(DATA_DIR, 'invalid_artifacts.json')
    save_json(invalid_file, {
        'count': len(invalid_artifacts),
        'generated_at': datetime.now().isoformat(),
        'artifacts': invalid_artifacts
    })
    print(f"  已保存无效条目清单到: invalid_artifacts.json")

    # 输出长度分布
    print("\n  正文长度分布:")
    for range_name, count in sorted(length_distribution.items()):
        print(f"    {range_name}: {count}")

    return valid_artifacts, invalid_artifacts, length_distribution

def task2_check_duplicates():
    """任务2：去重检查"""
    print("\n=== 任务2：去重检查 ===")

    artifacts_list = load_json(os.path.join(DATA_DIR, 'artifacts_list.json'))
    names = [item.get('name', '') for item in artifacts_list]

    # 统计重复
    name_counts = Counter(names)
    duplicates = {name: count for name, count in name_counts.items() if count > 1}

    print(f"  总条目数: {len(artifacts_list)}")
    print(f"  唯一名称数: {len(name_counts)}")
    print(f"  重复名称数: {len(duplicates)}")

    if duplicates:
        print(f"\n  重复详情:")
        for name, count in sorted(duplicates.items(), key=lambda x: -x[1]):
            print(f"    '{name}': 出现 {count} 次")

    return duplicates

def task3_validate_qa():
    """任务3：QA验证"""
    print("\n=== 任务3：QA验证 ===")

    benchmark_qa = load_json(os.path.join(DATA_DIR, 'benchmark_qa.json'))
    print(f"  QA条目总数: {len(benchmark_qa)}")

    # 获取所有有效的artifact名称（从detail文件）
    detail_files = [f[:-5] for f in os.listdir(DETAIL_DIR) if f.endswith('.json')]  # 去掉.json后缀
    valid_sources = set()
    for filename in detail_files:
        filepath = os.path.join(DETAIL_DIR, filename + '.json')
        try:
            data = load_json(filepath)
            valid_sources.add(data.get('name', filename))
        except:
            valid_sources.add(filename)

    # 验证每条QA的source_artifact
    invalid_qa = []
    valid_qa = []
    source_usage = defaultdict(int)

    for qa in benchmark_qa:
        source = qa.get('source_artifact', '')
        source_usage[source] += 1

        if source in valid_sources:
            valid_qa.append(qa)
        else:
            invalid_qa.append({
                'id': qa.get('id'),
                'question': qa.get('question', ''),
                'source_artifact': source,
                'reason': 'source_not_found'
            })

    print(f"  有效QA: {len(valid_qa)}")
    print(f"  无效QA: {len(invalid_qa)}")

    if invalid_qa:
        print(f"\n  无效QA详情:")
        for qa in invalid_qa[:10]:  # 只显示前10个
            print(f"    ID {qa['id']}: source '{qa['source_artifact']}' 不存在")
        if len(invalid_qa) > 10:
            print(f"    ... 还有 {len(invalid_qa) - 10} 条")

    # 输出source使用统计
    print(f"\n  Source使用统计（前5个）:")
    for source, count in sorted(source_usage.items(), key=lambda x: -x[1])[:5]:
        print(f"    '{source}': {count} 条QA")

    return valid_qa, invalid_qa, source_usage

def task4_fix_benchmark_source(valid_artifacts):
    """任务4：修复benchmark_source.json"""
    print("\n=== 任务4：修复benchmark_source.json ===")

    # 读取benchmark_qa获取所有需要的source_artifact
    benchmark_qa = load_json(os.path.join(DATA_DIR, 'benchmark_qa.json'))
    needed_sources = set(qa.get('source_artifact', '') for qa in benchmark_qa)
    print(f"  需要的source_artifact数量: {len(needed_sources)}")

    # 从detail文件中提取对应数据
    new_benchmark_source = []

    for source_name in needed_sources:
        # 尝试多种匹配方式
        matched_file = None
        matched_data = None

        # 方式1：直接匹配文件名
        possible_filename = source_name + '.json'
        filepath = os.path.join(DETAIL_DIR, possible_filename)
        if os.path.exists(filepath):
            matched_file = filepath

        # 方式2：搜索detail目录中的name字段
        if not matched_file:
            for filename in os.listdir(DETAIL_DIR):
                if filename.endswith('.json'):
                    fpath = os.path.join(DETAIL_DIR, filename)
                    try:
                        data = load_json(fpath)
                        if data.get('name', '') == source_name:
                            matched_file = fpath
                            break
                    except:
                        pass

        if matched_file:
            try:
                matched_data = load_json(matched_file)
                new_benchmark_source.append({
                    'name': matched_data.get('name', source_name),
                    'era': matched_data.get('era', ''),
                    'museum': matched_data.get('museum', ''),
                    'material': matched_data.get('material', ''),
                    'summary': matched_data.get('summary', ''),
                    'category': matched_data.get('category', ''),
                    'url': matched_data.get('url', ''),
                    'full_text_length': len(matched_data.get('full_text', ''))
                })
            except Exception as e:
                print(f"  读取 {matched_file} 失败: {e}")
        else:
            print(f"  未找到source: '{source_name}'")

    print(f"  成功匹配: {len(new_benchmark_source)}")

    # 保存修复后的benchmark_source.json
    output_file = os.path.join(DATA_DIR, 'benchmark_source.json')
    save_json(output_file, {
        'generated_at': datetime.now().isoformat(),
        'total_sources': len(new_benchmark_source),
        'artifacts': new_benchmark_source
    })
    print(f"  已保存修复后的文件: benchmark_source.json")

    return new_benchmark_source

def task5_update_report(valid_count, invalid_count, length_distribution, duplicates, invalid_qa_count):
    """任务5：更新validation_report.md"""
    print("\n=== 任务5：更新validation_report.md ===")

    # 统计类别分布
    category_count = defaultdict(int)
    for filename in os.listdir(DETAIL_DIR):
        if filename.endswith('.json'):
            filepath = os.path.join(DETAIL_DIR, filename)
            try:
                data = load_json(filepath)
                full_text = data.get('full_text', '')
                if len(full_text) >= 100:  # 只统计有效条目
                    category_count[data.get('category', '未知')] += 1
            except:
                pass

    report = f"""# Data Validation Report

## Summary (更新时间: {datetime.now().strftime('%Y-%m-%d %H:%M')})
- **原始条目总数**: 629
- **有效条目数**: {valid_count} (full_text >= 100字)
- **已过滤条目数**: {invalid_count} (full_text < 100字)
- **有效率**: {valid_count/629*100:.1f}%

## 正文长度分布 (清洗后)
| 长度范围 | 数量 | 百分比 |
|----------|------|--------|
"""
    total = sum(length_distribution.values())
    for range_name in ['0', '1-99', '100-499', '500-999', '1000-1999', '2000+']:
        count = length_distribution.get(range_name, 0)
        pct = count/total*100 if total > 0 else 0
        report += f"| {range_name} 字 | {count} | {pct:.1f}% |\n"

    report += f"""
## 类别分布 (清洗后有效条目)
| 类别 | 数量 |
|------|------|
"""
    for category, count in sorted(category_count.items(), key=lambda x: -x[1])[:10]:
        report += f"| {category} | {count} |\n"

    report += f"""
## 去重检查
- **重复名称数**: {len(duplicates)}
- **重复详情**: {'无重复' if not duplicates else '见invalid_artifacts.json'}

## QA验证结果
- **QA总数**: 181
- **有效QA**: {181 - invalid_qa_count}
- **无效QA**: {invalid_qa_count} (source_artifact不存在)

## 数据文件
- 有效条目详情: `artifacts_detail/*.json` (629个文件)
- 无效条目清单: `invalid_artifacts.json`
- Benchmark QA: `benchmark_qa.json` (181条)
- Benchmark Source: `benchmark_source.json` (已修复)

## 建议下一步
1. 删除invalid_artifacts.json中的条目（朝代页、博物馆页等非文物内容）
2. 为无效QA重新关联正确的source_artifact
3. 扩展数据爬取以达到更多有效条目
"""

    report_file = os.path.join(DATA_DIR, 'validation_report.md')
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f"  已更新报告: validation_report.md")

def main():
    print("=" * 60)
    print("数据清洗脚本开始执行")
    print("=" * 60)

    # 任务1：过滤零文本条目
    valid_artifacts, invalid_artifacts, length_distribution = task1_filter_zero_text()

    # 任务2：去重检查
    duplicates = task2_check_duplicates()

    # 任务3：QA验证
    valid_qa, invalid_qa, source_usage = task3_validate_qa()

    # 任务4：修复benchmark_source.json
    new_benchmark_source = task4_fix_benchmark_source(valid_artifacts)

    # 任务5：更新报告
    task5_update_report(
        len(valid_artifacts),
        len(invalid_artifacts),
        length_distribution,
        duplicates,
        len(invalid_qa)
    )

    print("\n" + "=" * 60)
    print("清洗完成！结果摘要：")
    print("=" * 60)
    print(f"  有效条目数: {len(valid_artifacts)}")
    print(f"  已过滤条目数: {len(invalid_artifacts)}")
    print(f"  重复名称数: {len(duplicates)}")
    print(f"  无效QA数: {len(invalid_qa)}")
    print(f"  benchmark_source已重建，包含 {len(new_benchmark_source)} 个source")
    print("=" * 60)

if __name__ == '__main__':
    main()