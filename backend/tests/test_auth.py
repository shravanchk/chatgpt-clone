from datetime import UTC, datetime, timedelta

import jwt
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.models import RefreshToken, User, UserSettings
from tests.conftest import PASSWORD, RegisterFn, bearer

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/users/me"


def _session(app: FastAPI) -> AsyncSession:
    factory: async_sessionmaker[AsyncSession] = app.state.session_factory
    return factory()


# --- register --------------------------------------------------------------------


async def test_register_creates_user_settings_and_logs_in(
    client: AsyncClient, app: FastAPI
) -> None:
    response = await client.post(
        REGISTER,
        json={"email": "Alice@Example.com", "password": PASSWORD, "display_name": " Alice "},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["display_name"] == "Alice"
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert "password" not in response.text

    cookie = response.headers["set-cookie"].lower()
    assert "refresh_token=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/api/v1/auth" in cookie

    async with _session(app) as session:
        user = await session.scalar(select(User).where(User.email == "alice@example.com"))
        assert user is not None
        assert user.password_hash.startswith("$2")  # bcrypt, never plaintext
        assert await session.get(UserSettings, user.id) is not None


async def test_register_duplicate_email_is_case_insensitive(
    client: AsyncClient, register: RegisterFn
) -> None:
    await register(email="bob@example.com")

    response = await client.post(
        REGISTER,
        json={"email": "BOB@example.com", "password": PASSWORD, "display_name": "Bob 2"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


async def test_register_rejects_weak_password_and_bad_email(client: AsyncClient) -> None:
    short = await client.post(
        REGISTER, json={"email": "c@example.com", "password": "short", "display_name": "C"}
    )
    too_long = await client.post(
        REGISTER, json={"email": "c@example.com", "password": "x" * 73, "display_name": "C"}
    )
    bad_email = await client.post(
        REGISTER, json={"email": "not-an-email", "password": PASSWORD, "display_name": "C"}
    )

    for response in (short, too_long, bad_email):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


# --- login -----------------------------------------------------------------------


async def test_login_returns_access_token_and_cookie(
    client: AsyncClient, register: RegisterFn
) -> None:
    await register()

    response = await client.post(LOGIN, json={"email": "ALICE@example.com", "password": PASSWORD})

    assert response.status_code == 200
    token = response.json()["access_token"]
    assert "refresh_token=" in response.headers["set-cookie"]
    me = await client.get(ME, headers=bearer(token))
    assert me.json()["email"] == "alice@example.com"


async def test_login_wrong_password_and_unknown_email_are_indistinguishable(
    client: AsyncClient, register: RegisterFn
) -> None:
    await register()

    wrong_password = await client.post(
        LOGIN, json={"email": "alice@example.com", "password": "nope-nope"}
    )
    unknown_email = await client.post(
        LOGIN, json={"email": "ghost@example.com", "password": PASSWORD}
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert wrong_password.json()["error"]["code"] == "invalid_credentials"


# --- access token ----------------------------------------------------------------


async def test_me_requires_valid_token(client: AsyncClient, settings: Settings) -> None:
    missing = await client.get(ME)
    garbage = await client.get(ME, headers=bearer("not-a-jwt"))
    now = datetime.now(UTC)
    expired_token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000000",
            "type": "access",
            "iat": now - timedelta(hours=1),
            "exp": now - timedelta(minutes=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    expired = await client.get(ME, headers=bearer(expired_token))

    assert missing.status_code == garbage.status_code == expired.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"
    assert garbage.json()["error"]["code"] == "invalid_token"
    assert expired.json()["error"]["code"] == "token_expired"


async def test_token_signed_with_other_secret_is_rejected(
    client: AsyncClient, register: RegisterFn
) -> None:
    user_id = (await register())["user"]["id"]
    now = datetime.now(UTC)
    forged = jwt.encode(
        {"sub": user_id, "type": "access", "iat": now, "exp": now + timedelta(minutes=5)},
        "attacker-controlled-secret-of-32-bytes+",
        algorithm="HS256",
    )

    response = await client.get(ME, headers=bearer(forged))

    assert response.status_code == 401


# --- refresh / rotation ----------------------------------------------------------


async def test_refresh_rotates_token(client: AsyncClient, register: RegisterFn) -> None:
    await register()
    old_cookie = client.cookies["refresh_token"]

    response = await client.post(REFRESH)

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "alice@example.com"
    new_cookie = client.cookies["refresh_token"]
    assert new_cookie != old_cookie
    me = await client.get(ME, headers=bearer(response.json()["access_token"]))
    assert me.status_code == 200


async def test_refresh_without_cookie_is_401(client: AsyncClient) -> None:
    response = await client.post(REFRESH)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_refresh_token"


async def test_reused_refresh_token_revokes_all_sessions(
    client: AsyncClient, register: RegisterFn, app: FastAPI
) -> None:
    await register()
    stolen = client.cookies["refresh_token"]
    await client.post(REFRESH)  # legitimate rotation; `stolen` is now revoked
    current = client.cookies["refresh_token"]

    # Move the revocation outside the grace window, as if the thief replays it later.
    async with _session(app) as session:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.revoked_at.is_not(None))
            .values(revoked_at=text("now() - interval '1 minute'"))
        )
        await session.commit()

    client.cookies.set("refresh_token", stolen, path="/api/v1/auth")
    reuse = await client.post(REFRESH)
    assert reuse.status_code == 401

    # The legitimate session was revoked too.
    client.cookies.set("refresh_token", current, path="/api/v1/auth")
    after = await client.post(REFRESH)
    assert after.status_code == 401
    async with _session(app) as session:
        active = await session.scalar(select(RefreshToken).where(RefreshToken.revoked_at.is_(None)))
        assert active is None


async def test_reuse_within_grace_window_does_not_revoke_all(
    client: AsyncClient, register: RegisterFn
) -> None:
    """Two tabs refreshing at the same time must not log the user out everywhere."""
    await register()
    first = client.cookies["refresh_token"]
    await client.post(REFRESH)
    current = client.cookies["refresh_token"]

    client.cookies.set("refresh_token", first, path="/api/v1/auth")
    racing = await client.post(REFRESH)
    assert racing.status_code == 401

    client.cookies.set("refresh_token", current, path="/api/v1/auth")
    assert (await client.post(REFRESH)).status_code == 200


async def test_expired_refresh_token_is_rejected(
    client: AsyncClient, register: RegisterFn, app: FastAPI
) -> None:
    await register()
    async with _session(app) as session:
        await session.execute(
            update(RefreshToken).values(expires_at=text("now() - interval '1 second'"))
        )
        await session.commit()

    response = await client.post(REFRESH)

    assert response.status_code == 401


# --- logout ----------------------------------------------------------------------


async def test_logout_revokes_refresh_token_and_clears_cookie(
    client: AsyncClient, register: RegisterFn
) -> None:
    await register()
    token = client.cookies["refresh_token"]

    response = await client.post(LOGOUT)

    assert response.status_code == 204
    assert 'refresh_token=""' in response.headers["set-cookie"] or "max-age=0" in (
        response.headers["set-cookie"].lower()
    )
    client.cookies.set("refresh_token", token, path="/api/v1/auth")
    assert (await client.post(REFRESH)).status_code == 401


async def test_logout_without_cookie_is_idempotent(client: AsyncClient) -> None:
    assert (await client.post(LOGOUT)).status_code == 204
