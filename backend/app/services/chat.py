"""Chat service — ReAct Tool Calling with DeepSeek.

Replaces the previous pre-retrieval approach (jieba -> search -> system prompt -> LLM)
with a proper ReAct loop where the LLM decides which tools to call.

SSE event flow per round:
  thinking_start -> thinking_delta... -> thinking_end
  tool_call_start -> tool_call_result          (for each tool call in the round)

Only the final round emits:
  answer_start -> answer_delta... -> answer_end

Finish:
  done
"""

import json
import logging
import time
from typing import Optional

from openai import OpenAI
import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.chat import ChatSession, ChatMessage
from app.schemas.chat import ChatSessionCreate
from app.ai.tools import TOOL_DEFINITIONS, execute_tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_REACT_ROUNDS = 5

SYSTEM_PROMPT = (
    "你是一个专业的文物知识助手，服务于「文物大数据与人工智能集成系统」。\n"
    "你可以使用以下工具来获取文物数据：\n"
    "1. **search_artifacts** — 按关键词、朝代、类别搜索文物数据库，返回文物列表\n"
    "2. **get_artifact_detail** — 获取指定文物的完整详细信息（先用 search_artifacts 找到 ID）\n"
    "3. **query_knowledge_graph** — 查询知识图谱中的实体和关系，适合回答概念性问题（如'青铜器有什么特点'、'商代有哪些重要文物'）\n\n"
    "回答规则：\n"
    "- 【不调用工具的场景】如果用户只是打招呼（你好、嗨、hello）、寒暄、问你的能力（你能做什么/你是谁）、"
    "或者发发表情/闲聊，直接友好回复即可，**绝对不要调用任何工具**\n"
    "- 用户询问具体文物信息时，先用 search_artifacts 搜索，再用 get_artifact_detail 获取详情\n"
    "- 用户询问概念性知识（特点、分类、关系）时，优先使用 query_knowledge_graph 查询图谱\n"
    "- 综合工具返回的数据回答，用编号列表和加粗标题组织内容\n"
    "- 引用数据时标注来源（如「数据库检索结果 #1」或「知识图谱」）\n"
    "- 如果工具返回为空，如实告知未找到，并建议用户调整搜索条件\n"
    "- 如果问题与文物无关，可以正常闲聊，但礼貌引导用户回到文物话题\n"
    "- 回答要结构清晰、准确、专业\n"
)

# ---------------------------------------------------------------------------
# OpenAI client (lazy singleton)
# ---------------------------------------------------------------------------

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Lazy-initialize the OpenAI client configured for DeepSeek."""
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.AI_API_KEY,
            base_url=settings.AI_API_BASE,
            timeout=120.0,  # 2 minutes — covers long DeepSeek Reasoner responses
        )
    return _client


# ---------------------------------------------------------------------------
# Session / message helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# History loader
# ---------------------------------------------------------------------------

def load_history(db: Session, session_id: int, limit: int = 10) -> list[dict]:
    """Load recent chat history as OpenAI-compatible message dicts.

    Only returns user/assistant messages (no system).
    """
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()  # chronological order

    result: list[dict] = []
    for m in messages:
        if m.role == "user":
            result.append({"role": "user", "content": m.content})
        elif m.role == "assistant":
            result.append({"role": "assistant", "content": m.content or ""})
    return result


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------

def _sse_event(event_type: str, data: dict) -> str:
    """Format a single SSE event."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Main streaming generator
# ---------------------------------------------------------------------------

