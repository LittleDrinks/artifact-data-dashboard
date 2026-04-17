#!/usr/bin/env python
"""
清理 artifacts 表中无效的 image_url：
1. Wikipedia 页面链接 -> NULL
2. Wikimedia 非缩略图链接 -> 尝试转换为缩略图 URL
"""

import sqlite3
import re
import os

DB_PATH = "E:/shared/workplace/ADD_new/backend/data/app.db"

def convert_to_thumb_url(url: str) -> str | None:
    """
    将 Wikimedia 非缩略图 URL 转换为缩略图 URL。
    格式：
    - 原: https://upload.wikimedia.org/wikipedia/commons/<hash>/<filename>
    - 新: https://upload.wikimedia.org/wikipedia/commons/thumb/<hash>/<filename>/500px-<filename>
    """
    pattern = r"(https://upload\.wikimedia\.org/wikipedia/commons/)([a-f0-9]/[a-f0-9]{2}/)([^/]+)$"
    match = re.match(pattern, url)
    if match:
        base, hash_part, filename = match.groups()
        thumb_url = f"{base}thumb/{hash_part}{filename}/500px-{filename}"
        return thumb_url
    return None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 统计修复前
    print("=== 修复前 URL 类型分布 ===")
    cursor.execute("""
        SELECT COUNT(*) FROM artifacts
        WHERE image_url LIKE '%wikipedia.org/wiki%'
        AND image_url NOT LIKE '%upload.wikimedia%'
    """)
    wiki_page_count = cursor.fetchone()[0]
    print(f"Wikipedia 页面链接（将设为 NULL）: {wiki_page_count}")

    cursor.execute("""
        SELECT COUNT(*) FROM artifacts
        WHERE image_url LIKE '%upload.wikimedia.org%'
        AND image_url NOT LIKE '%/thumb/%'
    """)
    non_thumb_count = cursor.fetchone()[0]
    print(f"Wikimedia 非缩略图链接（尝试转换）: {non_thumb_count}")

    # 显示将被修改的记录样本
    print("\n=== 将设为 NULL 的样本（Wikipedia 页面）===")
    cursor.execute("""
        SELECT id, name, image_url FROM artifacts
        WHERE image_url LIKE '%wikipedia.org/wiki%'
        AND image_url NOT LIKE '%upload.wikimedia%'
        LIMIT 5
    """)
    for row in cursor.fetchall():
        print(f"ID {row[0]}: {row[2][:100]}...")

    print("\n=== 尝试转换为缩略图的样本 ===")
    cursor.execute("""
        SELECT id, name, image_url FROM artifacts
        WHERE image_url LIKE '%upload.wikimedia.org%'
        AND image_url NOT LIKE '%/thumb/%'
        LIMIT 5
    """)
    convert_samples = []
    for row in cursor.fetchall():
        thumb_url = convert_to_thumb_url(row[2])
        convert_samples.append((row[0], row[2], thumb_url))
        print(f"ID {row[0]}:\n  原: {row[2]}\n  新: {thumb_url}")

    # 确认执行
    print(f"\n=== 确认执行 ===")
    print(f"将把 {wiki_page_count} 条 Wikipedia 页面链接设为 NULL")
    print(f"将尝试转换 {non_thumb_count} 条 Wikimedia 非缩略图链接")

    # 执行 UPDATE
    # 1. Wikipedia 页面链接 -> NULL
    cursor.execute("""
        UPDATE artifacts SET image_url = NULL
        WHERE image_url LIKE '%wikipedia.org/wiki%'
        AND image_url NOT LIKE '%upload.wikimedia%'
    """)
    null_updated = cursor.rowcount
    print(f"\n已将 {null_updated} 条记录的 image_url 设为 NULL")

    # 2. Wikimedia 非缩略图 -> 缩略图（逐条处理）
    cursor.execute("""
        SELECT id, image_url FROM artifacts
        WHERE image_url LIKE '%upload.wikimedia.org%'
        AND image_url NOT LIKE '%/thumb/%'
    """)
    thumb_converted = 0
    thumb_failed = 0
    for row in cursor.fetchall():
        id_, url = row
        thumb_url = convert_to_thumb_url(url)
        if thumb_url:
            cursor.execute("UPDATE artifacts SET image_url = ? WHERE id = ?", (thumb_url, id_))
            thumb_converted += 1
        else:
            thumb_failed += 1
            print(f"警告: 无法转换 ID {id_} 的 URL: {url}")

    print(f"成功转换 {thumb_converted} 条为缩略图 URL")
    print(f"无法转换 {thumb_failed} 条（保留原样）")

    conn.commit()

    # 验证
    print("\n=== 验证修复结果 ===")
    cursor.execute("""
        SELECT COUNT(*) FROM artifacts
        WHERE image_url LIKE '%wikipedia.org/wiki%'
        AND image_url NOT LIKE '%upload.wikimedia%'
    """)
    remaining = cursor.fetchone()[0]
    print(f"Wikipedia 页面链接剩余: {remaining}（应为 0）")

    # 修复后统计
    print("\n=== 修复后 URL 类型分布 ===")
    cursor.execute("""
        SELECT COUNT(*) FROM artifacts
        WHERE image_url LIKE '%/thumb/%'
    """)
    print(f"Wikimedia 缩略图链接: {cursor.fetchone()[0]}")

    cursor.execute("""
        SELECT COUNT(*) FROM artifacts
        WHERE image_url LIKE '%upload.wikimedia.org%'
        AND image_url NOT LIKE '%/thumb/%'
    """)
    print(f"Wikimedia 非缩略图链接: {cursor.fetchone()[0]}")

    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE image_url IS NULL OR image_url = ''")
    print(f"NULL 或空: {cursor.fetchone()[0]}")

    cursor.execute("SELECT COUNT(*) FROM artifacts")
    print(f"总记录数: {cursor.fetchone()[0]}")

    conn.close()
    print("\n清理完成！")

if __name__ == "__main__":
    main()