"""AI QA evaluation pipeline.

Steps:
  1. Sample 50 QA pairs from benchmark (balanced across categories/difficulties)
  2. Call backend /api/chat/ask to get AI answers (SSE parsing)
  3. Use LLM-as-Judge to score accuracy/completeness/faithfulness
  4. Output scored results + summary report

Usage:
    python scripts/run_eval.py              # full pipeline
    python scripts/run_eval.py --skip-ask   # skip asking, just score existing raw_results
    python scripts/run_eval.py --limit 5    # quick test with 5 questions
"""

import argparse
import json
import os
import random
import statistics
import sys
import time
from pathlib import Path

# Bootstrap imports
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

_env_file = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_file):
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=False)

import requests

BASE_URL = "http://localhost:8000"
DATA_DIR = os.path.join(_repo_root, "data", "eval")
BENCHMARK_FILE = os.path.join(_repo_root, "data", "final", "benchmark_qa_clean.json")

JUDGE_PROMPT = """你是一个严格的评分裁判。请根据以下标准给AI回答打分。

问题：{question}
标准答案：{expected}
AI回答：{actual}

评分维度（每项0-5分，整数）：
1. 准确性（accuracy）：AI回答中的事实是否正确，与标准答案是否一致
2. 完整性（completeness）：AI回答是否覆盖了标准答案的关键信息点
3. 忠实度（faithfulness）：AI回答是否基于检索到的数据，有没有编造信息

只输出JSON，不要其他内容：
{{"accuracy": X, "completeness": X, "faithfulness": X, "comment": "一句话评价"}}"""


# ── Step 1: Sampling ─────────────────────────────────────────────────────

def sample_qa(benchmark: list[dict], n: int = 50, seed: int = 42) -> list[dict]:
    """Sample n QA pairs with balanced category/difficulty coverage."""
    random.seed(seed)

    # Target allocation
    allocation = [
        ("basic_fact", "easy", 10),
        ("detailed_explanation", "medium", 10),
        ("identification", "medium", 10),
        ("comparative", "hard", 5),
        ("relationship", "hard", 5),
    ]

    sampled = []
    used_ids = set()

    for category, difficulty, count in allocation:
        pool = [
            qa for qa in benchmark
            if qa["category"] == category
            and qa["difficulty"] == difficulty
            and qa["id"] not in used_ids
        ]
        chosen = random.sample(pool, min(count, len(pool)))
        sampled.extend(chosen)
        used_ids.update(qa["id"] for qa in chosen)

    # Fill remaining from other combos
    remaining = n - len(sampled)
    if remaining > 0:
        other_pool = [
            qa for qa in benchmark
            if qa["id"] not in used_ids
        ]
        sampled.extend(random.sample(other_pool, min(remaining, len(other_pool))))

    return sampled[:n]


# ── Step 2: Ask AI ──────────────────────────────────────────────────────

