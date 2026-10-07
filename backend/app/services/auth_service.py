import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import (
    AccessToken,
    burn_password_check,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import User
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.settings_repository import SettingsRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthResult:
    user: User
    access: AccessToken
    refresh_token: str
    refresh_expires_at: datetime


def _invalid_refresh() -> UnauthorizedError:
    return UnauthorizedError("Session expired, please log in again", code="invalid_refresh_token")


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.users = UserRepository(session)
        self.user_settings = SettingsRepository(session)
        self.tokens = RefreshTokenRepository(session)

    async def register(self, data: RegisterRequest) -> AuthResult:
        if await self.users.get_by_email(data.email):
            raise ConflictError("An account with this email already exists", code="email_taken")

        password_hash = await hash_password(data.password, self.settings.bcrypt_rounds)
        try:
            user = await self.users.add(
                email=data.email, password_hash=password_hash, display_name=data.display_name
            )
            await self.user_settings.add_default(user.id)
            result = await self._issue_tokens(user)
            await self.session.commit()
        except IntegrityError as exc:  # concurrent registration with the same email
            await self.session.rollback()
            raise ConflictError(
                "An account with this email already exists", code="email_taken"
            ) from exc

        logger.info("user_registered", extra={"user_id": str(user.id)})
        return result

    async def login(self, data: LoginRequest) -> AuthResult:
        user = await self.users.get_by_email(data.email)
        if user is None:
            await burn_password_check(data.password, self.settings.bcrypt_rounds)
            raise UnauthorizedError("Invalid email or password", code="invalid_credentials")
        if not await verify_password(data.password, user.password_hash):
            raise UnauthorizedError("Invalid email or password", code="invalid_credentials")

        result = await self._issue_tokens(user)
        await self.session.commit()
        logger.info("user_logged_in", extra={"user_id": str(user.id)})
        return result

    async def refresh(self, raw_token: str | None) -> AuthResult:
        """Rotate a refresh token. Reuse of a revoked token revokes the whole family."""
        if not raw_token:
            raise _invalid_refresh()

        token = await self.tokens.get_by_hash_for_update(hash_refresh_token(raw_token))
        if token is None:
            raise _invalid_refresh()

        now = datetime.now(UTC)
        if token.revoked_at is not None:
            grace = timedelta(seconds=self.settings.refresh_reuse_grace_seconds)
            if now - token.revoked_at > grace:
                await self.tokens.revoke_all_for_user(token.user_id, now)
                await self.session.commit()
                logger.warning(
                    "refresh_token_reuse_detected", extra={"user_id": str(token.user_id)}
                )
            raise _invalid_refresh()

        if token.expires_at <= now:
            raise _invalid_refresh()

        user = await self.users.get_by_id(token.user_id)
        if user is None:
            raise _invalid_refresh()

        token.revoked_at = now
        result = await self._issue_tokens(user)
        await self.session.commit()
        return result

    async def logout(self, raw_token: str | None) -> None:
        """Revoke the presented refresh token. Idempotent: unknown tokens are ignored."""
        if not raw_token:
            return
        token = await self.tokens.get_by_hash_for_update(hash_refresh_token(raw_token))
        if token is not None and token.revoked_at is None:
            token.revoked_at = datetime.now(UTC)
            await self.session.commit()

    async def _issue_tokens(self, user: User) -> AuthResult:
        raw = generate_refresh_token()
        expires_at = datetime.now(UTC) + timedelta(days=self.settings.refresh_ttl_days)
        await self.tokens.add(
            user_id=user.id, token_hash=hash_refresh_token(raw), expires_at=expires_at
        )
        return AuthResult(
            user=user,
            access=create_access_token(user.id, self.settings),
            refresh_token=raw,
            refresh_expires_at=expires_at,
        )
