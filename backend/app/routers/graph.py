"""知识图谱路由 — 图谱数据查询 API"""

import asyncio
import csv
import io
import logging
import threading
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from neo4j import GraphDatabase
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas.graph import (
    GraphDataResponse, NodeDetailResponse, ImportResponse,
    ExtractRequest, ExtractResponse, ExtractedEntity, ExtractedRelation,
    KnowledgeQueryRequest, KnowledgeQueryResponse,
)
from app.services import graph as graph_service
from app.ai.lightrag_service import get_lightrag_service

logger = logging.getLogger(__name__)
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
    """导出图谱三元组为 CSV（Neo4j primary, SQLite fallback）

    CSV 格式：
    source_name,relation,target_name,source_type,target_type
    """
    # Get graph data (default all node types)
    nodes, links = graph_service.get_full_graph(db, limit=limit, offset=0, node_types=None)

    # Build lookup for node names and types
    node_info = {n.id: (n.name, n.type) for n in nodes}

    # Build CSV content
    output = io.StringIO()
    writer = csv.writer(output)
    # Header row with types
    writer.writerow(["source_name", "relation", "target_name", "source_type", "target_type"])

    # Data rows - each link is a triple
    for link in links:
        src_name, src_type = node_info.get(link.source, (link.source, "unknown"))
        tgt_name, tgt_type = node_info.get(link.target, (link.target, "unknown"))
        writer.writerow([src_name, link.relation, tgt_name, src_type, tgt_type])

    # Stream response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=graph_triples_export.csv",
        },
    )


@router.post("/import", response_model=ImportResponse)
async def import_graph_csv(
    file: UploadFile = File(..., description="CSV file with triples"),
):
    """导入图谱三元组 CSV 到 Neo4j

    CSV 格式要求（与导出格式一致）：
    source_name,relation,target_name,source_type,target_type

    所有导入的三元组会添加 source='csv_import' 属性。
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="请上传 CSV 文件")

    # Read CSV content
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("gbk")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="CSV 文件编码必须是 UTF-8 或 GBK")

    # Parse CSV
    reader = csv.DictReader(io.StringIO(text))

    # Validate header
    required_cols = ["source_name", "relation", "target_name"]
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV 文件无标题行")

    missing_cols = [c for c in required_cols if c not in reader.fieldnames]
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"CSV 缺少必需列: {', '.join(missing_cols)}"
        )

    # Collect triples
    triples = []
    errors: List[str] = []
    row_num = 1

    for row in reader:
        row_num += 1
        src_name = row.get("source_name", "").strip()
        relation = row.get("relation", "").strip()
        tgt_name = row.get("target_name", "").strip()
        src_type = row.get("source_type", "unknown").strip()
        tgt_type = row.get("target_type", "unknown").strip()

        if not src_name or not relation or not tgt_name:
            errors.append(f"行 {row_num}: 缺少必需字段")
            continue

        triples.append({
            "source_name": src_name,
            "relation": relation,
            "target_name": tgt_name,
            "source_type": src_type,
            "target_type": tgt_type,
        })

    if not triples:
        return ImportResponse(
            success=False,
            nodes_imported=0,
            relations_imported=0,
            message="CSV 无有效三元组数据",
            errors=errors,
        )

    # Import to Neo4j
    try:
        driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )

        nodes_imported = 0
        relations_imported = 0

        def sanitize_label(label: str) -> str:
            """Sanitize Neo4j label to prevent Cypher injection."""
            # Only allow alphanumeric and underscore characters
            import re
            sanitized = re.sub(r"[^a-zA-Z0-9_]", "", label)
            return sanitized if sanitized else "Unknown"

        with driver.session() as session:
            # Batch import nodes and relations
            for triple in triples:
                # Generate IDs from name and type
                src_type_sanitized = sanitize_label(triple["source_type"])
                tgt_type_sanitized = sanitize_label(triple["target_type"])
                src_id = f"{src_type_sanitized}:{triple['source_name']}"
                tgt_id = f"{tgt_type_sanitized}:{triple['target_name']}"

                # MERGE source node (use sanitized label)
                session.run(
                    f"""
                    MERGE (n:`{src_type_sanitized}` {{id: $id}})
                    SET n.name = $name
                    SET n.source = 'csv_import'
                    """,
                    id=src_id,
                    name=triple["source_name"],
                )
                nodes_imported += 1

                # MERGE target node
                session.run(
                    f"""
                    MERGE (n:`{tgt_type_sanitized}` {{id: $id}})
                    SET n.name = $name
                    SET n.source = 'csv_import'
                    """,
                    id=tgt_id,
                    name=triple["target_name"],
                )
                nodes_imported += 1

                # MERGE relationship (sanitize relation type)
                rel_type_sanitized = sanitize_label(triple["relation"].replace(" ", "_").replace("-", "_"))
                session.run(
                    f"""
                    MATCH (s:`{src_type_sanitized}` {{id: $src_id}})
                    MATCH (t:`{tgt_type_sanitized}` {{id: $tgt_id}})
                    MERGE (s)-[r:`{rel_type_sanitized}`]->(t)
                    SET r.source = 'csv_import'
                    """,
                    src_id=src_id,
                    tgt_id=tgt_id,
                )
                relations_imported += 1

        driver.close()

        return ImportResponse(
            success=True,
            nodes_imported=nodes_imported,
            relations_imported=relations_imported,
            message=f"成功导入 {len(triples)} 条三元组",
            errors=errors if errors else None,
        )

    except Exception as e:
        logger.exception("Neo4j import failed")
        raise HTTPException(
            status_code=500,
            detail=f"Neo4j 导入失败: {str(e)}"
        )


@router.post("/extract", response_model=ExtractResponse)
def extract_triples(
    request: ExtractRequest,
):
    """LightRAG 增量提取 API — 从文本中提取实体和关系并存入 Neo4j

    流程：
    1. 初始化 LightRAG 服务
    2. 调用 rag.ainsert(text) 进行提取
    3. 查询 Neo4j 获取新提取的实体和关系
    4. 返回结构化结果

    超时：120 秒
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="文本内容不能为空")

    # Get LightRAG service
    rag_service = get_lightrag_service()
    if rag_service is None:
        raise HTTPException(
            status_code=503,
            detail="LightRAG 服务不可用 — 请检查 LIGHTRAG_API_KEY 是否配置"
        )

    # Run LightRAG insert in background thread with timeout
    result_container = {"success": False, "error": None}
    thread_started = threading.Event()
    thread_completed = threading.Event()

    def run_insert():
        try:
            thread_started.set()
            asyncio.run(rag_service.ainsert([request.text]))
            result_container["success"] = True
        except Exception as e:
            result_container["error"] = str(e)
        thread_completed.set()

    insert_thread = threading.Thread(target=run_insert)
    insert_thread.start()

    # Wait for thread to start (gives us confidence it's running)
    thread_started.wait(timeout=5)

    # Wait for completion with timeout
    if not thread_completed.wait(timeout=120):
        # Timeout
        raise HTTPException(
            status_code=504,
            detail="LightRAG 提取超时（120秒）— 文本可能过长"
        )

    if not result_container["success"]:
        error_msg = result_container["error"] or "未知错误"
        raise HTTPException(
            status_code=500,
            detail=f"LightRAG 提取失败: {error_msg}"
        )

    # Query Neo4j for newly added entities (LightRAG stores with entity_name property)
    try:
        driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )

        entities: List[ExtractedEntity] = []
        relations: List[ExtractedRelation] = []

        with driver.session() as session:
            # Query entities (LightRAG uses entity_name, entity_type properties)
            entity_query = """
                MATCH (e)
                WHERE e.entity_name IS NOT NULL AND e.entity_type IS NOT NULL
                AND (e.source IS NULL OR NOT e.source IN ['rule', 'csv_import'])
                RETURN e.entity_name AS name, e.entity_type AS type, e.description AS desc
                ORDER BY e.entity_name
                LIMIT 100
            """
            entity_result = session.run(entity_query)
            for record in entity_result:
                entities.append(ExtractedEntity(
                    entity_name=record.get("name", ""),
                    entity_type=record.get("type", "unknown"),
                    description=record.get("desc"),
                ))

            # Query relations (LightRAG stores relations between entity_name nodes)
            rel_query = """
                MATCH (a)-[r]->(b)
                WHERE a.entity_name IS NOT NULL AND b.entity_name IS NOT NULL
                AND (r.source IS NULL OR NOT r.source IN ['rule', 'csv_import'])
                RETURN a.entity_name AS src, b.entity_name AS tgt, type(r) AS rel
                ORDER BY a.entity_name
                LIMIT 100
            """
            rel_result = session.run(rel_query)
            for record in rel_result:
                relations.append(ExtractedRelation(
                    src_name=record.get("src", ""),
                    tgt_name=record.get("tgt", ""),
                    relation=record.get("rel", "related"),
                ))

        driver.close()

        return ExtractResponse(
            success=True,
            entities=entities,
            relations=relations,
            count=len(entities) + len(relations),
            message=f"提取完成，获得 {len(entities)} 个实体和 {len(relations)} 个关系",
        )

    except Exception as e:
        logger.warning("Neo4j query for extracted entities failed: %s", e)
        # LightRAG insert succeeded, but Neo4j query failed
        return ExtractResponse(
            success=True,
            entities=[],
            relations=[],
            count=0,
            message=f"LightRAG 提取成功，但无法从 Neo4j 查询结果: {str(e)}",
        )


