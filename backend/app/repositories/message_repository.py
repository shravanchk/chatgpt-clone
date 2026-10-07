import uuid
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import Cursor
from app.models import Message


class MessageRepository:
    """Message access. Callers must already have checked conversation ownership."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(
        self,
        conversation_id: uuid.UUID,
        *,
        role: str,
        content: str,
        status: str = "complete",
        meta: dict[str, Any] | None = None,
    ) -> Message:
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            status=status,
            meta=meta or {},
        )
        self.session.add(message)
        await self.session.flush()
        return message

    async def get(self, message_id: uuid.UUID) -> Message | None:
        return await self.session.get(Message, message_id)

    async def has_any(self, conversation_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            select(Message.id).where(Message.conversation_id == conversation_id).limit(1)
        )
        return result.first() is not None

    async def list_before(
        self, conversation_id: uuid.UUID, *, limit: int, before: Cursor | None = None
    ) -> list[Message]:
        """Newest-first page of messages older than `before`."""
        stmt = select(Message).where(Message.conversation_id == conversation_id)
        if before is not None:
            stmt = stmt.where(tuple_(Message.created_at, Message.id) < tuple_(before.at, before.id))
        stmt = stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit)
        return list((await self.session.scalars(stmt)).all())

    async def recent_complete(self, conversation_id: uuid.UUID, limit: int) -> list[Message]:
        """The last `limit` successfully completed messages, oldest first (LLM context)."""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.status == "complete")
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(limit)
        )
        return list(reversed((await self.session.scalars(stmt)).all()))

    async def list_all(self, conversation_id: uuid.UUID) -> list[Message]:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at, Message.id)
        )
        return list((await self.session.scalars(stmt)).all())
