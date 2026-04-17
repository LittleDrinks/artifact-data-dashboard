"""Chat router - session management and SSE streaming for AI Q&A."""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.chat import ChatSession
from app.routers.auth import get_current_user
from app.schemas.chat import (
    ChatAskRequest,
    ChatSessionCreate,
    ChatSessionListResponse,
    ChatSessionResponse,
    ChatMessageResponse,
)
from app.services import chat as chat_service

router = APIRouter()

# ── Simple in-memory rate limiter for ask endpoint ──
_ask_attempts: dict[str, list[float]] = defaultdict(list)
_ASK_RATE_LIMIT_WINDOW = 60  # seconds
_ASK_RATE_LIMIT_MAX = 10  # attempts per window


def _check_ask_rate_limit(client_ip: str) -> None:
    """Raise 429 if client_ip exceeds ask rate limit."""
    now = time.time()
    # Prune ALL expired keys to prevent memory leak
    expired_keys = [
        k for k, v in _ask_attempts.items()
        if not v or now - v[-1] > _ASK_RATE_LIMIT_WINDOW
    ]
    for k in expired_keys:
        del _ask_attempts[k]

    # Prune old entries for this IP
    attempts = _ask_attempts[client_ip]
    _ask_attempts[client_ip] = [t for t in attempts if now - t < _ASK_RATE_LIMIT_WINDOW]
    if len(_ask_attempts[client_ip]) >= _ASK_RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="提问过于频繁，请稍后再试",
        )
    _ask_attempts[client_ip].append(now)


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    data: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建新会话"""
    session = chat_service.create_session(db, current_user.id, data)
    session.message_count = 0
    return session


@router.get("/sessions", response_model=ChatSessionListResponse)
def list_sessions(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取用户的会话列表"""
    sessions, total = chat_service.get_user_sessions(
        db, current_user.id, page=page, page_size=size
    )
    return ChatSessionListResponse(
        items=[ChatSessionResponse.model_validate(s) for s in sessions],
        total=total,
    )


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
def get_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取会话历史消息"""
    messages = chat_service.get_session_messages(db, session_id, current_user.id)
    if messages is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在",
        )
    return messages


@router.delete("/sessions")
def delete_sessions(
    ids: str = Query(..., description="逗号分隔的会话ID列表"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量删除会话"""
    try:
        session_ids = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ids 格式错误，应为逗号分隔的数字",
        )
    if not session_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ids 不能为空",
        )
    count = chat_service.delete_sessions(db, current_user.id, session_ids)
    return {"deleted": count}


@router.post("/ask")
def ask_question(
    data: ChatAskRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    AI 问答（SSE 流式响应）。
    三阶段输出：thinking -> tool_call -> answer -> done
    """
    client_ip = request.client.host if request.client else "unknown"
    _check_ask_rate_limit(client_ip)

    session_id = data.session_id
    new_session = False

    # Create a new session if none provided
    if session_id is None:
        title = data.question[:50] + ("..." if len(data.question) > 50 else "")
        session = chat_service.create_session(
            db, current_user.id, ChatSessionCreate(title=title)
        )
        session_id = session.id
        new_session = True
    else:
        # Verify session belongs to user
        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.id == session_id,
                ChatSession.user_id == current_user.id,
            )
            .first()
        )
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="会话不存在",
            )

    return StreamingResponse(
        chat_service.stream_chat_response(db, data.question, session_id, new_session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
