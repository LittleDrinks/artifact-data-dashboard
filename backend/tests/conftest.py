"""Conftest module - shared fixtures for pytest tests."""

import os
import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, get_db
from app.models.user import User
from app.routers import artifacts, auth, chat, health, repair, stats
from app.services.auth import create_access_token, hash_password


@pytest.fixture(scope="function")
def test_engine():
    """Create a test database engine with SQLite file (shared across connections)."""
    # Import all models so they register with Base.metadata for test table creation
    from app.models import artifact, attachment, chat  # noqa: F401

    # Use a temporary file for SQLite to ensure all connections see the same tables
    # In-memory SQLite (:memory:) is per-connection, not shared
    temp_db_fd, temp_db_path = tempfile.mkstemp(suffix=".db")
    db_url = f"sqlite:///{temp_db_path}"

    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )

    # Enable foreign keys for each connection
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    event.listen(engine, "connect", _set_sqlite_pragma)

    # Create all tables BEFORE any tests
    Base.metadata.create_all(bind=engine)

    yield engine

    # Cleanup
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    os.close(temp_db_fd)
    os.unlink(temp_db_path)


@pytest.fixture(scope="function")
def db_session(test_engine):
    """Create a test database session."""
    test_session_local = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = test_session_local()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(test_engine):
    """Create a test client with test database engine (no lifespan)."""
    test_session_local = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    def override_get_db():
        session = test_session_local()
        try:
            yield session
        finally:
            session.close()

    # Create a fresh FastAPI app WITHOUT lifespan (no init_db call)
    test_app = FastAPI(title="Test App")

    # Include routers
    test_app.include_router(health.router, prefix="/api", tags=["health"])
    test_app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    test_app.include_router(artifacts.router, prefix="/api/artifacts", tags=["artifacts"])
    test_app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
    test_app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
    from app.routers import graph

    test_app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
    test_app.include_router(repair.router, prefix="/api/artifacts", tags=["repair"])

    # Override get_db dependency
    test_app.dependency_overrides[get_db] = override_get_db

    client = TestClient(test_app)
    yield client

    test_app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(db_session: Session):
    """Create a test user and return the user object."""
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("Testpass123"),
        role="user",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def admin_user(db_session: Session):
    """Create an admin user and return the user object."""
    user = User(
        username="adminuser",
        email="admin@example.com",
        password_hash=hash_password("Adminpass123"),
        role="admin",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_header(test_user: User):
    """Create authorization header with valid JWT token."""
    token = create_access_token(test_user.id, test_user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def admin_auth_header(admin_user: User):
    """Create authorization header with admin JWT token."""
    token = create_access_token(admin_user.id, admin_user.role)
    return {"Authorization": f"Bearer {token}"}
