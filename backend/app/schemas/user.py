import uuid
from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Theme = Literal["light", "dark", "system"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    theme: Theme
    model: str
    system_prompt: str | None
    updated_at: datetime


class SettingsUpdate(BaseModel):
    """Partial update: only fields present in the request body are changed."""

    model_config = ConfigDict(extra="forbid")

    theme: Theme | None = None
    model: str | None = Field(default=None, min_length=1, max_length=100)
    system_prompt: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _non_nullable_fields(self) -> Self:
        # `system_prompt: null` clears it; theme and model cannot be cleared.
        for name in ("theme", "model"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self
