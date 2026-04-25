"""Authentication router - register, login, get current user."""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, TokenResponse, UserResponse
from app.services import auth as auth_service
from app.config import settings

router = APIRouter()
security = HTTPBearer()

# ── Simple in-memory rate limiter ──
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 5  # attempts per window


def _check_rate_limit(client_ip: str) -> None:
    """Raise 429 if client_ip exceeds login rate limit.

    Uses TTL-based lazy cleanup instead of scanning all keys on every request.
    """
    if not settings.RATE_LIMIT_ENABLED:
        return
    now = time.time()

    # Lazy cleanup: only prune entries for this IP (not all IPs)
    # This avoids O(n) scan of all keys on every request
    attempts = _login_attempts[client_ip]
    # Prune old entries for this IP only
    _login_attempts[client_ip] = [t for t in attempts if now - t < _RATE_LIMIT_WINDOW]

    # Periodically clean up empty IPs to prevent memory leak (1% probability)
    # This spreads the cleanup cost across requests instead of doing it every time
    import random
    if random.random() < 0.01:
        empty_ips = [ip for ip, ts in _login_attempts.items() if not ts]
        for ip in empty_ips:
            del _login_attempts[ip]

    if len(_login_attempts[client_ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录尝试过于频繁，请稍后再试",
        )
    _login_attempts[client_ip].append(now)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate the current user from a Bearer JWT token.
    Use as a FastAPI Depends() injection for protected endpoints.
    """
    token = credentials.credentials
    try:
        payload = auth_service.jwt.decode(
            token,
            auth_service.settings.JWT_SECRET_KEY,
            algorithms=[auth_service.settings.JWT_ALGORITHM],
        )
    except auth_service.jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已过期",
        )
    except auth_service.jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token",
        )

    try:
        user_id_int = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token",
        )

    user = auth_service.get_user_by_id(db, user_id_int)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user. Returns user info on success.

    Handles IntegrityError for race condition between uniqueness check and commit.
    """
    from sqlalchemy.exc import IntegrityError

    try:
        user = auth_service.register_user(db, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except IntegrityError:
        # Race condition: concurrent request created duplicate user
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已被注册",
        )
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate user and return JWT access token."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    try:
        token_response = auth_service.authenticate_user(db, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
    return token_response


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's info."""
    return current_user
