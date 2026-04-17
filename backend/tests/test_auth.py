"""Tests for authentication API endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.auth import hash_password, create_access_token


class TestRegister:
    """Tests for /api/auth/register endpoint."""

    def test_register_success(self, client: TestClient, db_session: Session):
        """Test successful user registration."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "Password123",
                "confirm_password": "Password123",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["email"] == "new@example.com"
        assert data["role"] == "user"
        assert "id" in data

    def test_register_duplicate_username(self, client: TestClient, test_user: User):
        """Test registration with existing username."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": test_user.username,
                "email": "different@example.com",
                "password": "Password123",
                "confirm_password": "Password123",
            },
        )
        assert response.status_code == 400
        assert "用户名已存在" in response.json()["detail"]

    def test_register_duplicate_email(self, client: TestClient, test_user: User):
        """Test registration with existing email."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "differentuser",
                "email": test_user.email,
                "password": "Password123",
                "confirm_password": "Password123",
            },
        )
        assert response.status_code == 400
        assert "邮箱已被注册" in response.json()["detail"]

    def test_register_password_mismatch(self, client: TestClient):
        """Test registration with mismatched passwords."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "Password123",
                "confirm_password": "Different123",
            },
        )
        assert response.status_code == 422

    def test_register_invalid_email(self, client: TestClient):
        """Test registration with invalid email format."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "invalid-email",
                "password": "Password123",
                "confirm_password": "Password123",
            },
        )
        assert response.status_code == 422

    def test_register_weak_password(self, client: TestClient):
        """Test registration with password without letters."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "12345678",
                "confirm_password": "12345678",
            },
        )
        assert response.status_code == 422

    def test_register_short_password(self, client: TestClient):
        """Test registration with password too short."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "Pass1",
                "confirm_password": "Pass1",
            },
        )
        assert response.status_code == 422


class TestLogin:
    """Tests for /api/auth/login endpoint."""

    def test_login_success_with_username(self, client: TestClient, test_user: User):
        """Test successful login with username."""
        response = client.post(
            "/api/auth/login",
            json={"username": test_user.username, "password": "Testpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == test_user.username

    def test_login_success_with_email(self, client: TestClient, test_user: User):
        """Test successful login with email."""
        response = client.post(
            "/api/auth/login",
            json={"username": test_user.email, "password": "Testpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == test_user.email

    def test_login_wrong_password(self, client: TestClient, test_user: User):
        """Test login with incorrect password."""
        response = client.post(
            "/api/auth/login",
            json={"username": test_user.username, "password": "Wrongpass123"},
        )
        assert response.status_code == 401
        assert "用户名或密码错误" in response.json()["detail"]

    def test_login_nonexistent_user(self, client: TestClient):
        """Test login with nonexistent username."""
        response = client.post(
            "/api/auth/login",
            json={"username": "nonexistent", "password": "Password123"},
        )
        assert response.status_code == 401
        assert "用户名或密码错误" in response.json()["detail"]


class TestGetCurrentUser:
    """Tests for /api/auth/me endpoint."""

    def test_get_me_success(self, client: TestClient, auth_header: dict):
        """Test getting current user info with valid token."""
        response = client.get("/api/auth/me", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert data["role"] == "user"

    def test_get_me_no_token(self, client: TestClient):
        """Test getting current user without token."""
        response = client.get("/api/auth/me")
        assert response.status_code == 403

    def test_get_me_invalid_token(self, client: TestClient):
        """Test getting current user with invalid token."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token"},
        )
        assert response.status_code == 401


class TestTokenValidation:
    """Tests for JWT token validation."""

    def test_valid_token_structure(self, test_user: User):
        """Test that created token has correct structure."""
        token = create_access_token(test_user.id, test_user.role)
        assert token is not None
        assert len(token) > 0
        # JWT tokens have three parts separated by dots
        parts = token.split(".")
        assert len(parts) == 3

    def test_token_contains_user_info(self, client: TestClient, auth_header: dict):
        """Test that token contains correct user info."""
        response = client.get("/api/auth/me", headers=auth_header)
        assert response.status_code == 200
        # The user info should match what's in the token
        data = response.json()
        assert "id" in data
        assert isinstance(data["id"], int)