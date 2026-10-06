import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Literal, get_args

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User

Theme = Literal["light", "dark", "system"]
THEMES: tuple[str, ...] = get_args(Theme)


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (CheckConstraint(f"theme IN {THEMES}", name="theme_valid"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    theme: Mapped[str] = mapped_column(String(10), nullable=False, server_default="system")
    model: Mapped[str] = mapped_column(String(100), nullable=False, server_default="mock")
    system_prompt: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="settings", lazy="raise")
