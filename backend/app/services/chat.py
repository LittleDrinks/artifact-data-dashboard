"""Chat service - session management and SSE streaming for AI Q&A.

Uses DeepSeek API for LLM-powered responses with RAG context from:
1. Keyword search across the SQLite artifacts table (always available)
2. LightRAG knowledge-graph query (hybrid mode, graceful fallback)
SSE three-stage output: thinking -> tool_call -> answer -> done
"""

import asyncio
import json
import logging
import threading
import time
from typing import Optional

import jieba
from openai import OpenAI
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.config import settings
from app.models.chat import ChatSession, ChatMessage
from app.models.artifact import Artifact
from app.schemas.chat import ChatSessionCreate

logger = logging.getLogger(__name__)

# Initialize DeepSeek client
_client: Optional[OpenAI] = None


def _run_async(coro):
    """Run an async coroutine from synchronous context.

    Uses a background thread with its own event loop to avoid conflicts
    with any running event loop (e.g. inside FastAPI's StreamingResponse).
    """
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
    t.join(timeout=120)  # 2 minute timeout for LightRAG queries
    if exc is not None:
        raise exc
    return result


def _get_client() -> OpenAI:
    """Lazy-initialize the OpenAI client configured for DeepSeek."""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.AI_API_KEY,
            base_url=settings.AI_API_BASE,
        )
    return _client


