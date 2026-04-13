"""Statistics schemas."""

from typing import Optional

from pydantic import BaseModel


class OverviewStats(BaseModel):
    """Schema for dashboard overview statistics."""
    total_artifacts: int
    total_categories: int
    total_eras: int
    total_locations: int


class EraStat(BaseModel):
    """Schema for era-based statistics."""
    era: str
    count: int


class CategoryStat(BaseModel):
    """Schema for category-based statistics."""
    category: str
    count: int


class WordCloudItem(BaseModel):
    """Schema for word cloud data item."""
    word: str
    weight: int
