#!/usr/bin/env python3
"""合并 data_ds.csv 到数据库

功能：
1. 添加 related_artifacts 字段到 artifacts 表
2. 用 name 匹配：已有记录补全字段，新记录插入
3. 统计合并结果
"""

import csv
import sys
import os
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

# 添加 backend 到路径
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

from app.database import SessionLocal, init_db
from app.models.artifact import Artifact


def load_csv():
    """加载 data_ds.csv"""
    csv_path = Path(__file__).parent.parent / 'data_ds.csv'
    if not csv_path.exists():
        print(f"CSV 文件不存在: {csv_path}")
        return []

    artifacts = []
    with open(csv_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # 处理多行描述（CSV 中用引号包裹）
            description = row.get('description', '')
            if description:
                # 清理换行符
                description = description.replace('\n', ' ').strip()

            artifacts.append({
                'name': row.get('name', '').strip(),
                'source_url': row.get('source_url', '').strip(),
                'description': description[:500] if description else None,  # 限制长度
                'category': row.get('category', '').strip(),
                'era': row.get('era', '').strip(),
                'location': row.get('location', '').strip(),
                'museum': row.get('museum', '').strip(),
                'material': row.get('material', '').strip(),
                'dimensions': row.get('dimensions', '').strip(),
                'image_url': row.get('image_url', '').strip(),
                'related_artifacts': row.get('related_artifacts', '').strip(),
            })

    return artifacts


def main():
    """主函数"""
    print("=" * 60)
    print("合并 data_ds.csv 到数据库")
    print("=" * 60)

    # 初始化数据库（会自动添加新列）
    init_db()

    # 手动添加新列（SQLite 不自动修改现有表）
    import sqlite3
    db_path = Path(__file__).parent.parent / 'backend' / 'data' / 'app.db'
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 检查列是否存在
    cursor.execute("PRAGMA table_info(artifacts)")
    columns = [col[1] for col in cursor.fetchall()]

    if 'related_artifacts' not in columns:
        print("添加 related_artifacts 列...")
        cursor.execute("ALTER TABLE artifacts ADD COLUMN related_artifacts TEXT")
        conn.commit()
        print("列已添加")
    else:
        print("related_artifacts 列已存在")

    conn.close()

    db = SessionLocal()

    try:
        # 1. 加载 CSV
        csv_data = load_csv()
        print(f"CSV 记录数: {len(csv_data)}")

        # 2. 获取现有数据库记录
        existing = {a.name: a for a in db.query(Artifact).all()}
        print(f"数据库现有记录: {len(existing)}")

        # 3. 合并
        updated_count = 0
        inserted_count = 0
        related_count = 0
        image_count = 0

        for item in csv_data:
            name = item['name']
            if not name:
                continue

            if name in existing:
                # 更新现有记录
                artifact = existing[name]

                # 补全空字段
                if not artifact.description and item['description']:
                    artifact.description = item['description']
                    updated_count += 1
                if not artifact.era and item['era']:
                    artifact.era = item['era']
                    updated_count += 1
                if not artifact.location and item['location']:
                    artifact.location = item['location']
                    updated_count += 1
                if not artifact.museum and item['museum']:
                    artifact.museum = item['museum']
                    updated_count += 1
                if not artifact.material and item['material']:
                    artifact.material = item['material']
                    updated_count += 1
                if not artifact.dimensions and item['dimensions']:
                    artifact.dimensions = item['dimensions']
                    updated_count += 1
                if not artifact.image_url and item['image_url']:
                    artifact.image_url = item['image_url']
                    image_count += 1
                    updated_count += 1
                if not artifact.related_artifacts and item['related_artifacts']:
                    artifact.related_artifacts = item['related_artifacts']
                    related_count += 1
                    updated_count += 1
            else:
                # 新增记录
                artifact = Artifact(
                    name=name,
                    description=item['description'],
                    category=item['category'],
                    era=item['era'],
                    location=item['location'],
                    museum=item['museum'],
                    material=item['material'],
                    dimensions=item['dimensions'],
                    source_url=item['source_url'],
                    image_url=item['image_url'],
                    related_artifacts=item['related_artifacts'],
                )
                db.add(artifact)
                inserted_count += 1
                if item['related_artifacts']:
                    related_count += 1
                if item['image_url']:
                    image_count += 1

        db.commit()

        # 4. 统计
        print("\n" + "=" * 60)
        print("合并结果")
        print("=" * 60)
        print(f"补全字段: {updated_count} 条记录")
        print(f"新增记录: {inserted_count} 条")
        print(f"image_url 覆盖: +{image_count}")
        print(f"related_artifacts 覆盖: +{related_count}")

        # 5. 最终覆盖率统计
        final_count = db.query(Artifact).count()

        desc_count = db.query(Artifact).filter(Artifact.description != None).count()
        era_count = db.query(Artifact).filter(Artifact.era != None).count()
        location_count = db.query(Artifact).filter(Artifact.location != None).count()
        museum_count = db.query(Artifact).filter(Artifact.museum != None).count()
        material_count = db.query(Artifact).filter(Artifact.material != None).count()
        dimensions_count = db.query(Artifact).filter(Artifact.dimensions != None).count()
        image_count = db.query(Artifact).filter(Artifact.image_url != None).count()
        related_count = db.query(Artifact).filter(Artifact.related_artifacts != None).count()

        print("\n" + "=" * 60)
        print("最终覆盖率")
        print("=" * 60)
        print(f"总记录数: {final_count}")
        print(f"  description: {desc_count}/{final_count} ({desc_count/final_count*100:.1f}%)")
        print(f"  era: {era_count}/{final_count} ({era_count/final_count*100:.1f}%)")
        print(f"  location: {location_count}/{final_count} ({location_count/final_count*100:.1f}%)")
        print(f"  museum: {museum_count}/{final_count} ({museum_count/final_count*100:.1f}%)")
        print(f"  material: {material_count}/{final_count} ({material_count/final_count*100:.1f}%)")
        print(f"  dimensions: {dimensions_count}/{final_count} ({dimensions_count/final_count*100:.1f}%)")
        print(f"  image_url: {image_count}/{final_count} ({image_count/final_count*100:.1f}%)")
        print(f"  related_artifacts: {related_count}/{final_count} ({related_count/final_count*100:.1f}%)")

    except Exception as e:
        db.rollback()
        print(f"错误: {e}")
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()