def create_session(db: Session, user_id: int, data: ChatSessionCreate) -> ChatSession:
    """Create a new chat session."""
    session = ChatSession(
        user_id=user_id,
        title=data.title or "新对话",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_user_sessions(
    db: Session, user_id: int, *, page: int = 1, page_size: int = 20
) -> tuple[list[ChatSession], int]:
    """Get paginated chat sessions for a user, newest first."""
    query = db.query(ChatSession).filter(ChatSession.user_id == user_id)
    total = query.count()
    sessions = (
        query.order_by(ChatSession.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    for s in sessions:
        s.message_count = len(s.messages)  # type: ignore[attr-defined]
    return sessions, total


def get_session_messages(
    db: Session, session_id: int, user_id: int
) -> list[ChatMessage] | None:
    """Get all messages for a session, ordered by id. Returns None if session not found."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == user_id,
    ).first()
    if not session:
        return None
    return session.messages  # type: ignore[return-value]


def save_message(
    db: Session, session_id: int, role: str, content: str, tool_calls: Optional[str] = None
) -> ChatMessage:
    """Save a message to the database."""
    msg = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        tool_calls=tool_calls,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def update_session_title(db: Session, session_id: int, title: str) -> None:
    """Update session title."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.title = title
        db.commit()


def delete_sessions(db: Session, user_id: int, session_ids: list[int]) -> int:
    """Delete sessions by IDs (only if they belong to the user). Returns count deleted."""
    from sqlalchemy import text
    if not session_ids:
        return 0
    placeholders = ",".join(f":id{i}" for i in range(len(session_ids)))
    params = {f"id{i}": sid for i, sid in enumerate(session_ids)}
    params["uid"] = user_id
    # Delete messages first, then sessions
    db.execute(
        text(
            f"DELETE FROM chat_messages WHERE session_id IN "
            f"(SELECT id FROM chat_sessions WHERE id IN ({placeholders}) AND user_id = :uid)"
        ),
        params,
    )
    result = db.execute(
        text(f"DELETE FROM chat_sessions WHERE id IN ({placeholders}) AND user_id = :uid"),
        params,
    )
    db.commit()
    return result.rowcount


def _search_artifacts(db: Session, query: str, limit: int = 5) -> list[dict]:
    """Keyword search across artifacts table using jieba word segmentation."""
    # Extract keywords from the query using jieba
    words = [w.strip() for w in jieba.cut(query) if len(w.strip()) >= 2]
    if not words:
        # Fallback to full query
        words = [query]

    # Build OR filter: match any keyword in any text field
    conditions = []
    for word in words:
        search_term = f"%{word}%"
        conditions.append(Artifact.name.ilike(search_term))
        conditions.append(Artifact.description.ilike(search_term))
        conditions.append(Artifact.tags.ilike(search_term))
        conditions.append(Artifact.category.ilike(search_term))
        conditions.append(Artifact.era.ilike(search_term))

    results = (
        db.query(Artifact)
        .filter(or_(*conditions))
        .limit(limit)
        .all()
    )

    items = []
    for a in results:
        snippet = ""
        if a.description:
            desc = a.description
            lower_desc = desc.lower()
            lower_query = query.lower()
            pos = lower_desc.find(lower_query)
            if pos >= 0:
                start = max(0, pos - 30)
                end = min(len(desc), pos + len(query) + 60)
                snippet = desc[start:end]
                if start > 0:
                    snippet = "..." + snippet
                if end < len(desc):
                    snippet = snippet + "..."
            else:
                snippet = desc[:120] + ("..." if len(desc) > 120 else "")
        else:
            snippet = "暂无描述"

        items.append({
            "id": a.id,
            "name": a.name,
            "snippet": snippet,
            "category": a.category,
            "era": a.era,
            "location": a.location,
        })
    return items


def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _build_system_prompt(query: str, search_results: list[dict], lightrag_context: str = "") -> str:
    """Build system prompt with RAG context from search results and LightRAG."""
    context_parts = []
    for i, r in enumerate(search_results, 1):
        parts = [f"【{i}】{r['name']}"]
        if r.get("category"):
            parts.append(f"类别：{r['category']}")
        if r.get("era"):
            parts.append(f"年代：{r['era']}")
        if r.get("location"):
            parts.append(f"出土地点：{r['location']}")
        if r.get("snippet"):
            parts.append(f"简介：{r['snippet']}")
        context_parts.append(" | ".join(parts))

    context_text = "\n".join(context_parts) if context_parts else "未找到相关文物数据"

    # Append LightRAG knowledge-graph context if available
    if lightrag_context:
        context_text += (
            "\n\n【知识图谱检索结果（LightRAG）】\n"
            "以下是通过文物知识图谱得到的补充信息，可用于丰富回答：\n"
            f"{lightrag_context}"
        )

    return (
        "你是一个专业的文物知识助手，服务于「文物大数据与人工智能集成系统」。"
        "你的职责是基于文物数据库的检索结果和知识图谱信息，回答用户关于文物的问题。\n\n"
        "回答要求：\n"
        "1. 综合使用数据库检索结果和知识图谱信息回答，如果两者都不充分，可以适当补充你的知识\n"
        "2. 回答要结构清晰，可以使用编号列表和加粗标题\n"
        "3. 引用检索结果时，标注来源编号\n"
        "4. 如果问题与文物无关，礼貌引导用户回到文物话题\n\n"
        f"用户问题：{query}\n\n"
        f"【检索结果】\n{context_text}\n"
    )


def stream_chat_response(db: Session, query: str, session_id: int):
    """
    Generator that yields SSE events for the three-stage chat flow.
    Stages: thinking -> tool_call -> answer -> done
    """
    start_time = time.time()

    # Save user message immediately to prevent data loss on stream interruption
    save_message(db, session_id, "user", query)

    # ── Stage 1: Thinking (simulated, fast) ──
    thinking_text = (
        f"用户询问：「{query}」。正在分析问题意图，提取关键词...\n\n"
        f"检索策略：\n"
        f"1. 关键词提取：对问题进行分词，提取核心查询词\n"
        f"2. 数据库检索：在文物数据库中搜索相关名称、描述、标签\n"
        f"3. 知识图谱检索：通过LightRAG知识图谱进行语义检索\n"
        f"4. 结果融合：综合数据库和知识图谱结果，组织回答内容\n\n"
        f"综合检索结果，组织回答内容。"
    )

    yield _sse_event("thinking_start", {})
    chunk_size = 12
    for i in range(0, len(thinking_text), chunk_size):
        chunk = thinking_text[i : i + chunk_size]
        yield _sse_event("thinking_delta", {"content": chunk})
        time.sleep(0.005)
    yield _sse_event("thinking_end", {})

    # ── Stage 2: Tool Call (search artifacts + LightRAG) ──
    yield _sse_event("tool_call_start", {"tool": "search_artifacts", "query": query})
    time.sleep(0.05)

    # Keyword search (always available)
    search_results = _search_artifacts(db, query, limit=5)

    # LightRAG knowledge-graph query (graceful fallback)
    lightrag_context = ""
    lightrag_used = False
    try:
        from app.ai.lightrag_service import get_lightrag_service

        lightrag_svc = get_lightrag_service()
        if lightrag_svc is not None:
            lightrag_context = _run_async(lightrag_svc.aquery(query))
            if lightrag_context:
                lightrag_used = True
                logger.info("LightRAG context retrieved for query: %s", query[:60])
    except Exception:
        logger.warning(
            "LightRAG query failed — falling back to keyword search only. Query: %s",
            query[:60],
            exc_info=True,
        )

    if lightrag_used:
        logger.info("Chat response will use LightRAG + keyword search context")
    else:
        logger.info("Chat response using keyword search only (LightRAG unavailable or no results)")

    elapsed = round(time.time() - start_time, 2)

    yield _sse_event("tool_call_delta", {"content": f"正在检索「{query}」..."})
    time.sleep(0.03)

    tool_result_data = {
        "results": search_results,
        "count": len(search_results),
        "elapsed": elapsed,
        "lightrag_used": lightrag_used,
    }
    yield _sse_event("tool_call_result", tool_result_data)

    # ── Stage 3: Answer (DeepSeek LLM streaming) ──
    answer_text = ""

    # Try DeepSeek API; fall back to template if it fails
    use_llm = bool(settings.AI_API_KEY)
    if use_llm:
        try:
            client = _get_client()
            system_prompt = _build_system_prompt(query, search_results, lightrag_context)

            yield _sse_event("answer_start", {})

            stream = client.chat.completions.create(
                model=settings.AI_MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query},
                ],
                stream=True,
                max_tokens=1024,
                temperature=0.7,
            )

            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    answer_text += delta.content
                    yield _sse_event("answer_delta", {"content": delta.content})

            yield _sse_event("answer_end", {})

        except Exception as e:
            # LLM failed — fall back to template answer
            answer_text = _build_template_answer(query, search_results)
            yield _sse_event("answer_start", {})
            chunk_size = 6
            for i in range(0, len(answer_text), chunk_size):
                yield _sse_event("answer_delta", {"content": answer_text[i : i + chunk_size]})
                time.sleep(0.01)
            yield _sse_event("answer_end", {})
    else:
        # No API key configured — use template
        answer_text = _build_template_answer(query, search_results)
        yield _sse_event("answer_start", {})
        chunk_size = 6
        for i in range(0, len(answer_text), chunk_size):
            yield _sse_event("answer_delta", {"content": answer_text[i : i + chunk_size]})
            time.sleep(0.01)
        yield _sse_event("answer_end", {})

    total_elapsed = round(time.time() - start_time, 2)

    # Save AI reply to database
    tool_calls_json = json.dumps(tool_result_data, ensure_ascii=False)
    save_message(db, session_id, "assistant", answer_text, tool_calls=tool_calls_json)

    # Update session title
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session and session.title == "新对话":
        title = query[:50] + ("..." if len(query) > 50 else "")
        update_session_title(db, session_id, title)

    # Build citation sources
    sources = [
        {"name": r["name"], "source": "文物数据库"}
        for r in search_results
    ]

    # ── Stage 4: Done ──
    yield _sse_event("done", {
        "elapsed": total_elapsed,
        "sources": sources,
    })


def _build_template_answer(query: str, results: list[dict]) -> str:
    """Build a template-based answer from search results (fallback)."""
    if not results:
        return (
            f"很抱歉，在文物数据库中未找到与「{query}」直接相关的文物信息。\n\n"
            f"建议您可以：\n"
            f"1. 尝试使用不同的关键词搜索\n"
            f"2. 缩小查询范围，例如指定朝代或类别\n"
            f"3. 浏览文物管理页面查看完整数据"
        )

    lines = [f"根据数据库检索，找到了与「{query}」相关的以下文物信息：\n"]
    for i, r in enumerate(results, 1):
        lines.append(f"**{i}. {r['name']}**")
        if r.get("era"):
            lines.append(f"   年代：{r['era']}")
        if r.get("category"):
            lines.append(f"   类别：{r['category']}")
        if r.get("location"):
            lines.append(f"   出土地点：{r['location']}")
        if r.get("snippet"):
            lines.append(f"   简介：{r['snippet']}")
        lines.append("")

    lines.append("以上信息来源于文物数据库，如需了解更多详情，可在文物管理页面查看。")
    return "\n".join(lines)
