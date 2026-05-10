"""Artifacts router - CRUD API with pagination, search, filtering, and auth."""

import csv
import io
import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.artifact import (
    ArtifactCreate,
    ArtifactListResponse,
    ArtifactResponse,
    ArtifactUpdate,
)
from app.services import artifact as artifact_service

router = APIRouter()


@router.get("", response_model=ArtifactListResponse)
async def list_artifacts(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页条数"),
    keyword: str | None = Query(None, description="搜索关键词（匹配名称/描述/标签）"),
    category: str | None = Query(None, description="类别筛选"),
    era: str | None = Query(None, description="年代筛选"),
    location: str | None = Query(None, description="出土地点筛选"),
    db: Session = Depends(get_db),
):
    """获取文物列表（分页、搜索、筛选）"""
    artifacts, total = await run_in_threadpool(
        lambda: artifact_service.get_artifacts(
            db,
            page=page,
            page_size=size,
            search=keyword,
            category=category,
            era=era,
            location=location,
        )
    )
    total_pages = math.ceil(total / size) if total > 0 else 0
    return ArtifactListResponse(
        items=artifacts,
        total=total,
        page=page,
        page_size=size,
        total_pages=total_pages,
    )


@router.post("", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
def create_artifact(
    data: ArtifactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建文物（需要认证，name/category/era 必填）"""
    artifact = artifact_service.create_artifact(db, data)
    return artifact


@router.get("/export")
def export_artifacts_csv(
    keyword: str | None = Query(None, description="搜索关键词"),
    category: str | None = Query(None, description="类别筛选"),
    era: str | None = Query(None, description="年代筛选"),
    location: str | None = Query(None, description="出土地点筛选"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出文物列表为 CSV（需要认证）"""
    artifacts, _ = artifact_service.get_artifacts(
        db,
        page=1,
        page_size=10000,
        search=keyword,
        category=category,
        era=era,
        location=location,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    # UTF-8 BOM for Excel compatibility
    output.write("\ufeff")
    writer.writerow(["id", "name", "category", "era", "location", "material", "museum", "tags"])

    for art in artifacts:
        writer.writerow(
            [
                art.id,
                art.name,
                art.category or "",
                art.era or "",
                art.location or "",
                getattr(art, "material", "") or "",
                getattr(art, "museum", "") or "",
                art.tags or "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=artifacts_export.csv",
        },
    )


@router.get("/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(artifact_id: int, db: Session = Depends(get_db)):
    """获取文物详情"""
    artifact = await run_in_threadpool(lambda: artifact_service.get_artifact_by_id(db, artifact_id))
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"文物 ID {artifact_id} 不存在",
        )
    return artifact


@router.put("/{artifact_id}", response_model=ArtifactResponse)
def update_artifact(
    artifact_id: int,
    data: ArtifactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新文物（需要认证）"""
    artifact = artifact_service.update_artifact(db, artifact_id, data)
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"文物 ID {artifact_id} 不存在",
        )
    return artifact


@router.delete("/{artifact_id}")
def delete_artifact(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除文物（需要 admin 角色）"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可以删除文物",
        )
    deleted = artifact_service.delete_artifact(db, artifact_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"文物 ID {artifact_id} 不存在或已被删除",
        )
    return {"success": True, "deleted_id": artifact_id}
