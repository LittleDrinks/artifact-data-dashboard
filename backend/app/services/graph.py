"""知识图谱服务 — 从 SQLite artifacts 表动态构建图谱关系

MVP 阶段不使用 Neo4j，直接从文物数据中提取关系：
- artifact → era（属于朝代）
- artifact → category（属于类别）
- artifact → location（出土于）
- artifact → tags（包含标签，多个标签拆分）
"""

from typing import Optional, List, Tuple, Dict, Set

from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.schemas.graph import GraphNode, GraphLink


def _parse_tags(tags_str: Optional[str]) -> List[str]:
    """解析 tags 字段，支持逗号、顿号、空格分隔"""
    if not tags_str:
        return []
    # 支持中文顿号、逗号、空格分隔
    import re
    parts = re.split(r'[,，、\s]+', tags_str.strip())
    return [p.strip() for p in parts if p.strip()]


def build_graph_from_artifacts(
    artifacts: List[Artifact],
) -> Tuple[Dict[str, GraphNode], Dict[str, GraphLink]]:
    """
    从文物列表构建图谱节点和边。

    返回 (nodes_dict, links_dict)，key 为节点/边的唯一标识符，
    方便去重和后续查询。
    """
    nodes: Dict[str, GraphNode] = {}
    links: Dict[str, GraphLink] = {}

    for art in artifacts:
        # --- 文物节点 ---
        art_node_id = f"artifact_{art.id}"
        nodes[art_node_id] = GraphNode(
            id=art_node_id,
            name=art.name,
            type="artifact",
            properties={
                "category": art.category,
                "era": art.era,
                "location": art.location,
                "image_url": art.image_url,
            },
        )

        # --- 朝代关系 ---
        if art.era:
            era_id = f"era_{art.era}"
            if era_id not in nodes:
                nodes[era_id] = GraphNode(
                    id=era_id,
                    name=art.era,
                    type="era",
                )
            link_key = f"{art_node_id}->era_{art.era}"
            links[link_key] = GraphLink(
                source=art_node_id,
                target=era_id,
                relation="属于朝代",
            )

        # --- 类别关系 ---
        if art.category:
            cat_id = f"cat_{art.category}"
            if cat_id not in nodes:
                nodes[cat_id] = GraphNode(
                    id=cat_id,
                    name=art.category,
                    type="category",
                )
            link_key = f"{art_node_id}->cat_{art.category}"
            links[link_key] = GraphLink(
                source=art_node_id,
                target=cat_id,
                relation="属于类别",
            )

        # --- 出土地点关系 ---
        if art.location:
            loc_id = f"loc_{art.location}"
            if loc_id not in nodes:
                nodes[loc_id] = GraphNode(
                    id=loc_id,
                    name=art.location,
                    type="location",
                )
            link_key = f"{art_node_id}->loc_{art.location}"
            links[link_key] = GraphLink(
                source=art_node_id,
                target=loc_id,
                relation="出土于",
            )

        # --- 标签关系 ---
        for tag in _parse_tags(art.tags):
            tag_id = f"tag_{tag}"
            if tag_id not in nodes:
                nodes[tag_id] = GraphNode(
                    id=tag_id,
                    name=tag,
                    type="tag",
                )
            link_key = f"{art_node_id}->tag_{tag}"
            links[link_key] = GraphLink(
                source=art_node_id,
                target=tag_id,
                relation="包含标签",
            )

    return nodes, links


def get_full_graph(
    db: Session,
    limit: int = 100,
    offset: int = 0,
) -> Tuple[List[GraphNode], List[GraphLink]]:
    """
    获取完整图谱数据。

    Args:
        db: 数据库会话
        limit: 返回前 N 个文物的图谱数据
        offset: 偏移量，用于分页

    Returns:
        (nodes_list, links_list)
    """
    artifacts = (
        db.query(Artifact)
        .order_by(Artifact.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    nodes_dict, links_dict = build_graph_from_artifacts(artifacts)
    return list(nodes_dict.values()), list(links_dict.values())


def search_graph(
    db: Session,
    keyword: str,
) -> Tuple[List[GraphNode], List[GraphLink]]:
    """
    搜索图谱节点，返回匹配节点及其一跳邻居构成的子图。

    搜索范围：节点名称包含关键词。
    """
    # 先构建全量图谱（基于所有文物）
    all_artifacts = db.query(Artifact).order_by(Artifact.id).all()
    nodes_dict, links_dict = build_graph_from_artifacts(all_artifacts)

    keyword_lower = keyword.lower()

    # 找到所有匹配的节点
    matched_node_ids: Set[str] = set()
    for nid, node in nodes_dict.items():
        if keyword_lower in node.name.lower():
            matched_node_ids.add(nid)

    if not matched_node_ids:
        return [], []

    # 收集一跳邻居
    result_node_ids: Set[str] = set(matched_node_ids)
    result_link_keys: Set[str] = set()

    for link_key, link in links_dict.items():
        if link.source in matched_node_ids or link.target in matched_node_ids:
            result_node_ids.add(link.source)
            result_node_ids.add(link.target)
            result_link_keys.add(link_key)

    # 构建结果
    result_nodes = [nodes_dict[nid] for nid in result_node_ids if nid in nodes_dict]
    result_links = [links_dict[lk] for lk in result_link_keys if lk in links_dict]

    return result_nodes, result_links


def get_node_detail(
    db: Session,
    node_id: str,
) -> Optional[Tuple[GraphNode, List[GraphLink], List[GraphNode]]]:
    """
    获取单个节点的详情及其直接关系和邻居。

    Returns:
        (node, links, neighbors) 或 None（节点不存在时）
    """
    all_artifacts = db.query(Artifact).order_by(Artifact.id).all()
    nodes_dict, links_dict = build_graph_from_artifacts(all_artifacts)

    if node_id not in nodes_dict:
        return None

    node = nodes_dict[node_id]

    # 收集与该节点直接相关的边
    related_links: List[GraphLink] = []
    neighbor_ids: Set[str] = set()

    for link in links_dict.values():
        if link.source == node_id or link.target == node_id:
            related_links.append(link)
            neighbor_ids.add(link.source)
            neighbor_ids.add(link.target)

    neighbor_ids.discard(node_id)  # 排除自身
    neighbors = [nodes_dict[nid] for nid in neighbor_ids if nid in nodes_dict]

    return node, related_links, neighbors
