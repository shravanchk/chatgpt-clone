"""Test fixtures.

Tests run against a real PostgreSQL database (`chatgpt_test`, created on demand) so that
jsonb, pg_trgm and row locking behave as in production. The schema is built by the real
Alembic migrations. Each test runs inside a transaction that is rolled back afterwards;
service-level `commit()` calls become SAVEPOINT releases, so tests stay isolated.

Start the database first:  docker compose up -d db
"""

import asyncio
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fakeredis.aioredis import FakeRedis
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.core.config import Settings
from app.main import create_app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://chatgpt:change-me@localhost:5432/chatgpt_test"
)
BACKEND_DIR = Path(__file__).resolve().parents[1]
PASSWORD = "correct-horse-battery"


async def _ensure_database(url: str) -> None:
    target = make_url(url)
    admin = create_async_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database}
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    await admin.dispose()


def _migrate(url: str) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    await _ensure_database(TEST_DATABASE_URL)
    # env.py calls asyncio.run(), so run migrations outside this event loop.
    await asyncio.to_thread(_migrate, TEST_DATABASE_URL)
    engine = create_async_engine(TEST_DATABASE_URL)
    yield engine
    await engine.dispose()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        database_url=TEST_DATABASE_URL,
        jwt_secret="test-secret-that-is-at-least-32-bytes-long",
        bcrypt_rounds=4,  # fast hashing in tests
        cookie_secure=False,  # httpx only sends Secure cookies over https
    )


@pytest.fixture
async def redis() -> AsyncIterator[FakeRedis]:
    client = FakeRedis(decode_responses=True)
    yield client
    await client.aclose()


@pytest.fixture
async def app(engine: AsyncEngine, settings: Settings, redis: FakeRedis) -> AsyncIterator[FastAPI]:
    # ASGITransport does not run the lifespan, so wire app.state by hand.
    application = create_app(settings)
    async with engine.connect() as conn:
        transaction = await conn.begin()
        application.state.session_factory = async_sessionmaker(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        application.state.redis = redis
        yield application
        await transaction.rollback()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


RegisterFn = Callable[..., Awaitable[dict[str, Any]]]


@pytest.fixture
def register(client: AsyncClient) -> RegisterFn:
    """Register a user and return the JSON body (user + access_token)."""

    async def _register(
        email: str = "alice@example.com", password: str = PASSWORD, display_name: str = "Alice"
    ) -> dict[str, Any]:
        response = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "display_name": display_name},
        )
        assert response.status_code == 201, response.text
        body: dict[str, Any] = response.json()
        return body

    return _register


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
