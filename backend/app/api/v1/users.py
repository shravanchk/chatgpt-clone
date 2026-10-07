from fastapi import APIRouter

from app.api.deps import CurrentUser, SettingsSvc
from app.schemas.user import SettingsOut, SettingsUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/me/settings")
async def get_my_settings(user: CurrentUser, service: SettingsSvc) -> SettingsOut:
    return SettingsOut.model_validate(await service.get(user.id))


@router.patch("/me/settings")
async def update_my_settings(
    body: SettingsUpdate, user: CurrentUser, service: SettingsSvc
) -> SettingsOut:
    return SettingsOut.model_validate(await service.update(user.id, body))
