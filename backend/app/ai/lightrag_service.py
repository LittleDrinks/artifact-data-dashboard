"""LightRAG service — singleton wrapper for building and querying the artifact knowledge graph.

Uses Ollama for both LLM (qwen2.5:7b) and embedding (bge-m3).
The working directory stores persistent index files so the graph only needs
to be built once (via scripts/build_lightrag_index.py).

IMPORTANT: LightRAG v1.4+ requires ``await rag.initialize_storages()`` before
any insert or query.  This service handles that transparently.
"""

import asyncio
import logging
import threading
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton
_instance: Optional["LightRAGService"] = None


def _run_async(coro):
    """Run an async coroutine in a background thread with its own event loop."""
    result = None
    exc = None

    def _target():
        nonlocal result, exc
        try:
            result = asyncio.run(coro)
        except Exception as e:
            exc = e

    t = threading.Thread(target=_target)
    t.start()
    t.join(timeout=300)  # 5 min timeout for heavy operations
    if exc is not None:
        raise exc
    return result


class LightRAGService:
    """Thin wrapper around lightrag.LightRAG tailored to this project."""

    def __init__(self) -> None:
        from lightrag import LightRAG
        from lightrag.llm.ollama import ollama_model_complete, ollama_embed

        working_dir = settings.LIGHTRAG_DIR
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        embed_model = settings.LIGHTRAG_EMBEDDING_MODEL
        llm_model = settings.LIGHTRAG_LLM_MODEL

        logger.info(
            "Initializing LightRAG — working_dir=%s, llm=%s, embed=%s",
            working_dir,
            llm_model,
            embed_model,
        )

        self._rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=ollama_model_complete,
            llm_model_name=llm_model,
            embedding_func=ollama_embed,
            # Local Ollama with bge-m3 is slower than cloud APIs;
            # increase timeouts to avoid worker timeouts during index build.
            default_embedding_timeout=300,   # 5 min per embedding batch
            default_llm_timeout=300,         # 5 min per LLM call
        )

        # LightRAG v1.4+ requires explicit storage initialization
        self._initialized = False
        _run_async(self._initialize_storages())

    async def _initialize_storages(self) -> None:
        """Initialize LightRAG storages (required before insert/query in v1.4+)."""
        if self._initialized:
            return
        await self._rag.initialize_storages()
        self._initialized = True
        logger.info("LightRAG storages initialized successfully")

    # ── public helpers ──────────────────────────────────────────────

    async def aquery(self, question: str) -> str:
        """Run a hybrid query against the LightRAG knowledge graph.

        Returns the answer string, or an empty string on failure.
        """
        from lightrag.lightrag import QueryParam

        try:
            if not self._initialized:
                await self._initialize_storages()

            result = await self._rag.aquery(
                question,
                param=QueryParam(mode="hybrid", only_need_context=False),
            )
            # aquery may return a string or an async iterator
            if isinstance(result, str):
                return result
            # consume async iterator
            chunks: list[str] = []
            async for chunk in result:
                chunks.append(chunk)
            return "".join(chunks)
        except Exception:
            logger.exception("LightRAG aquery failed for: %s", question[:80])
            return ""

    async def ainsert(self, texts: list[str]) -> None:
        """Insert a list of text documents into the knowledge graph."""
        if not self._initialized:
            await self._initialize_storages()

        for text in texts:
            if not text.strip():
                continue
            try:
                await self._rag.ainsert(text)
            except Exception:
                logger.exception("LightRAG ainsert failed for text (first 80 chars): %s", text[:80])

    @property
    def rag(self):
        """Direct access to the underlying LightRAG instance (for index build script)."""
        return self._rag


# ── module-level accessor ───────────────────────────────────────────


def get_lightrag_service() -> Optional[LightRAGService]:
    """Return the singleton LightRAGService, or *None* if initialisation fails.

    This is intentionally forgiving so that the chat service can gracefully
    fall back to keyword-only search when LightRAG is not available.
    """
    global _instance
    if _instance is not None:
        return _instance

    try:
        _instance = LightRAGService()
        return _instance
    except Exception:
        logger.exception("Failed to initialise LightRAGService — LightRAG will be disabled")
        return None
