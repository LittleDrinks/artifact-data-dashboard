"""Tests for LightRAG knowledge demo — graph extract + knowledge query.

Demo flow: user adds text → system extracts entities → user queries → gets enriched answer.
These tests verify the API layer for this flow.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def graph_client(client: TestClient):
    """TestClient with graph router mounted."""
    from app.routers import graph

    client.app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
    return client


@pytest.fixture
def mock_lightrag_service():
    """Mock LightRAGService with async ainsert and aquery."""
    with patch("app.routers.graph.get_lightrag_service") as mock_get:
        service = MagicMock()
        service.ainsert = AsyncMock()
        service.aquery = AsyncMock(return_value="测试知识查询结果")
        mock_get.return_value = service
        yield service


# ── Test: Extract API validation ──────────────────────────────────────

class TestExtractValidation:
    """RED: Test extract endpoint input validation."""

    def test_extract_empty_text_returns_400(self, graph_client):
        """Empty text should return 400."""
        resp = graph_client.post("/api/graph/extract", json={"text": ""})
        assert resp.status_code == 400
        assert "不能为空" in resp.json()["detail"]

    def test_extract_whitespace_text_returns_400(self, graph_client):
        """Whitespace-only text should return 400."""
        resp = graph_client.post("/api/graph/extract", json={"text": "   \n\t  "})
        assert resp.status_code == 400

    def test_extract_no_lightrag_returns_503(self, graph_client):
        """When LightRAG service is None, should return 503."""
        with patch("app.routers.graph.get_lightrag_service", return_value=None):
            resp = graph_client.post(
                "/api/graph/extract",
                json={"text": "这是一段测试文本"},
            )
            assert resp.status_code == 503
            assert "LightRAG" in resp.json()["detail"]


# ── Test: Knowledge Query endpoint (NEW) ─────────────────────────────

class TestKnowledgeQuery:
    """RED: Test new /api/graph/knowledge-query endpoint.

    This endpoint lets users query the LightRAG knowledge base
    to verify that their added data is retrievable — the core demo.
    """

    def test_knowledge_query_empty_question_returns_400(self, graph_client):
        """Empty question should return 400."""
        resp = graph_client.post(
            "/api/graph/knowledge-query",
            json={"question": ""},
        )
        assert resp.status_code == 400

    def test_knowledge_query_no_lightrag_returns_503(self, graph_client):
        """When LightRAG is not configured, return 503."""
        with patch("app.routers.graph.get_lightrag_service", return_value=None):
            resp = graph_client.post(
                "/api/graph/knowledge-query",
                json={"question": "越王勾践剑是什么？"},
            )
            assert resp.status_code == 503

    def test_knowledge_query_success_returns_answer(self, graph_client, mock_lightrag_service):
        """Successful query returns the LightRAG answer."""
        mock_lightrag_service.aquery = AsyncMock(return_value="越王勾践剑是春秋晚期越国的青铜剑，被誉为天下第一剑。")

        resp = graph_client.post(
            "/api/graph/knowledge-query",
            json={"question": "越王勾践剑是什么？"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "answer" in data
        assert data["source"] == "lightrag"

    def test_knowledge_query_returns_empty_on_failure(self, graph_client, mock_lightrag_service):
        """When LightRAG query fails, return graceful fallback."""
        mock_lightrag_service.aquery = AsyncMock(return_value="")

        resp = graph_client.post(
            "/api/graph/knowledge-query",
            json={"question": "不存在的文物"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["answer"] == ""
        assert data["source"] == "lightrag"


# ── Test: Full demo flow (insert → query) ────────────────────────────

class TestKnowledgeExpansionDemo:
    """RED: Test the full 'add data → query enriched knowledge' flow.

    This is the core demo scenario:
    1. Query something → get limited/empty answer
    2. Add new text via extract
    3. Query again → get enriched answer
    """

    def test_insert_then_query_expanded_knowledge(self, graph_client, mock_lightrag_service):
        """After inserting text, subsequent query should return enriched result."""
        # Step 1: Query before insert — returns empty
        mock_lightrag_service.aquery = AsyncMock(return_value="")
        resp1 = graph_client.post(
            "/api/graph/knowledge-query",
            json={"question": "曾侯乙编钟"},
        )
        assert resp1.status_code == 200
        assert resp1.json()["answer"] == ""

        # Step 2: Insert new knowledge
        mock_lightrag_service.ainsert = AsyncMock(return_value=None)
        resp2 = graph_client.post(
            "/api/graph/extract",
            json={"text": "曾侯乙编钟是战国早期曾国国君的大型礼乐重器，1978年出土于湖北随州，现藏于湖北省博物馆。全套编钟共65件，总重2567公斤。"},
        )
        assert resp2.status_code == 200

        # Step 3: Query again — now returns enriched answer
        mock_lightrag_service.aquery = AsyncMock(
            return_value="曾侯乙编钟是战国早期曾国的大型礼乐重器，出土于湖北随州，共65件。"
        )
        resp3 = graph_client.post(
            "/api/graph/knowledge-query",
            json={"question": "曾侯乙编钟"},
        )
        assert resp3.status_code == 200
        answer = resp3.json()["answer"]
        assert "编钟" in answer
