"""
Era normalization: standardize dynasty/period names in artifacts table.

Strategy:
1. Comprehensive mapping table for known variants (~80% coverage)
2. Regex-based pattern matching for date ranges
3. GLM-4.7 API for remaining unmapped eras
4. GLM-4.7 API to extract era from description for NULL eras

Usage:
    cd E:/shared/workplace/ADD_new
    backend/.venv/Scripts/python scripts/normalize_eras.py
"""

import os
import re
import sqlite3
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "app.db")

# ── Standard dynasty list ──────────────────────────────────────────────
STANDARD_DYNASTIES = [
    "夏", "商", "西周", "东周", "春秋", "战国", "秦", "西汉", "东汉",
    "三国", "西晋", "东晋", "南北朝", "北魏", "东魏", "西魏", "北齐",
    "北周", "南朝", "隋", "唐", "五代十国", "北宋", "南宋", "辽", "金",
    "宋", "西夏", "元", "明", "清", "民国", "新石器时代",
]

# ── Mapping table: variant → standardized era ──────────────────────────
# Keys are normalized (stripped, no spaces around punctuation)
ERA_MAPPING: dict[str, str] = {
    # Direct variants
    "唐朝": "唐", "唐代": "唐", "唐朝（武周）": "唐",
    "唐、武周": "唐",
    "宋朝": "宋", "宋代": "宋",
    "商代": "商", "商朝": "商",
    "商朝(前1600–前1046)": "商", "商朝前期": "商", "商朝晚期": "商",
    "商周": "商",
    "商末周初": "西周",
    "明朝": "明", "明代": "明",
    "清朝": "清", "清代": "清", "清末": "清",
    "秦代": "秦",
    "元朝": "元", "元代": "元",
    "汉朝": "西汉",
    "隋朝": "隋",
    "战国时代": "战国", "战国中晚期": "战国",
    "春秋时代": "春秋", "春秋时期": "春秋", "春秋晚期": "春秋",
    "新石器": "新石器时代", "中国新石器时代": "新石器时代",
    "西周早期": "西周", "西周中期（穆王时期）": "西周", "西周晚期": "西周",
    "古蜀（相当于中原地区的商朝）": "商",
    "古蜀（相当于中原地区的商周时代）": "商",
    "约3500年前": "商",
    "公元前11世纪": "西周",
    "夏代": "夏",

    # Three Kingdoms
    "三国·吴": "三国", "三国(吴)": "三国", "三国（吴）": "三国",

    # Range variants → take the start dynasty
    "唐、宋": "唐", "唐至宋": "唐", "唐代至宋代": "唐", "唐至民国": "唐",
    "唐至元": "唐", "唐至元、明": "唐", "唐至明": "唐", "唐至清": "唐",
    "南北朝、五代、宋": "南北朝",
    "隋至宋": "隋", "隋、唐": "隋", "隋至清": "隋", "隋朝": "隋",
    "南北朝至唐": "南北朝", "南北朝至清": "南北朝",
    "南北朝至元": "南北朝", "南北朝至明": "南北朝",
    "南北朝至民国": "南北朝", "南北朝至隋": "南北朝",
    "北朝至唐": "南北朝", "北朝—唐": "南北朝",
    "北朝至明": "南北朝",
    "北朝至西夏": "南北朝",
    "北朝": "南北朝",
    "北魏至元": "北魏", "北魏—宋": "北魏", "北魏—西夏": "北魏",
    "北魏至唐": "北魏", "北魏至唐宋": "北魏", "北魏至宋": "北魏",
    "北魏至隋": "北魏", "北魏至明": "北魏",
    "北齐至唐": "北齐",
    "北周至唐": "北周",
    "东魏-唐": "东魏", "东魏、北齐至元": "东魏",
    "十六国至清": "东晋",
    "六朝、唐": "三国",
    "东汉至魏、晋": "东汉",
    "宋–清": "宋", "宋、元、明": "宋",
    "宋至元": "宋", "宋至明": "宋", "宋至清": "宋",
    "元—清": "元", "元、清": "元", "元至清": "元",
    "明、清": "明", "明至清": "明",
    "金至清": "金",
    "五代至元": "五代十国", "五代吴越国": "五代十国",
    "南唐": "五代十国", "十国": "五代十国",
    "南宋、明": "南宋",
    "南诏、大理": "唐",
    "明朝，编号b为清朝文物": "明",
    "唐朝景云二年": "唐",
    "唐朝（武周）": "唐",
    "清代至民国": "清",
    "现代": "民国",
    "五代": "五代十国",
    "北燕": "南北朝",
    "约3,500年前": "商",
    "1958年": "民国",
    "1954年迁建（原文如此）": "民国",
    "2011年": None,  # too modern, skip

    # Year-based → dynasty mapping
    "1926年": "民国", "1864年": "清", "1877年": "清",

    # Culture periods
    "仰韶文化（约公元前5000年-前3000年）": "新石器时代",
}


