"""Chat service - session management and SSE streaming for AI Q&A."""

import json
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.models.chat import ChatSession, ChatMessage
from app.models.artifact import Artifact
from app.schemas.chat import ChatSessionCreate


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
    # Attach message_count to each session
    for s in sessions:
        s.message_count = len(s.messages)  # type: ignore[attr-defined]
    return sessions, total


def get_session_messages(
    db: Session, session_id: int, user_id: int
) -> list[ChatMessage]:
    """Get all messages for a session, ordered by id."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == user_id,
    ).first()
    if not session:
        return []
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


def _search_artifacts(db: Session, query: str, limit: int = 5) -> list[dict]:
    """Simple keyword search across artifacts table."""
    search_term = f"%{query}%"
    results = (
        db.query(Artifact)
        .filter(
            (Artifact.name.ilike(search_term))
            | (Artifact.description.ilike(search_term))
            | (Artifact.tags.ilike(search_term))
            | (Artifact.category.ilike(search_term))
            | (Artifact.era.ilike(search_term))
        )
        .limit(limit)
        .all()
    )

    items = []
    for a in results:
        snippet = ""
        if a.description:
            # Extract a short snippet around the keyword
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


def _build_thinking_content(query: str) -> str:
    """Generate a thinking process description based on the query."""
    return (
        f"用户询问：「{query}」。正在分析问题意图，提取关键词...\n\n"
        f"检索策略：\n"
        f"1. 关键词提取：对问题进行分词，提取核心查询词\n"
        f"2. 数据库检索：在文物数据库中搜索相关名称、描述、标签\n"
        f"3. 结果排序：根据关键词匹配度排序检索结果\n\n"
        f"综合检索结果，组织回答内容。"
    )


def _build_answer(query: str, results: list[dict]) -> str:
    """Build a template-based answer from search results."""
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


def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def stream_chat_response(db: Session, query: str, session_id: int):
    """
    Generator that yields SSE events for the three-stage chat flow.
    Stages: thinking -> tool_call -> answer -> done
    """
    start_time = time.time()

    # ── Stage 1: Thinking ──
    yield _sse_event("thinking_start", {})
    thinking_text = _build_thinking_content(query)
    # Stream thinking in chunks
    chunk_size = 12
    for i in range(0, len(thinking_text), chunk_size):
        chunk = thinking_text[i : i + chunk_size]
        yield _sse_event("thinking_delta", {"content": chunk})
        time.sleep(0.02)  # Small delay for streaming effect
    yield _sse_event("thinking_end", {})

    # ── Stage 2: Tool Call (search artifacts) ──
    yield _sse_event("tool_call_start", {"tool": "search_artifacts", "query": query})
    time.sleep(0.05)

    search_results = _search_artifacts(db, query, limit=5)
    elapsed = round(time.time() - start_time, 2)

    # Stream the search query being typed
    yield _sse_event("tool_call_delta", {"content": f"正在检索「{query}」..."})
    time.sleep(0.03)

    tool_result_data = {
        "results": search_results,
        "count": len(search_results),
        "elapsed": elapsed,
    }
    yield _sse_event("tool_call_result", tool_result_data)

    # ── Stage 3: Answer ──
    answer_text = _build_answer(query, search_results)
    yield _sse_event("answer_start", {})

    # Stream answer in chunks for typing effect
    chunk_size = 6
    for i in range(0, len(answer_text), chunk_size):
        chunk = answer_text[i : i + chunk_size]
        yield _sse_event("answer_delta", {"content": chunk})
        time.sleep(0.01)

    total_elapsed = round(time.time() - start_time, 2)
    yield _sse_event("answer_end", {})

    # Save messages to database
    save_message(db, session_id, "user", query)
    tool_calls_json = json.dumps(tool_result_data, ensure_ascii=False)
    save_message(db, session_id, "assistant", answer_text, tool_calls=tool_calls_json)

    # Update session title with first question if it's still default
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session and session.title == "新对话":
        title = query[:50] + ("..." if len(query) > 50 else "")
        update_session_title(db, session_id, title)

    # Build citation sources from search results
    sources = [
        {"name": r["name"], "source": "文物数据库"}
        for r in search_results
    ]

    # ── Stage 4: Done ──
    yield _sse_event("done", {
        "elapsed": total_elapsed,
        "sources": sources,
    })
