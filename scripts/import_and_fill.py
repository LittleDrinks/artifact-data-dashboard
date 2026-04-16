#!/usr/bin/env python3
"""导入新增数据并填充 description 字段

功能：
1. 将 data/artifacts_list_clean.json 导入数据库（已过滤非文物）
2. 从 artifacts_detail/ 获取更多字段信息（era, location, museum, material, dimensions, summary）
3. 为所有记录填充 description 字段（从 summary 或 full_text 前200字）
4. 填充新增字段：material, museum, source_url, dimensions
"""

import os
import sys
import json
from pathlib import Path

# 设置 UTF-8 输出编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 添加 backend 到路径
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

from app.database import SessionLocal, init_db
from app.models.artifact import Artifact

def load_detail_file(name: str) -> dict:
    """加载详情文件"""
    base_dir = Path(__file__).parent.parent
    detail_dir = base_dir / 'data' / 'artifacts_detail'

    # 尝试多种文件名格式
    possible_names = [
        f"{name}.json",
        f"{name.replace('/', '_')}.json",
    ]

    for fname in possible_names:
        filepath = detail_dir / fname
        if filepath.exists():
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass

    return {}

def get_description(detail: dict) -> str:
    """从详情获取 description"""
    summary = detail.get('summary', '')
    if summary:
        return summary

    full_text = detail.get('full_text', '')
    if full_text:
        # 取前 200 字符
        return full_text[:200].strip()

    return ''

def main():
    """主函数"""
    base_dir = Path(__file__).parent.parent

    # 初始化数据库（会自动添加新列）
    init_db()
    db = SessionLocal()

    try:
        # 1. 检查现有数据
        existing_count = db.query(Artifact).count()
        print(f"现有数据库记录: {existing_count}")
        print("=" * 60)

        # 2. 加载清理后的数据（优先使用 clean 版本）
        clean_path = base_dir / 'data' / 'artifacts_list_clean.json'
        if clean_path.exists():
            with open(clean_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f"使用清理后数据: artifacts_list_clean.json ({len(data)} 条)")
        else:
            # 回退到原始数据
            v5_path = base_dir / 'data' / 'artifacts_list_v5.json'
            with open(v5_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f"使用原始数据: artifacts_list_v5.json ({len(data)} 条)")

        # 3. 获取已存在的名称
        existing_names = set()
        for artifact in db.query(Artifact).all():
            existing_names.add(artifact.name)

        # 4. 导入新增记录
        imported_count = 0
        for item in data:
            name = item.get('name', '')
            if name in existing_names:
                continue

            # 从详情文件获取更多信息
            detail = load_detail_file(name)

            artifact = Artifact(
                name=name,
                category=item.get('category'),
                # source_url 使用 Wikipedia 链接
                source_url=item.get('url'),
                era=detail.get('era'),
                location=detail.get('location'),
                museum=detail.get('museum'),
                material=detail.get('material'),
                dimensions=detail.get('dimensions'),
                description=get_description(detail),
            )
            db.add(artifact)
            imported_count += 1

        db.commit()
        print(f"导入新增记录: {imported_count}")

        # 5. 填充所有记录的字段
        print("=" * 60)
        print("开始填充字段...")

        fields_filled = {
            'description': 0,
            'material': 0,
            'museum': 0,
            'source_url': 0,
            'dimensions': 0,
        }

        all_artifacts = db.query(Artifact).all()

        for artifact in all_artifacts:
            # 从详情文件获取
            detail = load_detail_file(artifact.name)

            # 填充 description
            if not artifact.description:
                desc = get_description(detail)
                if desc:
                    artifact.description = desc
                    fields_filled['description'] += 1

            # 填充 material
            if not artifact.material and detail.get('material'):
                artifact.material = detail.get('material')
                fields_filled['material'] += 1

            # 填充 museum
            if not artifact.museum and detail.get('museum'):
                artifact.museum = detail.get('museum')
                fields_filled['museum'] += 1

            # 填充 source_url（如果没有则使用详情文件中的 url）
            if not artifact.source_url:
                if detail.get('url'):
                    artifact.source_url = detail.get('url')
                    fields_filled['source_url'] += 1

            # 填充 dimensions
            if not artifact.dimensions and detail.get('dimensions'):
                artifact.dimensions = detail.get('dimensions')
                fields_filled['dimensions'] += 1

        db.commit()

        for field, count in fields_filled.items():
            if count > 0:
                print(f"{field} 填充: {count}")

        # 6. 统计最终状态
        print("=" * 60)
        final_count = db.query(Artifact).count()

        # 统计各字段覆盖率
        desc_count = db.query(Artifact).filter(Artifact.description != None).count()
        material_count = db.query(Artifact).filter(Artifact.material != None).count()
        museum_count = db.query(Artifact).filter(Artifact.museum != None).count()
        source_count = db.query(Artifact).filter(Artifact.source_url != None).count()
        dims_count = db.query(Artifact).filter(Artifact.dimensions != None).count()

        print(f"最终数据库记录: {final_count}")
        print(f"字段覆盖率:")
        print(f"  - description: {desc_count}/{final_count} ({desc_count/final_count*100:.1f}%)")
        print(f"  - material: {material_count}/{final_count} ({material_count/final_count*100:.1f}%)")
        print(f"  - museum: {museum_count}/{final_count} ({museum_count/final_count*100:.1f}%)")
        print(f"  - source_url: {source_count}/{final_count} ({source_count/final_count*100:.1f}%)")
        print(f"  - dimensions: {dims_count}/{final_count} ({dims_count/final_count*100:.1f}%)")

    except Exception as e:
        db.rollback()
        print(f"错误: {e}")
        raise
    finally:
        db.close()

if __name__ == '__main__':
    main()