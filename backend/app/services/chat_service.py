"""Send a message and stream the assistant's reply.

Two phases, so that every failure that can be reported as a normal HTTP error is:

1. `prepare` (inside the request): check ownership, save the user message and an empty
   assistant placeholder (`status=streaming`), name the conversation, commit.
2. `stream` (inside the SSE response): call the LLM, forward deltas, then finalize the
   placeholder as `complete`, or as `error` with the partial text if the provider fails
   or the client disconnects. Uses its own DB session, because it outlives the request.
"""

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field

import anyio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sse_starlette import ServerSentEvent

from app.cache.conversation_cache import ConversationListCache
from app.core.config import Settings
from app.llm.base import (
    Action,
    ActionsEvent,
    ChatMessage,
    GenerationSettings,
    LLMError,
    LLMProvider,
    TextDelta,
)
from app.models import Message
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.settings_repository import SettingsRepository
from app.schemas.conversation import MessageOut
from app.services.conversation_service import DEFAULT_TITLE, ConversationService

logger = logging.getLogger(__name__)

TITLE_MAX_LENGTH = 60


@dataclass
class PreparedTurn:
    user_id: uuid.UUID
    conversation_id: uuid.UUID
    user_message: MessageOut
    assistant_message_id: uuid.UUID
    history: list[ChatMessage]
    generation: GenerationSettings
    title: str


@dataclass
class _StreamResult:
    parts: list[str] = field(default_factory=list)
    actions: list[Action] = field(default_factory=list)
    error: LLMError | None = None


def title_from_message(content: str) -> str:
    first_line = " ".join(content.split())
    if len(first_line) <= TITLE_MAX_LENGTH:
        return first_line
    return first_line[: TITLE_MAX_LENGTH - 1].rsplit(" ", 1)[0] + "…"


def _event(name: str, data: object) -> ServerSentEvent:
    return ServerSentEvent(event=name, data=json.dumps(data, default=str))


class ChatService:
    def __init__(
        self,
        session: AsyncSession,
        session_factory: async_sessionmaker[AsyncSession],
        provider: LLMProvider,
        cache: ConversationListCache,
        settings: Settings,
    ) -> None:
        self.session = session
        self.session_factory = session_factory
        self.provider = provider
        self.cache = cache
        self.settings = settings

    async def prepare(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID, content: str
    ) -> PreparedTurn:
        conversation = await ConversationService(self.session, self.cache).get_owned(
            user_id, conversation_id
        )
        messages = MessageRepository(self.session)

        context = await messages.recent_complete(
            conversation_id, self.settings.llm_context_messages
        )
        is_first_message = not await messages.has_any(conversation_id)

        user_message = await messages.add(conversation_id, role="user", content=content)
        assistant = await messages.add(
            conversation_id, role="assistant", content="", status="streaming"
        )
        if is_first_message and conversation.title == DEFAULT_TITLE:
            conversation.title = title_from_message(content)
        await ConversationRepository(self.session).touch(conversation)

        user_settings = await SettingsRepository(self.session).get(user_id)
        await self.session.commit()
        await self.cache.invalidate(user_id)

        history = [
            ChatMessage(role=m.role, content=m.content)  # type: ignore[arg-type]
            for m in context
            if m.role in ("user", "assistant") and m.content
        ]
        history.append(ChatMessage(role="user", content=content))
        return PreparedTurn(
            user_id=user_id,
            conversation_id=conversation_id,
            user_message=MessageOut.model_validate(user_message),
            assistant_message_id=assistant.id,
            history=history,
            generation=GenerationSettings(
                model=user_settings.model if user_settings else "mock",
                system_prompt=user_settings.system_prompt if user_settings else None,
            ),
            title=conversation.title,
        )

    async def stream(self, turn: PreparedTurn) -> AsyncGenerator[ServerSentEvent]:
        yield _event(
            "message_start",
            {
                "conversation_id": turn.conversation_id,
                "title": turn.title,
                "user_message": turn.user_message.model_dump(mode="json"),
                "assistant_message_id": turn.assistant_message_id,
            },
        )

        result = _StreamResult()
        finished = False
        try:
            async for event in self.provider.stream(turn.history, turn.generation):
                if isinstance(event, TextDelta):
                    result.parts.append(event.text)
                    yield _event("delta", {"text": event.text})
                elif isinstance(event, ActionsEvent):
                    result.actions = event.actions
                    yield _event(
                        "actions",
                        {
                            "actions": [
                                {"label": a.label, "prompt": a.prompt} for a in event.actions
                            ]
                        },
                    )
            finished = True
        except LLMError as exc:
            result.error = exc
        except Exception:
            logger.exception("llm_stream_failed")
            result.error = LLMError("Something went wrong while generating the response.")
        finally:
            # Runs on success, provider error *and* client disconnect (cancellation).
            # Shield it so a cancelled request still records what was generated.
            with anyio.CancelScope(shield=True):
                message = await self._finalize(turn, result, complete=finished)

        if result.error is not None:
            yield _event(
                "error",
                {
                    "code": result.error.code,
                    "message": result.error.message,
                    "assistant_message_id": turn.assistant_message_id,
                },
            )
        else:
            yield _event("message_end", {"message": message.model_dump(mode="json")})

    async def _finalize(
        self, turn: PreparedTurn, result: _StreamResult, *, complete: bool
    ) -> MessageOut:
        async with self.session_factory() as session:
            message = await session.get(Message, turn.assistant_message_id)
            if message is None:  # deleted mid-stream (e.g. conversation hard-deleted)
                raise LookupError("assistant message disappeared")
            message.content = "".join(result.parts)
            message.status = "complete" if complete else "error"
            message.meta = {
                "actions": [{"label": a.label, "prompt": a.prompt} for a in result.actions]
            }
            conversation = await ConversationRepository(session).get_for_user(
                turn.user_id, turn.conversation_id
            )
            if conversation is not None:
                await ConversationRepository(session).touch(conversation)
            await session.commit()
            out = MessageOut.model_validate(message)
        await self.cache.invalidate(turn.user_id)
        logger.info(
            "assistant_message_finalized",
            extra={"message_id": str(message.id), "status": out.status, "chars": len(out.content)},
        )
        return out