def normalize_era(era: str) -> str | None:
    """Try to normalize an era string using the mapping table + regex."""
    if not era or not era.strip():
        return None

    era = era.strip()

    # Direct lookup
    if era in ERA_MAPPING:
        return ERA_MAPPING[era]

    # Normalize: remove spaces, fullwidth punctuation → halfwidth
    normalized = era.replace(" ", "").replace("（", "(").replace("）", ")")
    if normalized in ERA_MAPPING:
        return ERA_MAPPING[normalized]

    # If already a standard dynasty name, return as-is
    if era in STANDARD_DYNASTIES or era == "新石器时代":
        return era

    # Pattern: "唐（618-907）" or "商(前1600-前1046)" → strip parenthetical
    stripped = re.sub(r"[（(].+?[）)]", "", era).strip()
    if stripped in STANDARD_DYNASTIES or stripped == "新石器时代":
        return stripped
    # Also try mapping after stripping
    if stripped in ERA_MAPPING:
        return ERA_MAPPING[stripped]

    # Regex: "X朝" / "X代" / "X朝(X)" patterns
    for dynasty in STANDARD_DYNASTIES:
        # "唐朝" / "宋代" / "汉代"
        if re.match(rf"^{re.escape(dynasty)}[朝代]$", era):
            return dynasty
        # "西周早期/中期/晚期"
        if re.match(rf"^{re.escape(dynasty)}[早中晚]期", era):
            return dynasty

    # Regex: "X至Y" / "X、Y" → take X (the starting dynasty)
    # e.g. "唐至宋" → "唐"
    range_match = re.match(r"^(.+?)[至、\-—,，](.+)$", era)
    if range_match:
        start = range_match.group(1).strip()
        # Recursively normalize the start part
        result = normalize_era(start)
        if result:
            return result

    return None  # unmapped


