"""知识图谱服务 — Neo4j + LightRAG KV Store + SQLite 三级数据源

优先级：Neo4j → LightRAG KV Store → SQLite fallback

Neo4j 图谱：实体(entity_name, entity_type) + 关系(src_name, target_name, relation_type)
LightRAG KV Store：entity_names + relation_pairs（从 JSON 文件读取）
SQLite 基础图谱：artifact → era/category/location/tags
"""

import json
import logging
import os
from typing import Optional, List, Tuple, Dict, Set

from neo4j import GraphDatabase
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.config import settings
from app.models.artifact import Artifact
from app.schemas.graph import GraphNode, GraphLink
from app.services.stats import JUNK_CATEGORIES

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


def _check_neo4j_has_base_layer(driver) -> bool:
    """Check if Neo4j has base triple layer nodes (source='rule')."""
    if driver is None:
        return False
    try:
        with driver.session() as session:
            result = session.run("MATCH (e) WHERE e.source = 'rule' RETURN count(e) AS cnt LIMIT 1")
            record = result.single()
            cnt = record.get("cnt", 0) if record else 0
            return cnt > 0
    except Exception:
        return False


def _query_neo4j_base_layer(
    driver,
    limit: int = 100,
    offset: int = 0,
    node_types: Optional[List[str]] = None,
) -> Tuple[Dict[str, GraphNode], Dict[str, GraphLink]]:
    """Query base triple layer from Neo4j (nodes with source='rule').

    This queries Artifact, Era, Category, Location, Tag, Material, Museum nodes
    and their relationships.

    Returns (nodes_dict, links_dict). Empty dicts if Neo4j unavailable.
    """
    if driver is None:
        return {}, {}

    nodes: Dict[str, GraphNode] = {}
    links: Dict[str, GraphLink] = {}

    # Default types to query
    type_filter = node_types or ["artifact", "era", "category", "location", "tag", "material", "museum"]

    try:
        with driver.session() as session:
            # Query nodes by label and source='rule'
            for node_type in type_filter:
                # Map frontend types to Neo4j labels
                label_map = {
                    "artifact": "artifact",
                    "era": "era",
                    "category": "category",
                    "location": "location",
                    "tag": "tag",
                    "material": "material",
                    "museum": "museum",
                }
                neo4j_label = label_map.get(node_type)
                if not neo4j_label:
                    continue

                # Query nodes with this label
                node_query = f"""
                    MATCH (n:{neo4j_label})
                    WHERE n.source = 'rule'
                    RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n AS props
                    SKIP $offset LIMIT $limit
                """
                result = session.run(node_query, offset=offset, limit=limit)

                for record in result:
                    node_id = record.get("id")
                    name = record.get("name")
                    node_type_raw = record.get("type", neo4j_label)
                    props = dict(record.get("props", {}))

                    if node_id and name:
                        # Build properties dict
                        properties = {}
                        if neo4j_label == "artifact":
                            properties = {
                                "artifact_id": props.get("artifact_id"),
                                "description": props.get("description"),
                                "image_url": props.get("image_url"),
                                "dimensions": props.get("dimensions"),
                            }
                        elif props.get("count"):
                            properties["count"] = props.get("count")

                        nodes[node_id] = GraphNode(
                            id=node_id,
                            name=name,
                            type=node_type_raw,
                            properties=properties,
                        )

            # Query all relationships between matched nodes
            if nodes:
                node_ids = list(nodes.keys())
                rel_query = """
                    MATCH (a)-[r]->(b)
                    WHERE a.source = 'rule' AND b.source = 'rule'
                    AND a.id IN $ids AND b.id IN $ids
                    RETURN a.id AS src, b.id AS tgt, type(r) AS rel_type
                """
                rel_result = session.run(rel_query, ids=node_ids)

                for record in rel_result:
                    src = record.get("src")
                    tgt = record.get("tgt")
                    rel_type = record.get("rel_type", "related")

                    if src and tgt:
                        link_key = f"{src}->{tgt}"
                        links[link_key] = GraphLink(
                            source=src,
                            target=tgt,
                            relation=rel_type,
                        )

        logger.info("_query_neo4j_base_layer: %d nodes, %d links", len(nodes), len(links))
        return nodes, links
    except Exception as e:
        logger.warning("Neo4j base layer query failed: %s", e)
        return {}, {}


