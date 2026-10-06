import uuid
from typing import Any, Literal, get_args

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin

MessageRole = Literal["user", "assistant", "system"]
MessageStatus = Literal["complete", "streaming", "error"]
MESSAGE_ROLES: tuple[str, ...] = get_args(MessageRole)
MESSAGE_STATUSES: tuple[str, ...] = get_args(MessageStatus)


class Message(CreatedAtMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(f"role IN {MESSAGE_ROLES}", name="role_valid"),
        CheckConstraint(f"status IN {MESSAGE_STATUSES}", name="status_valid"),
        Index("ix_messages_conversation_id_created_at", "conversation_id", "created_at"),
        Index(
            "ix_messages_content_trgm",
            "content",
            postgresql_using="gin",
            postgresql_ops={"content": "gin_trgm_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # `metadata` is reserved on declarative classes, so the attribute is `meta`.
    meta: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="complete")
