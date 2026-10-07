import json
import re
import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.conversation_cache import ConversationListCache
from app.core.errors import NotFoundError
from app.core.pagination import decode_cursor, encode_cursor
from app.models import Conversation, Message
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.message_repository import MessageRepository
from app.schemas.conversation import (
    ConversationOut,
    ConversationPage,
    MessageOut,
    MessagePage,
)

DEFAULT_TITLE = "New chat"
DEFAULT_PAGE_SIZE = 30

ExportFormat = Literal["md", "json"]


@dataclass(frozen=True)
class ExportFile:
    filename: str
    media_type: str
    content: str


def conversation_not_found() -> NotFoundError:
    return NotFoundError("Conversation not found", code="conversation_not_found")


class ConversationService:
    def __init__(self, session: AsyncSession, cache: ConversationListCache) -> None:
        self.session = session
        self.cache = cache
        self.conversations = ConversationRepository(session)
        self.messages = MessageRepository(session)

    async def get_owned(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> Conversation:
        """The conversation, or 404 if it doesn't exist *or belongs to someone else*."""
        conversation = await self.conversations.get_for_user(user_id, conversation_id)
        if conversation is None:
            raise conversation_not_found()
        return conversation

    async def list(
        self,
        user_id: uuid.UUID,
        *,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
        search: str | None = None,
    ) -> ConversationPage:
        search = search.strip() if search else None
        # Only the default sidebar view (first page, no search) is cached.
        cacheable = cursor is None and not search and limit == DEFAULT_PAGE_SIZE
        if cacheable and (cached := await self.cache.get(user_id)) is not None:
            return cached

        rows = await self.conversations.list_for_user(
            user_id,
            limit=limit + 1,
            after=decode_cursor(cursor) if cursor else None,
            search=search,
        )
        items, has_more = rows[:limit], len(rows) > limit
        page = ConversationPage(
            items=[ConversationOut.model_validate(c) for c in items],
            next_cursor=encode_cursor(items[-1].updated_at, items[-1].id) if has_more else None,
        )
        if cacheable:
            await self.cache.set(user_id, page)
        return page

    async def create(self, user_id: uuid.UUID, title: str | None) -> Conversation:
        conversation = await self.conversations.add(user_id, title or DEFAULT_TITLE)
        await self.session.commit()
        await self.cache.invalidate(user_id)
        return conversation

    async def rename(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID, title: str
    ) -> Conversation:
        conversation = await self.get_owned(user_id, conversation_id)
        conversation.title = title
        await self.conversations.touch(conversation)
        await self.session.commit()
        await self.cache.invalidate(user_id)
        return conversation

    async def delete(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        conversation = await self.get_owned(user_id, conversation_id)
        await self.conversations.soft_delete(conversation)
        await self.session.commit()
        await self.cache.invalidate(user_id)

    async def list_messages(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        *,
        limit: int = 50,
        cursor: str | None = None,
    ) -> MessagePage:
        """Latest messages first page; `next_cursor` walks back in time."""
        await self.get_owned(user_id, conversation_id)
        rows = await self.messages.list_before(
            conversation_id, limit=limit + 1, before=decode_cursor(cursor) if cursor else None
        )
        page, has_more = rows[:limit], len(rows) > limit
        oldest = page[-1] if page else None
        return MessagePage(
            items=[MessageOut.model_validate(m) for m in reversed(page)],
            next_cursor=encode_cursor(oldest.created_at, oldest.id)
            if has_more and oldest
            else None,
        )

    async def export(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID, fmt: ExportFormat
    ) -> ExportFile:
        conversation = await self.get_owned(user_id, conversation_id)
        messages = await self.messages.list_all(conversation_id)
        slug = re.sub(r"[^a-z0-9]+", "-", conversation.title.lower()).strip("-")[:50] or "chat"

        if fmt == "json":
            payload = {
                "conversation": ConversationOut.model_validate(conversation).model_dump(
                    mode="json"
                ),
                "messages": [
                    MessageOut.model_validate(m).model_dump(mode="json") for m in messages
                ],
            }
            return ExportFile(f"{slug}.json", "application/json", json.dumps(payload, indent=2))
        return ExportFile(f"{slug}.md", "text/markdown", _to_markdown(conversation, messages))


def _to_markdown(conversation: Conversation, messages: list[Message]) -> str:
    speaker = {"user": "You", "assistant": "Assistant", "system": "System"}
    lines = [
        f"# {conversation.title}",
        "",
        f"_Exported conversation · started {conversation.created_at:%Y-%m-%d %H:%M} UTC_",
        "",
    ]
    for message in messages:
        lines += ["---", "", f"**{speaker.get(message.role, message.role)}:**", "", message.content]
        if message.status == "error":
            lines += ["", "_(response interrupted)_"]
        lines.append("")
    return "\n".join(lines)