@router.post("/knowledge-query", response_model=KnowledgeQueryResponse)
def knowledge_query(
    request: KnowledgeQueryRequest,
):
    """知识查询 API — 查询 LightRAG 知识库，验证用户添加的数据可检索。

    Demo flow:
    1. 用户添加文本 → extract → 存入知识库
    2. 用户提问 → knowledge-query → 返回基于新增知识的答案

    超时：60 秒
    """
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")

    # Get LightRAG service
    rag_service = get_lightrag_service()
    if rag_service is None:
        raise HTTPException(
            status_code=503,
            detail="LightRAG 服务不可用 — 请检查 LIGHTRAG_API_KEY 是否配置"
        )

    # Run LightRAG query in background thread with timeout
    result_container = {"answer": "", "error": None}
    thread_started = threading.Event()
    thread_completed = threading.Event()

    def run_query():
        try:
            thread_started.set()
            answer = asyncio.run(rag_service.aquery(request.question))
            result_container["answer"] = answer
        except Exception as e:
            result_container["error"] = str(e)
        thread_completed.set()

    query_thread = threading.Thread(target=run_query)
    query_thread.start()

    # Wait for thread to start
    thread_started.wait(timeout=5)

    # Wait for completion with timeout
    if not thread_completed.wait(timeout=60):
        raise HTTPException(
            status_code=504,
            detail="知识查询超时（60秒）"
        )

    if result_container["error"]:
        logger.warning("LightRAG query failed: %s", result_container["error"])
        # Return graceful fallback instead of error
        return KnowledgeQueryResponse(
            success=True,
            answer="",
            source="lightrag",
            message=f"查询失败: {result_container['error']}",
        )

    return KnowledgeQueryResponse(
        success=True,
        answer=result_container["answer"],
        source="lightrag",
    )
