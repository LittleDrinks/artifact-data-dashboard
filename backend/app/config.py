"""
Application configuration module.
Reads settings from environment variables with sensible defaults.
"""

import os
from pathlib import Path

from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "文物大数据与人工智能集成系统"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

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

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # AI / LLM
    AI_API_KEY: str = ""
    AI_API_BASE: str = "https://api.deepseek.com"
    AI_MODEL_NAME: str = "deepseek-chat"

    # LightRAG
    LIGHTRAG_DIR: str = ""
    LIGHTRAG_LLM_MODEL: str = "qwen2.5:7b"
    LIGHTRAG_EMBEDDING_MODEL: str = "bge-m3"

    # Data paths
    DATA_DIR: str = ""

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

        if self.JWT_SECRET_KEY == "your-secret-key-change-in-production":
            import secrets
            self.JWT_SECRET_KEY = secrets.token_urlsafe(32)


settings = Settings()
