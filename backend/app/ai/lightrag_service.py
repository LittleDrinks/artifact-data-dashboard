"""LightRAG service — singleton wrapper for building and querying the artifact knowledge graph.

Uses Ollama for both LLM (qwen2.5:7b) and embedding (bge-m3).
The working directory stores persistent index files so the graph only needs
to be built once (via scripts/build_lightrag_index.py).
"""

import logging
import os
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton
_instance: Optional["LightRAGService"] = None


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
        )

    # ── public helpers ──────────────────────────────────────────────

    async def aquery(self, question: str) -> str:
        """Run a hybrid query against the LightRAG knowledge graph.

        Returns the answer string, or an empty string on failure.
        """
        from lightrag.lightrag import QueryParam

        try:
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
