"""
Database connection and session management.
Uses SQLAlchemy with SQLite in WAL mode for better concurrent read performance.
"""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from typing import Generator

from app.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class."""
    pass


def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable WAL mode and foreign keys for SQLite connections."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


# Create engine with SQLite optimizations
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},  # SQLite specific
)

# Enable WAL mode on every new connection
event.listen(engine, "connect", _set_sqlite_pragma)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    Dependency that provides a database session.
    Automatically closes the session after the request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables in the database."""
    # Import all models so they are registered with Base.metadata
    from app.models import user, artifact, chat, attachment  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Create explicit indexes for frequently queried columns
    with engine.connect() as conn:
        indexes = [
            "CREATE INDEX IF NOT EXISTS ix_chat_messages_session_id ON chat_messages(session_id)",
            "CREATE INDEX IF NOT EXISTS ix_attachments_artifact_id ON attachments(artifact_id)",
            "CREATE INDEX IF NOT EXISTS ix_artifacts_category ON artifacts(category)",
            "CREATE INDEX IF NOT EXISTS ix_artifacts_era ON artifacts(era)",
            "CREATE INDEX IF NOT EXISTS ix_artifacts_name ON artifacts(name)",
            "CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_id ON chat_sessions(user_id)",
        ]
        for idx_sql in indexes:
            conn.execute(text(idx_sql))
        conn.commit()
