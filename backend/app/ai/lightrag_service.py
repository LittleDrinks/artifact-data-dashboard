"""LightRAG service — singleton wrapper for building and querying the artifact knowledge graph.

LLM: user-configured OpenAI-compatible API (base_url + api_key + model_name).
Embedding: sentence-transformers with BAAI/bge-m3 (pure Python, no external service).

IMPORTANT: LightRAG v1.4+ requires ``await rag.initialize_storages()`` before
any insert or query.  This service handles that transparently via lazy init.
"""

import asyncio
import logging
import threading
from pathlib import Path
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton
_instance: Optional["LightRAGService"] = None

# Lazy-loaded embedding model (shared across calls)
_embed_model: SentenceTransformer | None = None


def _get_embed_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        logger.info("Loading sentence-transformers model: BAAI/bge-m3 ...")
        _embed_model = SentenceTransformer("BAAI/bge-m3")
        logger.info("bge-m3 model loaded successfully")
    return _embed_model


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
    t.join(timeout=300)
    if exc is not None:
        raise exc
    return result


def make_llm_func():
    """Create an async LLM completion function using user-configured OpenAI-compatible API."""
    from lightrag.llm.openai import openai_complete_if_cache

    api_key = settings.LIGHTRAG_API_KEY
    base_url = settings.LIGHTRAG_API_BASE
    model = settings.LIGHTRAG_MODEL_NAME

    async def llm_complete(
        prompt,
        system_prompt=None,
        history_messages=None,
        enable_cot=False,
        keyword_extraction=False,
        **kwargs,
    ):
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

    return llm_complete


class LightRAGService:
    """Thin wrapper around lightrag.LightRAG tailored to this project."""

    def __init__(self) -> None:
        from lightrag import LightRAG
        from lightrag.utils import EmbeddingFunc

        working_dir = settings.LIGHTRAG_DIR
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        # LLM via user-configured API
        llm_func = make_llm_func()
        llm_name = settings.LIGHTRAG_MODEL_NAME
        logger.info(
            "Initializing LightRAG — working_dir=%s, llm=%s (API: %s), embed=BAAI/bge-m3 (sentence-transformers)",
            working_dir,
            llm_name,
            settings.LIGHTRAG_API_BASE,
        )

        # Embedding via sentence-transformers
        embed_model = _get_embed_model()

        async def embedding_func(texts: list[str]) -> np.ndarray:
            return embed_model.encode(texts, convert_to_numpy=True)

        self._rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=llm_func,
            llm_model_name=llm_name,
            embedding_func=EmbeddingFunc(
                embedding_dim=1024,
                max_token_size=8192,
                model_name="BAAI/bge-m3",
                func=embedding_func,
            ),
            default_embedding_timeout=300,
            default_llm_timeout=300,
        )

        self._initialized = False

    async def _initialize_storages(self) -> None:
        """Initialize LightRAG storages (required before insert/query in v1.4+)."""
        if self._initialized:
            return
        await self._rag.initialize_storages()
        self._initialized = True
        logger.info("LightRAG storages initialized successfully")

    # ── public helpers ──────────────────────────────────────────────

    async def aquery(self, question: str) -> str:
        """Run a hybrid query against the LightRAG knowledge graph."""
        from lightrag.lightrag import QueryParam

        try:
            if not self._initialized:
                await self._initialize_storages()

            result = await self._rag.aquery(
                question,
                param=QueryParam(mode="hybrid", only_need_context=False),
            )
            if isinstance(result, str):
                return result
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


def get_lightrag_service() -> LightRAGService | None:
    """Return the singleton LightRAGService.

    Requires LIGHTRAG_API_KEY to be configured. Returns None if unavailable.
    """
    global _instance
    if _instance is not None:
        return _instance

    if not settings.LIGHTRAG_API_KEY:
        logger.warning("LIGHTRAG_API_KEY not configured — LightRAG disabled")
        return None

    try:
        _instance = LightRAGService()
        logger.info("LightRAG initialized with API LLM + sentence-transformers embedding")
        return _instance
    except Exception:
        logger.exception("LightRAG initialization failed — LightRAG disabled")
        return None


def reset_lightrag_service() -> None:
    """Reset singleton so next call to get_lightrag_service() re-checks availability."""
    global _instance
    _instance = None
