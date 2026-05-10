"""Statistics router - overview, era/category/location stats, word cloud."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stats import (
    CategoryStat,
    EraStat,
    LocationStat,
    OverviewStats,
    WordCloudItem,
)
from app.services import stats as stats_service

router = APIRouter()


@router.get("/overview", response_model=OverviewStats)
def get_overview(db: Session = Depends(get_db)):
    """获取 Dashboard 概览统计。"""
    return stats_service.get_overview_stats(db)


@router.get("/by-era", response_model=list[EraStat])
def get_by_era(db: Session = Depends(get_db)):
    """按朝代统计文物数量分布。"""
    return stats_service.get_era_stats(db)


@router.get("/by-category", response_model=list[CategoryStat])
def get_by_category(db: Session = Depends(get_db)):
    """按类别统计文物数量分布。"""
    return stats_service.get_category_stats(db)


@router.get("/by-location", response_model=list[LocationStat])
def get_by_location(db: Session = Depends(get_db)):
    """按出土地点统计文物数量分布。"""
    return stats_service.get_location_stats(db)


@router.get("/wordcloud", response_model=list[WordCloudItem])
def get_wordcloud(
    limit: int = Query(100, ge=10, le=500, description="返回关键词数量"),
    db: Session = Depends(get_db),
):
    """获取词云数据（基于 jieba 分词）。"""
    return stats_service.get_wordcloud_data(db, limit=limit)
