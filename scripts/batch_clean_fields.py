#!/usr/bin/env python3
"""批量清洗 era/material/museum 字段

使用 Ollama qwen2.5:3b 进行结构化清洗。
"""

import json
import sys
import time
import re
from pathlib import Path
from openai import OpenAI

sys.stdout.reconfigure(encoding='utf-8')

# 添加 backend 和 scripts 到路径
backend_path = Path(__file__).parent.parent / 'backend'
scripts_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))
sys.path.insert(0, str(scripts_path.parent))

from app.database import SessionLocal
from app.models.artifact import Artifact

# 直接读取 prompt
CLEAN_FIELDS_PROMPT = """你是一个文物数据结构化清洗专家。我们要清洗以下文物的'年代(era)'、'材质(material)'和'馆藏(museum)'字段，请严格使用以下规则，并直接返回与输入等长的JSON数组。
1. 年代(era)：必须归一化为仅包含下列标准朝代名：新石器时代, 夏, 商, 西周, 东周, 春秋, 战国, 秦, 西汉, 东汉, 三国, 西晋, 东晋, 南北朝, 北魏, 东魏, 西魏, 北齐, 北周, 南朝, 隋, 唐, 五代十国, 北宋, 南宋, 辽, 金, 宋, 西夏, 元, 明, 清, 民国。如果是"商晚期"、"晚商"，统一填"商"；如果在范围内无法对应或者原数据为空，直接填""。
2. 材质(material)：不管之前写了什么句子，只能从中提取有效核心材质，像：青铜, 铜, 陶, 瓷, 玉, 金, 银, 石, 木, 丝, 纸, 漆等。如果提取不到或者本来就没有，填""。
3. 馆藏(museum)：去重并统一名称。比如：包含"北京故宫博物院"一律叫"故宫博物院"；包含"国立故宫博物院"一律叫"台北故宫博物院"；"湖南省博物馆"改叫"湖南博物院"。不要加"于"等介词前缀。
输入JSON：
{input_data}
只输出干净合法的纯JSON数组：[{{"name": "...", "era": "...", "material": "...", "museum": "..."}}]不要有任何其它的文字和Markdown修饰符号！"""


import httpx

# Ollama 配置
OLLAMA_BASE_URL = "http://localhost:11434/v1"
OLLAMA_API_KEY = "ollama"
OLLAMA_MODEL = "qwen2.5:3b"  # 使用 3b 模型更轻量

# 批次大小（减小以避免 Ollama 崩溃）
BATCH_SIZE = 10  # 每批处理10条


def get_client():
    """获取 OpenAI 客户端（Ollama 兼容）"""
    # 设置更长的 timeout
    return OpenAI(
        base_url=OLLAMA_BASE_URL,
        api_key=OLLAMA_API_KEY,
        timeout=httpx.Timeout(120.0, connect=10.0)
    )


def parse_response(text: str) -> list | None:
    """解析 LLM 返回的 JSON（可能带 markdown 代码块）"""
    # 去除 markdown 代码块
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def batch_clean(client, batch: list[dict]) -> list[dict] | None:
    """调用 LLM 清洗一批数据"""
    input_data = json.dumps(batch, ensure_ascii=False)
    prompt = CLEAN_FIELDS_PROMPT.format(input_data=input_data)

    try:
        response = client.chat.completions.create(
            model=OLLAMA_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2000,
        )
        result = parse_response(response.choices[0].message.content)
        return result
    except Exception as e:
        print(f"  LLM 调用失败: {e}")
        return None


def main():
    print("=" * 60, flush=True)
    print("批量清洗 era/material/museum 字段", flush=True)
    print("=" * 60, flush=True)

    # 1. 获取需要清洗的记录（排除 CSV 已清洗的 188 条）
    print("连接数据库...", flush=True)
    db = SessionLocal()

    print("查询 CSV 已清洗记录...", flush=True)
    # 获取有 related_artifacts 的记录名称（CSV 已清洗）
    csv_cleaned = set()
    for a in db.query(Artifact).filter(Artifact.related_artifacts != None).all():
        csv_cleaned.add(a.name)

    print("查询需要清洗记录...", flush=True)
    # 获取需要清洗的记录
    to_clean = []
    for a in db.query(Artifact).all():
        if a.name in csv_cleaned:
            continue  # 跳过 CSV 已清洗的

        # 检查是否有需要清洗的字段
        has_era = a.era and a.era.strip()
        has_material = a.material and a.material.strip()
        has_museum = a.museum and a.museum.strip()

        if has_era or has_material or has_museum:
            to_clean.append({
                "id": a.id,
                "name": a.name,
                "era": a.era or "",
                "material": a.material or "",
                "museum": a.museum or "",
            })

    print(f"CSV 已清洗记录: {len(csv_cleaned)}", flush=True)
    print(f"需要清洗记录: {len(to_clean)}", flush=True)

    if not to_clean:
        print("无需清洗，退出", flush=True)
        db.close()
        return

    # 2. 分批清洗
    print("初始化 Ollama 客户端...", flush=True)
    client = get_client()
    print("客户端初始化完成", flush=True)
    batch_size = BATCH_SIZE
    total_batches = (len(to_clean) + batch_size - 1) // batch_size

    print(f"\n分批处理: {total_batches} 批，每批 {batch_size} 条", flush=True)
    print("-" * 60, flush=True)

    cleaned_count = 0
    failed_batches = []

    for i in range(0, len(to_clean), batch_size):
        batch = to_clean[i:i + batch_size]
        batch_num = i // batch_size + 1

        print(f"  批次 {batch_num}/{total_batches}: 清洗 {len(batch)} 条...")

        # 构建输入数据（去掉 id）
        input_batch = [{"name": r["name"], "era": r["era"], "material": r["material"], "museum": r["museum"]} for r in batch]

        result = batch_clean(client, input_batch)

        if result and len(result) == len(batch):
            # 更新数据库
            for j, r in enumerate(result):
                artifact = db.query(Artifact).filter(Artifact.id == batch[j]["id"]).first()
                if artifact:
                    # 只更新非空值
                    if r.get("era") and r["era"].strip():
                        artifact.era = r["era"].strip()
                    if r.get("material") and r["material"].strip():
                        artifact.material = r["material"].strip()
                    if r.get("museum") and r["museum"].strip():
                        artifact.museum = r["museum"].strip()
                    cleaned_count += 1

            db.commit()
            print(f"    成功: 更新 {len(result)} 条")
        else:
            failed_batches.append(batch_num)
            print(f"    失败: 返回数据不匹配")

        # 避免 Ollama 过载
        time.sleep(1.5)

    db.close()

    # 3. 统计
    print("-" * 60)
    print("\n清洗完成!")
    print(f"  成功清洗: {cleaned_count} 条")
    print(f"  失败批次: {len(failed_batches)}")
    if failed_batches:
        print(f"  失败批次号: {failed_batches}")


if __name__ == '__main__':
    main()