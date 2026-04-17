"""知识图谱相关 Schema"""

from typing import Optional, List

from pydantic import BaseModel


class GraphNode(BaseModel):
    """图谱节点"""
    id: str
    name: str
    type: str  # artifact, era, category, location, tag
    properties: Optional[dict] = None


class GraphLink(BaseModel):
    """图谱边/关系"""
    source: str
    target: str
    relation: str  # 属于朝代, 属于类别, 出土于, 包含标签


class GraphDataResponse(BaseModel):
    """完整图谱数据响应"""
    nodes: List[GraphNode]
    links: List[GraphLink]
    total_nodes: int
    total_links: int


class NodeDetailResponse(BaseModel):
    """节点详情响应（包含直接关系和邻居节点）"""
    node: GraphNode
    links: List[GraphLink]
    neighbors: List[GraphNode]


class ImportResponse(BaseModel):
    """CSV 导入响应"""
    success: bool
    nodes_imported: int
    relations_imported: int
    message: str
    errors: Optional[List[str]] = None


class ExtractRequest(BaseModel):
    """LightRAG 提取请求"""
    text: str
    source_name: Optional[str] = None


class ExtractedEntity(BaseModel):
    """提取的实体"""
    entity_name: str
    entity_type: str
    description: Optional[str] = None


class ExtractedRelation(BaseModel):
    """提取的关系"""
    src_name: str
    tgt_name: str
    relation: str


class ExtractResponse(BaseModel):
    """LightRAG 提取响应"""
    success: bool
    entities: List[ExtractedEntity]
    relations: List[ExtractedRelation]
    count: int
    message: str
