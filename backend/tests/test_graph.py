"""Tests for graph query, import, and export endpoints.

Covers:
- Graph query endpoints (full, search, node detail) — with mocked Neo4j
- Graph import endpoint (CSV upload, label whitelist validation)
- Graph export endpoint (CSV format validation)
"""

import io
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.artifact import Artifact

# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def sample_artifacts(db_session: Session):
    """Create sample artifacts for graph testing."""
    artifacts = [
        Artifact(
            name="越王勾践剑",
            description="春秋晚期越国青铜器",
            category="青铜器",
            era="春秋",
            location="湖北江陵",
            tags="宝剑,越王",
        ),
        Artifact(
            name="曾侯乙编钟",
            description="战国早期曾国礼乐重器",
            category="乐器",
            era="战国",
            location="湖北随州",
            tags="编钟,礼乐",
        ),
        Artifact(
            name="清明上河图",
            description="北宋风俗画",
            category="书画",
            era="北宋",
            location="北京故宫",
            tags="绘画,风俗",
        ),
    ]
    for art in artifacts:
        db_session.add(art)
    db_session.commit()
    for art in artifacts:
        db_session.refresh(art)
    yield artifacts
    for art in artifacts:
        existing = db_session.get(Artifact, art.id)
        if existing:
            db_session.delete(existing)
    db_session.commit()


@pytest.fixture
def mock_neo4j_driver():
    """Mock Neo4j driver and session for graph tests."""
    with (
        patch("app.services.graph._get_neo4j_driver") as mock_get_driver,
        patch("app.routers.graph.GraphDatabase.driver") as mock_driver_class,
    ):
        # Mock driver for services/graph.py
        driver = MagicMock()
        session = MagicMock()
        driver.session.return_value.__enter__ = MagicMock(return_value=session)
        driver.session.return_value.__exit__ = MagicMock(return_value=False)
        mock_get_driver.return_value = driver

        # Mock driver for routers/graph.py (import endpoint)
        router_driver = MagicMock()
        router_session = MagicMock()
        router_driver.session.return_value.__enter__ = MagicMock(return_value=router_session)
        router_driver.session.return_value.__exit__ = MagicMock(return_value=False)
        mock_driver_class.return_value = router_driver

        yield {
            "driver": driver,
            "session": session,
            "router_driver": router_driver,
            "router_session": router_session,
        }


@pytest.fixture
def mock_neo4j_empty():
    """Mock Neo4j as unavailable (returns None driver)."""
    with patch("app.services.graph._get_neo4j_driver", return_value=None):
        yield


# ── Test: Graph Full Query ────────────────────────────────────────────


