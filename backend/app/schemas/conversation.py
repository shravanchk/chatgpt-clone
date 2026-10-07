import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, StringConstraints

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
MessageContent = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32_000)
]


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None


class ConversationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationPage(BaseModel):
    items: list[ConversationOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to fetch the next (older) page; null on the last page."
    )


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: MessageContent


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: Literal["user", "assistant", "system"]
    content: str
    # ORM attribute is `meta` (SQLAlchemy reserves `metadata`); the API field is `metadata`.
    metadata: dict[str, Any] = Field(validation_alias=AliasChoices("meta", "metadata"))
    status: Literal["complete", "streaming", "error"]
    created_at: datetime


class MessagePage(BaseModel):
    items: list[MessageOut] = Field(description="Oldest first within the page.")
    next_cursor: str | None = Field(
        description="Pass as `cursor` to load earlier messages; null when none remain."
    )