def stream_chat_response(db: Session, query: str, session_id: int, new_session: bool = False):
    """Generator that yields SSE events for the chat flow (ReAct Tool Calling).

    Uses ``yield from`` to delegate to ``_react_gen`` which handles the
    actual ReAct loop.

    Args:
        db: Database session
        query: User's question
        session_id: Session ID to use (already created)
        new_session: If True, emit session_created event first
    """
    start_time = time.time()

    # Emit session_created event first if this is a new session
    # This allows frontend to set activeSessionId before any other events
    if new_session:
        yield _sse_event("session_created", {"session_id": session_id})

    # Save user message
    save_message(db, session_id, "user", query)

    # Build initial message list
    history = load_history(db, session_id, limit=10)
    # The last history entry is the current user query we just saved.
    # Remove it to avoid duplication (we append it explicitly below).
    if history and history[-1]["role"] == "user" and history[-1]["content"] == query:
        history = history[:-1]

    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ] + history + [
        {"role": "user", "content": query},
    ]

    all_tool_calls_log: list[dict] = []
    all_thinking_rounds: list[str] = []  # Accumulate thinking text for DB persistence
    answer_text = ""
    sources: list[dict] = []

    use_llm = bool(settings.AI_API_KEY)

    if use_llm:
        try:
            answer_text = yield from _react_gen(db, messages, all_tool_calls_log, all_thinking_rounds)
        except Exception as exc:
            logger.error("ReAct loop failed: %s", str(exc)[:300], exc_info=True)
            yield _sse_event("thinking_start", {})
            yield _sse_event("thinking_end", {})
            answer_text = "抱歉，AI 服务暂时出现异常，请稍后重试。"
            yield _sse_event("answer_start", {})
            chunk_size = 6
            for i in range(0, len(answer_text), chunk_size):
                yield _sse_event("answer_delta", {"content": answer_text[i : i + chunk_size]})
                time.sleep(0.01)
            yield _sse_event("answer_end", {})
    else:
        yield _sse_event("thinking_start", {})
        yield _sse_event("thinking_end", {})
        answer_text = "AI 服务未配置（缺少 AI_API_KEY），请联系管理员。"
        yield _sse_event("answer_start", {})
        yield _sse_event("answer_delta", {"content": answer_text})
        yield _sse_event("answer_end", {})

    total_elapsed = round(time.time() - start_time, 2)

    # Prepend thinking rounds to tool_calls_log for database persistence
    # Format: {"type": "thinking", "rounds": [round1_text, round2_text, ...]}
    if all_thinking_rounds:
        all_tool_calls_log.insert(0, {"type": "thinking", "rounds": all_thinking_rounds})

    # Save AI reply
    tool_calls_json = (
        json.dumps(all_tool_calls_log, ensure_ascii=False)
        if all_tool_calls_log
        else None
    )
    save_message(db, session_id, "assistant", answer_text, tool_calls=tool_calls_json)

    # Update session title if still the default
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session and session.title == "新对话":
        title = query[:50] + ("..." if len(query) > 50 else "")
        update_session_title(db, session_id, title)

    # Build citation sources from tool call results
    for tc_log in all_tool_calls_log:
        if tc_log.get("tool") == "search_artifacts":
            for r in tc_log.get("result", {}).get("results", []):
                sources.append({"name": r["name"], "source": "文物数据库", "artifact_id": r.get("id")})
        elif tc_log.get("tool") == "get_artifact_detail":
            detail = tc_log.get("result", {})
            if "error" not in detail:
                sources.append({"name": detail.get("name", ""), "source": "文物数据库", "artifact_id": detail.get("id")})

    yield _sse_event("done", {
        "elapsed": total_elapsed,
        "sources": sources,
    })


# ---------------------------------------------------------------------------
# ReAct loop generator
# ---------------------------------------------------------------------------