class TestGraphFullQuery:
    """Tests for GET /api/graph/full endpoint."""

    def test_full_graph_returns_data(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Full graph endpoint should return nodes and links from SQLite fallback."""
        resp = client.get("/api/graph/full")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "links" in data
        assert data["total_nodes"] > 0
        assert data["total_links"] > 0
        # Should contain artifact nodes
        artifact_nodes = [n for n in data["nodes"] if n["type"] == "artifact"]
        assert len(artifact_nodes) >= 3

    def test_full_graph_with_limit(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Limit parameter should restrict number of artifacts processed."""
        resp = client.get("/api/graph/full?limit=1")
        assert resp.status_code == 200
        data = resp.json()
        # Only 1 artifact, but it creates related era/category/location nodes
        artifact_nodes = [n for n in data["nodes"] if n["type"] == "artifact"]
        assert len(artifact_nodes) == 1

    def test_full_graph_with_node_types_filter(
        self, client: TestClient, sample_artifacts, mock_neo4j_empty
    ):
        """node_types filter should only return requested types."""
        resp = client.get("/api/graph/full?node_types=artifact")
        assert resp.status_code == 200
        data = resp.json()
        # Only artifact nodes, no era/category/location/tag
        for node in data["nodes"]:
            assert node["type"] == "artifact"
        assert data["total_links"] == 0  # No links between artifacts only

    def test_full_graph_invalid_limit_returns_422(self, client: TestClient):
        """Invalid limit parameter should return 422 validation error."""
        resp = client.get("/api/graph/full?limit=0")
        assert resp.status_code == 422

    def test_full_graph_with_offset(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Offset parameter should skip first N artifacts."""
        resp = client.get("/api/graph/full?offset=1&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        artifact_nodes = [n for n in data["nodes"] if n["type"] == "artifact"]
        # With offset=1, should get 2 artifacts (from 3 total)
        assert len(artifact_nodes) == 2


# ── Test: Graph Search ────────────────────────────────────────────────


class TestGraphSearch:
    """Tests for GET /api/graph/search endpoint."""

    def test_search_by_keyword(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Search should return matching nodes and their neighbors."""
        resp = client.get("/api/graph/search?keyword=越王")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_nodes"] > 0
        # Should find the artifact node
        names = [n["name"] for n in data["nodes"]]
        assert "越王勾践剑" in names

    def test_search_with_depth(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Depth parameter should control neighbor expansion."""
        resp = client.get("/api/graph/search?keyword=春秋&depth=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_nodes"] >= 0

    def test_search_empty_keyword_returns_422(self, client: TestClient):
        """Empty keyword should return 422 (min_length=1)."""
        resp = client.get("/api/graph/search?keyword=")
        assert resp.status_code == 422

    def test_search_no_match_returns_empty(
        self, client: TestClient, sample_artifacts, mock_neo4j_empty
    ):
        """Search with non-matching keyword should return empty result."""
        resp = client.get("/api/graph/search?keyword=不存在的文物")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_nodes"] == 0
        assert data["total_links"] == 0

    def test_search_with_node_types(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """node_types filter should restrict returned node types."""
        resp = client.get("/api/graph/search?keyword=湖北&node_types=artifact,location")
        assert resp.status_code == 200
        data = resp.json()
        for node in data["nodes"]:
            assert node["type"] in ("artifact", "location")


# ── Test: Graph Node Detail ───────────────────────────────────────────


class TestGraphNodeDetail:
    """Tests for GET /api/graph/node/{node_id} endpoint."""

    def test_node_detail_artifact(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Get detail for an artifact node."""
        art = sample_artifacts[0]
        resp = client.get(f"/api/graph/node/artifact_{art.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["node"]["name"] == art.name
        assert data["node"]["type"] == "artifact"
        assert "links" in data
        assert "neighbors" in data

    def test_node_detail_era(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Get detail for an era node."""
        resp = client.get("/api/graph/node/era_春秋")
        assert resp.status_code == 200
        data = resp.json()
        assert data["node"]["name"] == "春秋"
        assert data["node"]["type"] == "era"

    def test_node_detail_not_found(self, client: TestClient):
        """Non-existent node should return 404."""
        resp = client.get("/api/graph/node/nonexistent_999")
        assert resp.status_code == 404

    def test_node_detail_category(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Get detail for a category node."""
        resp = client.get("/api/graph/node/cat_青铜器")
        assert resp.status_code == 200
        data = resp.json()
        assert data["node"]["name"] == "青铜器"
        assert data["node"]["type"] == "category"


# ── Test: Graph Export ────────────────────────────────────────────────


class TestGraphExport:
    """Tests for GET /api/graph/export endpoint."""

    def test_export_returns_csv(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Export should return CSV with correct headers and content."""
        resp = client.get("/api/graph/export")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in resp.headers["content-disposition"]
        assert "graph_triples_export.csv" in resp.headers["content-disposition"]

        content = resp.text
        lines = content.strip().split("\r\n")
        # First line should be header
        assert lines[0] == "source_name,relation,target_name,source_type,target_type"
        # Should have data rows
        assert len(lines) > 1

    def test_export_with_limit(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Limit parameter should restrict exported data."""
        resp = client.get("/api/graph/export?limit=1")
        assert resp.status_code == 200
        content = resp.text
        lines = content.strip().split("\r\n")
        # Header + data rows (1 artifact creates multiple links)
        assert len(lines) >= 1
        assert lines[0] == "source_name,relation,target_name,source_type,target_type"

    def test_export_invalid_limit_returns_422(self, client: TestClient):
        """Invalid limit should return 422."""
        resp = client.get("/api/graph/export?limit=0")
        assert resp.status_code == 422

    def test_export_csv_format(self, client: TestClient, sample_artifacts, mock_neo4j_empty):
        """Exported CSV should have correct column structure."""
        resp = client.get("/api/graph/export")
        assert resp.status_code == 200
        content = resp.text
        lines = content.strip().split("\r\n")
        # Check that data rows have 5 columns
        for line in lines[1:]:
            cols = line.split(",")
            assert len(cols) == 5


# ── Test: Graph Import ────────────────────────────────────────────────


class TestGraphImport:
    """Tests for POST /api/graph/import endpoint."""

    def _make_csv_file(self, rows: list[dict]) -> tuple[bytes, str]:
        """Helper to create CSV file content from dict rows."""
        import csv

        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(
                output,
                fieldnames=["source_name", "relation", "target_name", "source_type", "target_type"],
            )
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        else:
            output.write("source_name,relation,target_name,source_type,target_type\n")
        return output.getvalue().encode("utf-8"), "test.csv"

    def test_import_valid_csv(self, client: TestClient, mock_neo4j_driver):
        """Import valid CSV should succeed and return counts."""
        rows = [
            {
                "source_name": "文物A",
                "relation": "属于",
                "target_name": "朝代B",
                "source_type": "artifact",
                "target_type": "era",
            },
            {
                "source_name": "文物C",
                "relation": "出土于",
                "target_name": "地点D",
                "source_type": "artifact",
                "target_type": "location",
            },
        ]
        content, filename = self._make_csv_file(rows)
        resp = client.post(
            "/api/graph/import",
            files={"file": (filename, io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["nodes_imported"] > 0
        assert data["relations_imported"] > 0
        assert "成功导入" in data["message"]

    def test_import_non_csv_returns_400(self, client: TestClient):
        """Non-CSV file should return 400."""
        resp = client.post(
            "/api/graph/import",
            files={"file": ("test.txt", io.BytesIO(b"not a csv"), "text/plain")},
        )
        assert resp.status_code == 400
        assert "CSV" in resp.json()["detail"]

    def test_import_missing_columns_returns_400(self, client: TestClient):
        """CSV missing required columns should return 400."""
        content = b"source_name,wrong_col,target_name\nA,rel,B\n"
        resp = client.post(
            "/api/graph/import",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 400
        assert "缺少必需列" in resp.json()["detail"]

    def test_import_empty_csv_returns_error(self, client: TestClient):
        """CSV with no valid data rows should return success=False."""
        content = b"source_name,relation,target_name,source_type,target_type\n"
        resp = client.post(
            "/api/graph/import",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["nodes_imported"] == 0
        assert data["relations_imported"] == 0

    def test_import_invalid_label_whitelist_skipped_with_errors(
        self, client: TestClient, mock_neo4j_driver
    ):
        """SEC-03: Invalid label not in ALLOWED_LABELS is skipped, errors recorded in response.

        The import endpoint sanitizes labels and then validates against
        ALLOWED_LABELS = {"artifact", "era", "category", "location", "tag", "material", "museum"}.
        Invalid labels like "INVALID_TYPE" are sanitized to "INVALIDTYPE" which is still
        not in ALLOWED_LABELS, so the row is skipped and an error is recorded.
        The endpoint returns 200 with success=True but includes errors list.
        """
        rows = [
            {
                "source_name": "wenwuA",
                "relation": "shuyu",
                "target_name": "chaodaiB",
                "source_type": "INVALID_TYPE",  # Not in ALLOWED_LABELS
                "target_type": "era",
            },
        ]
        content, filename = self._make_csv_file(rows)
        resp = client.post(
            "/api/graph/import",
            files={"file": (filename, io.BytesIO(content), "text/csv")},
        )
        # The endpoint catches ValueError, records error, continues (skips invalid row)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["errors"] is not None
        assert len(data["errors"]) > 0
        # Invalid label row was skipped, so no nodes/relations imported
        assert data["nodes_imported"] == 0
        assert data["relations_imported"] == 0

    def test_import_with_gbk_encoding(self, client: TestClient, mock_neo4j_driver):
        """CSV with GBK encoding should be accepted."""
        import csv

        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["source_name", "relation", "target_name", "source_type", "target_type"],
        )
        writer.writeheader()
        writer.writerow(
            {
                "source_name": "文物A",
                "relation": "属于",
                "target_name": "朝代B",
                "source_type": "artifact",
                "target_type": "era",
            }
        )
        content = output.getvalue().encode("gbk")
        resp = client.post(
            "/api/graph/import",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    def test_import_missing_required_fields(self, client: TestClient):
        """Rows with missing required fields should be recorded as errors."""
        content = (
            b"source_name,relation,target_name,source_type,target_type\n,,mubiao,,\nlaiyuan,,,,\n"
        )
        resp = client.post(
            "/api/graph/import",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        # No valid triples, but errors recorded
        assert data["success"] is False
        assert data["errors"] is not None
        assert len(data["errors"]) > 0


# ── Test: Graph Import with Mocked Neo4j Session ──────────────────────


class TestGraphImportMockNeo4j:
    """Detailed tests for import endpoint with fully mocked Neo4j."""

    def test_import_success_with_mock_session(self, client: TestClient):
        """Import with fully mocked Neo4j driver and session."""
        import csv

        with patch("app.routers.graph.GraphDatabase.driver") as mock_driver_class:
            mock_driver = MagicMock()
            mock_session = MagicMock()
            mock_driver.session.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_driver.session.return_value.__exit__ = MagicMock(return_value=False)
            mock_driver_class.return_value = mock_driver

            output = io.StringIO()
            writer = csv.DictWriter(
                output,
                fieldnames=["source_name", "relation", "target_name", "source_type", "target_type"],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "source_name": "测试文物",
                    "relation": "属于朝代",
                    "target_name": "唐代",
                    "source_type": "artifact",
                    "target_type": "era",
                }
            )
            content = output.getvalue().encode("utf-8")

            resp = client.post(
                "/api/graph/import",
                files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["nodes_imported"] == 2  # source + target
            assert data["relations_imported"] == 1
            # Verify Neo4j session.run was called
            assert mock_session.run.called

    def test_import_invalid_label_returns_error_in_response(self, client: TestClient):
        """Invalid label should be caught and reported in errors, not crash."""
        import csv

        with patch("app.routers.graph.GraphDatabase.driver") as mock_driver_class:
            mock_driver = MagicMock()
            mock_session = MagicMock()
            mock_driver.session.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_driver.session.return_value.__exit__ = MagicMock(return_value=False)
            mock_driver_class.return_value = mock_driver

            output = io.StringIO()
            writer = csv.DictWriter(
                output,
                fieldnames=["source_name", "relation", "target_name", "source_type", "target_type"],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "source_name": "文物A",
                    "relation": "属于",
                    "target_name": "朝代B",
                    "source_type": "INVALID",  # Not in ALLOWED_LABELS
                    "target_type": "era",
                }
            )
            content = output.getvalue().encode("utf-8")

            resp = client.post(
                "/api/graph/import",
                files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
            )
            # Invalid label is caught inside _import_triples_to_neo4j, recorded as error,
            # and the endpoint returns 200 with success=True and errors list.
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["errors"] is not None
            assert len(data["errors"]) > 0
            assert data["nodes_imported"] == 0
            assert data["relations_imported"] == 0