def _search_neo4j_base_layer(
    driver,
    keyword: str,
    node_types: Optional[List[str]] = None,
    depth: int = 1,
) -> Tuple[List[GraphNode], List[GraphLink], int]:
    """Search base layer nodes by keyword and expand neighbors.

    Returns (nodes_list, links_list, matched_count).
    """
    if driver is None:
        return [], [], 0

    nodes: Dict[str, GraphNode] = {}
    matched_ids: Set[str] = set()

    type_filter = node_types or ["artifact", "era", "category", "location", "tag", "material", "museum"]
    kw = keyword.lower()

    try:
        with driver.session() as session:
            # Search nodes by name containing keyword
            for node_type in type_filter:
                label_map = {
                    "artifact": "artifact",
                    "era": "era",
                    "category": "category",
                    "location": "location",
                    "tag": "tag",
                    "material": "material",
                    "museum": "museum",
                }
                neo4j_label = label_map.get(node_type)
                if not neo4j_label:
                    continue

                search_query = f"""
                    MATCH (n:{neo4j_label})
                    WHERE n.source = 'rule' AND toLower(n.name) CONTAINS $keyword
                    RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n AS props
                    LIMIT 50
                """
                result = session.run(search_query, keyword=kw)

                for record in result:
                    node_id = record.get("id")
                    name = record.get("name")
                    node_type_raw = record.get("type", neo4j_label)
                    props = dict(record.get("props", {}))

                    if node_id and name:
                        matched_ids.add(node_id)
                        properties = {}
                        if neo4j_label == "artifact":
                            properties = {
                                "artifact_id": props.get("artifact_id"),
                                "description": props.get("description"),
                                "image_url": props.get("image_url"),
                            }
                        elif props.get("count"):
                            properties["count"] = props.get("count")

                        nodes[node_id] = GraphNode(
                            id=node_id,
                            name=name,
                            type=node_type_raw,
                            properties=properties,
                        )

            matched_count = len(matched_ids)
            if matched_count == 0:
                return [], [], 0

            # Multi-hop neighbor expansion
            result_node_ids: Set[str] = set(matched_ids)
            result_links: List[GraphLink] = []

            for _ in range(depth):
                # Query relationships from current nodes
                expand_query = """
                    MATCH (a)-[r]->(b)
                    WHERE a.source = 'rule' AND b.source = 'rule'
                    AND a.id IN $ids
                    RETURN a.id AS src, b.id AS tgt, type(r) AS rel_type, b.name AS tgt_name, labels(b)[0] AS tgt_type
                """
                expand_result = session.run(expand_query, ids=list(result_node_ids))

                new_ids: Set[str] = set()
                for record in expand_result:
                    src = record.get("src")
                    tgt = record.get("tgt")
                    rel_type = record.get("rel_type", "related")
                    tgt_name = record.get("tgt_name")
                    tgt_type = record.get("tgt_type")

                    if src and tgt:
                        link_key = f"{src}->{tgt}"
                        # Add link if not already added
                        existing = False
                        for l in result_links:
                            if l.source == src and l.target == tgt:
                                existing = True
                                break
                        if not existing:
                            result_links.append(GraphLink(
                                source=src,
                                target=tgt,
                                relation=rel_type,
                            ))

                        # Add target node if new
                        if tgt not in result_node_ids and tgt not in nodes:
                            new_ids.add(tgt)
                            nodes[tgt] = GraphNode(
                                id=tgt,
                                name=tgt_name or tgt,
                                type=tgt_type or "unknown",
                            )

                result_node_ids.update(new_ids)

            # Apply type filter to final nodes
            allowed_types = set(type_filter)
            filtered_nodes = [n for n in nodes.values() if n.type in allowed_types]
            filtered_links = [l for l in result_links if l.source in nodes and l.target in nodes]

            return filtered_nodes, filtered_links, matched_count

    except Exception as e:
        logger.warning("Neo4j base layer search failed: %s", e)
        return [], [], 0


