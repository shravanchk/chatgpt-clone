"""Fixed-window rate limiter backed by Redis.

One counter per (key, window): `INCR` then `EXPIRE` on first hit. Simple and cheap; the
known trade-off is that a client can burst up to 2x the limit across a window boundary.
"""

import logging
import time

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.errors import RateLimitedError

logger = logging.getLogger(__name__)


def _now() -> float:
    return time.time()  # indirection so tests can pin the window without freezing time globally


class RateLimiter:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    async def hit(self, key: str, *, limit: int, window_seconds: int = 60) -> None:
        """Count one request; raise RateLimitedError when over the limit.

        Fails open: if Redis is unavailable the request is allowed and a warning logged.
        """
        now = _now()
        window = int(now // window_seconds)
        redis_key = f"ratelimit:{key}:{window}"
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.incr(redis_key)
                pipe.expire(redis_key, window_seconds, nx=True)
                count, _ = await pipe.execute()
        except RedisError as exc:
            logger.warning("rate_limit_unavailable", extra={"error": type(exc).__name__})
            return

        if count > limit:
            retry_after = max(1, int((window + 1) * window_seconds - now))
            raise RateLimitedError(retry_after=retry_after)
