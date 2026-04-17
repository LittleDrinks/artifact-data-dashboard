"""清理被 Wikipedia 分类污染的 category 字段"""
import sqlite3
import os

DB_PATH = "backend/data/app.db"

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 查询所有 category 包含 | 的记录
    cursor.execute("SELECT id, name, category FROM artifacts WHERE category LIKE '%|%'")
    rows = cursor.fetchall()

    print(f"找到 {len(rows)} 条需要清理的记录:\n")

    updates = []
    for id, name, category in rows:
        parts = [p.strip() for p in category.split('|') if p.strip()]

        # 规则：取最后一个非空部分
        new_category = parts[-1] if parts else category

        # 如果最后一部分过长（>50），取第一部分
        if len(new_category) > 50:
            new_category = parts[0] if parts else category

        # 如果第一部分也过长，截断或保持原样
        if len(new_category) > 50:
            # 尝试找最短的非空部分
            short_parts = [p for p in parts if len(p) <= 20 and len(p) >= 2]
            if short_parts:
                new_category = short_parts[0]

        print(f"ID={id}: '{category}' -> '{new_category}'")
        updates.append((new_category, id))

    print(f"\n将更新 {len(updates)} 条记录")

    # 执行更新
    cursor.executemany("UPDATE artifacts SET category = ? WHERE id = ?", updates)
    conn.commit()
    print("更新完成")

    # 验证
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE category LIKE '%|%'")
    count = cursor.fetchone()[0]
    print(f"验证: 剩余包含 | 的记录数 = {count}")

    if count == 0:
        print("清理完成!")
    else:
        print(f"还有 {count} 条未清理")

    conn.close()

if __name__ == "__main__":
    main()