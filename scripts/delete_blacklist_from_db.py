#!/usr/bin/env python3
"""删除数据库中的非文物条目（黑名单条目）"""

import sys
from pathlib import Path

# 设置 UTF-8 输出编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 添加 backend 到路径
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

import json
from app.database import SessionLocal, init_db
from app.models.artifact import Artifact


def load_blacklist() -> set[str]:
    """加载黑名单"""
    base_dir = Path(__file__).parent.parent
    blacklist_file = base_dir / 'data' / 'non_artifact_blacklist.json'
    with open(blacklist_file, encoding='utf-8') as f:
        data = json.load(f)
    return set(data['blacklist'])


def main():
    """主函数"""
    # 初始化数据库（确保新列存在）
    init_db()

    blacklist = load_blacklist()
    print(f"黑名单条目数: {len(blacklist)}")

    db = SessionLocal()
    try:
        # 查询黑名单条目
        blacklisted = db.query(Artifact).filter(Artifact.name.in_(blacklist)).all()
        print(f"数据库中黑名单条目: {len(blacklisted)}")

        if blacklisted:
            # 打印要删除的条目
            print("\n将删除以下条目:")
            for artifact in blacklisted:
                print(f"  - #{artifact.id}: {artifact.name}")

            # 删除
            for artifact in blacklisted:
                db.delete(artifact)

            db.commit()
            print(f"\n已删除 {len(blacklisted)} 条记录")
        else:
            print("数据库中无黑名单条目，无需删除")

        # 验证
        remaining = db.query(Artifact).filter(Artifact.name.in_(blacklist)).count()
        print(f"验证：数据库中剩余黑名单条目: {remaining}")

        # 统计总数
        total = db.query(Artifact).count()
        print(f"数据库总记录: {total}")

    except Exception as e:
        db.rollback()
        print(f"错误: {e}")
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()