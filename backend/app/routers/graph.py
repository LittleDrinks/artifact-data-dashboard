"""知识图谱路由 — 图谱数据查询 API"""

import csv
import io
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.graph import GraphDataResponse, NodeDetailResponse
from app.services import graph as graph_service

router = APIRouter()


@router.get("/full", response_model=GraphDataResponse)
def get_full_graph(
    limit: int = Query(100, ge=1, le=1000, description="返回前 N 个文物的图谱数据"),
    offset: int = Query(0, ge=0, description="偏移量"),
    node_types: Optional[str] = Query(
        "artifact,era,category,location,tag",
        description="逗号分隔的节点类型，如 artifact,era,category,location,tag",
    ),
    db: Session = Depends(get_db),
):
    """获取完整图谱数据（从 SQLite 文物数据动态构建）"""
    types = [t.strip() for t in node_types.split(",") if t.strip()] if node_types else ["artifact"]
    nodes, links = graph_service.get_full_graph(db, limit=limit, offset=offset, node_types=types)
    return GraphDataResponse(
        nodes=nodes,
        links=links,
        total_nodes=len(nodes),
        total_links=len(links),
    )


@router.get("/search", response_model=GraphDataResponse)
def search_graph(
    keyword: str = Query(..., min_length=1, description="搜索关键词"),
    node_types: Optional[str] = Query(
        "artifact,era,category,location,tag",
        description="逗号分隔的节点类型",
    ),
    depth: int = Query(1, ge=1, le=2, description="邻居扩展层级（1=一跳，2=两跳）"),
    db: Session = Depends(get_db),
):
    """搜索图谱节点，返回匹配节点及其多跳邻居构成的子图"""
    types = [t.strip() for t in node_types.split(",") if t.strip()] if node_types else ["artifact"]
    nodes, links, matched_count = graph_service.search_graph(db, keyword=keyword, node_types=types, depth=depth)
    return GraphDataResponse(
        nodes=nodes,
        links=links,
        total_nodes=len(nodes),
        total_links=len(links),
    )


@router.get("/node/{node_id}", response_model=NodeDetailResponse)
def get_node_detail(
    node_id: str,
    db: Session = Depends(get_db),
):
    """获取单个节点的详情和直接关系"""
    result = graph_service.get_node_detail(db, node_id=node_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"节点 '{node_id}' 不存在")
    node, links, neighbors = result
    return NodeDetailResponse(
        node=node,
        links=links,
        neighbors=neighbors,
    )


@router.get("/export")
def export_graph_csv(
    limit: int = Query(500, ge=1, le=1000, description="导出前 N 个文物的图谱数据"),
    db: Session = Depends(get_db),
):
    """导出图谱三元组为 CSV"""
    # Get graph data (default all node types to get all relations)
    nodes, links = graph_service.get_full_graph(db, limit=limit, offset=0, node_types=None)

    # Build a lookup for node names
    node_names = {n.id: n.name for n in nodes}

    # Build CSV content
    output = io.StringIO()
    writer = csv.writer(output)
    # Header row
    writer.writerow(["source_name", "relation", "target_name"])

    # Data rows - each link is a triple
    for link in links:
        src_name = node_names.get(link.source, link.source)
        tgt_name = node_names.get(link.target, link.target)
        writer.writerow([src_name, link.relation, tgt_name])

    # Stream response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=graph_triples_export.csv",
        },
    )
