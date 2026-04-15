"""知识图谱服务 — Neo4j + SQLite 双数据源

优先从 Neo4j 查询实体/关系（LightRAG 构建的语义图谱），
如果 Neo4j 无数据则 fallback 到 SQLite artifacts 表动态构建基础关系。

Neo4j 图谱：实体(entity_name, entity_type) + 关系(src_name, target_name, relation_type)
SQLite 基础图谱：artifact → era/category/location/tags
"""

import logging
from typing import Optional, List, Tuple, Dict, Set

from neo4j import GraphDatabase
from sqlalchemy.orm import Session

from app.config import settings
from app.models.artifact import Artifact
from app.schemas.graph import GraphNode, GraphLink

logger = logging.getLogger(__name__)

# Neo4j driver singleton
_neo4j_driver = None


def _get_neo4j_driver():
    """Lazy-initialize Neo4j driver."""
    global _neo4j_driver
    if _neo4j_driver is None:
        try:
            _neo4j_driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            )
            logger.info("Neo4j driver connected: %s", settings.NEO4J_URI)
        except Exception as e:
            logger.warning("Neo4j connection failed: %s", e)
            _neo4j_driver = None
    return _neo4j_driver


def _close_neo4j_driver():
    """Close Neo4j driver on shutdown."""
    global _neo4j_driver
    if _neo4j_driver:
        _neo4j_driver.close()
        _neo4j_driver = None


def _query_neo4j_entities(driver, limit: int = 100, keyword: str = None) -> Tuple[List[GraphNode], List[GraphLink]]:
    """Query entities and relations from Neo4j (LightRAG knowledge graph).

    Returns (nodes_list, links_list). Empty lists if Neo4j unavailable or no data.
    """
    if driver is None:
        return [], []

    nodes: Dict[str, GraphNode] = {}
    links: Dict[str, GraphLink] = {}

    try:
        with driver.session() as session:
            # Query entities
            if keyword:
                # Search by name containing keyword
                entity_query = """
                    MATCH (e)
                    WHERE e.entity_name CONTAINS $keyword
                    RETURN e.entity_name AS name, e.entity_type AS type, e.description AS desc
                    LIMIT $limit
                """
                result = session.run(entity_query, keyword=keyword, limit=limit)
            else:
                entity_query = """
                    MATCH (e)
                    RETURN e.entity_name AS name, e.entity_type AS type, e.description AS desc
                    LIMIT $limit
                """
                result = session.run(entity_query, limit=limit)

            for record in result:
                name = record.get("name")
                entity_type = record.get("type", "unknown")
                desc = record.get("desc", "")
                if name:
                    node_id = f"neo4j_{name}"
                    nodes[node_id] = GraphNode(
                        id=node_id,
                        name=name,
                        type=entity_type,
                        properties={"description": desc},
                    )

            # Query relations between matched entities
            if nodes:
                entity_names = list(nodes.keys())
                # Query relations
                rel_query = """
                    MATCH (a)-[r]->(b)
                    WHERE a.entity_name IN $names AND b.entity_name IN $names
                    RETURN a.entity_name AS src, b.entity_name AS tgt, type(r) AS rel_type
                """
                rel_result = session.run(rel_query, names=[n.replace("neo4j_", "") for n in entity_names])
                for record in rel_result:
                    src = record.get("src")
                    tgt = record.get("tgt")
                    rel_type = record.get("rel_type", "related")
                    if src and tgt:
                        src_id = f"neo4j_{src}"
                        tgt_id = f"neo4j_{tgt}"
                        link_key = f"{src_id}->{tgt_id}"
                        links[link_key] = GraphLink(
                            source=src_id,
                            target=tgt_id,
                            relation=rel_type,
                        )

        return list(nodes.values()), list(links.values())
    except Exception as e:
        logger.warning("Neo4j query failed: %s", e)
        return [], []


def _check_neo4j_has_data(driver) -> bool:
    """Check if Neo4j has any entity nodes."""
    if driver is None:
        return False
    try:
        with driver.session() as session:
            result = session.run("MATCH (e) RETURN count(e) AS cnt LIMIT 1")
            record = result.single()
            cnt = record.get("cnt", 0) if record else 0
            return cnt > 0
    except Exception:
        return False


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

    优先从 Neo4j 查询（LightRAG 构建的语义图谱），如果无数据则 fallback 到 SQLite。

    Args:
        db: 数据库会话
        limit: 返回前 N 个实体/文物
        offset: 偏移量，用于分页（仅 SQLite fallback 时使用）

    Returns:
        (nodes_list, links_list)
    """
    driver = _get_neo4j_driver()

    # Try Neo4j first
    if _check_neo4j_has_data(driver):
        neo4j_nodes, neo4j_links = _query_neo4j_entities(driver, limit=limit)
        if neo4j_nodes:
            logger.info("get_full_graph: returned %d nodes from Neo4j", len(neo4j_nodes))
            return neo4j_nodes, neo4j_links

    # Fallback to SQLite
    logger.info("get_full_graph: Neo4j empty or unavailable, falling back to SQLite")
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

    优先从 Neo4j 查询语义实体，如果无数据则 fallback 到 SQLite artifacts。

    搜索范围：节点名称包含关键词。
    """
    driver = _get_neo4j_driver()

    # Try Neo4j first
    if _check_neo4j_has_data(driver):
        neo4j_nodes, neo4j_links = _query_neo4j_entities(driver, limit=50, keyword=keyword)
        if neo4j_nodes:
            logger.info("search_graph: found %d nodes in Neo4j for keyword '%s'", len(neo4j_nodes), keyword)
            # Collect one-hop neighbors
            matched_ids = {n.id for n in neo4j_nodes}
            result_node_ids: Set[str] = set(matched_ids)
            result_link_keys: Set[str] = set()

            for link in neo4j_links:
                if link.source in matched_ids or link.target in matched_ids:
                    result_node_ids.add(link.source)
                    result_node_ids.add(link.target)
                    result_link_keys.add(link.source + "->" + link.target)

            nodes_dict = {n.id: n for n in neo4j_nodes}
            result_nodes = [nodes_dict[nid] for nid in result_node_ids if nid in nodes_dict]
            result_links = [l for l in neo4j_links if l.source + "->" + l.target in result_link_keys]
            return result_nodes, result_links

    # Fallback to SQLite
    logger.info("search_graph: Neo4j empty or unavailable, falling back to SQLite")
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
