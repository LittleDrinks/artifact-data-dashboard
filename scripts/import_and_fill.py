#!/usr/bin/env python3
"""导入新增数据并填充 description 字段

功能：
1. 将 data/artifacts_list_v5.json 导入数据库（新增记录）
2. 从 artifacts_detail/ 获取更多字段信息（era, location, museum, summary）
3. 为所有记录填充 description 字段（从 summary 或 full_text 前200字）
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

    # 初始化数据库
    init_db()
    db = SessionLocal()

    try:
        # 1. 检查现有数据
        existing_count = db.query(Artifact).count()
        print(f"现有数据库记录: {existing_count}")
        print("=" * 60)

        # 2. 加载 v5 数据
        v5_path = base_dir / 'data' / 'artifacts_list_v5.json'
        with open(v5_path, 'r', encoding='utf-8') as f:
            v5_data = json.load(f)
        print(f"v5 数据条数: {len(v5_data)}")

        # 3. 获取已存在的名称
        existing_names = set()
        for artifact in db.query(Artifact).all():
            existing_names.add(artifact.name)

        # 4. 导入新增记录
        imported_count = 0
        for item in v5_data:
            name = item.get('name', '')
            if name in existing_names:
                continue

            # 从详情文件获取更多信息
            detail = load_detail_file(name)

            artifact = Artifact(
                name=name,
                category=item.get('category'),
                image_url=item.get('url'),
                era=detail.get('era'),
                location=detail.get('location') or detail.get('museum'),
                description=get_description(detail),
            )
            db.add(artifact)
            imported_count += 1

        db.commit()
        print(f"导入新增记录: {imported_count}")

        # 5. 填充所有记录的 description
        print("=" * 60)
        print("开始填充 description 字段...")

        description_filled = 0
        all_artifacts = db.query(Artifact).all()

        for artifact in all_artifacts:
            if artifact.description:
                continue

            # 从详情文件获取
            detail = load_detail_file(artifact.name)
            desc = get_description(detail)
            if desc:
                artifact.description = desc
                description_filled += 1

        db.commit()
        print(f"description 填充: {description_filled}")

        # 6. 统计最终状态
        print("=" * 60)
        final_count = db.query(Artifact).count()
        desc_count = db.query(Artifact).filter(Artifact.description != None).count()
        desc_rate = (desc_count / final_count * 100) if final_count > 0 else 0

        print(f"最终数据库记录: {final_count}")
        print(f"description 填充率: {desc_count}/{final_count} ({desc_rate:.1f}%)")

    except Exception as e:
        db.rollback()
        print(f"错误: {e}")
        raise
    finally:
        db.close()

if __name__ == '__main__':
    main()