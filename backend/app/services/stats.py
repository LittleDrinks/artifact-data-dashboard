"""Statistics service - dashboard overview, era/category stats, word cloud."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.schemas.stats import OverviewStats, EraStat, CategoryStat, WordCloudItem


def get_overview_stats(db: Session) -> OverviewStats:
    """Get dashboard overview statistics."""
    total = db.query(func.count(Artifact.id)).scalar() or 0
    total_categories = db.query(func.count(func.distinct(Artifact.category))).filter(
        Artifact.category.isnot(None), Artifact.category != ""
    ).scalar() or 0
    total_eras = db.query(func.count(func.distinct(Artifact.era))).filter(
        Artifact.era.isnot(None), Artifact.era != ""
    ).scalar() or 0
    total_locations = db.query(func.count(func.distinct(Artifact.location))).filter(
        Artifact.location.isnot(None), Artifact.location != ""
    ).scalar() or 0

    return OverviewStats(
        total_artifacts=total,
        total_categories=total_categories,
        total_eras=total_eras,
        total_locations=total_locations,
    )


def get_era_stats(db: Session) -> list[EraStat]:
    """Get artifact counts grouped by era."""
    results = (
        db.query(Artifact.era, func.count(Artifact.id))
        .filter(Artifact.era.isnot(None), Artifact.era != "")
        .group_by(Artifact.era)
        .order_by(func.count(Artifact.id).desc())
        .all()
    )
    return [EraStat(era=r[0], count=r[1]) for r in results]


def get_category_stats(db: Session) -> list[CategoryStat]:
    """Get artifact counts grouped by category."""
    results = (
        db.query(Artifact.category, func.count(Artifact.id))
        .filter(Artifact.category.isnot(None), Artifact.category != "")
        .group_by(Artifact.category)
        .order_by(func.count(Artifact.id).desc())
        .all()
    )
    return [CategoryStat(category=r[0], count=r[1]) for r in results]


def get_wordcloud_data(db: Session, limit: int = 100) -> list[WordCloudItem]:
    """
    Generate word cloud data from artifact descriptions and tags.
    Uses simple frequency counting (jieba integration can be added later).
    """
    import re
    from collections import Counter

    artifacts = db.query(Artifact.tags, Artifact.description).filter(
        or_condition := (
            (Artifact.tags.isnot(None) & (Artifact.tags != ""))
            | (Artifact.description.isnot(None) & (Artifact.description != ""))
        )
    ).all()

    word_counter: Counter = Counter()

    for tags_str, desc_str in artifacts:
        # Count from tags
        if tags_str:
            for tag in tags_str.split(","):
                tag = tag.strip()
                if tag and len(tag) >= 2:
                    word_counter[tag] += 1

        # Count from description - simple character n-gram approach
        if desc_str:
            # Extract meaningful terms (2-4 char Chinese words)
            chinese_words = re.findall(r'[\u4e00-\u9fff]{2,4}', desc_str)
            for word in chinese_words:
                if len(word) >= 2:
                    word_counter[word] += 1

    # Return top N
    return [WordCloudItem(word=w, weight=c) for w, c in word_counter.most_common(limit)]
