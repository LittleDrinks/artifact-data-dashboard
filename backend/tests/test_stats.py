"""Tests for statistics API endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.services.stats import clear_stats_cache


@pytest.fixture
def stats_artifacts(db_session: Session):
    """Create artifacts for stats testing."""
    artifacts = [
        Artifact(name="文物A", category="瓷器", era="唐代", location="西安"),
        Artifact(name="文物B", category="瓷器", era="唐代", location="北京"),
        Artifact(name="文物C", category="青铜器", era="宋代", location="西安"),
        Artifact(name="文物D", category="玉器", era="明代", location="南京"),
        Artifact(name="文物E", category="瓷器", era="宋代", location="西安"),
        Artifact(name="文物F", category="青铜器", era="唐代", location="北京"),
        Artifact(name="文物G", category="玉器", era="清代", location="杭州"),
        Artifact(name="文物H", category="", era="", location=""),  # empty fields
        Artifact(name="文物I", category="瓷器", era="", location="西安"),
    ]
    for a in artifacts:
        db_session.add(a)
    db_session.commit()
    # Clear cache to ensure fresh data
    clear_stats_cache()
    return artifacts


class TestOverviewStats:
    """Tests for /api/stats/overview endpoint."""

    def test_overview_success(self, client: TestClient, stats_artifacts):
        """Test overview stats returns correct counts."""
        response = client.get("/api/stats/overview")
        assert response.status_code == 200
        data = response.json()
        assert data["total_artifacts"] == 9
        # categories: 瓷器, 青铜器, 玉器, "" (4 distinct non-empty: 瓷器, 青铜器, 玉器 = 3)
        assert data["total_categories"] == 3
        # eras: 唐代, 宋代, 明代, 清代, "" (4 distinct non-empty = 4)
        assert data["total_eras"] == 4
        # locations: 西安, 北京, 南京, 杭州, "" (4 distinct non-empty = 4)
        assert data["total_locations"] == 4

    def test_overview_empty_database(self, client: TestClient, db_session: Session):
        """Test overview stats with empty database."""
        # Clear any cached stats
        clear_stats_cache()
        response = client.get("/api/stats/overview")
        assert response.status_code == 200
        data = response.json()
        assert data["total_artifacts"] == 0
        assert data["total_categories"] == 0
        assert data["total_eras"] == 0
        assert data["total_locations"] == 0


class TestEraStats:
    """Tests for /api/stats/by-era endpoint."""

    def test_by_era_success(self, client: TestClient, stats_artifacts):
        """Test era stats returns correct distribution."""
        response = client.get("/api/stats/by-era")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Filter out empty eras
        era_counts = {item["era"]: item["count"] for item in data}
        assert era_counts.get("唐代") == 3  # A, B, F
        assert era_counts.get("宋代") == 2  # C, E
        assert era_counts.get("明代") == 1  # D
        assert era_counts.get("清代") == 1  # G
        # Empty era should not appear
        assert "" not in era_counts

    def test_by_era_empty_database(self, client: TestClient, db_session: Session):
        """Test era stats with empty database."""
        clear_stats_cache()
        response = client.get("/api/stats/by-era")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


class TestCategoryStats:
    """Tests for /api/stats/by-category endpoint."""

    def test_by_category_success(self, client: TestClient, stats_artifacts):
        """Test category stats returns correct distribution."""
        response = client.get("/api/stats/by-category")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        cat_counts = {item["category"]: item["count"] for item in data}
        assert cat_counts.get("瓷器") == 4  # A, B, E, I
        assert cat_counts.get("青铜器") == 2  # C, F
        assert cat_counts.get("玉器") == 2  # D, G
        # Empty category should not appear
        assert "" not in cat_counts

    def test_by_category_empty_database(self, client: TestClient, db_session: Session):
        """Test category stats with empty database."""
        clear_stats_cache()
        response = client.get("/api/stats/by-category")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


class TestLocationStats:
    """Tests for /api/stats/by-location endpoint."""

    def test_by_location_success(self, client: TestClient, stats_artifacts):
        """Test location stats returns correct distribution."""
        response = client.get("/api/stats/by-location")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        loc_counts = {item["location"]: item["count"] for item in data}
        assert loc_counts.get("西安") == 4  # A, C, E, I
        assert loc_counts.get("北京") == 2  # B, F
        assert loc_counts.get("南京") == 1  # D
        assert loc_counts.get("杭州") == 1  # G
        # Empty location should not appear
        assert "" not in loc_counts

    def test_by_location_empty_database(self, client: TestClient, db_session: Session):
        """Test location stats with empty database."""
        clear_stats_cache()
        response = client.get("/api/stats/by-location")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


class TestWordCloud:
    """Tests for /api/stats/wordcloud endpoint."""

    def test_wordcloud_success(self, client: TestClient, stats_artifacts):
        """Test wordcloud returns data."""
        response = client.get("/api/stats/wordcloud")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Each item should have word and weight
        for item in data:
            assert "word" in item
            assert "weight" in item
            assert isinstance(item["weight"], int)
            assert item["weight"] >= 1

    def test_wordcloud_limit(self, client: TestClient, stats_artifacts):
        """Test wordcloud respects limit parameter."""
        response = client.get("/api/stats/wordcloud?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 10

    def test_wordcloud_empty_database(self, client: TestClient, db_session: Session):
        """Test wordcloud with empty database."""
        clear_stats_cache()
        response = client.get("/api/stats/wordcloud")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0