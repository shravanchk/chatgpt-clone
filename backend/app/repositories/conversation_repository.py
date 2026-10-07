import uuid

from sqlalchemy import exists, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import Cursor
from app.db.base import utc_now
from app.models import Conversation, Message


def _like_pattern(term: str) -> str:
    """`%term%` with LIKE wildcards in the user's input escaped."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class ConversationRepository:
    """All queries are scoped to one user and exclude soft-deleted rows."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_for_user(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID
    ) -> Conversation | None:
        result = await self.session.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
                Conversation.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        limit: int,
        after: Cursor | None = None,
        search: str | None = None,
    ) -> list[Conversation]:
        """Newest activity first. Returns up to `limit` rows (callers ask for one extra)."""
        stmt = select(Conversation).where(
            Conversation.user_id == user_id, Conversation.deleted_at.is_(None)
        )
        if after is not None:
            stmt = stmt.where(
                tuple_(Conversation.updated_at, Conversation.id) < tuple_(after.at, after.id)
            )
        if search:
            pattern = _like_pattern(search)
            in_messages = exists().where(
                Message.conversation_id == Conversation.id,
                Message.content.ilike(pattern, escape="\\"),
            )
            stmt = stmt.where(or_(Conversation.title.ilike(pattern, escape="\\"), in_messages))
        stmt = stmt.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).limit(limit)
        return list((await self.session.scalars(stmt)).all())

    async def add(self, user_id: uuid.UUID, title: str) -> Conversation:
        conversation = Conversation(user_id=user_id, title=title)
        self.session.add(conversation)
        await self.session.flush()
        await self.session.refresh(conversation)
        return conversation

    async def touch(self, conversation: Conversation) -> None:
        """Mark activity so the conversation moves to the top of the sidebar."""
        conversation.updated_at = utc_now()
        await self.session.flush()

    async def soft_delete(self, conversation: Conversation) -> None:
        conversation.deleted_at = utc_now()
        await self.session.flush()
