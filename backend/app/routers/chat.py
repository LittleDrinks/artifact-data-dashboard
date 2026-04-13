"""Chat router - session management and SSE streaming for AI Q&A."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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


@router.post("/ask")
def ask_question(
    data: ChatAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    AI 问答（SSE 流式响应）。
    三阶段输出：thinking -> tool_call -> answer -> done
    """
    session_id = data.session_id

    # Create a new session if none provided
    if session_id is None:
        title = data.question[:50] + ("..." if len(data.question) > 50 else "")
        session = chat_service.create_session(
            db, current_user.id, ChatSessionCreate(title=title)
        )
        session_id = session.id
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
        chat_service.stream_chat_response(db, data.question, session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
