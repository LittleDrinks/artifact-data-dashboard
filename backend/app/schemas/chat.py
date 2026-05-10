"""Chat schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class ChatSessionCreate(BaseModel):
    """Schema for creating a chat session."""

    title: str | None = Field(None, max_length=255, description="会话标题")


class ChatSessionResponse(BaseModel):
    """Schema for chat session response."""

    id: int
    user_id: int
    title: str | None
    mode_used: str
    created_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class ChatSessionListResponse(BaseModel):
    """Schema for chat session list."""

    items: list[ChatSessionResponse]
    total: int


class ChatMessageResponse(BaseModel):
    """Schema for chat message response."""

    id: int
    session_id: int
    role: str
    content: str | None
    tool_calls: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatAskRequest(BaseModel):
    """Schema for sending a chat question."""

    session_id: int | None = Field(None, description="会话ID，为空则创建新会话")
    question: str = Field(..., min_length=1, description="用户问题")
    mode: str = Field("tool_calling", pattern=r"^(tool_calling|pre_retrieve)$")
