"""知识图谱相关 Schema"""

from pydantic import BaseModel


class GraphNode(BaseModel):
    """图谱节点"""

    id: str
    name: str
    type: str  # artifact, era, category, location, tag
    properties: dict | None = None


class GraphLink(BaseModel):
    """图谱边/关系"""

    source: str
    target: str
    relation: str  # 属于朝代, 属于类别, 出土于, 包含标签


class GraphDataResponse(BaseModel):
    """完整图谱数据响应"""

    nodes: list[GraphNode]
    links: list[GraphLink]
    total_nodes: int
    total_links: int


class NodeDetailResponse(BaseModel):
    """节点详情响应（包含直接关系和邻居节点）"""

    node: GraphNode
    links: list[GraphLink]
    neighbors: list[GraphNode]


class ImportResponse(BaseModel):
    """CSV 导入响应"""

    success: bool
    nodes_imported: int
    relations_imported: int
    message: str
    errors: list[str] | None = None


class ExtractRequest(BaseModel):
    """LightRAG 提取请求"""

    text: str
    source_name: str | None = None


class ExtractedEntity(BaseModel):
    """提取的实体"""

    entity_name: str
    entity_type: str
    description: str | None = None


class ExtractedRelation(BaseModel):
    """提取的关系"""

    src_name: str
    tgt_name: str
    relation: str


class ExtractResponse(BaseModel):
    """LightRAG 提取响应"""

    success: bool
    entities: list[ExtractedEntity]
    relations: list[ExtractedRelation]
    count: int
    message: str


class KnowledgeQueryRequest(BaseModel):
    """知识查询请求 — 用户查询 LightRAG 知识库"""

    question: str


class KnowledgeQueryResponse(BaseModel):
    """知识查询响应"""

    success: bool
    answer: str
    source: str  # "lightrag" or "fallback"
    message: str | None = None
