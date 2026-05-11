"""
Application configuration module.
Reads settings from environment variables with sensible defaults.
"""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "文物大数据与人工智能集成系统"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ADMIN_DEFAULT_PASSWORD: str = ""

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database - SQLite
    DATABASE_URL: str = ""

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"

    # JWT Authentication
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS — development defaults; production must override via .env
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # AI / LLM — Chat Q&A
    # User-configured OpenAI-compatible API
    AI_API_KEY: str = ""
    AI_API_BASE: str = ""
    AI_MODEL_NAME: str = ""

    # AI / LLM — LightRAG index build & query
    # User-configured OpenAI-compatible API (can be same or different from Chat Q&A)
    LIGHTRAG_API_KEY: str = ""
    LIGHTRAG_API_BASE: str = ""
    LIGHTRAG_MODEL_NAME: str = ""

    # LightRAG — storage path
    LIGHTRAG_DIR: str = ""

    # Data paths
    DATA_DIR: str = ""

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def model_post_init(self, __context) -> None:
        """Set computed defaults and validate critical settings."""
        if not self.DATABASE_URL:
            db_dir = Path(__file__).parent.parent / "data"
            db_dir.mkdir(exist_ok=True)
            self.DATABASE_URL = f"sqlite:///{db_dir / 'app.db'}"

        if not self.DATA_DIR:
            self.DATA_DIR = str(Path(__file__).parent.parent.parent / "data")

        if not self.LIGHTRAG_DIR:
            self.LIGHTRAG_DIR = str(Path(__file__).parent.parent / "data" / "lightrag")

        if self.JWT_SECRET_KEY == "your-secret-key-change-in-production" and not self.DEBUG:
            raise ValueError("JWT_SECRET_KEY must be changed from default in production")

        if not self.DEBUG and self.CORS_ORIGINS == [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]:
            raise ValueError("CORS_ORIGINS must be explicitly configured in production")


settings = Settings()