def get_token() -> str:
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "admin", "password": "admin123"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def ask_ai(token: str, question: str, timeout: int = 60) -> str:
    """Call /api/chat/ask, parse SSE stream, return answer text."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(
        f"{BASE_URL}/api/chat/ask",
        json={"question": question},
        headers=headers,
        stream=True,
        timeout=timeout,
    )
    resp.raise_for_status()

    answer = ""
    in_answer = False
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload.strip() == "[DONE]":
            break
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue

        event_type = data.get("type", "")
        if event_type == "answer_start":
            in_answer = True
        elif event_type == "answer_delta":
            if in_answer:
                answer += data.get("content", "")
        elif event_type == "answer_end":
            in_answer = False
        elif event_type == "done":
            break

    return answer.strip()


def run_ask_stage(sample: list[dict], token: str) -> list[dict]:
    """Ask AI for each sample question."""
    results = []
    total = len(sample)
    for i, qa in enumerate(sample):
        print(f"  [{i+1}/{total}] Asking: {qa['question'][:50]}...", flush=True)
        try:
            ai_answer = ask_ai(token, qa["question"])
            results.append({
                "id": qa["id"],
                "question": qa["question"],
                "expected": qa["answer"],
                "actual": ai_answer,
                "source_artifact": qa.get("source_artifact", ""),
                "category": qa["category"],
                "difficulty": qa["difficulty"],
            })
        except Exception as e:
            print(f"    ERROR: {e}", flush=True)
            results.append({
                "id": qa["id"],
                "question": qa["question"],
                "expected": qa["answer"],
                "actual": f"[ERROR: {e}]",
                "source_artifact": qa.get("source_artifact", ""),
                "category": qa["category"],
                "difficulty": qa["difficulty"],
            })
        time.sleep(1)
    return results


# ── Step 3: LLM-as-Judge Scoring ───────────────────────────────────────

def make_judge_client():
    """Create LLM client for judging (uses GLM API)."""
    from langchain_openai import ChatOpenAI
    from app.config import settings

    return ChatOpenAI(
        model=settings.LIGHTRAG_MODEL_NAME,
        openai_api_key=settings.LIGHTRAG_API_KEY,
        openai_api_base=settings.LIGHTRAG_API_BASE,
        temperature=0.0,
    )


def judge_single(judge, question: str, expected: str, actual: str) -> dict:
    """Score a single QA pair."""
    prompt = JUDGE_PROMPT.format(question=question, expected=expected, actual=actual)
    try:
        response = judge.invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        # Extract JSON from response
        content = content.strip()
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            content = content[start:end].strip()
        elif "```" in content:
            start = content.find("```") + 3
            end = content.rfind("```")
            content = content[start:end].strip()
        scores = json.loads(content)
        return {
            "accuracy": int(scores.get("accuracy", 0)),
            "completeness": int(scores.get("completeness", 0)),
            "faithfulness": int(scores.get("faithfulness", 0)),
            "comment": scores.get("comment", ""),
        }
    except Exception as e:
        return {"accuracy": 0, "completeness": 0, "faithfulness": 0, "comment": f"Parse error: {e}"}


def run_score_stage(results: list[dict]) -> list[dict]:
    """Score all results using LLM-as-Judge."""
    judge = make_judge_client()
    total = len(results)
    for i, r in enumerate(results):
        print(f"  [{i+1}/{total}] Scoring: {r['question'][:40]}...", flush=True)
        scores = judge_single(judge, r["question"], r["expected"], r["actual"])
        r["scores"] = scores
        time.sleep(0.5)
    return results


# ── Step 4: Report ──────────────────────────────────────────────────────

def generate_report(results: list[dict]) -> dict:
    """Generate summary report from scored results."""
    report = {"total": len(results)}

    # Overall scores
    for dim in ["accuracy", "completeness", "faithfulness"]:
        vals = [r["scores"][dim] for r in results]
        report[f"{dim}_mean"] = round(statistics.mean(vals), 2)
        report[f"{dim}_median"] = statistics.median(vals)

    # By difficulty
    report["by_difficulty"] = {}
    for diff in ["easy", "medium", "hard"]:
        subset = [r for r in results if r["difficulty"] == diff]
        if subset:
            report["by_difficulty"][diff] = {
                "count": len(subset),
                "accuracy": round(statistics.mean([r["scores"]["accuracy"] for r in subset]), 2),
                "completeness": round(statistics.mean([r["scores"]["completeness"] for r in subset]), 2),
                "faithfulness": round(statistics.mean([r["scores"]["faithfulness"] for r in subset]), 2),
            }

    # By category
    report["by_category"] = {}
    for cat in sorted(set(r["category"] for r in results)):
        subset = [r for r in results if r["category"] == cat]
        report["by_category"][cat] = {
            "count": len(subset),
            "accuracy": round(statistics.mean([r["scores"]["accuracy"] for r in subset]), 2),
            "completeness": round(statistics.mean([r["scores"]["completeness"] for r in subset]), 2),
            "faithfulness": round(statistics.mean([r["scores"]["faithfulness"] for r in subset]), 2),
        }

    return report


def print_report(report: dict):
    print("\n" + "=" * 60)
    print("QA EVALUATION REPORT")
    print("=" * 60)
    print(f"Total questions: {report['total']}")
    print()
    print(f"{'Dimension':<20} {'Mean':>8} {'Median':>8}")
    print("-" * 36)
    for dim in ["accuracy", "completeness", "faithfulness"]:
        print(f"{dim:<20} {report[f'{dim}_mean']:>8.2f} {report[f'{dim}_median']:>8.1f}")
    print()
    print("By Difficulty:")
    print(f"{'Level':<10} {'Count':>6} {'Accuracy':>10} {'Complete':>10} {'Faithful':>10}")
    print("-" * 46)
    for diff in ["easy", "medium", "hard"]:
        if diff in report["by_difficulty"]:
            d = report["by_difficulty"][diff]
            print(f"{diff:<10} {d['count']:>6} {d['accuracy']:>10.2f} {d['completeness']:>10.2f} {d['faithfulness']:>10.2f}")
    print()
    print("By Category:")
    print(f"{'Category':<25} {'Count':>6} {'Accuracy':>10}")
    print("-" * 41)
    for cat, d in report["by_category"].items():
        cat_display = cat[:25]
        print(f"{cat_display:<25} {d['count']:>6} {d['accuracy']:>10.2f}")
    print("=" * 60)


# ── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI QA Evaluation Pipeline")
    parser.add_argument("--limit", type=int, default=50, help="Number of QA to evaluate")
    parser.add_argument("--skip-ask", action="store_true", help="Skip asking, score existing raw_results")
    parser.add_argument("--skip-score", action="store_true", help="Only ask, don't score")
    args = parser.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)

    sample_path = os.path.join(DATA_DIR, "sample_50.json")
    raw_path = os.path.join(DATA_DIR, "raw_results_50.json")
    scored_path = os.path.join(DATA_DIR, "scored_results_50.json")
    report_path = os.path.join(DATA_DIR, "report_50.json")

    # Step 1: Sample
    if not args.skip_ask:
        print("Step 1: Sampling QA pairs...", flush=True)
        with open(BENCHMARK_FILE, encoding="utf-8") as f:
            benchmark = json.load(f)
        sample = sample_qa(benchmark, n=args.limit)
        with open(sample_path, "w", encoding="utf-8") as f:
            json.dump(sample, f, ensure_ascii=False, indent=2)
        print(f"  Sampled {len(sample)} QA pairs -> {sample_path}", flush=True)

        # Step 2: Ask AI
        print("Step 2: Getting AI answers...", flush=True)
        token = get_token()
        results = run_ask_stage(sample, token)
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"  Raw results -> {raw_path}", flush=True)
    else:
        print("Skipping ask stage, loading existing results...", flush=True)
        with open(raw_path, encoding="utf-8") as f:
            results = json.load(f)

    if not args.skip_score:
        # Step 3: Score
        print("Step 3: Scoring with LLM-as-Judge...", flush=True)
        results = run_score_stage(results)
        with open(scored_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"  Scored results -> {scored_path}", flush=True)

        # Step 4: Report
        print("Step 4: Generating report...", flush=True)
        report = generate_report(results)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print_report(report)
        print(f"  Report -> {report_path}", flush=True)
    else:
        print("Skipping score stage.", flush=True)


if __name__ == "__main__":
    main()
