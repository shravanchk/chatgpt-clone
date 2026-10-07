import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserSettings


class SettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: uuid.UUID) -> UserSettings | None:
        return await self.session.get(UserSettings, user_id)

    async def add_default(self, user_id: uuid.UUID) -> UserSettings:
        settings = UserSettings(user_id=user_id)
        self.session.add(settings)
        await self.session.flush()
        return settings

    async def update(self, settings: UserSettings, changes: dict[str, Any]) -> UserSettings:
        for field, value in changes.items():
            setattr(settings, field, value)
        await self.session.flush()
        # `updated_at` is set by the DB (onupdate=now()); reload it.
        await self.session.refresh(settings)
        return settings
