"""Cache-aside for the first page of a user's conversation list (the sidebar).

Writes never update the cached value; they delete the key so the next read reloads it.
Every Redis failure is logged and treated as a cache miss: the app keeps working.
"""

import logging
import uuid

from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.schemas.conversation import ConversationPage

logger = logging.getLogger(__name__)


def conversation_list_key(user_id: uuid.UUID) -> str:
    return f"user:{user_id}:conversations"


class ConversationListCache:
    def __init__(self, redis: Redis, ttl_seconds: int) -> None:
        self.redis = redis
        self.ttl_seconds = ttl_seconds

    async def get(self, user_id: uuid.UUID) -> ConversationPage | None:
        try:
            raw = await self.redis.get(conversation_list_key(user_id))
        except RedisError as exc:
            logger.warning("cache_unavailable", extra={"op": "get", "error": type(exc).__name__})
            return None
        if raw is None:
            return None
        try:
            return ConversationPage.model_validate_json(raw)
        except ValidationError:  # stale shape after a deploy; treat as a miss
            return None

    async def set(self, user_id: uuid.UUID, page: ConversationPage) -> None:
        try:
            await self.redis.set(
                conversation_list_key(user_id), page.model_dump_json(), ex=self.ttl_seconds
            )
        except RedisError as exc:
            logger.warning("cache_unavailable", extra={"op": "set", "error": type(exc).__name__})

    async def invalidate(self, user_id: uuid.UUID) -> None:
        try:
            await self.redis.delete(conversation_list_key(user_id))
        except RedisError as exc:
            # The TTL bounds staleness to 60s even if this delete is lost.
            logger.warning("cache_unavailable", extra={"op": "delete", "error": type(exc).__name__})
