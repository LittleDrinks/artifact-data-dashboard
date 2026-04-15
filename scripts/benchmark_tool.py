#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Benchmark 验证与评估工具

功能：
1. 验证 benchmark_qa.json 的完整性（source_artifact 存在性、字段完整性）
2. 统计 benchmark 覆盖情况
3. 提供评估脚本骨架（用于后续评估 AI 问答质量）

用法：
  python scripts/benchmark_tool.py          # 验证
  python scripts/benchmark_tool.py --stats  # 统计详情
"""

import argparse
import json
import os
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_DIR, 'data')
DETAIL_DIR = os.path.join(DATA_DIR, 'artifacts_detail')


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_all_artifact_names():
    """获取所有已知文物名称。"""
    names = set()
    for fn in os.listdir(DETAIL_DIR):
        if fn.endswith('.json'):
            try:
                d = load_json(os.path.join(DETAIL_DIR, fn))
                names.add(d['name'])
            except:
                pass
    return names


def validate_benchmark(benchmark_qa, artifact_names):
    """验证 benchmark 数据质量。"""
    results = {
        'total': len(benchmark_qa),
        'valid': 0,
        'multi_source': 0,
        'invalid_source': 0,
        'missing_fields': 0,
        'empty_answer': 0,
        'issues': [],
    }

    for qa in benchmark_qa:
        qid = qa.get('id', '?')
        src = qa.get('source_artifact', '')

        # 检查必填字段
        required = ['id', 'question', 'answer', 'source_artifact', 'category', 'difficulty']
        missing = [f for f in required if f not in qa or not qa[f]]
        if missing:
            results['missing_fields'] += 1
            results['issues'].append(f"ID {qid}: missing fields {missing}")
            continue

        # 检查 answer 非空
        if not qa['answer'].strip():
            results['empty_answer'] += 1
            results['issues'].append(f"ID {qid}: empty answer")
            continue

        # 检查 source_artifact
        if src == 'multiple':
            results['multi_source'] += 1
            results['valid'] += 1
        elif '、' in src:
            # 多个文物来源，检查每个
            parts = src.split('、')
            found = sum(1 for p in parts if p in artifact_names)
            if found == len(parts):
                results['multi_source'] += 1
                results['valid'] += 1
            elif found > 0:
                results['valid'] += 1  # 部分匹配也视为有效
            else:
                results['invalid_source'] += 1
                results['issues'].append(f"ID {qid}: source '{src}' not found")
        elif src in artifact_names:
            results['valid'] += 1
        else:
            results['invalid_source'] += 1
            results['issues'].append(f"ID {qid}: source '{src}' not found")

    return results


def print_stats(benchmark_qa, artifact_names):
    """打印详细的统计信息。"""
    print(f"\n{'='*60}")
    print("Benchmark 统计")
    print(f"{'='*60}")

    # 总体
    print(f"\n总问题数: {len(benchmark_qa)}")
    print(f"总文物数: {len(artifact_names)}")

    # 类别分布
    cats = Counter(qa.get('category', 'unknown') for qa in benchmark_qa)
    print(f"\n类别分布:")
    for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count} ({count*100//len(benchmark_qa)}%)")

    # 难度分布
    diffs = Counter(qa.get('difficulty', 'unknown') for qa in benchmark_qa)
    print(f"\n难度分布:")
    for diff, count in sorted(diffs.items(), key=lambda x: -x[1]):
        print(f"  {diff}: {count} ({count*100//len(benchmark_qa)}%)")

    # Source 覆盖
    sources = set()
    multi_sources = set()
    for qa in benchmark_qa:
        src = qa.get('source_artifact', '')
        if src == 'multiple':
            multi_sources.add(src)
        elif '、' in src:
            for s in src.split('、'):
                multi_sources.add(s)
        else:
            sources.add(src)

    all_used = sources | multi_sources
    if 'multiple' in all_used:
        all_used.discard('multiple')

    covered = all_used & artifact_names
    print(f"\nSource 覆盖:")
    print(f"  引用的文物: {len(all_used)}")
    print(f"  有效覆盖: {len(covered)}")
    print(f"  覆盖率: {len(covered)*100//len(artifact_names)}% (相对所有文物)")

    # 答案长度分布
    answer_lens = [len(qa.get('answer', '')) for qa in benchmark_qa]
    if answer_lens:
        print(f"\n答案长度:")
        print(f"  最短: {min(answer_lens)} 字")
        print(f"  最长: {max(answer_lens)} 字")
        print(f"  平均: {sum(answer_lens)//len(answer_lens)} 字")

    # 按类别的难度交叉表
    print(f"\n类别×难度交叉表:")
    cross = defaultdict(Counter)
    for qa in benchmark_qa:
        cross[qa.get('category', 'unknown')][qa.get('difficulty', 'unknown')] += 1
    print(f"  {'类别':<25} {'easy':>5} {'medium':>5} {'hard':>5}")
    for cat in sorted(cross.keys()):
        d = cross[cat]
        print(f"  {cat:<25} {d.get('easy', 0):>5} {d.get('medium', 0):>5} {d.get('hard', 0):>5}")


def evaluate_answers(benchmark_qa, answers_dict):
    """
    评估 AI 回答质量。

    参数:
        benchmark_qa: benchmark 数据
        answers_dict: {question_id: ai_answer} 的字典

    返回:
        评估结果字典
    """
    results = {
        'total': 0,
        'exact_match': 0,
        'has_overlap': 0,
        'no_match': 0,
        'per_category': defaultdict(lambda: {'total': 0, 'exact_match': 0, 'has_overlap': 0}),
    }

    for qa in benchmark_qa:
        qid = qa.get('id')
        if qid not in answers_dict:
            continue

        results['total'] += 1
        expected = qa['answer'].strip()
        actual = answers_dict[qid].strip()
        cat = qa.get('category', 'unknown')

        results['per_category'][cat]['total'] += 1

        if actual == expected:
            results['exact_match'] += 1
            results['per_category'][cat]['exact_match'] += 1
        elif any(kw in actual for kw in expected.split('、') if len(kw) >= 2):
            results['has_overlap'] += 1
            results['per_category'][cat]['has_overlap'] += 1
        else:
            results['no_match'] += 1

    return results


def main():
    parser = argparse.ArgumentParser(description='Benchmark 验证与评估工具')
    parser.add_argument('--stats', action='store_true', help='显示详细统计')
    parser.add_argument('--fix', action='store_true', help='修复可修复的问题')
    args = parser.parse_args()

    # 加载数据
    benchmark_qa = load_json(os.path.join(DATA_DIR, 'benchmark_qa.json'))
    artifact_names = get_all_artifact_names()

    # 验证
    validation = validate_benchmark(benchmark_qa, artifact_names)

    print(f"{'='*60}")
    print("Benchmark 验证结果")
    print(f"{'='*60}")
    print(f"总条目: {validation['total']}")
    print(f"有效: {validation['valid']}")
    print(f"  多源问题: {validation['multi_source']}")
    print(f"无效来源: {validation['invalid_source']}")
    print(f"缺少字段: {validation['missing_fields']}")
    print(f"空答案: {validation['empty_answer']}")

    if validation['issues']:
        print(f"\n前 10 个问题:")
        for issue in validation['issues'][:10]:
            print(f"  {issue}")

    if args.fix:
        # 移除无效条目
        valid_qa = [qa for qa in benchmark_qa
                     if qa.get('source_artifact') in artifact_names
                     or qa.get('source_artifact') == 'multiple'
                     or ('、' in qa.get('source_artifact', '') and
                         any(p in artifact_names for p in qa['source_artifact'].split('、')))]
        removed = len(benchmark_qa) - len(valid_qa)
        if removed > 0:
            print(f"\n移除 {removed} 条无效条目")
            save_json(os.path.join(DATA_DIR, 'benchmark_qa.json'), valid_qa)
            print("已保存清理后的 benchmark_qa.json")
        else:
            print("\n无需修复")

    if args.stats:
        print_stats(benchmark_qa, artifact_names)

    # 生成评估模板
    eval_template_path = os.path.join(DATA_DIR, 'eval_template.json')
    if not os.path.exists(eval_template_path):
        sample_ids = [qa['id'] for qa in benchmark_qa[:20]]
        template = {
            'description': 'AI问答评估结果模板',
            'usage': '将 AI 的回答填入 answers 字段，然后运行 benchmark_tool.py --eval',
            'sample_question_ids': sample_ids,
            'answers': {},
        }
        save_json(eval_template_path, template)
        print(f"\n评估模板已生成: {eval_template_path}")


if __name__ == '__main__':
    main()
