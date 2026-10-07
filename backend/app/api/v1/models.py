from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import AppSettings, CurrentUser

router = APIRouter(prefix="/models", tags=["models"])


class ModelsOut(BaseModel):
    models: list[str]
    default: str


@router.get("")
async def list_models(_: CurrentUser, settings: AppSettings) -> ModelsOut:
    """Models a user may select in their settings."""
    return ModelsOut(models=settings.available_models, default=settings.available_models[0])
