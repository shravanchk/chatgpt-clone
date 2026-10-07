from fastapi import Request
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff


def create_redis(url: str, *, connect_timeout: float = 1.0) -> Redis:
    """Redis client tuned to fail fast.

    Redis only backs optional features (cache, rate limits), so when it is down we degrade
    immediately instead of the default retry-with-backoff, which adds seconds per request.
    One immediate retry still recovers a stale pooled connection.
    """
    return Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=connect_timeout,
        socket_timeout=connect_timeout,
        retry=Retry(NoBackoff(), retries=1),
    )


def get_redis(request: Request) -> Redis:
    redis: Redis = request.app.state.redis
    return redis
