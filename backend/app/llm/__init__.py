from fastapi import Request

from app.core.config import Settings
from app.llm.base import LLMProvider
from app.llm.mock_provider import MockProvider


def create_llm_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY")
        from app.llm.anthropic_provider import AnthropicProvider  # optional dependency path

        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
    return MockProvider(delay_seconds=settings.mock_stream_delay_ms / 1000)


def get_llm_provider(request: Request) -> LLMProvider:
    provider: LLMProvider = request.app.state.llm
    return provider
