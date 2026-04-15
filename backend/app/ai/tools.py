"""Tool definitions and implementations for ReAct Tool Calling.

Provides two tools for the LLM:
- search_artifacts: keyword / era / category search against SQLite
- get_artifact_detail: fetch a single artifact by ID
"""

import json
import logging
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.artifact import Artifact

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
                        "description": "返回数量上限，默认10",
                        "default": 10,
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
    era: Optional[str] = args.get("era")
    category: Optional[str] = args.get("category")
    location: Optional[str] = args.get("location")
    limit: int = min(int(args.get("limit", 10)), 50)

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
        items.append({
            "id": a.id,
            "name": a.name,
            "snippet": snippet,
            "category": a.category,
            "era": a.era,
            "location": a.location,
        })

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
