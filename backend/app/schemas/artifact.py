"""Artifact schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ArtifactBase(BaseModel):
    """Base schema for artifact data."""
    name: str = Field(..., min_length=1, max_length=255, description="文物名称")
    description: Optional[str] = Field(None, description="文物描述")
    category: Optional[str] = Field(None, max_length=50, description="类别")
    era: Optional[str] = Field(None, max_length=50, description="年代")
    location: Optional[str] = Field(None, max_length=100, description="出土地点")
    image_url: Optional[str] = Field(None, max_length=500, description="图片链接")
    tags: Optional[str] = Field(None, description="标签（逗号分隔）")
    # 新增字段
    material: Optional[str] = Field(None, max_length=50, description="材质")
    museum: Optional[str] = Field(None, max_length=100, description="馆藏")
    source_url: Optional[str] = Field(None, max_length=500, description="来源链接")
    dimensions: Optional[str] = Field(None, max_length=100, description="尺寸")


class ArtifactCreate(ArtifactBase):
    """Schema for creating a new artifact."""
    pass


class ArtifactUpdate(BaseModel):
    """Schema for updating an artifact. All fields are optional."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)
    era: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=100)
    image_url: Optional[str] = Field(None, max_length=500)
    tags: Optional[str] = None
    # 新增字段
    material: Optional[str] = Field(None, max_length=50)
    museum: Optional[str] = Field(None, max_length=100)
    source_url: Optional[str] = Field(None, max_length=500)
    dimensions: Optional[str] = Field(None, max_length=100)


class ArtifactResponse(ArtifactBase):
    """Schema for artifact API response."""
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArtifactListResponse(BaseModel):
    """Schema for paginated artifact list response."""
    items: list[ArtifactResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
