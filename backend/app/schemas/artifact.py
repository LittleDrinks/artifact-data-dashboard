"""Artifact schemas."""

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def _normalize_text(value: str | None) -> str | None:
    """Strip leading/trailing whitespace and collapse internal whitespace."""
    if value is None:
        return None
    # Strip outer whitespace
    stripped = value.strip()
    if not stripped:
        return None
    # Collapse multiple spaces/tabs/newlines into a single space
    return re.sub(r'\s+', ' ', stripped)


def _normalize_category(value: str | None) -> str | None:
    """Normalize category: strip whitespace, apply title case."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    # Title case: first letter of each word uppercased
    return stripped.title()


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

    @field_validator('name', mode='before')
    @classmethod
    def normalize_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('文物名称不能为空')
        # Collapse whitespace but do not change casing (Chinese names)
        return re.sub(r'\s+', ' ', v.strip())

    @field_validator('category', mode='before')
    @classmethod
    def normalize_category(cls, v: str | None) -> str | None:
        return _normalize_category(v)

    @field_validator('era', mode='before')
    @classmethod
    def normalize_era(cls, v: str | None) -> str | None:
        return _normalize_text(v)

    @field_validator('location', mode='before')
    @classmethod
    def normalize_location(cls, v: str | None) -> str | None:
        return _normalize_text(v)

    @field_validator('tags', mode='before')
    @classmethod
    def normalize_tags(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        # Normalize whitespace around commas, collapse multiple commas
        parts = [p.strip() for p in stripped.split(',')]
        parts = [p for p in parts if p]
        return ','.join(parts)


class ArtifactCreate(ArtifactBase):
    """Schema for creating a new artifact."""

    @model_validator(mode='after')
    def validate_required_fields(self) -> 'ArtifactCreate':
        """Ensure name, category, and era are provided for creation."""
        # name is already required by Field, but double-check after normalization
        if not self.name or not self.name.strip():
            raise ValueError('文物名称不能为空')
        if not self.category:
            raise ValueError('文物类别不能为空')
        if not self.era:
            raise ValueError('文物年代不能为空')
        return self


class ArtifactUpdate(BaseModel):
    """Schema for updating an artifact. All fields are optional.
    Cannot set non-null fields (name, category, era) to None."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)
    era: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=100)
    image_url: Optional[str] = Field(None, max_length=500)
    tags: Optional[str] = None
    material: Optional[str] = Field(None, max_length=50)
    museum: Optional[str] = Field(None, max_length=100)
    source_url: Optional[str] = Field(None, max_length=500)
    dimensions: Optional[str] = Field(None, max_length=100)

    @model_validator(mode='after')
    def prevent_nullify_required(self) -> 'ArtifactUpdate':
        """Prevent setting name/category/era to empty string which would nullify them."""
        if self.name is not None and not self.name.strip():
            raise ValueError('文物名称不能为空')
        if self.category is not None and not self.category.strip():
            raise ValueError('文物类别不能为空字符串')
        if self.era is not None and not self.era.strip():
            raise ValueError('文物年代不能为空字符串')
        return self

    @field_validator('name', mode='before')
    @classmethod
    def normalize_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.strip():
            raise ValueError('文物名称不能为空')
        return re.sub(r'\s+', ' ', v.strip())

    @field_validator('category', mode='before')
    @classmethod
    def normalize_category_update(cls, v: str | None) -> str | None:
        # Reject explicit empty string (user trying to nullify)
        if v is not None and not v.strip():
            raise ValueError('文物类别不能为空字符串')
        return _normalize_category(v)

    @field_validator('era', mode='before')
    @classmethod
    def normalize_era_update(cls, v: str | None) -> str | None:
        # Reject explicit empty string
        if v is not None and not v.strip():
            raise ValueError('文物年代不能为空字符串')
        return _normalize_text(v)

    @field_validator('location', mode='before')
    @classmethod
    def normalize_location_update(cls, v: str | None) -> str | None:
        return _normalize_text(v)

    @field_validator('tags', mode='before')
    @classmethod
    def normalize_tags_update(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        parts = [p.strip() for p in stripped.split(',')]
        parts = [p for p in parts if p]
        return ','.join(parts)


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
