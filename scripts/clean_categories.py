"""
Category cleaning: standardize artifact categories into a clean taxonomy.

Strategy:
1. Define standard category taxonomy
2. Map obvious variants (location-prefixed → standard)
3. Map grade labels (禁止出境展览文物 etc.) to separate handling
4. Use local Ollama (qwen2.5:3b) for remaining non-standard categories

Usage:
    cd E:/shared/workplace/ADD_new
    backend/.venv/Scripts/python scripts/clean_categories.py
"""

import os
import re
import sqlite3
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")

# Standard category taxonomy
STANDARD_CATEGORIES = [
    "青铜器", "陶瓷", "玉器", "书法", "绘画", "金银器", "石刻",
    "漆器", "文献", "纺织品", "壁画", "帛画", "砖画", "象牙器",
    "玻璃器", "漆木器", "织锦", "货币", "礼器", "砖瓦",
    "兵器", "乐器", "铜镜", "印章", "甲骨", "简牍", "雕塑",
]

# Category mapping: variant → standard category
CATEGORY_MAPPING: dict[str, str] = {
    # Grade labels → preserve as-is but reclassify category
    "禁止出境展览文物": None,  # grade label, will need GLM to classify

    # "中国XX" prefix → remove prefix
    "中国文物": None,  # too generic, needs GLM
    "中国古代货币": "货币",
    "中国古代礼器": "礼器",
    "中国青铜器": "青铜器",
    "中国陶瓷": "陶瓷",
    "中国玉器": "玉器",
    "中国石窟": "石刻",

    # Location-prefixed 石窟 → all map to 石刻
    "四川佛教石窟": "石刻",
    "重庆佛教石窟": "石刻",
    "甘肃省石窟": "石刻",
    "山西省石窟": "石刻",
    "新疆维吾尔自治区石窟": "石刻",
    "浙江佛教石窟": "石刻",
    "中国佛教石窟": "石刻",
    "河南佛教石窟": "石刻",
    "陕西佛教石窟": "石刻",
    "云南省佛教石窟": "石刻",
    "山东省石窟": "石刻",
    "杭州石窟": "石刻",
    "河北省石窟": "石刻",
    "云南省石窟": "石刻",
    "河南省石窟": "石刻",
    "浙江石窟": "石刻",
    "福建省石窟": "石刻",
    "陕西省石窟": "石刻",

    # Specific sites
    "三星堆遗址": "青铜器",
    "秦始皇陵": "雕塑",

    # Era-based labels
    "西周文物": "青铜器",

    # Already standard
    "陶瓷": "陶瓷",
    "文献": "文献",
    "金银器": "金银器",
    "书法": "书法",
    "玉器": "玉器",
    "青铜器": "青铜器",
    "漆器": "漆器",
    "象牙器": "象牙器",
    "壁画": "壁画",
    "帛画": "帛画",
    "漆木器": "漆木器",
    "玻璃器": "玻璃器",
    "石刻": "石刻",
    "砖画": "砖画",
    "纺织品": "纺织品",
    "织锦": "织锦",
    "绘画": "绘画",
}


def _get_ollama_client():
    """Return an OpenAI client configured for local Ollama.

    Ollama exposes an OpenAI-compatible API at http://localhost:11434/v1
    Uses qwen2.5:3b (2GB VRAM) which is safe for 8GB GPU.
    """
    try:
        from openai import OpenAI
    except ImportError:
        print("  openai not installed", flush=True)
        return None

    # Ollama OpenAI-compatible endpoint
    return OpenAI(
        api_key="ollama",  # Ollama accepts any string as api_key
        base_url="http://localhost:11434/v1",
        timeout=120.0,
    )


def call_ollama_with_retry(client, prompt: str, max_retries: int = 3) -> str | None:
    """Call Ollama (qwen2.5:3b) with exponential backoff retry. Uses streaming for reliability."""
    for attempt in range(max_retries):
        try:
            stream = client.chat.completions.create(
                model="qwen2.5:3b",  # 2GB VRAM, safe for 8GB GPU
                messages=[{"role": "user", "content": prompt}],
                max_tokens=80,
                temperature=0.1,
                timeout=30,
                stream=True,
            )
            full_content = ""
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    full_content += chunk.choices[0].delta.content
            if full_content.strip():
                return full_content.strip()
            print(f"  Empty response, retry {attempt+1}/{max_retries}", flush=True)
            time.sleep(2)
        except Exception as e:
            wait = min(2 ** attempt, 30)
            print(f"  Retry {attempt+1}/{max_retries} after {wait}s: {e}", flush=True)
            time.sleep(wait)
    return None


