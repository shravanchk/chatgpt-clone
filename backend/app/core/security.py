"""Password hashing, JWT access tokens and opaque refresh tokens."""

import asyncio
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache

import bcrypt
import jwt

from app.core.config import Settings
from app.core.errors import UnauthorizedError

ACCESS_TOKEN_TYPE = "access"  # noqa: S105  (a claim value, not a secret)


# --- Passwords -------------------------------------------------------------------
# bcrypt is deliberately slow (~250 ms at 12 rounds), so it runs in a worker thread
# to keep the event loop responsive.


async def hash_password(password: str, rounds: int) -> str:
    salt = bcrypt.gensalt(rounds=rounds)
    hashed = await asyncio.to_thread(bcrypt.hashpw, password.encode(), salt)
    return hashed.decode()


async def verify_password(password: str, password_hash: str) -> bool:
    return await asyncio.to_thread(bcrypt.checkpw, password.encode(), password_hash.encode())


@cache
def _dummy_hash(rounds: int) -> bytes:
    return bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt(rounds=rounds))


async def burn_password_check(password: str, rounds: int) -> None:
    """Spend the same time as a real check, so unknown emails are not distinguishable."""
    await asyncio.to_thread(bcrypt.checkpw, password.encode(), _dummy_hash(rounds))


# --- Access tokens (JWT) ---------------------------------------------------------


@dataclass(frozen=True)
class AccessToken:
    token: str
    expires_in: int  # seconds


def create_access_token(user_id: uuid.UUID, settings: Settings) -> AccessToken:
    now = datetime.now(UTC)
    ttl = timedelta(minutes=settings.jwt_access_ttl_minutes)
    claims = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + ttl,
    }
    token = jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return AccessToken(token=token, expires_in=int(ttl.total_seconds()))


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    """Return the user id, or raise UnauthorizedError for any invalid/expired token."""
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat", "type"]},
        )
        if claims["type"] != ACCESS_TOKEN_TYPE:
            raise UnauthorizedError("Invalid access token", code="invalid_token")
        return uuid.UUID(claims["sub"])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token expired", code="token_expired") from exc
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise UnauthorizedError("Invalid access token", code="invalid_token") from exc


# --- Refresh tokens (opaque, stored hashed) ---------------------------------------


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    # A fast hash is fine here: the input is 256 bits of randomness, not a password.
    return hashlib.sha256(token.encode()).hexdigest()
