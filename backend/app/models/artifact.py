"""Artifact model."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    category: Mapped[str | None] = mapped_column(String(50), index=True)
    era: Mapped[str | None] = mapped_column(String(50), index=True)
    location: Mapped[str | None] = mapped_column(String(100))
    image_url: Mapped[str | None] = mapped_column(String(500))
    tags: Mapped[str | None] = mapped_column(Text)
    # 新增字段（数据质量修复）
    material: Mapped[str | None] = mapped_column(String(50), index=True)  # 材质
    museum: Mapped[str | None] = mapped_column(String(100), index=True)  # 馆藏
    source_url: Mapped[str | None] = mapped_column(String(500))  # Wikipedia 来源链接
    dimensions: Mapped[str | None] = mapped_column(String(100))  # 尺寸
    related_artifacts: Mapped[str | None] = mapped_column(Text)  # 关联文物（用 | 分隔）
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    def __repr__(self):
        return f"<Artifact(id={self.id}, name='{self.name}')>"
