"""Tests for chat SSE streaming endpoint (/api/chat/ask)."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.models.chat import ChatSession


class TestChatSSE:
    """Tests for SSE streaming response from /api/chat/ask."""

    def _mock_stream(self, session_id: int, new_session: bool = False):
        """Return a generator that yields typical SSE events."""
        from app.services.chat import _sse_event

        if new_session:
            yield _sse_event("session_created", {"session_id": session_id})
        yield _sse_event("thinking_start", {})
        yield _sse_event("thinking_delta", {"content": "分析中..."})
        yield _sse_event("thinking_end", {})
        yield _sse_event("answer_start", {})
        yield _sse_event("answer_delta", {"content": "这是AI的回答。"})
        yield _sse_event("answer_end", {})
        yield _sse_event("done", {"elapsed": 1.23, "sources": []})

    def test_sse_stream_format(self, client: TestClient, auth_header: dict):
        """SSE response should have correct format and all expected events."""
        with patch(
            "app.routers.chat.chat_service.stream_chat_response",
            side_effect=lambda db, query, sid, new_session, collector: self._mock_stream(
                sid, new_session
            ),
        ):
            resp = client.post(
                "/api/chat/ask",
                headers=auth_header,
                json={"question": "你好"},
            )
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]

            events = []
            for line in resp.text.strip().split("\n\n"):
                if line.startswith("data: "):
                    payload = line[6:]
                    events.append(payload)

            # Verify events are valid JSON
            import json

            for ev in events:
                data = json.loads(ev)
                assert "type" in data

            event_types = [json.loads(ev)["type"] for ev in events]
            assert "session_created" in event_types
            assert "thinking_start" in event_types
            assert "answer_delta" in event_types
            assert "done" in event_types

    def test_sse_new_session_created(self, client: TestClient, auth_header: dict):
        """Without session_id, a new session should be created and reported."""
        captured_session_id = None

        def mock_stream(db, query, sid, new_session, collector):
            nonlocal captured_session_id
            captured_session_id = sid
            yield from self._mock_stream(sid, new_session)

        with patch("app.routers.chat.chat_service.stream_chat_response", side_effect=mock_stream):
            resp = client.post(
                "/api/chat/ask",
                headers=auth_header,
                json={"question": "新建会话测试"},
            )
            assert resp.status_code == 200
            assert captured_session_id is not None

    def test_sse_invalid_session_returns_404(self, client: TestClient, auth_header: dict):
        """Invalid session_id should return 404 before streaming starts."""
        resp = client.post(
            "/api/chat/ask",
            headers=auth_header,
            json={"question": "测试", "session_id": 99999},
        )
        assert resp.status_code == 404

    def test_sse_existing_session(self, client: TestClient, auth_header: dict, db_session):
        """Existing valid session should stream without session_created event."""
        session = ChatSession(user_id=1, title="测试")
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        with patch(
            "app.routers.chat.chat_service.stream_chat_response",
            side_effect=lambda db, query, sid, new_session, collector: self._mock_stream(
                sid, new_session
            ),
        ):
            resp = client.post(
                "/api/chat/ask",
                headers=auth_header,
                json={"question": "继续对话", "session_id": session.id},
            )
            assert resp.status_code == 200
            import json

            events = [
                json.loads(line[6:])
                for line in resp.text.strip().split("\n\n")
                if line.startswith("data: ")
            ]
            # Should NOT have session_created for existing session
            types = [e["type"] for e in events]
            assert "session_created" not in types
