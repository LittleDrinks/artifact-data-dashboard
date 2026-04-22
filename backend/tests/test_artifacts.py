"""Tests for artifacts API endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.artifact import Artifact
from app.models.user import User
from app.services.auth import create_access_token


@pytest.fixture
def sample_artifact(db_session: Session):
    """Create a sample artifact for testing."""
    artifact = Artifact(
        name="测试文物",
        description="这是一个测试文物",
        category="瓷器",
        era="唐代",
        location="西安",
        tags="测试,示例",
    )
    db_session.add(artifact)
    db_session.commit()
    db_session.refresh(artifact)
    yield artifact
    # Teardown: delete test artifact
    db_session.delete(artifact)
    db_session.commit()


@pytest.fixture
def multiple_artifacts(db_session: Session):
    """Create multiple artifacts for pagination testing."""
    artifacts = []
    for i in range(25):
        artifact = Artifact(
            name=f"文物{i}",
            description=f"描述{i}",
            category="瓷器" if i % 2 == 0 else "青铜器",
            era="唐代" if i % 3 == 0 else "宋代",
            location=f"地点{i}",
        )
        db_session.add(artifact)
        artifacts.append(artifact)
    db_session.commit()
    for a in artifacts:
        db_session.refresh(a)
    yield artifacts
    # Teardown: delete all test artifacts
    for a in artifacts:
        db_session.delete(a)
    db_session.commit()


class TestListArtifacts:
    """Tests for /api/artifacts GET endpoint."""

    def test_list_default_pagination(self, client: TestClient, multiple_artifacts):
        """Test default pagination (page=1, size=20)."""
        response = client.get("/api/artifacts")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 20
        assert data["total"] == 25
        assert data["page"] == 1
        assert data["page_size"] == 20
        assert data["total_pages"] == 2

    def test_list_custom_pagination(self, client: TestClient, multiple_artifacts):
        """Test custom pagination parameters."""
        response = client.get("/api/artifacts?page=2&size=10")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 10
        assert data["page"] == 2
        assert data["page_size"] == 10

    def test_list_empty_database(self, client: TestClient):
        """Test listing when no artifacts exist."""
        response = client.get("/api/artifacts")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 0
        assert data["total"] == 0
        assert data["total_pages"] == 0

    def test_list_search_keyword(self, client: TestClient, multiple_artifacts):
        """Test search by keyword."""
        response = client.get("/api/artifacts?keyword=文物5")
        assert response.status_code == 200
        data = response.json()
        # Should find artifacts with "文物5" in name (文物5, 文物15, 文件25-like)
        assert data["total"] >= 1
        for item in data["items"]:
            assert "文物5" in item["name"] or "文物5" in str(item.get("description", ""))

    def test_list_filter_category(self, client: TestClient, multiple_artifacts):
        """Test filter by category."""
        response = client.get("/api/artifacts?category=瓷器")
        assert response.status_code == 200
        data = response.json()
        # Half of artifacts are 瓷器
        assert data["total"] == 13  # indices 0, 2, 4, ..., 24 (13 items)
        for item in data["items"]:
            assert item["category"] == "瓷器"

    def test_list_filter_era(self, client: TestClient, multiple_artifacts):
        """Test filter by era."""
        response = client.get("/api/artifacts?era=唐代")
        assert response.status_code == 200
        data = response.json()
        # Artifacts at indices 0, 3, 6, ..., 24 are 唐代 (9 items)
        assert data["total"] == 9
        for item in data["items"]:
            assert item["era"] == "唐代"

    def test_list_combined_filters(self, client: TestClient, multiple_artifacts):
        """Test combined category and era filters."""
        response = client.get("/api/artifacts?category=瓷器&era=唐代")
        assert response.status_code == 200
        data = response.json()
        # 瓷器 indices: 0, 2, 4, ..., 24 (even numbers)
        # 唐代 indices: 0, 3, 6, ..., 24 (multiples of 3)
        # Intersection: 0, 6, 12, 18, 24 (5 items that are both even and multiples of 3)
        assert data["total"] == 5
        for item in data["items"]:
            assert item["category"] == "瓷器"
            assert item["era"] == "唐代"


class TestGetArtifact:
    """Tests for /api/artifacts/{id} GET endpoint."""

    def test_get_artifact_success(self, client: TestClient, sample_artifact: Artifact):
        """Test getting artifact by ID."""
        response = client.get(f"/api/artifacts/{sample_artifact.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_artifact.id
        assert data["name"] == sample_artifact.name
        assert data["description"] == sample_artifact.description
        assert data["category"] == sample_artifact.category

    def test_get_artifact_not_found(self, client: TestClient):
        """Test getting nonexistent artifact."""
        response = client.get("/api/artifacts/99999")
        assert response.status_code == 404
        assert "不存在" in response.json()["detail"]


class TestCreateArtifact:
    """Tests for /api/artifacts POST endpoint."""

    def test_create_success(self, client: TestClient, auth_header: dict, db_session: Session):
        """Test successful artifact creation with auth."""
        response = client.post(
            "/api/artifacts",
            headers=auth_header,
            json={
                "name": "新建文物",
                "description": "新建文物的描述",
                "category": "玉器",
                "era": "明代",
                "location": "北京",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "新建文物"
        assert data["category"] == "玉器"
        assert "id" in data
        assert "created_at" in data
        # Teardown: delete created artifact
        created_id = data["id"]
        db_session.query(Artifact).filter(Artifact.id == created_id).delete()
        db_session.commit()

    def test_create_unauthorized(self, client: TestClient):
        """Test artifact creation without auth."""
        response = client.post(
            "/api/artifacts",
            json={"name": "Unauthorized文物", "description": "Test"},
        )
        assert response.status_code == 403

    def test_create_missing_name(self, client: TestClient, auth_header: dict):
        """Test artifact creation without required name field."""
        response = client.post(
            "/api/artifacts",
            headers=auth_header,
            json={"description": "Only description"},
        )
        assert response.status_code == 422


class TestUpdateArtifact:
    """Tests for /api/artifacts/{id} PUT endpoint."""

    def test_update_success(self, client: TestClient, auth_header: dict, sample_artifact: Artifact):
        """Test successful artifact update with auth."""
        response = client.put(
            f"/api/artifacts/{sample_artifact.id}",
            headers=auth_header,
            json={"name": "更新后的名称", "description": "更新后的描述"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "更新后的名称"
        assert data["description"] == "更新后的描述"
        assert data["category"] == sample_artifact.category  # unchanged

    def test_update_not_found(self, client: TestClient, auth_header: dict):
        """Test updating nonexistent artifact."""
        response = client.put(
            "/api/artifacts/99999",
            headers=auth_header,
            json={"name": "New Name"},
        )
        assert response.status_code == 404

    def test_update_unauthorized(self, client: TestClient, sample_artifact: Artifact):
        """Test artifact update without auth."""
        response = client.put(
            f"/api/artifacts/{sample_artifact.id}",
            json={"name": "Unauthorized Update"},
        )
        assert response.status_code == 403

    def test_update_partial(self, client: TestClient, auth_header: dict, sample_artifact: Artifact):
        """Test partial update (only some fields)."""
        original_desc = sample_artifact.description
        response = client.put(
            f"/api/artifacts/{sample_artifact.id}",
            headers=auth_header,
            json={"category": "新类别"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "新类别"
        assert data["name"] == sample_artifact.name  # unchanged
        assert data["description"] == original_desc  # unchanged


class TestDeleteArtifact:
    """Tests for /api/artifacts/{id} DELETE endpoint."""

    def test_delete_success_admin(self, client: TestClient, admin_auth_header: dict, sample_artifact: Artifact):
        """Test successful artifact deletion by admin."""
        response = client.delete(
            f"/api/artifacts/{sample_artifact.id}",
            headers=admin_auth_header,
        )
        assert response.status_code == 204

        # Verify artifact is deleted
        response2 = client.get(f"/api/artifacts/{sample_artifact.id}")
        assert response2.status_code == 404

    def test_delete_forbidden_user(self, client: TestClient, auth_header: dict, sample_artifact: Artifact):
        """Test deletion forbidden for non-admin user."""
        response = client.delete(
            f"/api/artifacts/{sample_artifact.id}",
            headers=auth_header,
        )
        assert response.status_code == 403
        assert "仅管理员" in response.json()["detail"]

    def test_delete_not_found(self, client: TestClient, admin_auth_header: dict):
        """Test deleting nonexistent artifact."""
        response = client.delete(
            "/api/artifacts/99999",
            headers=admin_auth_header,
        )
        assert response.status_code == 404

    def test_delete_unauthorized(self, client: TestClient, sample_artifact: Artifact):
        """Test artifact deletion without auth."""
        response = client.delete(f"/api/artifacts/{sample_artifact.id}")
        assert response.status_code == 403