"""Application settings loaded from environment variables (and `.env` when present)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ChatGPT Clone API"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://chatgpt:change-me@localhost:5432/chatgpt"
    redis_url: str = "redis://localhost:6379/0"

    # HS256 needs >= 32 bytes of key material (RFC 7518 §3.2).
    jwt_secret: str = Field(default="dev-only-insecure-secret-change-me-0123456789", min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 15
    refresh_ttl_days: int = 7
    # A token revoked less than this many seconds ago is treated as a benign race
    # (two tabs refreshing at once), not as theft.
    refresh_reuse_grace_seconds: int = 10
    cookie_secure: bool = True
    bcrypt_rounds: int = Field(default=12, ge=4, le=16)

    rate_limit_login_per_minute: int = 10
    rate_limit_register_per_minute: int = 5
    rate_limit_messages_per_minute: int = 20

    conversation_cache_ttl_seconds: int = 60
    # How many recent messages are sent to the model as context.
    llm_context_messages: int = 20

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    llm_provider: Literal["mock", "anthropic"] = "mock"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    mock_stream_delay_ms: int = 20
    available_models: Annotated[list[str], NoDecode] = [
        "mock",
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "claude-haiku-4-5",
    ]

    @field_validator("cors_origins", "available_models", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
