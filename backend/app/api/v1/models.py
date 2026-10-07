from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import AppSettings, CurrentUser

router = APIRouter(prefix="/models", tags=["models"])


class ModelsOut(BaseModel):
    provider: Literal["mock", "anthropic"]
    models: list[str]
    default: str


@router.get("")
async def list_models(_: CurrentUser, settings: AppSettings) -> ModelsOut:
    """The active LLM provider and the models a user may select in their settings."""
    models = settings.selectable_models
    return ModelsOut(provider=settings.llm_provider, models=models, default=models[0])
