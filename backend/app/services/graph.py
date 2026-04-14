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
    使用 DB-level ILIKE 过滤，避免加载全部文物。
    """
    # DB-level filtering — only load matching artifacts
    search_term = f"%{keyword}%"
    matched_artifacts = (
        db.query(Artifact)
        .filter(
            Artifact.name.ilike(search_term)
            | Artifact.era.ilike(search_term)
            | Artifact.category.ilike(search_term)
            | Artifact.location.ilike(search_term)
            | Artifact.tags.ilike(search_term)
        )
        .all()
    )

    if not matched_artifacts:
        return [], []

    # Also load artifacts that share era/category/location/tags with matches
    eras = {a.era for a in matched_artifacts if a.era}
    categories = {a.category for a in matched_artifacts if a.category}
    locations = {a.location for a in matched_artifacts if a.location}

    related_artifacts = (
        db.query(Artifact)
        .filter(
            (Artifact.era.in_(eras) if eras else False)
            | (Artifact.category.in_(categories) if categories else False)
            | (Artifact.location.in_(locations) if locations else False)
        )
        .all()
    ) if (eras or categories or locations) else []

    # Merge and deduplicate
    all_ids = {a.id for a in matched_artifacts}
    all_arts = list(matched_artifacts)
    for a in related_artifacts:
        if a.id not in all_ids:
            all_ids.add(a.id)
            all_arts.append(a)

    nodes_dict, links_dict = build_graph_from_artifacts(all_arts)

    keyword_lower = keyword.lower()

    # Find matched node IDs by name
    matched_node_ids: Set[str] = set()
    for nid, node in nodes_dict.items():
        if keyword_lower in node.name.lower():
            matched_node_ids.add(nid)

    if not matched_node_ids:
        return list(nodes_dict.values()), list(links_dict.values())

    # Collect one-hop neighbors
    result_node_ids: Set[str] = set(matched_node_ids)
    result_link_keys: Set[str] = set()

    for link_key, link in links_dict.items():
        if link.source in matched_node_ids or link.target in matched_node_ids:
            result_node_ids.add(link.source)
            result_node_ids.add(link.target)
            result_link_keys.add(link_key)

    result_nodes = [nodes_dict[nid] for nid in result_node_ids if nid in nodes_dict]
    result_links = [links_dict[lk] for lk in result_link_keys if lk in links_dict]

    return result_nodes, result_links


def get_node_detail(
    db: Session,
    node_id: str,
) -> Optional[Tuple[GraphNode, List[GraphLink], List[GraphNode]]]:
    """
    获取单个节点的详情及其直接关系和邻居。

    只加载与目标节点相关的文物，避免全表扫描。
    """
    # Parse node_id to determine type and value
    if node_id.startswith("artifact_"):
        # Direct artifact — load just that one
        try:
            art_id = int(node_id.split("_", 1)[1])
        except (ValueError, IndexError):
            return None
        artifacts = db.query(Artifact).filter(Artifact.id == art_id).all()
    elif node_id.startswith("era_"):
        era_val = node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.era == era_val).all()
    elif node_id.startswith("cat_"):
        cat_val = node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.category == cat_val).all()
    elif node_id.startswith("loc_"):
        loc_val = node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.location == loc_val).all()
    elif node_id.startswith("tag_"):
        tag_val = node_id[4:]
        artifacts = (
            db.query(Artifact).filter(Artifact.tags.ilike(f"%{tag_val}%")).all()
        )
    else:
        return None

    nodes_dict, links_dict = build_graph_from_artifacts(artifacts)

    if node_id not in nodes_dict:
        return None

    node = nodes_dict[node_id]

    # Collect directly related edges and neighbors
    related_links: List[GraphLink] = []
    neighbor_ids: Set[str] = set()

    for link in links_dict.values():
        if link.source == node_id or link.target == node_id:
            related_links.append(link)
            neighbor_ids.add(link.source)
            neighbor_ids.add(link.target)

    neighbor_ids.discard(node_id)
    neighbors = [nodes_dict[nid] for nid in neighbor_ids if nid in nodes_dict]

    return node, related_links, neighbors