def call_glm_with_retry(client, prompt: str, max_retries: int = 3, model: str = "glm-4.7") -> str | None:
    """Call GLM with exponential backoff retry. Uses streaming for reliability."""
    for attempt in range(max_retries):
        try:
            stream = client.chat.completions.create(
                model=model,
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


def classify_era_batch(client, items: list[tuple[int, str, str]]) -> dict[int, str]:
    """
    Use GLM to classify era for a batch of artifacts.
    items: [(id, name, current_era_or_desc), ...]
    Returns: {id: normalized_era}
    """
    prompt_lines = [
        "将以下文物的朝代标准化为最接近的主要朝代。只回复朝代名，用逗号分隔，顺序对应。",
        "标准朝代：夏 商 西周 东周 春秋 战国 秦 西汉 东汉 三国 西晋 东晋 南北朝 北魏 东魏 西魏 北齐 北周 南朝 隋 唐 五代十国 北宋 南宋 辽 金 西夏 元 明 清 民国 新石器时代",
        "如果无法确定，回复\"未知\"。只回复朝代名列表，不要解释。",
        "",
    ]
    for idx, (aid, name, era) in enumerate(items):
        display = era if era else f"(从名称推断: {name})"
        prompt_lines.append(f"{idx+1}. {name} — {display}")

    prompt = "\n".join(prompt_lines)
    # Batch size limit check
    if len(items) > 20:
        # Split into smaller batches
        result = {}
        for i in range(0, len(items), 10):
            batch = items[i:i+10]
            result.update(classify_era_batch(client, batch))
            if i + 10 < len(items):
                time.sleep(1)  # rate limit buffer
        return result

    response = call_glm_with_retry(client, prompt)
    if not response:
        return {}

    # Parse response: split by comma or newline
    answers = re.split(r"[,，\n]", response)
    answers = [a.strip() for a in answers if a.strip()]

    result = {}
    for idx, (aid, name, _) in enumerate(items):
        if idx < len(answers):
            era = answers[idx]
            if era != "未知" and era in STANDARD_DYNASTIES + ["新石器时代"]:
                result[aid] = era
            elif era != "未知":
                # Try to normalize the LLM output
                normalized = normalize_era(era)
                if normalized:
                    result[aid] = normalized
    return result


def _get_glm_client():
    """Load GLM API credentials from .env and return an OpenAI client."""
    try:
        from openai import OpenAI
    except ImportError:
        print("  openai not installed", flush=True)
        return None

    env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
    api_key = api_base = None
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("LIGHTRAG_API_KEY="):
                api_key = line.split("=", 1)[1]
            elif line.startswith("LIGHTRAG_API_BASE="):
                api_base = line.split("=", 1)[1]

    if not api_key:
        print("  No LIGHTRAG_API_KEY found in .env", flush=True)
        return None

    return OpenAI(api_key=api_key, base_url=api_base, timeout=120.0)


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
    print("\n=== Phase 1: Apply mapping table ===")
    cursor.execute("SELECT id, era FROM artifacts WHERE era IS NOT NULL AND era != ''")
    rows = cursor.fetchall()
    print(f"Era fields to normalize: {len(rows)}")

    mapping_updated = 0
    unmapped_eras: dict[str, list[int]] = {}  # era -> [ids]

    for aid, era in rows:
        normalized = normalize_era(era)
        if normalized and normalized != era:
            cursor.execute("UPDATE artifacts SET era = ? WHERE id = ?", (normalized, aid))
            mapping_updated += 1
        elif not normalized:
            if era not in unmapped_eras:
                unmapped_eras[era] = []
            unmapped_eras[era].append(aid)

    conn.commit()
    print(f"  Normalized via mapping: {mapping_updated}")
    print(f"  Unmapped eras: {len(unmapped_eras)} unique values, {sum(len(v) for v in unmapped_eras.values())} artifacts")

    if unmapped_eras:
        print("  Unmapped era values:")
        for era, ids in sorted(unmapped_eras.items(), key=lambda x: -len(x[1])):
            print(f"    {len(ids):3d}x  {era}")

    # ── Phase 2: GLM for unmapped eras ────────────────────────────────
    glm_client = _get_glm_client()
    if unmapped_eras and glm_client:
        print("\n=== Phase 2: GLM classification for unmapped eras ===")
        client = glm_client

        # Build items for classification
        items = []
        cursor.execute("SELECT id, name FROM artifacts WHERE id IN ({})".format(
            ",".join(str(aid) for ids in unmapped_eras.values() for aid in ids)
        ))
        name_map = {aid: name for aid, name in cursor.fetchall()}

        for era, ids in unmapped_eras.items():
            for aid in ids:
                name = name_map.get(aid, "")
                items.append((aid, name, era))

        # Process in batches of 10
        glm_updated = 0
        batch_size = 10
        for i in range(0, len(items), batch_size):
            batch = items[i:i+batch_size]
            print(f"  Batch {i//batch_size+1}/{(len(items)-1)//batch_size+1}: {len(batch)} items...", flush=True)
            result = classify_era_batch(client, batch)
            for aid, era in result.items():
                cursor.execute("UPDATE artifacts SET era = ? WHERE id = ?", (era, aid))
                glm_updated += 1
            conn.commit()
            if i + batch_size < len(items):
                time.sleep(1)

        print(f"  GLM classified: {glm_updated}/{len(items)}")

    # ── Phase 3: Fill NULL eras from description via GLM ─────────────
    print("\n=== Phase 3: Fill NULL eras from description ===")
    cursor.execute("""
        SELECT id, name, description
        FROM artifacts
        WHERE (era IS NULL OR era = '') AND description IS NOT NULL AND description != ''
    """)
    null_era_rows = cursor.fetchall()
    print(f"Artifacts with no era but has description: {len(null_era_rows)}", flush=True)

    if null_era_rows and not glm_client:
        print("  Skipping: no GLM client available", flush=True)
        null_era_rows = []

    if null_era_rows:
        client = glm_client

    if null_era_rows:
        items = []
        for aid, name, desc in null_era_rows:
            # Truncate description to save tokens
            short_desc = desc[:200] if desc else ""
            items.append((aid, name, short_desc))

        filled_count = 0
        batch_size = 10
        for i in range(0, len(items), batch_size):
            batch = items[i:i+batch_size]
            print(f"  Batch {i//batch_size+1}/{(len(items)-1)//batch_size+1}: {len(batch)} items...", flush=True)

            # Different prompt for description-based extraction
            prompt_lines = [
                "从以下文物名称和描述中推断朝代。只回复朝代名，用逗号分隔，顺序对应。",
                "标准朝代：夏 商 西周 东周 春秋 战国 秦 西汉 东汉 三国 西晋 东晋 南北朝 北魏 东魏 西魏 北齐 北周 南朝 隋 唐 五代十国 北宋 南宋 辽 金 西夏 元 明 清 民国 新石器时代",
                "如果无法判断，回复\"未知\"。只回复朝代名列表。",
                "",
            ]
            for idx, (aid, name, desc) in enumerate(batch):
                prompt_lines.append(f"{idx+1}. {name} — {desc[:100]}")

            prompt = "\n".join(prompt_lines)
            response = call_glm_with_retry(client, prompt)
            if not response:
                continue

            answers = re.split(r"[,，\n]", response)
            answers = [a.strip() for a in answers if a.strip()]

            for idx, (aid, name, _) in enumerate(batch):
                if idx < len(answers):
                    era = answers[idx]
                    if era != "未知" and era in STANDARD_DYNASTIES + ["新石器时代"]:
                        cursor.execute("UPDATE artifacts SET era = ? WHERE id = ?", (era, aid))
                        filled_count += 1

            conn.commit()
            if i + batch_size < len(items):
                time.sleep(1)

        print(f"  Filled from description: {filled_count}/{len(items)}")

    # ── Final stats ────────────────────────────────────────────────────
    print("\n=== Final stats ===")
    cursor.execute("SELECT COUNT(*) FROM artifacts WHERE era IS NOT NULL AND era != ''")
    era_count = cursor.fetchone()[0]
    print(f"Artifacts with era: {era_count}/{total} ({era_count*100//total}%)")

    cursor.execute("SELECT era, COUNT(*) as cnt FROM artifacts WHERE era IS NOT NULL AND era != '' GROUP BY era ORDER BY cnt DESC")
    print("\nEra distribution:")
    for era, cnt in cursor.fetchall():
        bar = "█" * (cnt // 2)
        print(f"  {era:6s} {cnt:4d}  {bar}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
