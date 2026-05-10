"""Tests for image repair API endpoints.

Tests cover:
- _validate_image_url() SSRF protection
- repair_image endpoint with mocked cv2.inpaint and requests.get
"""

import base64
import io
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app.models.artifact import Artifact


class TestValidateImageUrl:
    """Tests for _validate_image_url() SSRF validation."""

    def test_allow_public_url(self):
        """Public image URL should pass validation."""
        from app.routers.repair import _validate_image_url

        _validate_image_url("https://example.com/image.jpg")

    def test_allow_public_url_with_path(self):
        """Public URL with nested path should pass."""
        from app.routers.repair import _validate_image_url

        _validate_image_url("https://cdn.example.com/images/photo.png")

    def test_reject_localhost(self):
        """localhost should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("http://localhost/image.jpg")
        assert "禁止访问" in str(exc_info.value)

    def test_reject_127_loopback(self):
        """127.0.0.1 should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("http://127.0.0.1/image.jpg")
        assert "禁止访问" in str(exc_info.value)

    def test_reject_10_private(self):
        """10.x.x.x should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("http://10.0.0.1/image.jpg")
        assert "禁止访问" in str(exc_info.value)

    def test_reject_192_168_private(self):
        """192.168.x.x should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("http://192.168.1.1/image.jpg")
        assert "禁止访问" in str(exc_info.value)

    def test_reject_172_private(self):
        """172.16-31.x.x should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("http://172.16.0.1/image.jpg")
        assert "禁止访问" in str(exc_info.value)

    def test_reject_local_domain(self):
        """.local domain should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("http://server.local/image.jpg")
        assert "禁止访问" in str(exc_info.value)

    def test_reject_no_hostname(self):
        """URL without hostname should be rejected."""
        from app.routers.repair import _validate_image_url

        with pytest.raises(Exception) as exc_info:
            _validate_image_url("not-a-url")
        assert "无效" in str(exc_info.value)


