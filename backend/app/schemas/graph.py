"""Graph schemas."""

from typing import Optional

from pydantic import BaseModel


class GraphNode(BaseModel):
    """Schema for a graph node."""
    id: str
    label: str
    type: str
    properties: dict = {}


class GraphEdge(BaseModel):
    """Schema for a graph edge/relationship."""
    source: str
    target: str
    type: str
    properties: dict = {}


class GraphData(BaseModel):
    """Schema for full graph data response."""
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class GraphSearchRequest(BaseModel):
    """Schema for graph search."""
    keyword: str
    depth: int = 1
