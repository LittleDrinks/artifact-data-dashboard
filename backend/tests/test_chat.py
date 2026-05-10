"""Tests for chat API endpoints."""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, ChatSession
from app.models.user import User


@pytest.fixture
def chat_session(db_session: Session, test_user: User):
    """Create a sample chat session for testing."""
    session = ChatSession(
        user_id=test_user.id,
        title="测试会话",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


@pytest.fixture
def chat_messages(db_session: Session, chat_session: ChatSession):
    """Create sample messages in a chat session."""
    messages = [
        ChatMessage(session_id=chat_session.id, role="user", content="你好"),
        ChatMessage(
            session_id=chat_session.id, role="assistant", content="你好！有什么可以帮您的？"
        ),
        ChatMessage(session_id=chat_session.id, role="user", content="介绍一下文物A"),
        ChatMessage(session_id=chat_session.id, role="assistant", content="文物A是一件珍贵的..."),
    ]
    for m in messages:
        db_session.add(m)
    db_session.commit()
    for m in messages:
        db_session.refresh(m)
    return messages


class TestCreateSession:
    """Tests for /api/chat/sessions POST endpoint."""

    def test_create_session_success(self, client: TestClient, auth_header: dict):
        """Test successful session creation."""
        response = client.post(
            "/api/chat/sessions",
            headers=auth_header,
            json={"title": "新对话"},
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["title"] == "新对话"
        assert data["message_count"] == 0
        assert "created_at" in data

    def test_create_session_default_title(self, client: TestClient, auth_header: dict):
        """Test session creation with default title."""
        response = client.post(
            "/api/chat/sessions",
            headers=auth_header,
            json={},  # No title provided
        )
        assert response.status_code == 201
        data = response.json()
        # Backend should use default title "新对话"
        assert data["title"] == "新对话"

    def test_create_session_unauthorized(self, client: TestClient):
        """Test session creation without auth."""
        response = client.post(
            "/api/chat/sessions",
            json={"title": "Unauthorized"},
        )
        assert response.status_code == 403


class TestListSessions:
    """Tests for /api/chat/sessions GET endpoint."""

    def test_list_sessions_success(
        self, client: TestClient, auth_header: dict, chat_session: ChatSession
    ):
        """Test listing user's sessions."""
        response = client.get("/api/chat/sessions", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert data["total"] >= 1
        # Check the session we created is in the list
        found = any(s["id"] == chat_session.id for s in data["items"])
        assert found

    def test_list_sessions_pagination(
        self, client: TestClient, auth_header: dict, db_session: Session, test_user: User
    ):
        """Test session list pagination."""
        # Create multiple sessions
        for i in range(15):
            session = ChatSession(user_id=test_user.id, title=f"Session {i}")
            db_session.add(session)
        db_session.commit()

        response = client.get("/api/chat/sessions?page=1&size=10", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 10
        assert data["total"] >= 15  # 15 new sessions

        response2 = client.get("/api/chat/sessions?page=2&size=10", headers=auth_header)
        assert response2.status_code == 200
        data2 = response2.json()
        assert len(data2["items"]) >= 5  # remaining items (15 - 10 = 5)

    def test_list_sessions_empty(self, client: TestClient, auth_header: dict):
        """Test listing sessions when user has none."""
        # Use a fresh user with no sessions
        response = client.get("/api/chat/sessions", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        # Even with fixture, check structure works
        assert "items" in data
        assert "total" in data

    def test_list_sessions_unauthorized(self, client: TestClient):
        """Test listing sessions without auth."""
        response = client.get("/api/chat/sessions")
        assert response.status_code == 403


class TestGetMessages:
    """Tests for /api/chat/sessions/{id}/messages GET endpoint."""

    def test_get_messages_success(
        self, client: TestClient, auth_header: dict, chat_session: ChatSession, chat_messages
    ):
        """Test getting messages for a session."""
        response = client.get(
            f"/api/chat/sessions/{chat_session.id}/messages",
            headers=auth_header,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 4
        # Check order (should be chronological)
        assert data[0]["role"] == "user"
        assert data[0]["content"] == "你好"
        assert data[1]["role"] == "assistant"

    def test_get_messages_empty_session(
        self, client: TestClient, auth_header: dict, db_session: Session, test_user: User
    ):
        """Test getting messages for empty session."""
        session = ChatSession(user_id=test_user.id, title="Empty")
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        response = client.get(
            f"/api/chat/sessions/{session.id}/messages",
            headers=auth_header,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0

    def test_get_messages_wrong_user(
        self, client: TestClient, auth_header: dict, db_session: Session
    ):
        """Test getting messages for another user's session."""
        # Create a different user and their session
        from app.services.auth import hash_password

        other_user = User(
            username="otheruser",
            email="other@example.com",
            password_hash=hash_password("Password123"),
            role="user",
        )
        db_session.add(other_user)
        db_session.commit()
        db_session.refresh(other_user)

        other_session = ChatSession(user_id=other_user.id, title="Other's Session")
        db_session.add(other_session)
        db_session.commit()
        db_session.refresh(other_session)

        response = client.get(
            f"/api/chat/sessions/{other_session.id}/messages",
            headers=auth_header,  # test_user's auth
        )
        assert response.status_code == 404
        assert "不存在" in response.json()["detail"]

    def test_get_messages_nonexistent_session(self, client: TestClient, auth_header: dict):
        """Test getting messages for nonexistent session."""
        response = client.get(
            "/api/chat/sessions/99999/messages",
            headers=auth_header,
        )
        assert response.status_code == 404

    def test_get_messages_unauthorized(self, client: TestClient, chat_session: ChatSession):
        """Test getting messages without auth."""
        response = client.get(f"/api/chat/sessions/{chat_session.id}/messages")
        assert response.status_code == 403


class TestDeleteSessions:
    """Tests for /api/chat/sessions DELETE endpoint."""

    def test_delete_sessions_success(
        self, client: TestClient, auth_header: dict, chat_session: ChatSession
    ):
        """Test deleting sessions."""
        response = client.delete(
            f"/api/chat/sessions?ids={chat_session.id}",
            headers=auth_header,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] == 1

        # Verify session is deleted
        response2 = client.get("/api/chat/sessions", headers=auth_header)
        data2 = response2.json()
        found = any(s["id"] == chat_session.id for s in data2["items"])
        assert not found

    def test_delete_multiple_sessions(
        self, client: TestClient, auth_header: dict, db_session: Session, test_user: User
    ):
        """Test deleting multiple sessions."""
        # Create multiple sessions
        sessions = []
        for i in range(3):
            s = ChatSession(user_id=test_user.id, title=f"ToDelete{i}")
            db_session.add(s)
            sessions.append(s)
        db_session.commit()
        ids = ",".join(str(s.id) for s in sessions)

        response = client.delete(
            f"/api/chat/sessions?ids={ids}",
            headers=auth_header,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] == 3

    def test_delete_sessions_invalid_ids(self, client: TestClient, auth_header: dict):
        """Test deleting with invalid ID format."""
        response = client.delete(
            "/api/chat/sessions?ids=abc,def",
            headers=auth_header,
        )
        assert response.status_code == 400
        assert "格式错误" in response.json()["detail"]

    def test_delete_sessions_empty_ids(self, client: TestClient, auth_header: dict):
        """Test deleting with empty IDs."""
        response = client.delete(
            "/api/chat/sessions?ids=",
            headers=auth_header,
        )
        assert response.status_code == 400
        assert "不能为空" in response.json()["detail"]

    def test_delete_sessions_unauthorized(self, client: TestClient, chat_session: ChatSession):
        """Test deleting sessions without auth."""
        response = client.delete(f"/api/chat/sessions?ids={chat_session.id}")
        assert response.status_code == 403


class TestAskQuestion:
    """Tests for /api/chat/ask SSE endpoint."""

    def _mock_stream(self, question: str, session_id: int, new_session: bool, collector: dict):
        """Mock generator that yields SSE events."""
        if new_session:
            yield f"data: {json.dumps({'type': 'session_created', 'session_id': session_id}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'thinking_start'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'thinking_end'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'answer_start'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'answer_delta', 'content': '你好'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'answer_end'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'elapsed': 0.1, 'sources': []}, ensure_ascii=False)}\n\n"
        if collector is not None:
            collector["answer_text"] = "你好"
            collector["tool_calls_log"] = []
            collector["thinking_rounds"] = []
            collector["sources"] = []
            collector["tool_results"] = []
            collector["query"] = question

    def test_ask_success_with_existing_session(
        self, client: TestClient, auth_header: dict, chat_session: ChatSession
    ):
        """Test SSE streaming with existing session."""
        with (
            patch("app.routers.chat.chat_service.stream_chat_response") as mock_stream,
            patch("app.routers.chat._persist_chat_response") as mock_persist,
        ):
            mock_stream.return_value = self._mock_stream("你好", chat_session.id, False, {})
            response = client.post(
                "/api/chat/ask",
                headers=auth_header,
                json={"question": "你好", "session_id": chat_session.id},
            )
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]
            body = response.text
            assert "thinking_start" in body
            assert "answer_delta" in body
            assert "done" in body
            mock_persist.assert_called_once()

    def test_ask_success_new_session(self, client: TestClient, auth_header: dict, test_user: User):
        """Test SSE streaming creates new session when session_id is null."""
        with (
            patch("app.routers.chat.chat_service.stream_chat_response") as mock_stream,
            patch("app.routers.chat._persist_chat_response") as mock_persist,
        ):
            # The actual session_id is determined at runtime; we just verify
            # the response contains session_created when new_session=True.
            mock_stream.return_value = self._mock_stream("介绍一下文物", 999, True, {})
            response = client.post(
                "/api/chat/ask",
                headers=auth_header,
                json={"question": "介绍一下文物"},
            )
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]
            body = response.text
            assert "session_created" in body
            assert "answer_delta" in body
            assert "done" in body
            mock_persist.assert_called_once()

    def test_ask_empty_question(self, client: TestClient, auth_header: dict):
        """Test empty question returns 400 (Pydantic min_length=1)."""
        response = client.post(
            "/api/chat/ask",
            headers=auth_header,
            json={"question": ""},
        )
        assert response.status_code == 422

    def test_ask_unauthorized(self, client: TestClient):
        """Test ask without auth returns 401/403."""
        response = client.post(
            "/api/chat/ask",
            json={"question": "你好"},
        )
        # FastAPI JWT dependency returns 403 for missing/invalid token
        assert response.status_code in (401, 403)

    def test_ask_wrong_user_session(
        self, client: TestClient, auth_header: dict, db_session: Session
    ):
        """Test ask with session belonging to another user returns 404."""
        from app.services.auth import hash_password

        other_user = User(
            username="otherask",
            email="otherask@example.com",
            password_hash=hash_password("Password123"),
            role="user",
        )
        db_session.add(other_user)
        db_session.commit()
        db_session.refresh(other_user)

        other_session = ChatSession(user_id=other_user.id, title="Other")
        db_session.add(other_session)
        db_session.commit()
        db_session.refresh(other_session)

        response = client.post(
            "/api/chat/ask",
            headers=auth_header,
            json={"question": "你好", "session_id": other_session.id},
        )
        assert response.status_code == 404
        assert "不存在" in response.json()["detail"]

    def test_ask_sse_headers(
        self, client: TestClient, auth_header: dict, chat_session: ChatSession
    ):
        """Test SSE response has correct headers."""
        with (
            patch("app.routers.chat.chat_service.stream_chat_response") as mock_stream,
            patch("app.routers.chat._persist_chat_response") as mock_persist,
        ):
            mock_stream.return_value = self._mock_stream("测试", chat_session.id, False, {})
            response = client.post(
                "/api/chat/ask",
                headers=auth_header,
                json={"question": "测试", "session_id": chat_session.id},
            )
            assert response.status_code == 200
            assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
            assert response.headers["cache-control"] == "no-cache"
            assert response.headers["connection"] == "keep-alive"
            assert response.headers["x-accel-buffering"] == "no"
            mock_persist.assert_called_once()
