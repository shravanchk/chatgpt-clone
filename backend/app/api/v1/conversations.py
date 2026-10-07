import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sse_starlette import EventSourceResponse

from app.api.deps import ChatSvc, ConversationSvc, CurrentUser, user_rate_limit
from app.schemas.conversation import (
    ConversationCreate,
    ConversationOut,
    ConversationPage,
    ConversationUpdate,
    MessageCreate,
    MessagePage,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])

SSE_DESCRIPTION = """\
`text/event-stream` with these events (each `data` is JSON):

| event | data |
|---|---|
| `message_start` | `{conversation_id, title, user_message, assistant_message_id}` |
| `delta` | `{text}` - the next chunk of the reply |
| `actions` | `{actions: [{label, prompt}]}` - follow-up suggestions |
| `message_end` | `{message}` - the saved assistant message |
| `error` | `{code, message, assistant_message_id}` - partial reply saved with `status=error` |
"""


@router.get("")
async def list_conversations(
    user: CurrentUser,
    service: ConversationSvc,
    search: Annotated[str | None, Query(max_length=200)] = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ConversationPage:
    """The user's conversations, most recently active first. `search` matches titles and
    message text."""
    return await service.list(user.id, limit=limit, cursor=cursor, search=search)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate, user: CurrentUser, service: ConversationSvc
) -> ConversationOut:
    return ConversationOut.model_validate(await service.create(user.id, body.title))


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, service: ConversationSvc
) -> ConversationOut:
    return ConversationOut.model_validate(await service.get_owned(user.id, conversation_id))


@router.patch("/{conversation_id}")
async def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    user: CurrentUser,
    service: ConversationSvc,
) -> ConversationOut:
    return ConversationOut.model_validate(
        await service.rename(user.id, conversation_id, body.title)
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, service: ConversationSvc
) -> None:
    await service.delete(user.id, conversation_id)


@router.get("/{conversation_id}/messages")
async def list_messages(
    conversation_id: uuid.UUID,
    user: CurrentUser,
    service: ConversationSvc,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> MessagePage:
    """Newest page first; follow `next_cursor` to load earlier messages."""
    return await service.list_messages(user.id, conversation_id, limit=limit, cursor=cursor)


@router.post(
    "/{conversation_id}/messages",
    response_class=EventSourceResponse,
    dependencies=[Depends(user_rate_limit("messages", lambda s: s.rate_limit_messages_per_minute))],
    responses={200: {"content": {"text/event-stream": {}}, "description": SSE_DESCRIPTION}},
)
async def send_message(
    conversation_id: uuid.UUID, body: MessageCreate, user: CurrentUser, chat: ChatSvc
) -> EventSourceResponse:
    """Save the user's message and stream the assistant's reply as Server-Sent Events."""
    turn = await chat.prepare(user.id, conversation_id, body.content)
    return EventSourceResponse(
        chat.stream(turn),
        ping=15,
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{conversation_id}/export")
async def export_conversation(
    conversation_id: uuid.UUID,
    user: CurrentUser,
    service: ConversationSvc,
    format: Literal["md", "json"] = "md",
) -> Response:
    export = await service.export(user.id, conversation_id, format)
    return Response(
        content=export.content,
        media_type=export.media_type,
        headers={"Content-Disposition": f'attachment; filename="{export.filename}"'},
    )
