import time

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from redis.asyncio import Redis

from app.cache.rate_limit import RateLimiter
from app.cache.redis import create_redis
from app.core.errors import RateLimitedError

LOGIN = "/api/v1/auth/login"
CREDENTIALS = {"email": "x@example.com", "password": "whatever-123"}


async def test_login_is_rate_limited_per_ip(
    client: AsyncClient, app: FastAPI, frozen_rate_limit_clock: None
) -> None:
    limit = app.state.settings.rate_limit_login_per_minute
    for _ in range(limit):
        assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 401

    response = await client.post(LOGIN, json=CREDENTIALS)

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(response.headers["retry-after"]) <= 60


async def test_requests_are_allowed_when_redis_is_down(client: AsyncClient, app: FastAPI) -> None:
    app.state.redis = create_redis("redis://localhost:1/0")  # nothing listens on port 1
    limit = app.state.settings.rate_limit_login_per_minute

    started = time.perf_counter()
    for _ in range(limit + 2):
        assert (await client.post(LOGIN, json=CREDENTIALS)).status_code == 401

    # Fail-fast client: an outage must not add retry/backoff latency to every request.
    assert time.perf_counter() - started < 3

    await app.state.redis.aclose()


async def test_limiter_counts_per_key_and_expires_window(
    redis: Redis, frozen_rate_limit_clock: None
) -> None:
    limiter = RateLimiter(redis)

    await limiter.hit("a", limit=1)
    with pytest.raises(RateLimitedError):
        await limiter.hit("a", limit=1)
    await limiter.hit("b", limit=1)  # separate key, separate counter

    [key_a] = await redis.keys("ratelimit:a:*")
    assert 0 < await redis.ttl(key_a) <= 60
