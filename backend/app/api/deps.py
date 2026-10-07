"""Shared FastAPI dependencies, aliased with `Annotated` for concise router signatures."""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.rate_limit import RateLimiter
from app.cache.redis import get_redis
from app.core.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.services.settings_service import SettingsService


def get_app_settings(request: Request) -> Settings:
    """Settings the app was created with (lets tests inject their own)."""
    settings: Settings = request.app.state.settings
    return settings


DbSession = Annotated[AsyncSession, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_app_settings)]
RedisClient = Annotated[Redis, Depends(get_redis)]

_bearer = HTTPBearer(auto_error=False, description="Access token from /auth/login")


async def get_current_user(
    db: DbSession,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise UnauthorizedError()
    user_id = decode_access_token(credentials.credentials, settings)
    user = await UserRepository(db).get_by_id(user_id)
    if user is None:
        raise UnauthorizedError("Invalid access token", code="invalid_token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_auth_service(db: DbSession, settings: AppSettings) -> AuthService:
    return AuthService(db, settings)


def get_settings_service(db: DbSession, settings: AppSettings) -> SettingsService:
    return SettingsService(db, settings)


AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
SettingsSvc = Annotated[SettingsService, Depends(get_settings_service)]


def rate_limit(scope: str, limit: Callable[[Settings], int]) -> Callable[..., Awaitable[None]]:
    """Per-client-IP fixed-window limit for an endpoint, e.g. `rate_limit("login", ...)`."""

    async def dependency(request: Request, redis: RedisClient, settings: AppSettings) -> None:
        client_ip = request.client.host if request.client else "unknown"
        await RateLimiter(redis).hit(f"{scope}:ip:{client_ip}", limit=limit(settings))

    return dependency