def main():
    db_path = os.path.abspath(DB_PATH)
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM artifacts")
    total = cursor.fetchone()[0]
    print(f"Total artifacts: {total}")

    # ── Phase 1: Apply mapping table ──────────────────────────────────
    print("\n=== Phase 1: Apply category mapping ===")
    cursor.execute("SELECT id, category FROM artifacts")
    rows = cursor.fetchall()

    mapping_updated = 0
    needs_glm: list[tuple[int, str, str]] = []  # (id, name, category)
    needs_glm_ids = set()

    # Get name map for GLM phase
    cursor.execute("SELECT id, name FROM artifacts")
    name_map = {aid: name for aid, name in cursor.fetchall()}

    for aid, category in rows:
        if not category:
            needs_glm.append((aid, name_map.get(aid, ""), ""))
            needs_glm_ids.add(aid)
            continue

        if category in CATEGORY_MAPPING:
            mapped = CATEGORY_MAPPING[category]
            if mapped is not None:
                cursor.execute("UPDATE artifacts SET category = ? WHERE id = ?", (mapped, aid))
                mapping_updated += 1
            else:
                # Needs GLM classification
                needs_glm.append((aid, name_map.get(aid, ""), category))
                needs_glm_ids.add(aid)
        elif category in STANDARD_CATEGORIES:
            pass  # already standard
        else:
            # Unknown category, needs GLM
            needs_glm.append((aid, name_map.get(aid, ""), category))
            needs_glm_ids.add(aid)

    conn.commit()
    print(f"  Mapped via table: {mapping_updated}")
    print(f"  Needs GLM: {len(needs_glm)} artifacts")

    # Show what needs GLM
    category_needs: dict[str, int] = {}
    for _, _, cat in needs_glm:
        key = cat if cat else "(NULL)"
        category_needs[key] = category_needs.get(key, 0) + 1
    if category_needs:
        print("  Categories needing GLM:")
        for cat, cnt in sorted(category_needs.items(), key=lambda x: -x[1]):
            print(f"    {cnt:4d}  {cat}")

    # ── Phase 2: Ollama classification ───────────────────────────────────
    if needs_glm:
        print("\n=== Phase 2: Ollama category classification ===")
        client = _get_ollama_client()
        if not client:
            print("  No Ollama client, skipping")
        else:
            ollama_updated = 0
            batch_size = 10
            for i in range(0, len(needs_glm), batch_size):
                batch = needs_glm[i:i+batch_size]
                print(f"  Batch {i//batch_size+1}/{(len(needs_glm)-1)//batch_size+1}: {len(batch)} items...", flush=True)

                prompt_lines = [
                    "将以下文物分类到标准类别。只回复类别名，用逗号分隔，顺序对应。",
                    "标准类别：青铜器 陶瓷 玉器 书法 绘画 金银器 石刻 漆器 文献 纺织品 壁画 帛画 砖画 象牙器 玻璃器 漆木器 织锦 货币 礼器 砖瓦 兵器 乐器 铜镜 印章 甲骨 简牍 雕塑",
                    "如果无法确定，回复\"其他\"。只回复类别名列表，不要解释。",
                    "",
                ]
                for idx, (aid, name, cat) in enumerate(batch):
                    hint = f"（原类别: {cat}）" if cat else ""
                    prompt_lines.append(f"{idx+1}. {name} {hint}")

                prompt = "\n".join(prompt_lines)
                response = call_ollama_with_retry(client, prompt)
                if not response:
                    continue

                answers = re.split(r"[,，\n]", response)
                answers = [a.strip() for a in answers if a.strip()]

                for idx, (aid, name, _) in enumerate(batch):
                    if idx < len(answers):
                        cat = answers[idx]
                        if cat != "其他" and cat in STANDARD_CATEGORIES:
                            cursor.execute("UPDATE artifacts SET category = ? WHERE id = ?", (cat, aid))
                            ollama_updated += 1
                        elif cat != "其他":
                            # Try fuzzy match
                            for std in STANDARD_CATEGORIES:
                                if std in cat or cat in std:
                                    cursor.execute("UPDATE artifacts SET category = ? WHERE id = ?", (std, aid))
                                    ollama_updated += 1
                                    break

                conn.commit()
                if i + batch_size < len(needs_glm):
                    time.sleep(1)

            print(f"  Ollama classified: {ollama_updated}/{len(needs_glm)}")

    # ── Final stats ────────────────────────────────────────────────────
    print("\n=== Final stats ===")
    cursor.execute("SELECT category, COUNT(*) as cnt FROM artifacts GROUP BY category ORDER BY cnt DESC")
    print("\nCategory distribution:")
    for cat, cnt in cursor.fetchall():
        cat_display = cat if cat else "(NULL)"
        bar = "█" * (cnt // 2)
        print(f"  {cat_display:8s} {cnt:4d}  {bar}")

    cursor.execute("SELECT COUNT(DISTINCT category) FROM artifacts WHERE category IS NOT NULL")
    unique = cursor.fetchone()[0]
    print(f"\nUnique categories: {unique}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