def _get_node_detail_from_neo4j(
    driver,
    node_id: str,
) -> Optional[Tuple[GraphNode, List[GraphLink], List[GraphNode]]]:
    """Get node detail from Neo4j base layer.

    Returns (node, related_links, neighbors) or None if not found.
    """
    if driver is None:
        return None

    try:
        with driver.session() as session:
            # Find node by id
            node_query = """
                MATCH (n)
                WHERE n.id = $node_id AND n.source = 'rule'
                RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n AS props
            """
            result = session.run(node_query, node_id=node_id)
            record = result.single()

            if not record:
                return None

            node_id_found = record.get("id")
            name = record.get("name")
            node_type = record.get("type", "unknown")
            props = dict(record.get("props", {}))

            properties = {}
            if node_type == "artifact":
                properties = {
                    "artifact_id": props.get("artifact_id"),
                    "description": props.get("description"),
                    "image_url": props.get("image_url"),
                    "dimensions": props.get("dimensions"),
                }
            elif props.get("count"):
                properties["count"] = props.get("count")

            node = GraphNode(
                id=node_id_found,
                name=name,
                type=node_type,
                properties=properties,
            )

            # Get related nodes and links
            rel_query = """
                MATCH (a)-[r]-(b)
                WHERE a.id = $node_id AND a.source = 'rule' AND b.source = 'rule'
                RETURN b.id AS neighbor_id, b.name AS neighbor_name, labels(b)[0] AS neighbor_type,
                       type(r) AS rel_type, CASE WHEN startNode(r) = a THEN 'out' ELSE 'in' END AS direction
            """
            rel_result = session.run(rel_query, node_id=node_id)

            neighbors: List[GraphNode] = []
            links: List[GraphLink] = []

            for rel_record in rel_result:
                neighbor_id = rel_record.get("neighbor_id")
                neighbor_name = rel_record.get("neighbor_name")
                neighbor_type = rel_record.get("neighbor_type", "unknown")
                rel_type = rel_record.get("rel_type", "related")
                direction = rel_record.get("direction", "out")

                if neighbor_id:
                    neighbors.append(GraphNode(
                        id=neighbor_id,
                        name=neighbor_name or neighbor_id,
                        type=neighbor_type,
                    ))

                    # Create link based on direction
                    if direction == "out":
                        links.append(GraphLink(
                            source=node_id_found,
                            target=neighbor_id,
                            relation=rel_type,
                        ))
                    else:
                        links.append(GraphLink(
                            source=neighbor_id,
                            target=node_id_found,
                            relation=rel_type,
                        ))

            return node, links, neighbors

    except Exception as e:
        logger.warning("Neo4j node detail query failed: %s", e)
        return None


