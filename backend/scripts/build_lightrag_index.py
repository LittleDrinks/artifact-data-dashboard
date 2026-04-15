"""Build the LightRAG knowledge-graph index from artifact detail JSON files.

Reads every JSON file under ``data/artifacts_detail/``, formats each artifact
into a structured text chunk, and inserts them into LightRAG.  The resulting
index is stored under ``backend/data/lightrag/`` so the running server can
query it directly.

Strategy:
  1. Check Ollama health — ensure bge-m3 embedding model is available.
  2. Use GLM-4.7 API for LLM (cloud-based, no VRAM pressure) + bge-m3 via
     Ollama for embedding (~1.2 GB VRAM, stable on 8 GB GPU).
  3. Unload any local LLM models from Ollama to free VRAM for embedding.
  4. Insert documents in parallel (8 workers) using LightRAG's built-in
     pipeline with retry logic on the LLM function.

Usage (from repo root):
    python -m backend.scripts.build_lightrag_index

Or from inside backend/:
    python -m scripts.build_lightrag_index
"""

import asyncio
import glob
import json
import logging
import os
import shutil
import sys
import time
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

# Set parallel insert BEFORE importing lightrag so it picks up the env var
os.environ["MAX_PARALLEL_INSERT"] = "4"

# Load .env from backend directory explicitly (pydantic-settings uses a relative
# path which resolves against CWD — wrong when running from the repo root).
_env_file = os.path.join(_backend_dir, ".env")
if os.path.isfile(_env_file):
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("build_lightrag_index")

DETAILS_DIR = os.path.join(_repo_root, "data", "artifacts_detail")
LIGHTRAG_DIR = os.path.join(_backend_dir, "data", "lightrag")

# LLM retry config
LLM_MAX_RETRIES = 5
LLM_RETRY_BASE_DELAY = 2  # seconds, doubled each attempt


# ── Helpers ────────────────────────────────────────────────────────────


def _load_artifacts() -> list[dict]:
    """Read all JSON files from the artifacts detail directory."""
    artifacts: list[dict] = []
    if not os.path.isdir(DETAILS_DIR):
        logger.error("Artifact detail directory not found: %s", DETAILS_DIR)
        return artifacts

    for fname in sorted(os.listdir(DETAILS_DIR)):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(DETAILS_DIR, fname)
        try:
            with open(fpath, encoding="utf-8") as f:
                data = json.load(f)
            data["_source_file"] = fname
            artifacts.append(data)
        except Exception:
            logger.exception("Failed to read %s", fpath)
    return artifacts


def _artifact_to_text(art: dict) -> str:
    """Convert one artifact dict into a single text chunk for LightRAG."""
    parts: list[str] = []

    name = art.get("name", "未知文物")
    parts.append(f"文物名称：{name}")

    if art.get("category"):
        parts.append(f"类别：{art['category']}")
    if art.get("era"):
        parts.append(f"年代：{art['era']}")
    if art.get("location"):
        parts.append(f"出土地点：{art['location']}")
    if art.get("museum"):
        parts.append(f"现藏：{art['museum']}")
    if art.get("material"):
        parts.append(f"材质：{art['material']}")
    if art.get("dimensions"):
        parts.append(f"尺寸：{art['dimensions']}")

    # Prefer full_text for richer context, fall back to summary
    body = art.get("full_text") or art.get("summary") or ""
    if body:
        parts.append(f"\n详细描述：\n{body}")

    # Include infobox key-value pairs if available
    infobox = art.get("infobox")
    if infobox and isinstance(infobox, dict):
        info_lines = [f"  {k}：{v}" for k, v in infobox.items() if v]
        if info_lines:
            parts.append("\n基本信息：\n" + "\n".join(info_lines))

    return "\n".join(parts)