class TestRepairImageEndpoint:
    """Tests for /api/artifacts/{id}/repair-image endpoint."""

    @pytest.fixture
    def artifact_with_image(self, db_session: Session):
        """Create an artifact with a valid image_url."""
        artifact = Artifact(
            name="测试文物",
            description="测试描述",
            category="青铜器",
            era="商代",
            image_url="https://example.com/artifact.jpg",
        )
        db_session.add(artifact)
        db_session.commit()
        db_session.refresh(artifact)
        return artifact

    @pytest.fixture
    def artifact_without_image(self, db_session: Session):
        """Create an artifact without image_url."""
        artifact = Artifact(
            name="无图文物",
            description="测试描述",
            category="玉器",
            era="汉代",
            image_url=None,
        )
        db_session.add(artifact)
        db_session.commit()
        db_session.refresh(artifact)
        return artifact

    @pytest.fixture
    def valid_mask_bytes(self):
        """Create a valid grayscale mask image (100x100)."""
        img = Image.new("L", (100, 100), color=0)
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()

    def _make_image_bytes(self, mode="RGB", size=(100, 100), color=(0, 0, 0)):
        """Create a real image bytes for mocking requests response."""
        img = Image.new(mode, size, color=color)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG")
        return buffer.getvalue()

    def _mock_response(self, content_type="image/jpeg", content=None):
        """Helper to create a mocked requests.Response (context manager compatible)."""
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": content_type}
        mock_resp.iter_content.return_value = [content or self._make_image_bytes()]
        mock_resp.raise_for_status.return_value = None
        # Support `with requests.get(...) as resp:`
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        return mock_resp

    @patch("app.routers.repair.requests.get")
    @patch("app.routers.repair.cv2.inpaint")
    @patch("app.routers.repair.cv2.cvtColor")
    @patch("app.routers.repair.cv2.threshold")
    @patch("app.routers.repair.cv2.resize")
    def test_repair_image_success(
        self,
        mock_cv2_resize,
        mock_cv2_threshold,
        mock_cv2_cvtcolor,
        mock_cv2_inpaint,
        mock_requests_get,
        client: TestClient,
        auth_header: dict,
        artifact_with_image: Artifact,
        valid_mask_bytes: bytes,
    ):
        """Upload mask and get repaired image base64."""
        mock_requests_get.return_value = self._mock_response()

        # Mock cv2 operations
        mock_cv2_cvtcolor.side_effect = lambda img, code: img
        mock_cv2_threshold.return_value = (None, np.ones((100, 100), dtype=np.uint8) * 255)
        mock_cv2_resize.return_value = np.ones((100, 100), dtype=np.uint8) * 255
        mock_cv2_inpaint.return_value = np.zeros((100, 100, 3), dtype=np.uint8)

        response = client.post(
            f"/api/artifacts/{artifact_with_image.id}/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["artifact_id"] == artifact_with_image.id
        assert data["artifact_name"] == artifact_with_image.name
        assert data["method"] == "telea"
        assert data["radius"] == 3
        assert "repaired_image" in data
        # Verify base64 string is valid
        repaired_b64 = data["repaired_image"]
        decoded = base64.b64decode(repaired_b64)
        assert len(decoded) > 0

    @patch("app.routers.repair.requests.get")
    @patch("app.routers.repair.cv2.inpaint")
    @patch("app.routers.repair.cv2.cvtColor")
    @patch("app.routers.repair.cv2.threshold")
    @patch("app.routers.repair.cv2.resize")
    def test_repair_image_ns_method(
        self,
        mock_cv2_resize,
        mock_cv2_threshold,
        mock_cv2_cvtcolor,
        mock_cv2_inpaint,
        mock_requests_get,
        client: TestClient,
        auth_header: dict,
        artifact_with_image: Artifact,
        valid_mask_bytes: bytes,
    ):
        """Test with Navier-Stokes method."""
        mock_requests_get.return_value = self._mock_response()

        mock_cv2_cvtcolor.side_effect = lambda img, code: img
        mock_cv2_threshold.return_value = (None, np.ones((100, 100), dtype=np.uint8) * 255)
        mock_cv2_resize.return_value = np.ones((100, 100), dtype=np.uint8) * 255
        mock_cv2_inpaint.return_value = np.zeros((100, 100, 3), dtype=np.uint8)

        response = client.post(
            f"/api/artifacts/{artifact_with_image.id}/repair-image",
            headers=auth_header,
            data={"radius": 5, "method": "ns"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["method"] == "ns"
        assert data["radius"] == 5

    def test_repair_image_no_auth(
        self,
        client: TestClient,
        artifact_with_image: Artifact,
        valid_mask_bytes: bytes,
    ):
        """Request without auth should return 403."""
        response = client.post(
            f"/api/artifacts/{artifact_with_image.id}/repair-image",
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )
        assert response.status_code == 403

    def test_repair_image_artifact_not_found(
        self,
        client: TestClient,
        auth_header: dict,
        valid_mask_bytes: bytes,
    ):
        """Nonexistent artifact should return 404."""
        response = client.post(
            "/api/artifacts/99999/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )
        assert response.status_code == 404
        assert "不存在" in response.json()["detail"]

    def test_repair_image_no_image_url(
        self,
        client: TestClient,
        auth_header: dict,
        artifact_without_image: Artifact,
        valid_mask_bytes: bytes,
    ):
        """Artifact without image_url should return 400."""
        response = client.post(
            f"/api/artifacts/{artifact_without_image.id}/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )
        assert response.status_code == 400
        assert "没有图片" in response.json()["detail"]

    def test_repair_image_invalid_method(
        self,
        client: TestClient,
        auth_header: dict,
        artifact_with_image: Artifact,
        valid_mask_bytes: bytes,
    ):
        """Invalid method parameter should return 400."""
        response = client.post(
            f"/api/artifacts/{artifact_with_image.id}/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "invalid"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )
        assert response.status_code == 400
        assert "telea" in response.json()["detail"]

    @patch("app.routers.repair.requests.get")
    def test_repair_image_invalid_content_type(
        self,
        mock_requests_get,
        client: TestClient,
        auth_header: dict,
        artifact_with_image: Artifact,
        valid_mask_bytes: bytes,
    ):
        """Non-image Content-Type should return 400."""
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "text/html"}
        mock_resp.iter_content.return_value = [b"<html></html>"]
        mock_resp.raise_for_status.return_value = None
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_requests_get.return_value = mock_resp

        response = client.post(
            f"/api/artifacts/{artifact_with_image.id}/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )
        assert response.status_code == 400
        assert "Content-Type" in response.json()["detail"]

    @patch("app.routers.repair.requests.get")
    def test_repair_image_private_ip_blocked(
        self,
        mock_requests_get,
        client: TestClient,
        auth_header: dict,
        db_session: Session,
        valid_mask_bytes: bytes,
    ):
        """SSRF: artifact image_url pointing to private IP should be blocked."""
        artifact = Artifact(
            name="恶意文物",
            description="测试",
            category="测试",
            era="现代",
            image_url="http://192.168.1.1/internal.jpg",
        )
        db_session.add(artifact)
        db_session.commit()
        db_session.refresh(artifact)

        response = client.post(
            f"/api/artifacts/{artifact.id}/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(valid_mask_bytes), "image/png")},
        )
        assert response.status_code == 400
        assert "禁止访问" in response.json()["detail"]
        mock_requests_get.assert_not_called()

    @patch("app.routers.repair.requests.get")
    @patch("app.routers.repair.cv2.inpaint")
    @patch("app.routers.repair.cv2.cvtColor")
    @patch("app.routers.repair.cv2.threshold")
    @patch("app.routers.repair.cv2.resize")
    def test_repair_image_mask_resize(
        self,
        mock_cv2_resize,
        mock_cv2_threshold,
        mock_cv2_cvtcolor,
        mock_cv2_inpaint,
        mock_requests_get,
        client: TestClient,
        auth_header: dict,
        artifact_with_image: Artifact,
    ):
        """Mask smaller than original image should be resized."""
        # Create a small mask (50x50 vs 100x100 original)
        small_mask = Image.new("L", (50, 50), color=0)
        mask_buffer = io.BytesIO()
        small_mask.save(mask_buffer, format="PNG")
        mask_bytes = mask_buffer.getvalue()

        mock_requests_get.return_value = self._mock_response()

        mock_cv2_cvtcolor.side_effect = lambda img, code: img
        mock_cv2_threshold.return_value = (None, np.ones((100, 100), dtype=np.uint8) * 255)
        mock_cv2_resize.return_value = np.ones((100, 100), dtype=np.uint8) * 255
        mock_cv2_inpaint.return_value = np.zeros((100, 100, 3), dtype=np.uint8)

        response = client.post(
            f"/api/artifacts/{artifact_with_image.id}/repair-image",
            headers=auth_header,
            data={"radius": 3, "method": "telea"},
            files={"mask": ("mask.png", io.BytesIO(mask_bytes), "image/png")},
        )

        assert response.status_code == 200
        # Verify cv2.resize was called to resize mask
        mock_cv2_resize.assert_called_once()
