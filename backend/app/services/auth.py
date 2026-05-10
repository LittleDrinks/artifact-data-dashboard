"""Authentication service - handles user registration, login, JWT token generation."""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.schemas.auth import TokenResponse, UserLogin, UserRegister, UserResponse


def get_user_by_username(db: Session, username: str) -> User | None:
    """Look up a user by username."""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    """Look up a user by email."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Look up a user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def create_access_token(user_id: int, role: str) -> str:
    """Generate a JWT access token."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def register_user(db: Session, data: UserRegister) -> User:
    """Register a new user. Raises ValueError if username or email already taken."""
    if get_user_by_username(db, data.username):
        raise ValueError("用户名已存在")
    if get_user_by_email(db, data.email):
        raise ValueError("邮箱已被注册")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, data: UserLogin) -> TokenResponse:
    """Authenticate a user and return a JWT token. Raises ValueError on failure."""
    # Try matching by username first, then by email
    user = get_user_by_username(db, data.username)
    if not user:
        user = get_user_by_email(db, data.username)
    if not user:
        raise ValueError("用户名或密码错误")
    if not verify_password(data.password, user.password_hash):
        raise ValueError("用户名或密码错误")

    token = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )
