"""Extract semantic triples from artifact descriptions using LLM.

Phase 2 of knowledge graph construction — complements rule-based triples
(task #4) with LLM-derived semantic relationships from description text.

Strategy:
  1. Read artifacts from SQLite that have non-empty description (~563 artifacts)
  2. Use LangChain with configurable LLM backend (Ollama or OpenAI-compatible API)
  3. Extract semantic relationships per artifact:
     - artifact-artifact (similar style, influenced by, contemporaneous with)
     - artifact-concept (technique used, decorative pattern, cultural context)
     - cultural significance (symbolism, ritual use, historical impact)
  4. Quality filter: confidence >= 0.7, deduplicate against rule-based triples
  5. Output to data/processed/semantic_triples.json + Neo4j import
  6. Rate limiting (1s delay for API) + resume support via checkpoint

Usage (from repo root):
    python -m backend.scripts.extract_semantic_triples --help
    python -m backend.scripts.extract_semantic_triples --limit 5  # test mode
    python -m backend.scripts.extract_semantic_triples --model ollama  # local
    python -m backend.scripts.extract_semantic_triples --model openai  # cloud

Output format (semantic_triples.json):
    {
      "triples": [
        {
          "subject": "四羊方尊",
          "subject_type": "artifact",
          "relation": "similar_style",
          "object": "人面纹方鼎",
          "object_type": "artifact",
          "confidence": 0.85,
          "source": "llm_extraction",
          "artifact_id": 123,
          "evidence": "两者均为商代晚期青铜方器..."
        }
      ],
      "metadata": {
        "total_triples": 1234,
        "model": "ollama/llama3",
        "timestamp": "2024-..."
      }
    }
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Bootstrap: make sure ``backend`` is importable regardless of cwd.
# ---------------------------------------------------------------------------
_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

# Load .env from backend directory
_env_file = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_file):
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("extract_semantic_triples")

# Output paths
OUTPUT_DIR = os.path.join(_repo_root, "data", "processed")
CHECKPOINT_FILE = os.path.join(OUTPUT_DIR, "semantic_triples_checkpoint.json")
RULE_TRIPLES_FILE = os.path.join(OUTPUT_DIR, "rule_triples.json")  # from task #4


# ── Extraction Prompt ─────────────────────────────────────────────────────

EXTRACTION_PROMPT_TEMPLATE = """你是一个文化遗产领域的知识图谱构建专家。请从以下文物描述中提取语义三元组关系。

文物名称：{artifact_name}
文物ID：{artifact_id}
类别：{category}
年代：{era}
描述：
{description}

请提取以下类型的关系：
1. artifact-artifact 关系（文物之间）：
   - similar_style（风格相似）：与已知其他文物风格相近
   - influenced_by（受影响）：受其他文物或风格影响
   - contemporaneous_with（同时代）：与某文物同属一个时代
   - same_category_as（同类别）：与其他文物属同一类别

2. artifact-concept 关系（文物与概念）：
   - uses_technique（使用工艺）：采用的制作工艺（如铸造、雕刻、烧制）
   - has_decorative_pattern（装饰纹样）：纹饰图案（如饕餮纹、云雷纹）
   - represents_symbolism（象征意义）：文化象征（如权力、祭祀、祥瑞）
   - serves_function（功能用途）：实际用途（如礼器、兵器、日用器）

3. cultural_significance 关系：
   - associated_with_dynasty（所属朝代）：明确的朝代归属
   - discovered_at_location（出土地点）：考古发现地点
   - housed_in_museum（馆藏机构）：现藏博物馆
   - related_to_historical_event（历史事件）：关联的历史事件
   - embodies_cultural_value（文化价值）：体现的文化内涵

