"""Statistics service - dashboard overview, era/category/location stats, word cloud."""

import time
from collections import Counter
from typing import List, Optional

import jieba
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.schemas.stats import (
    OverviewStats,
    EraStat,
    CategoryStat,
    LocationStat,
    WordCloudItem,
)

# 中文停用词表（常见虚词、代词、介词 + 文物领域无意义词）
STOP_WORDS = set(
    "的 了 在 是 我 有 和 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 "
    "这 他 她 它 们 那 里 为 以 对 中 与 从 来 而 个 大 小 多 少 年 月 日 时 分 秒 "
    "可 这个 那个 这些 那些 可以 因为 所以 如果 但是 然而 或者 以及 其他 还有 "
    "之 其 于 等 被 把 将 向 给 让 用 通过 根据 按照 由于 关于 对于 其中 以及 "
    "所 该 各 本 此 每 某 任 何 些 什么 怎么 哪 谁 几 多少 怎样 "
    # 文物领域无意义词
    "一种 年代 时期 时代 世纪 前后 左右 约为 部分 具有 属于 目前 已知 现存 "
    "发现 出土 收藏 现藏 现藏于 馆藏 保存 完整 不同 重要 著名 代表 典型 主要 "
    "古代 传统 中国 国家 级别 以上 以下 没有 无法 未知 不详 "
    # 度量单位
    "厘米 毫米 米 公分 尺 寸 高度 长度 直径 厚度 宽度 "
    # 通用动词（孤立无意义）
    "使用 利用 制作 雕刻 铸造 烧制 绘制 成为 开始 进行 发行 流通 描绘 作为 包括 "
    # 通用名词（孤立无意义）
    "特点 特征 风格 技术 工艺 方法 类型 彏式 材料 用途 "
    # Wiki/法律术语残留
    "引用 参考 来源 注释 图像 图片 目录 条例 实施 发布 公布 列为 "
    "禁止 出境 出国 中华人民共和国 文物保护法 国家文物局 禁止出境展览文物 "
    "境外 法律法规 法规 涵盖 修订 根据上述 "
    # 博物馆展示相关（太通用）
    "博物馆 博物院 展览 国家一级 国家博物馆 上海博物馆 "
    # 批次编号
    "第一批 第二批 第三批 "
    # 通用描述词
    "位于 又称 称为 认为 可能 所有 之一 一件 一幅 年间 之前 晚期 早期 "
    "单位 作品 内容 历史 文化 艺术 人物 变化 "
    # 数量描述词
    "一座 九座 大型 重点 依据 几次 及其 有所 "
    # 其他高频无意义词
    "所有 全国 最早 历史 内容 作品 人物 艺术 文化 变化 得名 或称 参加 珍贵文物 国立 铸行 银行 纸币 "
    .split()
)

# ── TTL Cache (60s) ──
_cache: dict = {}
_CACHE_TTL = 60  # seconds


def _get_cached(key: str):
    """Return cached value if still fresh, else None."""
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < _CACHE_TTL:
        return entry["value"]
    return None


def _set_cached(key: str, value) -> None:
    _cache[key] = {"value": value, "ts": time.time()}


def clear_stats_cache() -> None:
    """Clear all cached stats entries. Call after artifact mutations."""
    _cache.clear()


def get_overview_stats(db: Session) -> OverviewStats:
    """获取 Dashboard 概览统计。"""
    cached = _get_cached("overview")
    if cached is not None:
        return cached

    total = db.query(func.count(Artifact.id)).scalar() or 0
    total_categories = (
        db.query(func.count(func.distinct(Artifact.category)))
        .filter(Artifact.category.isnot(None), Artifact.category != "")
        .scalar()
        or 0
    )
    total_eras = (
        db.query(func.count(func.distinct(Artifact.era)))
        .filter(Artifact.era.isnot(None), Artifact.era != "")
        .scalar()
        or 0
    )
    total_locations = (
        db.query(func.count(func.distinct(Artifact.location)))
        .filter(Artifact.location.isnot(None), Artifact.location != "")
        .scalar()
        or 0
    )

    result = OverviewStats(
        total_artifacts=total,
        total_categories=total_categories,
        total_eras=total_eras,
        total_locations=total_locations,
    )
    _set_cached("overview", result)
    return result


def get_era_stats(db: Session) -> List[EraStat]:
    """按朝代统计文物数量分布。"""
    cached = _get_cached("era")
    if cached is not None:
        return cached

    results = (
        db.query(Artifact.era, func.count(Artifact.id))
        .filter(Artifact.era.isnot(None), Artifact.era != "")
        .group_by(Artifact.era)
        .order_by(func.count(Artifact.id).desc())
        .all()
    )
    value = [EraStat(era=r[0], count=r[1]) for r in results]
    _set_cached("era", value)
    return value


def get_category_stats(db: Session) -> List[CategoryStat]:
    """按类别统计文物数量分布。"""
    cached = _get_cached("category")
    if cached is not None:
        return cached

    results = (
        db.query(Artifact.category, func.count(Artifact.id))
        .filter(Artifact.category.isnot(None), Artifact.category != "")
        .group_by(Artifact.category)
        .order_by(func.count(Artifact.id).desc())
        .all()
    )
    value = [CategoryStat(category=r[0], count=r[1]) for r in results]
    _set_cached("category", value)
    return value


def get_location_stats(db: Session) -> List[LocationStat]:
    """按出土地点统计文物数量分布。"""
    cached = _get_cached("location")
    if cached is not None:
        return cached

    results = (
        db.query(Artifact.location, func.count(Artifact.id))
        .filter(Artifact.location.isnot(None), Artifact.location != "")
        .group_by(Artifact.location)
        .order_by(func.count(Artifact.id).desc())
        .all()
    )
    value = [LocationStat(location=r[0], count=r[1]) for r in results]
    _set_cached("location", value)
    return value


def get_wordcloud_data(db: Session, limit: int = 100) -> List[WordCloudItem]:
    """
    使用 jieba 分词提取文物名称和描述中的关键词及其频率。
    合并名称、描述、标签文本，过滤停用词和短词，返回 Top N。
    """
    cache_key = f"wordcloud_{limit}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    artifacts = (
        db.query(Artifact.name, Artifact.description, Artifact.tags)
        .filter(
            or_(
                Artifact.name.isnot(None),
                Artifact.description.isnot(None),
                Artifact.tags.isnot(None),
            )
        )
        .all()
    )

    word_counter: Counter = Counter()

    for name, description, tags_str in artifacts:
        texts = []
        if name:
            texts.append(name)
        if description:
            texts.append(description)
        if tags_str:
            # 标签按逗号/顿号拆分，直接作为词（也要过滤停用词）
            for tag in tags_str.replace("，", ",").replace("、", ",").split(","):
                tag = tag.strip()
                if tag and len(tag) >= 2 and tag not in STOP_WORDS:
                    word_counter[tag] += 1

        # 合并名称+描述文本做 jieba 分词
        combined = " ".join(texts)
        if combined.strip():
            words = jieba.cut(combined)
            for word in words:
                word = word.strip()
                # 过滤：长度>=2，不在停用词中，不是纯数字/标点
                if (
                    len(word) >= 2
                    and word not in STOP_WORDS
                    and not word.isdigit()
                    and any("\u4e00" <= ch <= "\u9fff" for ch in word)
                ):
                    word_counter[word] += 1

    result = [WordCloudItem(word=w, weight=c) for w, c in word_counter.most_common(limit)]
    _set_cached(cache_key, result)
    return result
