"""Chat session and message models."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    mode_used: Mapped[str] = mapped_column(
        String(20), default="tool_calling", server_default="tool_calling"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="session",
        order_by="ChatMessage.id",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<ChatSession(id={self.id}, title='{self.title}')>"


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    tool_calls: Mapped[str | None] = mapped_column(Text)  # JSON string
    reasoning_content: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # DeepSeek v4-flash thinking
    tool_call_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # for role=tool messages
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, role='{self.role}')>"
