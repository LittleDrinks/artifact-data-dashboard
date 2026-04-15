#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据清洗与知识抽取脚本

功能：
1. 从 infobox 抽取结构化知识（era、museum、location、material、dimensions）
2. 从 full_text 正则抽取缺失的结构化字段
3. 修复格式问题、统一字段
4. 合并 artifacts_list.json 和 artifacts_detail/ 的数据
5. 生成清洗报告

不修改 docs/ 和 demo/ 目录。
"""

import os
import re
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

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


# ---------------------------------------------------------------------------
# 知识抽取：从 infobox 映射
# ---------------------------------------------------------------------------
INFOBOX_ERA_KEYS = ['时代', '年份']
INFOBOX_MUSEUM_KEYS = ['现藏', '收藏地', '现存于']
INFOBOX_LOCATION_KEYS = ['出土', '发掘地点', '地址', '位置']
INFOBOX_MATERIAL_KEYS = ['材质']
INFOBOX_DIMENSIONS_KEYS = ['尺寸']

# 类型（type）在某些条目中相当于材质或文物类别
INFOBOX_TYPE_AS_MATERIAL = {'青铜器', '陶器', '瓷器', '玉器', '金器', '银器', '石器', '木器',
                             '丝绸', '纸质', '纸本', '绢本', '竹简', '骨器', '漆器'}


def extract_from_infobox(detail):
    """从 infobox 字段中抽取结构化知识，返回可填充的字段。"""
    ib = detail.get('infobox', {})
    if not ib:
        return {}

    result = {}

    # era
    if not detail.get('era'):
        for key in INFOBOX_ERA_KEYS:
            if ib.get(key):
                result['era'] = ib[key]
                break

    # museum
    if not detail.get('museum'):
        for key in INFOBOX_MUSEUM_KEYS:
            if ib.get(key):
                result['museum'] = ib[key]
                break
        # 收藏国家/地区有时包含博物馆信息
        if 'museum' not in result and ib.get('收藏国家／地区'):
            loc = ib['收藏国家／地区']
            if '博物馆' in loc or '博物院' in loc or '故宫' in loc:
                result['museum'] = loc

    # location
    if not detail.get('location'):
        for key in INFOBOX_LOCATION_KEYS:
            if ib.get(key):
                result['location'] = ib[key]
                break

    # material
    if not detail.get('material'):
        for key in INFOBOX_MATERIAL_KEYS:
            if ib.get(key):
                result['material'] = ib[key]
                break
        # type 字段有时是材质
        if 'material' not in result and ib.get('类型'):
            t = ib['类型']
            if any(m in t for m in INFOBOX_TYPE_AS_MATERIAL):
                result['material'] = t

    # dimensions
    if not detail.get('dimensions'):
        for key in INFOBOX_DIMENSIONS_KEYS:
            if ib.get(key):
                result['dimensions'] = ib[key]
                break

    return result


# ---------------------------------------------------------------------------
# 知识抽取：从 full_text 正则
# ---------------------------------------------------------------------------
# 材质正则
MATERIAL_PATTERNS = [
    r'材质[为：:]\s*([\u4e00-\u9fff]{2,6}?)(?:[，。、；\s]|$)',
    r'(?:材质|质料)[为：:]\s*([\u4e00-\u9fff]+?)(?:[，。、；）\s]|$)',
    r'(青铜器|陶器|瓷器|玉器|金器|银器|石器|木器|丝绸|纸本|绢本|竹简|骨器|漆器|金箔|铜器)',
]

# 清理 material 字段：只保留关键材质词
MATERIAL_KEYWORDS = [
    '青铜', '铜', '陶', '瓷', '玉', '金', '银', '石', '木', '丝', '纸', '绢',
    '竹', '骨', '漆', '铁', '锡', '铅', '琉璃', '珐琅', '水晶', '玛瑙', '琥珀',
    '翡翠', '珊瑚', '象牙', '犀角', '玳瑁', '贝', '蚌', '皮革', '布', '绸', '缎',
]


def clean_material(material):
    """清理 material 字段，提取关键材质词。"""
    if not material:
        return ''
    if len(material) <= 8:
        return material
    # 尝试匹配关键词
    for kw in MATERIAL_KEYWORDS:
        if kw in material:
            # 找到关键词，扩展到合理的范围
            idx = material.index(kw)
            # 向前看2个字
            start = max(0, idx - 2)
            end = min(len(material), idx + len(kw) + 2)
            result = material[start:end]
            # 如果结果还是太长，只保留关键词+后缀
            if len(result) > 6:
                return material[idx:idx+len(kw)+2]
            return result
    # 都不匹配，截断到前6个字
    return material[:6]

# 尺寸正则
DIMENSION_PATTERNS = [
    r'(?:通高|高|全长|长|口径|宽|直径)[：:]?\s*(\d+\.?\d*\s*(?:厘米|公分|mm|cm|m))',
    r'尺寸[：:纵]?\s*(\d+\.?\d*)\s*(?:厘米|公分)',
]

# 馆藏正则
MUSEUM_PATTERNS = [
    r'(?:现藏|收藏于|馆藏于|藏于)[：:，]?\s*([\u4e00-\u9fff]+(?:博物馆|博物院|纪念馆|考古所|文物所|研究所))',
    r'(?:中国国家博物馆|故宫博物院|台北故宫|南京博物院|上海博物馆|陕西省博物馆|河南博物院|湖北省博物馆|湖南省博物馆)',
]


def extract_from_text(detail):
    """从 full_text 中用正则抽取缺失的结构化字段。"""
    full_text = detail.get('full_text', '')
    if not full_text:
        return {}

    result = {}

    # material
    if not detail.get('material'):
        for pat in MATERIAL_PATTERNS:
            m = re.search(pat, full_text)
            if m:
                raw = m.group(1).rstrip('，。、；')
                result['material'] = clean_material(raw)
                break

    # dimensions - collect all dimension mentions
    if not detail.get('dimensions'):
        dims = []
        for pat in DIMENSION_PATTERNS:
            for m in re.finditer(pat, full_text):
                dims.append(m.group(0).strip())
        if dims:
            result['dimensions'] = '；'.join(dims[:3])  # 最多保留3个

    # museum
    if not detail.get('museum'):
        for pat in MUSEUM_PATTERNS:
            m = re.search(pat, full_text)
            if m:
                val = m.group(1) if m.lastindex else m.group(0)
                val = val.rstrip('，。、；')
                if len(val) >= 4:  # 至少4个字
                    result['museum'] = val
                    break

    # location from 出土
    if not detail.get('location'):
        m = re.search(r'(\d+年)[，，]?\s*([\u4e00-\u9fff]+(?:省|市|县|区|镇|村)[\u4e00-\u9fff]*(?:出土|发现|发掘))', full_text)
        if m:
            result['location'] = m.group(2)
        else:
            m = re.search(r'(?:出土于|发现于|发掘于|出土)([\u4e00-\u9fff]+(?:省|市|县|区))', full_text)
            if m:
                result['location'] = m.group(1)

    return result


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("数据清洗与知识抽取")
    print("=" * 60)

    detail_files = sorted([f for f in os.listdir(DETAIL_DIR) if f.endswith('.json')])
    print(f"\n共 {len(detail_files)} 个详情文件")

    stats = {
        'total': len(detail_files),
        'infobox_enriched': 0,
        'text_enriched': 0,
        'era_filled': 0,
        'museum_filled': 0,
        'location_filled': 0,
        'material_filled': 0,
        'dimensions_filled': 0,
    }

    # 用于追踪哪些字段被填补了（原来为空 → 现在有值）
    fill_tracker = defaultdict(int)

    for fn in detail_files:
        filepath = os.path.join(DETAIL_DIR, fn)
        try:
            detail = load_json(filepath)
        except json.JSONDecodeError:
            print(f"  JSON解析错误: {fn}")
            continue

        changed = False

        # 1. 从 infobox 抽取
        infobox_fields = extract_from_infobox(detail)
        for field, value in infobox_fields.items():
            if not detail.get(field):
                detail[field] = value
                fill_tracker[field] += 1
                changed = True
        if infobox_fields:
            stats['infobox_enriched'] += 1

        # 2. 从 full_text 正则抽取
        text_fields = extract_from_text(detail)
        for field, value in text_fields.items():
            if not detail.get(field):
                detail[field] = value
                fill_tracker[field] += 1
                changed = True
        if text_fields:
            stats['text_enriched'] += 1

        # 3. 保存更新
        if changed:
            save_json(filepath, detail)

    # 统计最终空字段情况
    final_empty = Counter()
    for fn in detail_files:
        filepath = os.path.join(DETAIL_DIR, fn)
        try:
            detail = load_json(filepath)
            for field in ['era', 'museum', 'location', 'material', 'dimensions']:
                if not detail.get(field):
                    final_empty[field] += 1
        except:
            pass

    print("\n--- 知识抽取结果 ---")
    print(f"从 infobox 补充数据: {stats['infobox_enriched']} 条")
    print(f"从 full_text 补充数据: {stats['text_enriched']} 条")
    print()
    print("字段补充统计:")
    for field in ['era', 'museum', 'location', 'material', 'dimensions']:
        filled = fill_tracker.get(field, 0)
        remaining = final_empty.get(field, 0)
        total_with_field = stats['total'] - remaining
        print(f"  {field}: 补充了 {filled} 条, 当前有值 {total_with_field}/{stats['total']} ({total_with_field*100//stats['total']}%)")

    # --- 数据清洗部分 ---
    print("\n--- 数据清洗 ---")

    # 检查 artifacts_list.json 重复
    artifacts_list = load_json(os.path.join(DATA_DIR, 'artifacts_list.json'))
    names = [item.get('name', '') for item in artifacts_list]
    name_counts = Counter(names)
    dups = {n: c for n, c in name_counts.items() if c > 1}
    print(f"artifacts_list.json 重复: {len(dups)}")
    if dups:
        for n, c in sorted(dups.items(), key=lambda x: -x[1])[:5]:
            print(f"  \"{n}\": {c} 次")

    # 去重 artifacts_list.json（保留第一条）
    if dups:
        seen = set()
        deduped = []
        for item in artifacts_list:
            name = item.get('name', '')
            if name not in seen:
                seen.add(name)
                deduped.append(item)
        print(f"去重: {len(artifacts_list)} → {len(deduped)}")
        save_json(os.path.join(DATA_DIR, 'artifacts_list.json'), deduped)
        artifacts_list = deduped

    # --- 合并 detail 名称到 artifacts_list ---
    detail_names = set()
    for fn in os.listdir(DETAIL_DIR):
        if fn.endswith('.json'):
            try:
                d = load_json(os.path.join(DETAIL_DIR, fn))
                detail_names.add(d['name'])
            except:
                pass

    list_names = set(item['name'] for item in artifacts_list)
    only_in_detail = detail_names - list_names
    print(f"\n仅存在于 detail 但不在 list 中的: {len(only_in_detail)} 条")
    if only_in_detail:
        # 将这些条目添加到 artifacts_list
        new_items = []
        for fn in os.listdir(DETAIL_DIR):
            if fn.endswith('.json'):
                try:
                    d = load_json(os.path.join(DETAIL_DIR, fn))
                    if d['name'] in only_in_detail:
                        new_items.append({
                            'name': d['name'],
                            'url': d.get('url', ''),
                            'category': d.get('category', ''),
                        })
                except:
                    pass
        artifacts_list.extend(new_items)
        print(f"已添加 {len(new_items)} 条到 artifacts_list.json")
        save_json(os.path.join(DATA_DIR, 'artifacts_list.json'), artifacts_list)

    # --- 验证 benchmark QA ---
    print("\n--- Benchmark 验证 ---")
    benchmark_qa = load_json(os.path.join(DATA_DIR, 'benchmark_qa.json'))
    print(f"Benchmark QA 条目数: {len(benchmark_qa)}")

    # 检查 source_artifact 存在性
    all_artifact_names = detail_names | list_names
    invalid_sources = []
    for qa in benchmark_qa:
        src = qa.get('source_artifact', '')
        if src not in all_artifact_names:
            invalid_sources.append({'id': qa.get('id'), 'source': src, 'question': qa.get('question', '')})

    print(f"无效 source_artifact: {len(invalid_sources)}")
    if invalid_sources:
        for item in invalid_sources[:5]:
            print(f"  ID {item['id']}: \"{item['source']}\"")

    # --- 生成清洗报告 ---
    report = {
        'timestamp': datetime.now().isoformat(),
        'total_detail_files': stats['total'],
        'total_list_entries': len(artifacts_list),
        'total_benchmark_qa': len(benchmark_qa),
        'knowledge_extraction': {
            'infobox_enriched': stats['infobox_enriched'],
            'text_enriched': stats['text_enriched'],
            'fields_filled': dict(fill_tracker),
        },
        'final_completeness': {
            field: f"{stats['total'] - final_empty.get(field, 0)}/{stats['total']}"
            for field in ['era', 'museum', 'location', 'material', 'dimensions']
        },
        'data_quality': {
            'duplicates_removed': len(dups),
            'detail_only_added_to_list': len(only_in_detail) if only_in_detail else 0,
            'invalid_benchmark_sources': len(invalid_sources),
        },
    }
    save_json(os.path.join(DATA_DIR, 'cleaning_report.json'), report)
    print(f"\n清洗报告已保存: data/cleaning_report.json")

    print("\n" + "=" * 60)
    print("数据清洗与知识抽取完成！")
    print("=" * 60)


if __name__ == '__main__':
    main()