def _react_gen(db: Session, messages: list[dict], tool_calls_log: list[dict], thinking_rounds: list[str]):
    """ReAct loop generator. Yields SSE event strings, returns final answer text.

    Up to MAX_REACT_ROUNDS iterations:
    - If the LLM requests tool calls -> execute them, append results, continue.
    - If the LLM produces content without tool calls -> final answer, return.
    """
    client = _get_client()

    # Some models (e.g. deepseek-reasoner) don't support tool calling.
    # Try with tools first; if the API rejects it, fall back to plain chat.
    use_tools = True

    for _round in range(MAX_REACT_ROUNDS):
        thinking_text = ""
        content_text = ""
        tc_buffers: dict[int, dict] = {}
        in_thinking = False
        in_answer = False

        try:
            kwargs = dict(
                model=settings.AI_MODEL_NAME,
                messages=messages,
                stream=True,
                max_tokens=4096,
            )
            if use_tools:
                kwargs["tools"] = TOOL_DEFINITIONS
            stream = client.chat.completions.create(**kwargs)
        except (httpx.TimeoutException, Exception) as exc:
            err_msg = str(exc)[:300]
            # If model doesn't support tools, retry without
            if use_tools and ("tool" in err_msg.lower() or "function" in err_msg.lower() or "does not support" in err_msg.lower() or "400" in err_msg):
                logger.warning("Model %s may not support tools, retrying without: %s", settings.AI_MODEL_NAME, err_msg)
                use_tools = False
                continue
            logger.warning("LLM stream creation failed: %s", err_msg)
            yield _sse_event("answer_start", {})
            yield _sse_event("answer_delta", {
                "content": "抱歉，AI 服务暂时响应超时，请稍后重试。"
            })
            yield _sse_event("answer_end", {})
            return content_text

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            # --- reasoning_content (thinking, for deepseek-reasoner) ---
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                if not in_thinking:
                    in_thinking = True
                    yield _sse_event("thinking_start", {})
                thinking_text += reasoning
                yield _sse_event("thinking_delta", {"content": reasoning})

            # --- tool_calls (accumulated across chunks) ---
            tc_deltas = getattr(delta, "tool_calls", None)
            if tc_deltas:
                for tc_delta in tc_deltas:
                    idx = tc_delta.index
                    if idx not in tc_buffers:
                        tc_buffers[idx] = {"name": "", "arguments": ""}
                    if tc_delta.function:
                        if tc_delta.function.name:
                            tc_buffers[idx]["name"] += tc_delta.function.name
                        if tc_delta.function.arguments:
                            tc_buffers[idx]["arguments"] += tc_delta.function.arguments

            # --- regular content ---
            content = delta.content
            if content:
                if in_thinking:
                    in_thinking = False
                    yield _sse_event("thinking_end", {})
                if not in_answer:
                    in_answer = True
                    yield _sse_event("answer_start", {})
                content_text += content
                yield _sse_event("answer_delta", {"content": content})

        # Close thinking phase if still open - save to thinking_rounds for DB persistence
        if in_thinking:
            in_thinking = False
            yield _sse_event("thinking_end", {})
        # Always save thinking text if we have any (not just when in_thinking is True)
        # This fixes the bug where the last round's thinking was lost when followed by content
        if thinking_text:
            thinking_rounds.append(thinking_text)

        # --- Tool calls requested ---
        if tc_buffers:
            # Build the assistant message with tool_calls for conversation history
            assistant_tc_list = []
            for idx in sorted(tc_buffers.keys()):
                buf = tc_buffers[idx]
                assistant_tc_list.append({
                    "id": f"call_{idx}",
                    "type": "function",
                    "function": {
                        "name": buf["name"],
                        "arguments": buf["arguments"],
                    },
                })

            # Append assistant message (with tool_calls) to conversation
            messages.append({
                "role": "assistant",
                "content": content_text or None,
                "tool_calls": assistant_tc_list,
            })

            # Execute each tool call and emit SSE events
            for tc in assistant_tc_list:
                fn_name = tc["function"]["name"]
                fn_args_str = tc["function"]["arguments"]

                try:
                    fn_args = json.loads(fn_args_str) if fn_args_str else {}
                except json.JSONDecodeError:
                    fn_args = {}
                    logger.warning(
                        "Failed to parse tool call arguments: %s",
                        fn_args_str[:200],
                    )

                # Emit tool_call_start with a human-readable query
                display_query = (
                    fn_args.get("keyword", "")
                    or fn_args.get("artifact_id", "")
                    or fn_args_str[:100]
                )
                yield _sse_event("tool_call_start", {
                    "tool": fn_name,
                    "query": str(display_query),
                })

                # Execute tool
                tool_start_time = time.time()
                result = execute_tool(fn_name, fn_args, db)
                tool_elapsed = round(time.time() - tool_start_time, 2)

                # Log for DB storage
                tool_calls_log.append({
                    "tool": fn_name,
                    "args": fn_args,
                    "result": result,
                })

                # Emit tool_call_result - different format based on tool type
                if fn_name == "get_artifact_detail":
                    yield _sse_event("tool_call_result", {
                        "tool": fn_name,
                        "query": result.get("name", str(fn_args.get("artifact_id", ""))),
                        "artifactDetail": result,  # Send full artifact detail (camelCase for frontend)
                        "count": 1 if "error" not in result else 0,
                        "elapsed": tool_elapsed,
                    })
                elif fn_name == "query_knowledge_graph":
                    yield _sse_event("tool_call_result", {
                        "tool": fn_name,
                        "query": fn_args.get("keyword", ""),
                        "entities": result.get("entities", []),
                        "relations": result.get("relations", []),
                        "count": result.get("count", 0),
                        "elapsed": tool_elapsed,
                    })
                else:
                    # Default: search_artifacts and other tools
                    yield _sse_event("tool_call_result", {
                        "tool": fn_name,
                        "query": fn_args.get("keyword", fn_args_str[:100]),
                        "results": result.get("results", []),
                        "count": result.get("count", 0),
                        "elapsed": tool_elapsed,
                    })

                # Append tool result to conversation
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result, ensure_ascii=False),
                })

            # Continue to next round
            continue

        else:
            # No tool calls — this is the final answer
            if in_answer:
                yield _sse_event("answer_end", {})
            elif content_text:
                # Content accumulated but answer_start never sent (edge case)
                yield _sse_event("answer_start", {})
                yield _sse_event("answer_delta", {"content": content_text})
                yield _sse_event("answer_end", {})
            else:
                # Empty response — emit minimal answer events
                yield _sse_event("answer_start", {})
                yield _sse_event("answer_end", {})

            return content_text

    # Exhausted all rounds without a final answer — close any open answer phase
    if in_answer:
        yield _sse_event("answer_end", {})

    return content_text
