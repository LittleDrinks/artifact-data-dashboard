# -*- coding: utf-8 -*-
"""
从artifacts_detail数据生成Benchmark QA对
目标：从181对扩展到800+对
"""

import json
import os
import glob
import re
from collections import defaultdict

# 目录配置
DETAIL_DIR = "artifacts_detail/"
QA_FILE = "benchmark_qa.json"
OUTPUT_FILE = "benchmark_qa_extended.json"

def load_existing_qa():
    """加载现有QA数据"""
    with open(QA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_all_artifacts():
    """加载所有文物详情"""
    artifacts = {}
    for filepath in glob.glob(os.path.join(DETAIL_DIR, "*.json")):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            name = data.get('name', '')
            if name:
                artifacts[name] = data
    return artifacts

def get_max_id(existing_qa):
    """获取当前最大ID"""
    return max(qa['id'] for qa in existing_qa)

def truncate_text(text, max_chars=200):
    """截取文本到指定长度"""
    if len(text) > max_chars:
        return text[:max_chars] + "..."
    return text

def generate_basic_fact_qa(artifacts, existing_qa, start_id):
    """生成basic_fact类型QA（补充）"""
    new_qas = []
    id_counter = start_id

    # 记录已生成的文物避免重复
    existing_artifacts = set()
    for qa in existing_qa:
        if qa['category'] == 'basic_fact':
            existing_artifacts.add(qa.get('source_artifact', ''))

    # 时代问题模板
    era_templates = [
        "{name}是什么时代的文物？",
        "{name}属于哪个历史时期？",
        "{name}的年代是什么？"
    ]

    # 博物馆问题模板
    museum_templates = [
        "{name}现藏于哪个博物馆？",
        "{name}收藏在什么地方？",
        "{name}目前保存在哪家博物馆？"
    ]

    # 材质问题模板（需要判断material字段）
    material_templates = [
        "{name}的材质是什么？",
        "{name}是用什么材料制作的？"
    ]

    # 出土地点问题模板
    location_templates = [
        "{name}出土于哪里？",
        "{name}是在哪里发现的？",
        "{name}的出土地点在哪里？"
    ]

    for name, artifact in artifacts.items():
        era = artifact.get('era', '')
        museum = artifact.get('museum', '')
        material = artifact.get('material', '')
        location = artifact.get('location', '')

        # 时代问题
        if era and name not in existing_artifacts:
            for template in era_templates[:1]:  # 只生成一个避免重复
                new_qas.append({
                    "id": id_counter,
                    "question": template.format(name=name),
                    "answer": era,
                    "source_artifact": name,
                    "category": "basic_fact",
                    "difficulty": "easy"
                })
                id_counter += 1
                break

        # 博物馆问题（对未覆盖的文物）
        if museum and museum not in ['', '不详', '未知']:
            # 检查是否已有此文物博物馆问题
            has_museum_q = any(
                qa['source_artifact'] == name and '博物馆' in qa['question']
                for qa in existing_qa + new_qas
            )
            if not has_museum_q:
                new_qas.append({
                    "id": id_counter,
                    "question": museum_templates[0].format(name=name),
                    "answer": museum,
                    "source_artifact": name,
                    "category": "basic_fact",
                    "difficulty": "easy"
                })
                id_counter += 1

        # 出土地点问题
        if location:
            has_location_q = any(
                qa['source_artifact'] == name and ('出土' in qa['question'] or '发现' in qa['question'])
                for qa in existing_qa + new_qas
            )
            if not has_location_q:
                # 提取地点
                loc_answer = location.split('（')[0] if '（' in location else location
                new_qas.append({
                    "id": id_counter,
                    "question": location_templates[0].format(name=name),
                    "answer": loc_answer,
                    "source_artifact": name,
                    "category": "basic_fact",
                    "difficulty": "easy"
                })
                id_counter += 1

    return new_qas

def generate_detailed_explanation_qa(artifacts, existing_qa, start_id):
    """生成detailed_explanation类型QA"""
    new_qas = []
    id_counter = start_id

    # 记录已生成的文物
    existing_detailed = set()
    for qa in existing_qa:
        if qa['category'] == 'detailed_explanation':
            existing_detailed.add(qa.get('source_artifact', ''))

    for name, artifact in artifacts.items():
        if name in existing_detailed:
            continue

        summary = artifact.get('summary', '')
        full_text = artifact.get('full_text', '')

        if not summary and not full_text:
            continue

        # 使用summary作为答案（截取前200字）
        answer_text = truncate_text(summary if summary else full_text, 200)

        # 多种问题模板
        templates = [
            f"请简要介绍{name}。",
            f"请介绍{name}的特点和历史。",
            f"{name}是什么？请详细介绍。"
        ]

        for template in templates[:1]:  # 每个文物生成一个
            new_qas.append({
                "id": id_counter,
                "question": template,
                "answer": answer_text,
                "source_artifact": name,
                "category": "detailed_explanation",
                "difficulty": "medium"
            })
            id_counter += 1
            break

    return new_qas

def generate_identification_qa(artifacts, existing_qa, start_id):
    """生成identification类型QA（根据描述识别文物）"""
    new_qas = []
    id_counter = start_id

    # 记录已生成的文物
    existing_ident = set()
    for qa in existing_qa:
        if qa['category'] == 'identification':
            existing_ident.add(qa.get('source_artifact', ''))

    for name, artifact in artifacts.items():
        if name in existing_ident:
            continue

        summary = artifact.get('summary', '')
        era = artifact.get('era', '')
        museum = artifact.get('museum', '')
        location = artifact.get('location', '')

        if not summary:
            continue

        # 截取描述的一部分作为线索
        desc_text = truncate_text(summary, 150)

        # 构造问题
        question = f"以下描述的是什么文物？\"{desc_text}\""

        new_qas.append({
            "id": id_counter,
            "question": question,
            "answer": name,
            "source_artifact": name,
            "category": "identification",
            "difficulty": "hard"
        })
        id_counter += 1

        # 生成反向推理题（更难）
        if era and location:
            loc_simple = location.split('（')[0] if '（' in location else location
            clue_question = f"有一件{era}的文物，出土于{loc_simple}，现藏于{museum}。它是什么？"
            new_qas.append({
                "id": id_counter,
                "question": clue_question,
                "answer": name,
                "source_artifact": name,
                "category": "identification",
                "difficulty": "medium"
            })
            id_counter += 1

    return new_qas

def generate_comparative_qa(artifacts, existing_qa, start_id):
    """生成comparative类型QA（比较类问题）"""
    new_qas = []
    id_counter = start_id

    # 按时代分组文物
    era_groups = defaultdict(list)
    for name, artifact in artifacts.items():
        era = artifact.get('era', '')
        if era:
            era_groups[era].append(name)

    # 按博物馆分组
    museum_groups = defaultdict(list)
    for name, artifact in artifacts.items():
        museum = artifact.get('museum', '')
        if museum and museum not in ['', '不详']:
            museum_groups[museum].append(name)

    # 按时代生成比较问题
    for era, names in era_groups.items():
        if len(names) >= 2:
            # 选择两个文物比较
            sample_names = names[:min(3, len(names))]
            if len(sample_names) >= 2:
                question = f"{era}有哪些著名的文物？请列举至少两件。"
                answer = "、".join(sample_names[:2])
                new_qas.append({
                    "id": id_counter,
                    "question": question,
                    "answer": answer,
                    "source_artifact": "multiple",
                    "category": "comparative",
                    "difficulty": "medium"
                })
                id_counter += 1

    # 按博物馆生成比较问题
    for museum, names in museum_groups.items():
        if len(names) >= 3:
            question = f"{museum}收藏了哪些著名文物？请列举至少三件。"
            answer = "、".join(names[:3])
            new_qas.append({
                "id": id_counter,
                "question": question,
                "answer": answer,
                "source_artifact": "multiple",
                "category": "comparative",
                "difficulty": "medium"
            })
            id_counter += 1

    # 生成两个具体文物比较的问题（从full_text提取特点）
    for era, names in era_groups.items():
        if len(names) >= 2:
            for i in range(min(10, len(names)-1)):  # 每个时代最多10个比较
                name1, name2 = names[i], names[i+1]
                artifact1 = artifacts.get(name1, {})
                artifact2 = artifacts.get(name2, {})

                # 获取特点描述
                summary1 = artifact1.get('summary', '')[:50]
                summary2 = artifact2.get('summary', '')[:50]

                if summary1 and summary2:
                    question = f"{name1}和{name2}都是{era}的文物，它们有什么不同？"
                    answer = f"{name1}：{truncate_text(summary1, 80)}；{name2}：{truncate_text(summary2, 80)}"
                    new_qas.append({
                        "id": id_counter,
                        "question": question,
                        "answer": answer,
                        "source_artifact": f"{name1}、{name2}",
                        "category": "comparative",
                        "difficulty": "hard"
                    })
                    id_counter += 1

    return new_qas

def generate_relationship_qa(artifacts, existing_qa, start_id):
    """生成relationship类型QA（关联类问题）"""
    new_qas = []
    id_counter = start_id

    # 按时代分组
    era_groups = defaultdict(list)
    for name, artifact in artifacts.items():
        era = artifact.get('era', '')
        if era:
            era_groups[era].append((name, artifact))

    # 按博物馆分组
    museum_groups = defaultdict(list)
    for name, artifact in artifacts.items():
        museum = artifact.get('museum', '')
        if museum and museum not in ['', '不详']:
            museum_groups[museum].append((name, artifact))

    # 按出土地点分组（提取省份或城市）
    location_groups = defaultdict(list)
    for name, artifact in artifacts.items():
        location = artifact.get('location', '')
        if location:
            # 提取主要地点
            loc_key = location.split('（')[0].split('省')[0] if '省' in location else location.split('（')[0]
            if loc_key:
                location_groups[loc_key].append((name, artifact))

    # 按时代-博物馆交叉分组
    era_museum_groups = defaultdict(list)
    for name, artifact in artifacts.items():
        era = artifact.get('era', '')
        museum = artifact.get('museum', '')
        if era and museum:
            key = (era, museum)
            era_museum_groups[key].append(name)

    # 时代+博物馆组合问题（hard难度）
    for (era, museum), names in era_museum_groups.items():
        if len(names) >= 2:
            question = f"{museum}收藏了哪些{era}的文物？"
            answer = "、".join(names[:min(5, len(names))])
            new_qas.append({
                "id": id_counter,
                "question": question,
                "answer": answer,
                "source_artifact": "multiple",
                "category": "relationship",
                "difficulty": "hard"
            })
            id_counter += 1

    # 出土地点问题
    for location, items in location_groups.items():
        if len(items) >= 2:
            names = [item[0] for item in items[:min(5, len(items))]]
            question = f"出土于{location}的文物有哪些？"
            answer = "、".join(names)
            new_qas.append({
                "id": id_counter,
                "question": question,
                "answer": answer,
                "source_artifact": "multiple",
                "category": "relationship",
                "difficulty": "medium"
            })
            id_counter += 1

    # 时代问题（列举多个文物）
    for era, items in era_groups.items():
        if len(items) >= 3:
            names = [item[0] for item in items[:min(5, len(items))]]
            question = f"{era}有哪些著名文物？请列举几件。"
            answer = "、".join(names)
            new_qas.append({
                "id": id_counter,
                "question": question,
                "answer": answer,
                "source_artifact": "multiple",
                "category": "relationship",
                "difficulty": "medium"
            })
            id_counter += 1

    return new_qas

def generate_hard_qa(artifacts, existing_qa, start_id):
    """生成hard难度QA（多步推理）"""
    new_qas = []
    id_counter = start_id

    # 收集有详细信息的文物
    detailed_artifacts = []
    for name, artifact in artifacts.items():
        era = artifact.get('era', '')
        museum = artifact.get('museum', '')
        location = artifact.get('location', '')
        summary = artifact.get('summary', '')

        if era and museum and summary:
            detailed_artifacts.append((name, artifact))

    # 多条件筛选问题（hard）
    era_location_museum = defaultdict(list)
    for name, artifact in detailed_artifacts:
        era = artifact.get('era', '')
        location = artifact.get('location', '')
        museum = artifact.get('museum', '')

        # 提取地点关键词
        loc_key = ''
        if location:
            if '河南' in location:
                loc_key = '河南'
            elif '陕西' in location:
                loc_key = '陕西'
            elif '湖南' in location:
                loc_key = '湖南'
            elif '四川' in location:
                loc_key = '四川'

        if era and loc_key:
            era_location_museum[(era, loc_key)].append((name, museum))

    for (era, loc), items in era_location_museum.items():
        if len(items) >= 2:
            # 多步推理：时代+地点→文物列表
            question = f"{era}出土于{loc}的文物有哪些？它们分别收藏在哪些博物馆？"
            answer_parts = []
            for name, museum in items[:min(5, len(items))]:
                answer_parts.append(f"{name}（藏于{museum}）")
            answer = "、".join(answer_parts)

            new_qas.append({
                "id": id_counter,
                "question": question,
                "answer": answer,
                "source_artifact": "multiple",
                "category": "relationship",
                "difficulty": "hard"
            })
            id_counter += 1

    # 特殊特征推理问题
    special_features = {
        '青铜': [],
        '陶瓷': [],
        '玉': [],
        '金': [],
        '帛画': [],
        '书法': [],
        '绘画': [],
    }

    for name, artifact in detailed_artifacts:
        full_text = artifact.get('full_text', '')
        era = artifact.get('era', '')

        if not era:
            continue

        # 检测特征关键词
        for feature in special_features.keys():
            if feature in name or feature in full_text[:100]:
                special_features[feature].append((name, era, artifact.get('museum', '')))

    for feature, items in special_features.items():
        if len(items) >= 2:
            # 按时代分组的特征问题
            era_items = defaultdict(list)
            for name, era, museum in items:
                era_items[era].append((name, museum))

            for era, era_list in era_items.items():
                if len(era_list) >= 2:
                    question = f"{era}有哪些著名的{feature}类文物？"
                    answer_parts = []
                    for name, museum in era_list[:min(5, len(era_list))]:
                        answer_parts.append(f"{name}（藏于{museum}）")
                    answer = "、".join(answer_parts)

                    new_qas.append({
                        "id": id_counter,
                        "question": question,
                        "answer": answer,
                        "source_artifact": "multiple",
                        "category": "relationship",
                        "difficulty": "hard"
                    })
                    id_counter += 1

    # 禁止出境展览文物相关hard问题
    forbidden_artifacts = []
    for name, artifact in artifacts.items():
        if artifact.get('category') == '禁止出境展览文物':
            forbidden_artifacts.append((name, artifact))

    if len(forbidden_artifacts) >= 3:
        # 按时代分组
        era_forbidden = defaultdict(list)
        for name, artifact in forbidden_artifacts:
            era = artifact.get('era', '')
            if era:
                era_forbidden[era].append(name)

        for era, names in era_forbidden.items():
            if len(names) >= 2:
                question = f"{era}有哪些禁止出境展览的文物？"
                answer = "、".join(names[:min(5, len(names))])
                new_qas.append({
                    "id": id_counter,
                    "question": question,
                    "answer": answer,
                    "source_artifact": "multiple",
                    "category": "relationship",
                    "difficulty": "hard"
                })
                id_counter += 1

        # 按博物馆分组
        museum_forbidden = defaultdict(list)
        for name, artifact in forbidden_artifacts:
            museum = artifact.get('museum', '')
            if museum:
                museum_forbidden[museum].append(name)

        for museum, names in museum_forbidden.items():
            if len(names) >= 3:
                question = f"{museum}收藏了哪些禁止出境展览的文物？"
                answer = "、".join(names[:min(5, len(names))])
                new_qas.append({
                    "id": id_counter,
                    "question": question,
                    "answer": answer,
                    "source_artifact": "multiple",
                    "category": "relationship",
                    "difficulty": "hard"
                })
                id_counter += 1

    return new_qas

def main():
    """主函数"""
    print("加载现有QA数据...")
    existing_qa = load_existing_qa()
    max_id = get_max_id(existing_qa)
    print(f"现有QA数量: {len(existing_qa)}, 最大ID: {max_id}")

    print("\n加载文物详情数据...")
    artifacts = load_all_artifacts()
    print(f"文物数量: {len(artifacts)}")

    # 统计现有分布
    category_count = defaultdict(int)
    difficulty_count = defaultdict(int)
    for qa in existing_qa:
        category_count[qa['category']] += 1
        difficulty_count[qa['difficulty']] += 1

    print("\n现有QA分布:")
    print(f"  Category: {dict(category_count)}")
    print(f"  Difficulty: {dict(difficulty_count)}")

    # 生成各类QA
    all_new_qas = []

    print("\n生成basic_fact QA...")
    basic_qas = generate_basic_fact_qa(artifacts, existing_qa, max_id + 1)
    all_new_qas.extend(basic_qas)
    print(f"  生成数量: {len(basic_qas)}")

    print("\n生成detailed_explanation QA...")
    detailed_qas = generate_detailed_explanation_qa(artifacts, existing_qa, max_id + len(basic_qas) + 1)
    all_new_qas.extend(detailed_qas)
    print(f"  生成数量: {len(detailed_qas)}")

    print("\n生成identification QA...")
    ident_qas = generate_identification_qa(artifacts, existing_qa, max_id + len(basic_qas) + len(detailed_qas) + 1)
    all_new_qas.extend(ident_qas)
    print(f"  生成数量: {len(ident_qas)}")

    print("\n生成comparative QA...")
    comp_qas = generate_comparative_qa(artifacts, existing_qa, max_id + len(basic_qas) + len(detailed_qas) + len(ident_qas) + 1)
    all_new_qas.extend(comp_qas)
    print(f"  生成数量: {len(comp_qas)}")

    print("\n生成relationship QA...")
    rel_qas = generate_relationship_qa(artifacts, existing_qa, max_id + len(basic_qas) + len(detailed_qas) + len(ident_qas) + len(comp_qas) + 1)
    all_new_qas.extend(rel_qas)
    print(f"  生成数量: {len(rel_qas)}")

    print("\n生成hard难度QA...")
    hard_qas = generate_hard_qa(artifacts, existing_qa, max_id + len(all_new_qas) + 1)
    all_new_qas.extend(hard_qas)
    print(f"  生成数量: {len(hard_qas)}")

    # 合并并保存
    final_qa = existing_qa + all_new_qas

    print(f"\n总QA数量: {len(final_qa)}")

    # 统计新分布
    new_category_count = defaultdict(int)
    new_difficulty_count = defaultdict(int)
    for qa in final_qa:
        new_category_count[qa['category']] += 1
        new_difficulty_count[qa['difficulty']] += 1

    print("\n新QA分布:")
    print(f"  Category: {dict(new_category_count)}")
    print(f"  Difficulty: {dict(new_difficulty_count)}")

    # 保存到新文件
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_qa, f, ensure_ascii=False, indent=2)

    print(f"\n已保存到: {OUTPUT_FILE}")

    return final_qa

if __name__ == "__main__":
    main()