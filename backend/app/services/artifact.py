"""Artifact service - handles CRUD operations for artifacts."""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.schemas.artifact import ArtifactCreate, ArtifactUpdate
from app.services.stats import JUNK_CATEGORIES, clear_stats_cache


def _normalize_category_for_query(category: str) -> str:
    """Normalize category for query matching: title case + strip."""
    return category.strip().title()


def get_artifacts(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    category: str | None = None,
    era: str | None = None,
    location: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    exclude_junk: bool = True,
) -> tuple[list[Artifact], int]:
    """
    Get a paginated, filtered list of artifacts.

    Returns (artifacts_list, total_count).
    """
    query = db.query(Artifact)

    # Exclude junk/maintenance categories by default
    if exclude_junk:
        query = query.filter(
            or_(
                Artifact.category.is_(None),
                Artifact.category == "",
                Artifact.category.notin_(JUNK_CATEGORIES),
            )
        )

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
        # Normalize category for matching: use exact match with title-cased value
        normalized_cat = _normalize_category_for_query(category)
        query = query.filter(Artifact.category == normalized_cat)
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
    clear_stats_cache()
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
    clear_stats_cache()
    return artifact


def delete_artifact(db: Session, artifact_id: int) -> bool:
    """Delete an artifact. Returns True if deleted, False if not found."""
    artifact = get_artifact_by_id(db, artifact_id)
    if not artifact:
        return False

    db.delete(artifact)
    db.commit()
    clear_stats_cache()
    return True


def get_distinct_values(db: Session, field: str) -> list[str]:
    """Get distinct non-empty values for a given field (for filter dropdowns)."""
    column = getattr(Artifact, field, None)
    if column is None:
        return []
    query = db.query(column).filter(column.isnot(None), column != "")
    if field == "category":
        query = query.filter(column.notin_(JUNK_CATEGORIES))
    results = query.distinct().all()
    return [r[0] for r in results if r[0]]
