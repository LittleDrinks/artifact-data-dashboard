"""Tool definitions and implementations for ReAct Tool Calling.

Provides three tools for the LLM:
- search_artifacts: keyword / era / category search against SQLite
- get_artifact_detail: fetch a single artifact by ID
- query_knowledge_graph: semantic entity search via Neo4j
"""

import logging
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.services import graph as graph_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenAI-compatible tool schemas (sent to the LLM)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_artifacts",
            "description": (
                "搜索文物数据库。支持按关键词、朝代、类别等条件筛选。"
                "当用户询问文物相关信息时，使用此工具查找匹配的文物记录。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "搜索关键词，如文物名称或相关描述词汇",
                    },
                    "era": {
                        "type": "string",
                        "description": "朝代筛选，如'商'、'唐'、'宋'、'明'",
                    },
                    "category": {
                        "type": "string",
                        "description": "类别筛选，如'青铜器'、'陶瓷'、'玉器'",
                    },
                    "location": {
                        "type": "string",
                        "description": "出土地点筛选，如'河南'、'陕西'",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量上限，默认20",
                        "default": 20,
                    },
                },
                "required": ["keyword"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_artifact_detail",
            "description": (
                "获取指定文物的完整详细信息。"
                "当用户询问某件具体文物的详情时，先用 search_artifacts 找到 ID，再用此工具获取完整信息。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "artifact_id": {
                        "type": "integer",
                        "description": "文物 ID",
                    },
                },
                "required": ["artifact_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_knowledge_graph",
            "description": (
                "查询知识图谱中的语义实体和关系。"
                "当用户询问概念性的知识（如'青铜器有什么特点'、'商代有哪些重要文物'）时，"
                "使用此工具获取图谱中的实体关系信息，比结构化文物数据更适合回答概念性问题。"
                "支持按朝代、类别筛选，返回相关实体及其关联关系。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "搜索关键词，用于匹配图谱中的实体名称",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量上限，默认20",
                        "default": 20,
                    },
                    "era": {
                        "type": "string",
                        "description": "朝代筛选，如'商'、'唐'、'宋'、'明'",
                    },
                    "category": {
                        "type": "string",
                        "description": "类别筛选，如'青铜器'、'陶瓷'、'玉器'",
                    },
                },
                "required": ["keyword"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Tool dispatch
# ---------------------------------------------------------------------------


def execute_tool(name: str, arguments: dict[str, Any], db: Session) -> dict[str, Any]:
    """Route a tool call to the appropriate handler.

    Returns a dict with at least ``result`` key. On error returns ``{error: ...}``.
    """
    try:
        if name == "search_artifacts":
            return _tool_search_artifacts(db, arguments)
        elif name == "get_artifact_detail":
            return _tool_get_artifact_detail(db, arguments)
        elif name == "query_knowledge_graph":
            return _tool_query_knowledge_graph(arguments, db)
        else:
            return {"error": f"Unknown tool: {name}"}
    except Exception as exc:
        logger.exception("Tool %s execution failed", name)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# search_artifacts implementation
# ---------------------------------------------------------------------------


def _tool_search_artifacts(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    keyword: str = args.get("keyword", "")
    era: str | None = args.get("era")
    category: str | None = args.get("category")
    location: str | None = args.get("location")
    limit: int = min(int(args.get("limit", 20)), 50)

    if not keyword:
        return {"results": [], "count": 0}

    query = db.query(Artifact)

    # --- keyword filter (ILIKE on name / description / tags) ---
    search_term = f"%{keyword}%"
    keyword_filter = or_(
        Artifact.name.ilike(search_term),
        Artifact.description.ilike(search_term),
        Artifact.tags.ilike(search_term),
    )
    query = query.filter(keyword_filter)

    # --- optional filters (AND) ---
    if era:
        query = query.filter(Artifact.era.ilike(f"%{era}%"))
    if category:
        query = query.filter(Artifact.category.ilike(f"%{category}%"))
    if location:
        query = query.filter(Artifact.location.ilike(f"%{location}%"))

    results = query.limit(limit).all()

    # --- relevance sort: exact match > prefix > contains ---
    def _relevance_score(artifact: Artifact) -> int:
        name_lower = (artifact.name or "").lower()
        kw_lower = keyword.lower()
        if name_lower == kw_lower:
            return 0  # exact
        if name_lower.startswith(kw_lower):
            return 1  # prefix
        if kw_lower in name_lower:
            return 2  # contains in name
        return 3  # only in desc/tags

    results.sort(key=_relevance_score)

    items = []
    for a in results:
        snippet = _build_snippet(a, keyword)
        items.append(
            {
                "id": a.id,
                "name": a.name,
                "snippet": snippet,
                "category": a.category,
                "era": a.era,
                "location": a.location,
            }
        )

    return {"results": items, "count": len(items)}


# ---------------------------------------------------------------------------
# get_artifact_detail implementation
# ---------------------------------------------------------------------------


def _tool_get_artifact_detail(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    artifact_id = args.get("artifact_id")
    if artifact_id is None:
        return {"error": "artifact_id is required"}

    a = db.query(Artifact).filter(Artifact.id == int(artifact_id)).first()
    if a is None:
        return {"error": f"未找到 ID={artifact_id} 的文物"}

    return {
        "id": a.id,
        "name": a.name,
        "description": a.description,
        "category": a.category,
        "era": a.era,
        "location": a.location,
        "image_url": a.image_url,
        "tags": a.tags,
    }


# ---------------------------------------------------------------------------
# query_knowledge_graph implementation
# ---------------------------------------------------------------------------


def _tool_query_knowledge_graph(args: dict[str, Any], db: Session) -> dict[str, Any]:
    """Query knowledge graph for semantic entities and relations.

    Strategy: try Neo4j first; if unavailable, fall back to SQLite-based
    graph service (same data that powers the /graph page).
    """
    keyword: str = args.get("keyword", "")
    limit: int = min(int(args.get("limit", 20)), 50)
    era: str | None = args.get("era")
    category: str | None = args.get("category")

    if not keyword:
        return {"entities": [], "relations": [], "count": 0, "source": "none"}

    # --- Try Neo4j first ---
    driver = graph_service._get_neo4j_driver()
    if graph_service._check_neo4j_has_data(driver):
        try:
            nodes, links = graph_service._query_neo4j_entities(driver, limit=limit, keyword=keyword)
            entities = [
                {
                    "name": n.name,
                    "type": n.type,
                    "description": (n.properties or {}).get("description", ""),
                }
                for n in nodes
            ]
            relations = [
                {
                    "source": l.source.replace("neo4j_", ""),
                    "target": l.target.replace("neo4j_", ""),
                    "relation": l.relation,
                }
                for l in links
            ]
            return {
                "entities": entities,
                "relations": relations,
                "count": len(entities),
                "source": "neo4j",
            }
        except Exception as exc:
            logger.warning("Neo4j query failed, falling back to SQLite: %s", str(exc)[:200])

    # --- SQLite fallback: use graph_service.search_graph ---
    try:
        # If era/category filters provided, incorporate into keyword for better matching
        search_keyword = keyword
        if era and era not in keyword:
            search_keyword = (
                keyword  # Keep original keyword; era/category are handled by graph structure
            )
        if category and category not in keyword:
            search_keyword = keyword

        # First try searching by the main keyword
        nodes, links, matched_count = graph_service.search_graph(
            db,
            keyword=search_keyword,
            node_types=["artifact", "era", "category", "location", "tag"],
            depth=1,
        )

        # If era/category filters provided, also search by those to expand the subgraph
        if era and era not in search_keyword:
            era_nodes, era_links, _ = graph_service.search_graph(
                db, keyword=era, node_types=["era", "artifact"], depth=1
            )
            # Merge: only keep nodes that appear in both result sets (intersection via links)
            existing_ids = {n.id for n in nodes}
            existing_links_set = {(l.source, l.target) for l in links}
            for n in era_nodes:
                if n.id not in existing_ids:
                    # Only add if connected to existing nodes
                    for l in era_links:
                        if (l.source == n.id and l.target in existing_ids) or (
                            l.target == n.id and l.source in existing_ids
                        ):
                            nodes.append(n)
                            existing_ids.add(n.id)
                            break
            for l in era_links:
                if (
                    (l.source, l.target) not in existing_links_set
                    and l.source in existing_ids
                    and l.target in existing_ids
                ):
                    links.append(l)
                    existing_links_set.add((l.source, l.target))

        if category and category not in search_keyword:
            cat_nodes, cat_links, _ = graph_service.search_graph(
                db, keyword=category, node_types=["category", "artifact"], depth=1
            )
            existing_ids = {n.id for n in nodes}
            existing_links_set = {(l.source, l.target) for l in links}
            for n in cat_nodes:
                if n.id not in existing_ids:
                    for l in cat_links:
                        if (l.source == n.id and l.target in existing_ids) or (
                            l.target == n.id and l.source in existing_ids
                        ):
                            nodes.append(n)
                            existing_ids.add(n.id)
                            break
            for l in cat_links:
                if (
                    (l.source, l.target) not in existing_links_set
                    and l.source in existing_ids
                    and l.target in existing_ids
                ):
                    links.append(l)
                    existing_links_set.add((l.source, l.target))

        # Build name lookup for human-readable relations
        node_name_map = {n.id: n.name for n in nodes}

        # Type labels for Chinese display
        type_labels = {
            "artifact": "文物",
            "era": "朝代",
            "category": "类别",
            "location": "地点",
            "tag": "标签",
        }

        # Build entity list with type labels and descriptions from node properties
        entities = []
        for n in nodes[:limit]:
            desc = (n.properties or {}).get("description", "")
            type_label = type_labels.get(n.type, n.type)
            entity_info = {"name": n.name, "type": type_label}
            if desc:
                entity_info["description"] = desc
            entities.append(entity_info)

        # Build relation list with human-readable names
        relations = []
        for l in links:
            src_name = node_name_map.get(l.source, l.source)
            tgt_name = node_name_map.get(l.target, l.target)
            relations.append(
                {
                    "source": src_name,
                    "target": tgt_name,
                    "relation": l.relation,
                }
            )

        # Build a text summary for the LLM to easily understand the data
        summary_parts = []
        # Group artifacts
        artifact_names = [n.name for n in nodes if n.type == "artifact"][:15]
        era_names = [n.name for n in nodes if n.type == "era"]
        cat_names = [n.name for n in nodes if n.type == "category"]
        loc_names = [n.name for n in nodes if n.type == "location"]
        tag_names = [n.name for n in nodes if n.type == "tag"][:10]

        if artifact_names:
            summary_parts.append(
                f"相关文物（{len(artifact_names)}件）：{'、'.join(artifact_names)}"
            )
        if era_names:
            summary_parts.append(f"涉及朝代：{'、'.join(era_names)}")
        if cat_names:
            summary_parts.append(f"所属类别：{'、'.join(cat_names)}")
        if loc_names:
            summary_parts.append(f"出土地点：{'、'.join(loc_names)}")
        if tag_names:
            summary_parts.append(f"关联标签：{'、'.join(tag_names)}")

        # Group relations by type for readability
        rel_groups: dict[str, list[str]] = {}
        for r in relations:
            key = r["relation"]
            rel_groups.setdefault(key, []).append(f"{r['source']} → {r['target']}")

        summary_text = "\n".join(summary_parts)
        if rel_groups:
            summary_text += "\n\n关系摘要："
            for rel_type, examples in rel_groups.items():
                # Show at most 5 examples per relation type
                shown = examples[:5]
                remaining = len(examples) - len(shown)
                summary_text += f"\n  · {rel_type}（{len(examples)}条）：{'; '.join(shown)}"
                if remaining > 0:
                    summary_text += f" 等{remaining}条"

        return {
            "entities": entities,
            "relations": relations,
            "count": len(entities),
            "source": "sqlite",
            "summary": summary_text,
        }
    except Exception as exc:
        logger.error("SQLite graph search also failed: %s", str(exc)[:200])
        return {
            "entities": [],
            "relations": [],
            "count": 0,
            "source": "none",
            "message": "知识图谱查询失败",
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_snippet(artifact: Artifact, keyword: str, max_len: int = 120) -> str:
    """Return a short text snippet from the artifact description, centred on the keyword."""
    desc = artifact.description
    if not desc:
        return "暂无描述"

    lower_desc = desc.lower()
    lower_kw = keyword.lower()
    pos = lower_desc.find(lower_kw)
    if pos >= 0:
        start = max(0, pos - 30)
        end = min(len(desc), pos + len(keyword) + 60)
        snippet = desc[start:end]
        if start > 0:
            snippet = "..." + snippet
        if end < len(desc):
            snippet = snippet + "..."
        return snippet

    # keyword not in description — return head
    if len(desc) > max_len:
        return desc[:max_len] + "..."
    return desc
