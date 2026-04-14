"""LightRAG service — singleton wrapper for building and querying the artifact knowledge graph.

Supports two LLM backends:
  - Ollama (qwen2.5:7b) — default, fully local, faster
  - GLM-4.7 API (mydamoxing.cn) — fallback when Ollama runs out of VRAM

Embedding always uses Ollama bge-m3 (~1.2 GB VRAM, stable).

IMPORTANT: LightRAG v1.4+ requires ``await rag.initialize_storages()`` before
any insert or query.  This service handles that transparently.
"""

import asyncio
import logging
import threading
from functools import partial
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


def make_deepseek_llm_func():
    """Create an async LLM completion function using GLM API (OpenAI-compatible) for LightRAG."""
    from lightrag.llm.openai import openai_complete_if_cache

    api_key = settings.LIGHTRAG_API_KEY
    base_url = settings.LIGHTRAG_API_BASE
    model = settings.LIGHTRAG_MODEL_NAME

    async def deepseek_complete(
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

    return deepseek_complete


class LightRAGService:
    """Thin wrapper around lightrag.LightRAG tailored to this project."""

    def __init__(self, use_deepseek_llm: bool = False) -> None:
        from lightrag import LightRAG
        from lightrag.llm.ollama import ollama_embed, ollama_model_complete

        working_dir = settings.LIGHTRAG_DIR
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        embed_model = settings.LIGHTRAG_EMBEDDING_MODEL
        llm_model = settings.LIGHTRAG_LLM_MODEL

        if use_deepseek_llm:
            llm_func = make_deepseek_llm_func()
            # DeepSeek model name for logging
            llm_name = f"deepseek:{settings.AI_MODEL_NAME}"
            logger.info(
                "Initializing LightRAG — working_dir=%s, llm=%s (DeepSeek API), embed=%s (Ollama)",
                working_dir,
                llm_name,
                embed_model,
            )
        else:
            llm_func = ollama_model_complete
            llm_name = llm_model
            logger.info(
                "Initializing LightRAG — working_dir=%s, llm=%s (Ollama), embed=%s (Ollama)",
                working_dir,
                llm_name,
                embed_model,
            )

        self._rag = LightRAG(
            working_dir=working_dir,
            llm_model_func=llm_func,
            llm_model_name=llm_name if use_deepseek_llm else llm_model,
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