def _check_ollama_health() -> bool:
    """Return True if Ollama is running and bge-m3 is available for embedding."""
    import urllib.request
    import urllib.error

    try:
        req = urllib.request.Request("http://localhost:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            models = [m["name"] for m in data.get("models", [])]
            logger.info("Ollama running — available models: %s", ", ".join(models[:5]))
            has_embed = any("nomic-embed-text" in m or "bge-m3" in m for m in models)
            if not has_embed:
                logger.error("nomic-embed-text or bge-m3 embedding model not found in Ollama!")
                return False
            return True
    except Exception as e:
        logger.error("Ollama health check failed: %s", e)
        return False


def _unload_ollama_llm_models() -> None:
    """Unload local LLM models from Ollama to free VRAM for bge-m3 embedding."""
    import urllib.request
    import urllib.error

    # Known local LLM models that consume VRAM
    llm_models = [
        "qwen3-vl:4b", "qwen2.5:7b",
        "deepseek-r1:7b", "deepseek-r1:8b", "deepseek-r1:14b",
        "zephyr:latest", "zephyr:7b", "glm-5:cloud",
    ]
    for model in llm_models:
        try:
            # Use keep_alive: 0 to force immediate unload
            data = json.dumps({"name": model, "keep_alive": 0}).encode("utf-8")
            req = urllib.request.Request(
                "http://localhost:11434/api/generate",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                resp.read()  # drain response
        except Exception:
            pass  # Model not loaded or already stopped
    logger.info("Unloaded local LLM models from Ollama to free VRAM")

    # Verify bge-m3 embedding works after unloading
    try:
        data = json.dumps({"model": "nomic-embed-text", "prompt": "test"}).encode("utf-8")
        req = urllib.request.Request(
            "http://localhost:11434/api/embeddings",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            emb = result.get("embedding", [])
            if len(emb) > 0:
                logger.info("bge-m3 embedding verified — dim=%d", len(emb))
            else:
                logger.error("bge-m3 embedding returned empty vector!")
    except Exception as e:
        logger.error("bge-m3 embedding verification failed: %s", e)


def _clear_index() -> None:
    """Remove all index files so we start fresh.

    On Windows, shutil.rmtree with ignore_errors=True can silently fail
    due to file locks. We retry with explicit file deletion as fallback.
    """
    if not os.path.isdir(LIGHTRAG_DIR):
        return
    logger.info("Clearing existing index at %s", LIGHTRAG_DIR)

    # First attempt: shutil.rmtree
    shutil.rmtree(LIGHTRAG_DIR, ignore_errors=True)

    # Fallback: if directory still exists, delete files individually
    if os.path.isdir(LIGHTRAG_DIR):
        logger.warning("rmtree did not fully remove directory, deleting files individually")
        for fname in os.listdir(LIGHTRAG_DIR):
            fpath = os.path.join(LIGHTRAG_DIR, fname)
            try:
                if os.path.isfile(fpath):
                    os.unlink(fpath)
            except Exception:
                logger.warning("Failed to delete %s", fpath)
        # Try removing the now-empty directory
        try:
            os.rmdir(LIGHTRAG_DIR)
        except Exception:
            pass

    # Verify: if key files still exist, abort
    if os.path.isdir(LIGHTRAG_DIR):
        remaining = os.listdir(LIGHTRAG_DIR)
        if remaining:
            logger.error(
                "Failed to clear index — remaining files: %s. "
                "Please close any processes using the index and retry.",
                remaining,
            )
            sys.exit(1)


def _check_index_status() -> dict:
    """Check the current index status — how many docs completed vs total."""
    status_path = os.path.join(LIGHTRAG_DIR, "kv_store_doc_status.json")
    if not os.path.exists(status_path):
        return {"completed": 0, "processing": 0, "failed": 0, "total": 0}

    try:
        with open(status_path, encoding="utf-8") as f:
            status = json.load(f)
        counts = {"completed": 0, "processing": 0, "failed": 0, "total": len(status)}
        for v in status.values():
            if isinstance(v, dict):
                s = v.get("status", "unknown")
                if s in ("completed", "processed"):
                    counts["completed"] += 1
                elif s == "processing":
                    counts["processing"] += 1
                else:
                    counts["failed"] += 1
        return counts
    except Exception:
        return {"completed": 0, "processing": 0, "failed": 0, "total": 0}


# ── GLM LLM function with retry ─────────────────────────────────────


def _make_glm_llm_func():
    """Create an async LLM completion function using GLM API with retry logic."""
    from lightrag.llm.openai import openai_complete_if_cache
    from app.config import settings

    api_key = settings.LIGHTRAG_API_KEY
    base_url = settings.LIGHTRAG_API_BASE
    model = settings.LIGHTRAG_MODEL_NAME

    async def glm_complete_with_retry(
        prompt,
        system_prompt=None,
        history_messages=None,
        enable_cot=False,
        keyword_extraction=False,
        **kwargs,
    ):
        for attempt in range(LLM_MAX_RETRIES):
            try:
                return await openai_complete_if_cache(
                    model=model,
                    prompt=prompt,
                    system_prompt=system_prompt,
                    history_messages=history_messages or [],
                    enable_cot=enable_cot,
                    keyword_extraction=keyword_extraction,
                    base_url=base_url,
                    api_key=api_key,
                )
            except Exception as e:
                error_msg = str(e)
                if attempt < LLM_MAX_RETRIES - 1:
                    delay = min(LLM_RETRY_BASE_DELAY * (2 ** attempt), 60)
                    logger.warning(
                        "GLM API call failed (attempt %d/%d): %s — retrying in %ds",
                        attempt + 1,
                        LLM_MAX_RETRIES,
                        error_msg[:200],
                        delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "GLM API call failed after %d attempts: %s",
                        LLM_MAX_RETRIES,
                        error_msg[:300],
                    )
                    raise

    return glm_complete_with_retry


# ── Custom embedding function (bypasses ollama Python client NaN issues) ──


def _make_robust_embed_func():
    """Create a robust async embedding function using raw HTTP to Ollama.

    Uses nomic-embed-text (768 dim) instead of bge-m3 (1024 dim) because
    nomic-embed-text is stable under concurrent load while bge-m3 returns
    intermittent 500/NaN errors.
    """
    from lightrag.base import EmbeddingFunc
    import numpy as np
    import urllib.request

    async def robust_ollama_embed(
        texts: list[str],
        embed_model: str = "nomic-embed-text",
        **kwargs,
    ) -> np.ndarray:
        """Embed texts using Ollama's /api/embed endpoint with retry."""
        _ = kwargs  # absorb extra kwargs
        max_retries = 3
        for attempt in range(max_retries):
            try:
                data = json.dumps({"model": embed_model, "input": texts}).encode("utf-8")
                req = urllib.request.Request(
                    "http://localhost:11434/api/embed",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read())
                    embeddings = result.get("embeddings", [])
                    arr = np.array(embeddings, dtype=np.float32)
                    # Check for NaN
                    if np.isnan(arr).any():
                        raise ValueError(f"NaN in embeddings for batch of {len(texts)}")
                    return arr
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        "Embed retry %d/%d: %s", attempt + 1, max_retries, str(e)[:100]
                    )
                    await asyncio.sleep(1)
                else:
                    raise

    # Wrap with LightRAG's EmbeddingFunc — 768 dim for nomic-embed-text
    return EmbeddingFunc(
        embedding_dim=768,
        max_token_size=8192,
        func=robust_ollama_embed,
    )





async def _monitor_progress(total_docs: int) -> None:
    """Background task that logs progress every 30 seconds."""
    while True:
        await asyncio.sleep(30)
        status = _check_index_status()
        completed = status["completed"]
        if completed > 0:
            logger.info(
                "Progress: %d/%d docs completed (%.1f%%)",
                completed,
                total_docs,
                completed / total_docs * 100,
            )


# ── Main build logic ─────────────────────────────────────────────────


async def _build() -> None:
    from lightrag import LightRAG
    from app.config import settings

    # Step 1: Load artifacts
    artifacts = _load_artifacts()
    if not artifacts:
        logger.warning("No artifacts loaded — nothing to index.")
        return

    logger.info("Loaded %d artifacts from %s", len(artifacts), DETAILS_DIR)

    texts = [_artifact_to_text(a) for a in artifacts]
    sources = [a.get("_source_file", f"artifact_{i}") for i, a in enumerate(artifacts)]
    # Filter out empty chunks
    pairs = [(t, s) for t, s in zip(texts, sources) if t.strip()]
    texts = [p[0] for p in pairs]
    sources = [p[1] for p in pairs]
    logger.info("Prepared %d text chunks for indexing", len(texts))

    # Step 2: Ollama health check (embedding only)
    ollama_ok = _check_ollama_health()
    if not ollama_ok:
        logger.error(
            "Ollama is not available or missing bge-m3. "
            "Please start Ollama and pull bge-m3: ollama pull bge-m3"
        )
        return

    # Step 3: Unload local LLM models to free VRAM
    _unload_ollama_llm_models()

    # Step 4: Resume or clear existing index
    existing_status = _check_index_status()
    if existing_status["completed"] > 0:
        logger.info(
            "Existing index found — %d/%d completed. Resuming (use --clear to rebuild from scratch).",
            existing_status["completed"],
            existing_status["total"],
        )
        # Filter out already-completed docs so LightRAG only processes remaining ones
        status_path = os.path.join(LIGHTRAG_DIR, "kv_store_doc_status.json")
        with open(status_path, encoding="utf-8") as f:
            doc_status = json.load(f)
        # Build set of completed doc hashes/content to skip
        completed_docs = set()
        full_docs_path = os.path.join(LIGHTRAG_DIR, "kv_store_full_docs.json")
        if os.path.exists(full_docs_path):
            with open(full_docs_path, encoding="utf-8") as f:
                full_docs = json.load(f)
            for doc_id, doc_info in doc_status.items():
                if isinstance(doc_info, dict) and doc_info.get("status") in ("completed", "processed"):
                    # Map doc_id to its content for matching
                    if doc_id in full_docs:
                        completed_docs.add(full_docs[doc_id].get("content", ""))
        # Keep only texts not yet indexed
        before = len(texts)
        texts = [t for t in texts if t.strip() not in completed_docs]
        logger.info("Skipping %d already-indexed documents, %d remaining", before - len(texts), len(texts))
        if not texts:
            logger.info("All documents already indexed — nothing to do.")
            return
    else:
        logger.info("No existing index — starting fresh build.")

    # Step 4b: Set OpenAI-compatible env vars so LightRAG's internal code paths
    # (which create their own OpenAI client via _create_openai_client) can reach
    # the GLM API.  Without this, entity/relation extraction fails with
    # KeyError: 'OPENAI_API_KEY'.
    os.environ["OPENAI_API_KEY"] = settings.LIGHTRAG_API_KEY
    os.environ["OPENAI_BASE_URL"] = settings.LIGHTRAG_API_BASE
    logger.info("Set OPENAI_API_KEY and OPENAI_BASE_URL for GLM API compatibility")

    # Step 5: Create LightRAG instance with GLM API LLM + parallel insert
    working_dir = settings.LIGHTRAG_DIR
    os.makedirs(working_dir, exist_ok=True)

    llm_func = _make_glm_llm_func()
    embed_func = _make_robust_embed_func()

    logger.info(
        "Creating LightRAG — working_dir=%s, llm=GLM-4.7 API (4 parallel), embed=nomic-embed-text (Ollama)",
        working_dir,
    )

    rag = LightRAG(
        working_dir=working_dir,
        llm_model_func=llm_func,
        llm_model_name=f"glm:{settings.LIGHTRAG_MODEL_NAME}",
        embedding_func=embed_func,
        max_parallel_insert=4,
        embedding_func_max_async=8,
        # Increase timeouts for large-scale indexing
        default_embedding_timeout=300,
        default_llm_timeout=300,
    )

    # Initialize storages
    await rag.initialize_storages()
    logger.info("LightRAG storages initialized")

    # Step 6: Insert all documents via LightRAG's built-in parallel pipeline
    logger.info("Starting parallel index build for %d documents (4 workers)…", len(texts))
    start = time.time()

    # Start progress monitor in background
    monitor_task = asyncio.create_task(_monitor_progress(len(texts)))

    try:
        # Pass all documents at once — LightRAG handles parallelism internally
        # with asyncio.Semaphore(max_parallel_insert=8)
        track_id = await rag.ainsert(texts)
        logger.info("Pipeline track ID: %s", track_id)
    finally:
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass

    elapsed = time.time() - start

    # Step 7: Check results
    status = _check_index_status()
    logger.info(
        "Index build completed in %.1f seconds (%.1f minutes)",
        elapsed,
        elapsed / 60,
    )
    logger.info(
        "Results — completed: %d, failed: %d, processing: %d, total: %d",
        status["completed"],
        status["failed"],
        status["processing"],
        status["total"],
    )

    # Step 8: Verify index files
    expected_files = [
        "kv_store_full_docs.json",
        "kv_store_doc_status.json",
        "kv_store_full_entities.json",
        "kv_store_full_relations.json",
    ]
    graph_files = glob.glob(os.path.join(LIGHTRAG_DIR, "graph_chunk_entity_relation*"))
    logger.info("Graph files: %s", [os.path.basename(f) for f in graph_files])

    for f in expected_files:
        fpath = os.path.join(LIGHTRAG_DIR, f)
        if os.path.exists(fpath):
            size = os.path.getsize(fpath)
            logger.info("  OK %s (%.1f KB)", f, size / 1024)
        else:
            logger.warning("  MISSING %s", f)

    # Step 9: Sample query to verify the index works
    logger.info("Running sample query to verify index…")
    try:
        from lightrag.lightrag import QueryParam

        result = await rag.aquery("有哪些青铜器文物？", param=QueryParam(mode="hybrid"))
        if isinstance(result, str):
            sample_answer = result[:200]
        else:
            chunks = []
            async for chunk in result:
                chunks.append(chunk)
            sample_answer = "".join(chunks)[:200]
        logger.info("Sample query result: %s…", sample_answer)
    except Exception:
        logger.exception("Sample query failed (index may still be usable)")

    if status["failed"] > 0:
        logger.warning(
            "%d documents failed to index. Re-run the script to retry.",
            status["failed"],
        )


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Build LightRAG knowledge-graph index")
    parser.add_argument("--clear", action="store_true", help="Clear existing index and rebuild from scratch")
    args = parser.parse_args()

    if args.clear:
        _clear_index()
        logger.info("Index cleared via --clear flag.")

    asyncio.run(_build())


if __name__ == "__main__":
    main()
