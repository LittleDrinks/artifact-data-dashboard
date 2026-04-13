"""Artifact service - handles CRUD operations for artifacts."""

import math
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.schemas.artifact import ArtifactCreate, ArtifactUpdate


def get_artifacts(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    category: Optional[str] = None,
    era: Optional[str] = None,
    location: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[Artifact], int]:
    """
    Get a paginated, filtered list of artifacts.

    Returns (artifacts_list, total_count).
    """
    query = db.query(Artifact)

    # Apply filters
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Artifact.name.ilike(search_term),
                Artifact.description.ilike(search_term),
                Artifact.tags.ilike(search_term),
            )
        )
    if category:
        query = query.filter(Artifact.category == category)
    if era:
        query = query.filter(Artifact.era == era)
    if location:
        loc_term = f"%{location}%"
        query = query.filter(Artifact.location.ilike(loc_term))

    # Count before pagination
    total = query.count()

    # Apply sorting
    sort_column = getattr(Artifact, sort_by, Artifact.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # Paginate
    offset = (page - 1) * page_size
    artifacts = query.offset(offset).limit(page_size).all()

    return artifacts, total


def get_artifact_by_id(db: Session, artifact_id: int) -> Artifact | None:
    """Get a single artifact by ID."""
    return db.query(Artifact).filter(Artifact.id == artifact_id).first()


def create_artifact(db: Session, data: ArtifactCreate) -> Artifact:
    """Create a new artifact."""
    artifact = Artifact(**data.model_dump())
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def update_artifact(db: Session, artifact_id: int, data: ArtifactUpdate) -> Artifact | None:
    """Update an existing artifact. Returns None if not found."""
    artifact = get_artifact_by_id(db, artifact_id)
    if not artifact:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(artifact, key, value)

    db.commit()
    db.refresh(artifact)
    return artifact


def delete_artifact(db: Session, artifact_id: int) -> bool:
    """Delete an artifact. Returns True if deleted, False if not found."""
    artifact = get_artifact_by_id(db, artifact_id)
    if not artifact:
        return False

    db.delete(artifact)
    db.commit()
    return True


def get_distinct_values(db: Session, field: str) -> list[str]:
    """Get distinct non-empty values for a given field (for filter dropdowns)."""
    column = getattr(Artifact, field, None)
    if column is None:
        return []
    results = db.query(column).filter(column.isnot(None), column != "").distinct().all()
    return [r[0] for r in results if r[0]]
