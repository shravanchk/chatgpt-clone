import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import UnprocessableError
from app.models import UserSettings
from app.repositories.settings_repository import SettingsRepository
from app.schemas.user import SettingsUpdate


class SettingsService:
    def __init__(self, session: AsyncSession, app_settings: Settings) -> None:
        self.session = session
        self.app_settings = app_settings
        self.repo = SettingsRepository(session)

    async def get(self, user_id: uuid.UUID) -> UserSettings:
        settings = await self.repo.get(user_id)
        if settings is None:  # e.g. a user created before settings existed
            settings = await self.repo.add_default(user_id)
            await self.session.commit()
        return settings

    async def update(self, user_id: uuid.UUID, data: SettingsUpdate) -> UserSettings:
        changes = data.model_dump(exclude_unset=True)
        model = changes.get("model")
        if model is not None and model not in self.app_settings.selectable_models:
            raise UnprocessableError(
                f"Unknown model '{model}'",
                code="invalid_model",
                details={"available_models": self.app_settings.selectable_models},
            )

        settings = await self.get(user_id)
        if changes:
            settings = await self.repo.update(settings, changes)
            await self.session.commit()
        return settings