输出要求：
- 只输出JSON数组格式，每个三元组包含：subject, relation, object, confidence, evidence
- confidence为0.0-1.0的置信度评分，低于0.7的关系请忽略
- evidence为简短的依据说明（不超过50字）
- 如无明显关系，输出空数组[]
- object_type可以是"artifact"、"concept"、"location"、"museum"、"dynasty"等
- subject必须是"{artifact_name}"本身

示例输出：
[
  {
    "subject": "四羊方尊",
    "relation": "uses_technique",
    "object": "青铜铸造",
    "object_type": "concept",
    "confidence": 0.95,
    "evidence": "描述明确提及青铜材质"
  },
  {
    "subject": "四羊方尊",
    "relation": "has_decorative_pattern",
    "object": "羊首纹",
    "object_type": "concept",
    "confidence": 0.9,
    "evidence": "器身四角各有一只羊首装饰"
  }
]

请严格按上述格式输出，不要添加任何其他内容。"""


# ── LLM Backend Functions ────────────────────────────────────────────────


def make_ollama_llm(model_name: str = "llama3"):
    """Create LangChain-compatible Ollama LLM."""
    from langchain_community.llms import Ollama

    return Ollama(
        model=model_name,
        base_url="http://localhost:11434",
        temperature=0.1,  # Low temperature for consistent extraction
    )


def make_openai_llm():
    """Create LangChain-compatible OpenAI-style LLM using GLM API."""
    from langchain_openai import ChatOpenAI
    from app.config import settings

    return ChatOpenAI(
        model=settings.LIGHTRAG_MODEL_NAME,
        openai_api_key=settings.LIGHTRAG_API_KEY,
        openai_api_base=settings.LIGHTRAG_API_BASE,
        temperature=0.1,
    )


# ── Async LLM Wrapper with Retry ────────────────────────────────────────


async def call_llm_async(llm, prompt: str, max_retries: int = 3) -> str:
    """Call LLM with retry logic and rate limiting."""
    for attempt in range(max_retries):
        try:
            # LangChain LLMs are synchronous, run in thread pool
            result = await asyncio.get_event_loop().run_in_executor(
                None, lambda: llm.invoke(prompt)
            )
            # Rate limiting: 1s delay between API calls
            await asyncio.sleep(1)
            return result
        except Exception as e:
            error_msg = str(e)
            if attempt < max_retries - 1:
                delay = min(2 * (2 ** attempt), 30)
                logger.warning(
                    "LLM call failed (attempt %d/%d): %s — retrying in %ds",
                    attempt + 1, max_retries, error_msg[:100], delay
                )
                await asyncio.sleep(delay)
            else:
                logger.error("LLM call failed after %d attempts", max_retries)
                raise


def parse_llm_response(response: str, artifact_id: int, artifact_name: str) -> list[dict]:
    """Parse LLM JSON response into structured triples."""
    triples = []

    # Extract JSON array from response (handle markdown code blocks)
    response = response.strip()
    if "```json" in response:
        start = response.find("```json") + 7
        end = response.find("```", start)
        response = response[start:end].strip()
    elif "```" in response:
        start = response.find("```") + 3
        end = response.rfind("```")
        response = response[start:end].strip()

    # Remove any trailing non-JSON content
    if response.endswith("]"):
        # Find the last valid JSON array
        pass
    else:
        # Try to find array boundary
        first_bracket = response.find("[")
        last_bracket = response.rfind("]")
        if first_bracket >= 0 and last_bracket > first_bracket:
            response = response[first_bracket:last_bracket + 1]

    try:
        data = json.loads(response)
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                triple = {
                    "subject": artifact_name,
                    "subject_type": "artifact",
                    "relation": item.get("relation", ""),
                    "object": item.get("object", ""),
                    "object_type": item.get("object_type", "concept"),
                    "confidence": float(item.get("confidence", 0.5)),
                    "source": "llm_extraction",
                    "artifact_id": artifact_id,
                    "evidence": item.get("evidence", ""),
                }
                # Quality filter: confidence >= 0.7
                if triple["confidence"] >= 0.7 and triple["relation"] and triple["object"]:
                    triples.append(triple)
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse LLM response for artifact %d: %s", artifact_id, str(e)[:100])
        # Try to extract triples from malformed JSON
        # Simple regex fallback for individual triples
        pass

    return triples


# ── Database Access ────────────────────────────────────────────────────────


def get_artifacts_with_description(limit: int = 0, checkpoint: dict = None) -> list[dict]:
    """Query SQLite for artifacts with non-empty description."""
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models.artifact import Artifact

    db: Session = SessionLocal()
    try:
        query = db.query(Artifact).filter(Artifact.description.isnot(None))
        query = query.filter(Artifact.description != "")

        # Skip already processed artifacts (resume support)
        if checkpoint and "processed_ids" in checkpoint:
            processed_ids = set(checkpoint["processed_ids"])
            query = query.filter(Artifact.id.notin_(processed_ids))
            logger.info("Skipping %d already processed artifacts", len(processed_ids))

        # Apply limit for testing
        if limit > 0:
            query = query.limit(limit)

        artifacts = query.all()
        result = []
        for a in artifacts:
            result.append({
                "id": a.id,
                "name": a.name,
                "description": a.description,
                "category": a.category or "未知",
                "era": a.era or "未知",
            })
        return result
    finally:
        db.close()


# ── Deduplication ────────────────────────────────────────────────────────


def load_rule_based_triples() -> list[dict]:
    """Load existing rule-based triples from task #4 output."""
    if not os.path.exists(RULE_TRIPLES_FILE):
        logger.info("No rule-based triples file found — will create new file")
        return []

    try:
        with open(RULE_TRIPLES_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return data.get("triples", [])
    except Exception:
        logger.warning("Failed to load rule-based triples")
        return []


def deduplicate_triples(new_triples: list[dict], existing_triples: list[dict]) -> list[dict]:
    """Remove duplicates between new and existing triples."""
    # Build set of existing triple signatures
    existing_signatures = set()
    for t in existing_triples:
        sig = (t.get("subject", ""), t.get("relation", ""), t.get("object", ""))
        existing_signatures.add(sig)

    # Filter new triples
    unique_triples = []
    for t in new_triples:
        sig = (t.get("subject", ""), t.get("relation", ""), t.get("object", ""))
        if sig not in existing_signatures:
            unique_triples.append(t)

    return unique_triples


# ── Checkpoint Management ─────────────────────────────────────────────────


def load_checkpoint() -> dict:
    """Load checkpoint file for resume support."""
    if not os.path.exists(CHECKPOINT_FILE):
        return {"processed_ids": [], "triples": [], "start_time": None}

    try:
        with open(CHECKPOINT_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        logger.warning("Failed to load checkpoint — starting fresh")
        return {"processed_ids": [], "triples": [], "start_time": None}


def save_checkpoint(checkpoint: dict) -> None:
    """Save checkpoint file."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    checkpoint["last_update"] = datetime.now(timezone.utc).isoformat()
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)


# ── Main Extraction Pipeline ─────────────────────────────────────────────


async def extract_triples_for_artifact(
    llm, artifact: dict, checkpoint: dict
) -> list[dict]:
    """Extract triples for a single artifact."""
    prompt = EXTRACTION_PROMPT_TEMPLATE.format(
        artifact_name=artifact["name"],
        artifact_id=artifact["id"],
        category=artifact["category"],
        era=artifact["era"],
        description=artifact["description"][:2000],  # Limit description length
    )

    try:
        response = await call_llm_async(llm, prompt)
        triples = parse_llm_response(response, artifact["id"], artifact["name"])
        logger.info(
            "Artifact %d (%s): extracted %d triples",
            artifact["id"], artifact["name"][:20], len(triples)
        )
        return triples
    except Exception as e:
        logger.error("Failed to extract triples for artifact %d: %s", artifact["id"], str(e)[:100])
        return []


async def run_extraction(
    model: str = "ollama",
    model_name: str = "llama3",
    limit: int = 0,
    resume: bool = True,
) -> None:
    """Run the full extraction pipeline."""
    # Initialize LLM
    if model == "ollama":
        llm = make_ollama_llm(model_name)
        logger.info("Using Ollama LLM: %s", model_name)
    elif model == "openai":
        llm = make_openai_llm()
        logger.info("Using OpenAI-compatible API: %s", model_name)
    else:
        logger.error("Unknown model backend: %s", model)
        return

    # Load checkpoint for resume
    checkpoint = load_checkpoint() if resume else {"processed_ids": [], "triples": [], "start_time": None}

    if not checkpoint.get("start_time"):
        checkpoint["start_time"] = datetime.now(timezone.utc).isoformat()
        checkpoint["model"] = f"{model}/{model_name}"

    # Load rule-based triples for deduplication
    rule_triples = load_rule_based_triples()
    logger.info("Loaded %d rule-based triples for deduplication", len(rule_triples))

    # Get artifacts to process
    artifacts = get_artifacts_with_description(limit=limit, checkpoint=checkpoint)
    if not artifacts:
        logger.info("No artifacts to process")
        return

    total_artifacts = len(artifacts)
    logger.info("Processing %d artifacts", total_artifacts)

    # Process each artifact
    start_time = time.time()
    new_triples = checkpoint.get("triples", [])

    for i, artifact in enumerate(artifacts):
        logger.info("Progress: %d/%d (%.1f%%)", i + 1, total_artifacts, (i + 1) / total_artifacts * 100)

        triples = await extract_triples_for_artifact(llm, artifact, checkpoint)

        # Deduplicate against rule-based triples
        unique_triples = deduplicate_triples(triples, rule_triples)
        new_triples.extend(unique_triples)

        # Update checkpoint
        checkpoint["processed_ids"].append(artifact["id"])
        checkpoint["triples"] = new_triples

        # Save checkpoint every 10 artifacts
        if (i + 1) % 10 == 0:
            save_checkpoint(checkpoint)

    # Final save
    checkpoint["triples"] = new_triples
    checkpoint["completed"] = True
    checkpoint["end_time"] = datetime.now(timezone.utc).isoformat()
    save_checkpoint(checkpoint)

    elapsed = time.time() - start_time
    logger.info(
        "Extraction completed in %.1f seconds (%.1f minutes)",
        elapsed, elapsed / 60
    )
    logger.info("Total triples extracted: %d", len(new_triples))

    # Write final output
    write_final_output(new_triples, checkpoint)


def write_final_output(triples: list[dict], checkpoint: dict) -> None:
    """Write final semantic_triples.json output."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output_path = os.path.join(OUTPUT_DIR, "semantic_triples.json")
    output_data = {
        "triples": triples,
        "metadata": {
            "total_triples": len(triples),
            "model": checkpoint.get("model", "unknown"),
            "start_time": checkpoint.get("start_time"),
            "end_time": checkpoint.get("end_time"),
            "artifacts_processed": len(checkpoint.get("processed_ids", [])),
            "source": "llm_extraction",
        }
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    logger.info("Written %d triples to %s", len(triples), output_path)


# ── Neo4j Import (optional) ───────────────────────────────────────────────


def import_to_neo4j(triples_file: str) -> None:
    """Import triples into Neo4j knowledge graph."""
    try:
        from neo4j import GraphDatabase
        from app.config import settings

        driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
        )

        with open(triples_file, encoding="utf-8") as f:
            data = json.load(f)
            triples = data.get("triples", [])

        logger.info("Importing %d triples into Neo4j", len(triples))

        with driver.session() as session:
            for triple in triples:
                # Create subject node (artifact)
                session.run(
                    "MERGE (s:Artifact {name: $name}) "
                    "ON CREATE SET s.artifact_id = $artifact_id",
                    name=triple["subject"],
                    artifact_id=triple.get("artifact_id")
                )

                # Create object node (concept/artifact/location/etc)
                obj_type = triple.get("object_type", "Concept")
                session.run(
                    f"MERGE (o:{obj_type} {{name: $name}})",
                    name=triple["object"]
                )

                # Create relationship
                session.run(
                    "MATCH (s:Artifact {name: $subject}) "
                    f"MATCH (o:{obj_type} {{name: $object}}) "
                    "MERGE (s)-[r:SEMANTIC_RELATION {type: $relation}]->(o) "
                    "ON CREATE SET r.confidence = $confidence, r.evidence = $evidence, r.source = 'llm'",
                    subject=triple["subject"],
                    object=triple["object"],
                    relation=triple["relation"],
                    confidence=triple["confidence"],
                    evidence=triple.get("evidence", "")
                )

        driver.close()
        logger.info("Neo4j import completed")

    except Exception as e:
        logger.error("Neo4j import failed: %s", str(e)[:200])


# ── CLI Entry Point ───────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract semantic triples from artifact descriptions using LLM",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        "--model", type=str, default="ollama",
        choices=["ollama", "openai"],
        help="LLM backend: 'ollama' (default) for local, 'openai' for cloud API"
    )

    parser.add_argument(
        "--model-name", type=str, default="llama3",
        help="Specific model name (e.g., llama3, qwen2, glm-4.7)"
    )

    parser.add_argument(
        "--limit", type=int, default=0,
        help="Limit number of artifacts to process (0 = all, use 5 for testing)"
    )

    parser.add_argument(
        "--resume", action="store_true", default=True,
        help="Resume from checkpoint (default: True)"
    )

    parser.add_argument(
        "--no-resume", action="store_true",
        help="Start fresh, ignore existing checkpoint"
    )

    parser.add_argument(
        "--import-neo4j", action="store_true",
        help="Import extracted triples into Neo4j after extraction"
    )

    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show configuration and exit without processing"
    )

    args = parser.parse_args()

    # Dry-run mode: just show configuration
    if args.dry_run:
        logger.info("Dry-run mode — configuration:")
        logger.info("  Model backend: %s", args.model)
        logger.info("  Model name: %s", args.model_name)
        logger.info("  Artifact limit: %s", args.limit if args.limit > 0 else "all")
        logger.info("  Resume: %s", not args.no_resume)
        logger.info("  Output directory: %s", OUTPUT_DIR)
        logger.info("  Checkpoint file: %s", CHECKPOINT_FILE)
        logger.info("  Rule triples file: %s", RULE_TRIPLES_FILE)

        # Check artifact count
        artifacts = get_artifacts_with_description(limit=1)
        logger.info("  Sample artifact: %s", artifacts[0] if artifacts else "None found")

        # Check LLM availability
        try:
            if args.model == "ollama":
                import urllib.request
                req = urllib.request.Request("http://localhost:11434/api/tags")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read())
                    models = [m["name"] for m in data.get("models", [])]
                    logger.info("  Ollama models available: %s", ", ".join(models[:5]))
            else:
                from app.config import settings
                logger.info("  OpenAI API base: %s", settings.LIGHTRAG_API_BASE)
        except Exception as e:
            logger.warning("  LLM check failed: %s", str(e)[:100])

        return

    # Run extraction
    resume = not args.no_resume
    asyncio.run(run_extraction(
        model=args.model,
        model_name=args.model_name,
        limit=args.limit,
        resume=resume,
    ))

    # Import to Neo4j if requested
    if args.import_neo4j:
        triples_file = os.path.join(OUTPUT_DIR, "semantic_triples.json")
        if os.path.exists(triples_file):
            import_to_neo4j(triples_file)
        else:
            logger.error("No triples file found for Neo4j import")


if __name__ == "__main__":
    main()