def _query_lightrag_kvstore(
    limit: int = 100,
    keyword: Optional[str] = None,
) -> Tuple[List[GraphNode], List[GraphLink]]:
    """Read LightRAG KV Store JSON files and build graph data.

    Returns (nodes_list, links_list). Empty lists if files not found.
    """
    lightrag_dir = settings.LIGHTRAG_DIR
    entities_path = os.path.join(lightrag_dir, "kv_store_full_entities.json")
    relations_path = os.path.join(lightrag_dir, "kv_store_full_relations.json")

    if not os.path.isfile(entities_path) or not os.path.isfile(relations_path):
        return [], []

    try:
        with open(entities_path, "r", encoding="utf-8") as f:
            entities_data = json.load(f)
        with open(relations_path, "r", encoding="utf-8") as f:
            relations_data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to read LightRAG KV Store: %s", e)
        return [], []

    # Collect all unique entity names
    all_entity_names: Set[str] = set()
    for doc in entities_data.values():
        for name in doc.get("entity_names", []):
            all_entity_names.add(name)

    # Filter by keyword if provided
    if keyword:
        kw = keyword.lower()
        all_entity_names = {n for n in all_entity_names if kw in n.lower()}

    # Build nodes
    nodes: Dict[str, GraphNode] = {}
    for name in all_entity_names:
        node_id = f"lightrag_{name}"
        nodes[node_id] = GraphNode(
            id=node_id,
            name=name,
            type="entity",
        )

    # Build links from relations
    links: Dict[str, GraphLink] = {}
    for doc in relations_data.values():
        for pair in doc.get("relation_pairs", []):
            if len(pair) >= 2:
                src_name, tgt_name = pair[0], pair[1]
                src_id = f"lightrag_{src_name}"
                tgt_id = f"lightrag_{tgt_name}"
                # Only include if both endpoints are in our node set
                if src_id in nodes and tgt_id in nodes:
                    link_key = f"{src_id}->{tgt_id}"
                    links[link_key] = GraphLink(
                        source=src_id,
                        target=tgt_id,
                        relation="相关",
                    )

    # Apply limit
    node_list = list(nodes.values())[:limit]
    node_ids = {n.id for n in node_list}
    link_list = [l for l in links.values() if l.source in node_ids and l.target in node_ids]

    logger.info("LightRAG KV Store: %d entities, %d relations", len(node_list), len(link_list))
    return node_list, link_list


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

    去重策略：先收集所有 era/category/location 名称，再处理 tags，
    避免 tag 与其他类型节点同名导致重复（如 tag_青铜器 vs cat_青铜器）。
    """
    nodes: Dict[str, GraphNode] = {}
    links: Dict[str, GraphLink] = {}

    # Step 1: Pre-collect all era/category/location names to prevent tag duplicates
    reserved_names: Set[str] = set()
    for art in artifacts:
        if art.era:
            reserved_names.add(art.era)
        if art.category and art.category not in JUNK_CATEGORIES:
            reserved_names.add(art.category)
        if art.location:
            reserved_names.add(art.location)

    for art in artifacts:
        # --- Skip artifacts with junk categories (Wikipedia maintenance categories) ---
        if art.category and art.category in JUNK_CATEGORIES:
            continue

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
        # Skip tags that duplicate existing era/category/location nodes
        # This prevents "青铜器" appearing as both cat_青铜器 and tag_青铜器
        for tag in _parse_tags(art.tags):
            # Check if this tag name is reserved by era/category/location
            if tag in reserved_names:
                # Link to existing/reserved node instead of creating duplicate tag
                # Determine which type the reserved name belongs to (prefer first match)
                if f"era_{tag}" in nodes:
                    existing_node_id = f"era_{tag}"
                elif f"cat_{tag}" in nodes:
                    existing_node_id = f"cat_{tag}"
                elif f"loc_{tag}" in nodes:
                    existing_node_id = f"loc_{tag}"
                else:
                    # Reserved but not yet created - will be created later, skip for now
                    # We'll create the link when that node is processed
                    continue
                link_key = f"{art_node_id}->{existing_node_id}"
                links[link_key] = GraphLink(
                    source=art_node_id,
                    target=existing_node_id,
                    relation="包含标签",
                )
            else:
                # Not reserved, create new tag node
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


def _filter_graph_by_types(
    nodes_dict: Dict[str, GraphNode],
    links_dict: Dict[str, GraphLink],
    node_types: List[str],
) -> Tuple[List[GraphNode], List[GraphLink]]:
    """Filter graph nodes/links to only include requested node types.

    If 'artifact' is in node_types but other types are not, the non-artifact
    nodes are removed and their links are dropped as well.
    """
    if not node_types or set(node_types) == {"artifact", "era", "category", "location", "tag"}:
        # No filtering needed — return all
        return list(nodes_dict.values()), list(links_dict.values())

    allowed = set(node_types)
    filtered_nodes = {nid: n for nid, n in nodes_dict.items() if n.type in allowed}
    filtered_links = {
        lk: l for lk, l in links_dict.items()
        if l.source in filtered_nodes and l.target in filtered_nodes
    }
    return list(filtered_nodes.values()), list(filtered_links.values())


def get_full_graph(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    node_types: Optional[List[str]] = None,
) -> Tuple[List[GraphNode], List[GraphLink]]:
    """
    获取完整图谱数据。

    数据源策略（Neo4j primary）：
    1. Neo4j 基础层优先：查询 source='rule' 的节点和关系
    2. SQLite fallback：如果 Neo4j 不可用或无数据，从 SQLite 构建

    Args:
        db: 数据库会话
        limit: 返回前 N 个文物的图谱数据
        offset: 偏移量，用于分页
        node_types: 节点类型过滤列表，默认显示全部类型以呈现关系

    Returns:
        (nodes_list, links_list)
    """
    # Try Neo4j first (primary data source)
    driver = _get_neo4j_driver()
    if _check_neo4j_has_base_layer(driver):
        nodes_dict, links_dict = _query_neo4j_base_layer(
            driver, limit=limit, offset=offset, node_types=node_types
        )
        if nodes_dict:
            logger.info("get_full_graph: using Neo4j primary, %d nodes", len(nodes_dict))
            return _filter_graph_by_types(nodes_dict, links_dict, node_types)

    # SQLite fallback (when Neo4j unavailable or empty)
    logger.info("get_full_graph: falling back to SQLite")

    # Optimize for demo: prioritize artifacts with rich metadata
    richness_expr = (
        func.coalesce(case((Artifact.era != None, 1), else_=0), 0) +
        func.coalesce(case((Artifact.category != None, 1), else_=0), 0) +
        func.coalesce(case((Artifact.location != None, 1), else_=0), 0) +
        func.coalesce(case((Artifact.tags != None, 1), else_=0), 0)
    )

    artifacts = (
        db.query(Artifact)
        .order_by(richness_expr.desc(), Artifact.id)
        .offset(offset)
        .limit(limit)
        .all()
    )

    nodes_dict, links_dict = build_graph_from_artifacts(artifacts)

    # Default to ALL node types to show relationships
    default_types = ["artifact", "era", "category", "location", "tag"]
    effective_types = node_types if node_types else default_types

    return _filter_graph_by_types(nodes_dict, links_dict, effective_types)


def search_graph(
    db: Session,
    keyword: str,
    node_types: Optional[List[str]] = None,
    depth: int = 1,
) -> Tuple[List[GraphNode], List[GraphLink], int]:
    """
    搜索图谱节点，返回匹配节点及其多跳邻居构成的子图。

    数据源策略（Neo4j primary）：
    1. Neo4j 基础层优先：搜索 source='rule' 的节点
    2. SQLite fallback：如果 Neo4j 不可用或无数据

    Args:
        db: 数据库会话
        keyword: 搜索关键词
        node_types: 节点类型过滤列表
        depth: 邻居扩展层级（1=一跳，2=两跳）

    Returns:
        (nodes_list, links_list, matched_count) — matched_count 为直接匹配的节点数量
    """
    driver = _get_neo4j_driver()

    # Try Neo4j base layer first (primary)
    if _check_neo4j_has_base_layer(driver):
        nodes, links, matched_count = _search_neo4j_base_layer(
            driver, keyword, node_types=node_types, depth=depth
        )
        if nodes:
            logger.info("search_graph: Neo4j found %d nodes for '%s'", matched_count, keyword)
            return nodes, links, matched_count

    # SQLite fallback
    logger.info("search_graph: falling back to SQLite for '%s' (depth=%d)", keyword, depth)
    default_types = ["artifact", "era", "category", "location", "tag"]
    types = node_types if node_types else default_types

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
        return [], [], 0

    # For multi-hop expansion, load all artifacts
    all_artifacts = db.query(Artifact).all()
    nodes_dict, links_dict = build_graph_from_artifacts(all_artifacts)

    keyword_lower = keyword.lower()

    matched_node_ids: Set[str] = set()
    for nid, node in nodes_dict.items():
        if keyword_lower in node.name.lower():
            matched_node_ids.add(nid)

    matched_count = len(matched_node_ids)

    if not matched_node_ids:
        return _filter_graph_by_types(nodes_dict, links_dict, types), 0

    # Multi-hop neighbor expansion
    result_node_ids: Set[str] = set(matched_node_ids)
    result_links: List[GraphLink] = []
    all_links_list = list(links_dict.values())

    for _ in range(depth):
        new_ids: Set[str] = set()
        for link in all_links_list:
            src_in = link.source in result_node_ids
            tgt_in = link.target in result_node_ids
            if src_in and not tgt_in:
                new_ids.add(link.target)
                result_links.append(link)
            elif tgt_in and not src_in:
                new_ids.add(link.source)
                result_links.append(link)
            elif src_in and tgt_in:
                # Both ends in result, add the link if not already added
                if link not in result_links:
                    result_links.append(link)
        result_node_ids.update(new_ids)

    # Apply type filter
    allowed = set(types)
    filtered_node_ids = {nid for nid in result_node_ids if nid in nodes_dict and nodes_dict[nid].type in allowed}
    filtered_links = [l for l in result_links if l.source in filtered_node_ids and l.target in filtered_node_ids]

    result_nodes = [nodes_dict[nid] for nid in filtered_node_ids if nid in nodes_dict]

    return result_nodes, filtered_links, matched_count


def get_node_detail(
    db: Session,
    node_id: str,
) -> Optional[Tuple[GraphNode, List[GraphLink], List[GraphNode]]]:
    """
    获取单个节点的详情及其直接关系和邻居。

    数据源策略（Neo4j primary）：
    1. Neo4j 基础层优先：查询 source='rule' 的节点
    2. SQLite fallback：如果 Neo4j 不可用或无数据
    """
    # Try Neo4j first
    driver = _get_neo4j_driver()
    if _check_neo4j_has_base_layer(driver):
        result = _get_node_detail_from_neo4j(driver, node_id)
        if result:
            logger.info("get_node_detail: found node '%s' in Neo4j", node_id)
            return result

    # SQLite fallback
    logger.info("get_node_detail: falling back to SQLite for '%s'", node_id)

    # Parse node_id to determine type and value
    # Support both SQLite format (artifact_123) and Neo4j format (artifact:123)
    if node_id.startswith("artifact:") or node_id.startswith("artifact_"):
        try:
            art_id = int(node_id.split(":", 1)[1] if ":" in node_id else node_id.split("_", 1)[1])
        except (ValueError, IndexError):
            return None
        artifacts = db.query(Artifact).filter(Artifact.id == art_id).all()
    elif node_id.startswith("era:") or node_id.startswith("era_"):
        era_val = node_id.split(":", 1)[1] if ":" in node_id else node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.era == era_val).all()
    elif node_id.startswith("category:") or node_id.startswith("cat_"):
        cat_val = node_id.split(":", 1)[1] if ":" in node_id else node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.category == cat_val).all()
    elif node_id.startswith("location:") or node_id.startswith("loc_"):
        loc_val = node_id.split(":", 1)[1] if ":" in node_id else node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.location == loc_val).all()
    elif node_id.startswith("tag:") or node_id.startswith("tag_"):
        tag_val = node_id.split(":", 1)[1] if ":" in node_id else node_id[4:]
        artifacts = db.query(Artifact).filter(Artifact.tags.ilike(f"%{tag_val}%")).all()
    else:
        return None

    nodes_dict, links_dict = build_graph_from_artifacts(artifacts)

    # Convert Neo4j-style ID to SQLite-style if needed
    sqlite_node_id = node_id.replace(":", "_") if ":" in node_id else node_id

    if sqlite_node_id not in nodes_dict:
        return None

    node = nodes_dict[sqlite_node_id]

    related_links: List[GraphLink] = []
    neighbor_ids: Set[str] = set()

    for link in links_dict.values():
        if link.source == sqlite_node_id or link.target == sqlite_node_id:
            related_links.append(link)
            neighbor_ids.add(link.source)
            neighbor_ids.add(link.target)

    neighbor_ids.discard(sqlite_node_id)
    neighbors = [nodes_dict[nid] for nid in neighbor_ids if nid in nodes_dict]

    return node, related_links, neighbors
