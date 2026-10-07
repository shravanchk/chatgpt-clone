"""Claude via the Anthropic SDK, streamed token by token."""

import logging
from collections.abc import AsyncIterator

import anthropic
from anthropic.types.beta import BetaMessageParam

from app.llm.base import (
    ChatMessage,
    GenerationSettings,
    LLMError,
    StreamEvent,
    TextDelta,
    build_system_prompt,
)

logger = logging.getLogger(__name__)

MAX_TOKENS = 32_000
# Models that support server-side refusal fallbacks ("default" routing) and `effort`.
# Haiku 4.5 rejects `effort`, so it gets neither.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MODELS_WITH_FALLBACK_AND_EFFORT = frozenset({"claude-opus-5-5", "claude-sonnet-5-5"})


class AnthropicProvider:
    def __init__(self, api_key: str, default_model: str) -> None:
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.default_model = default_model

    async def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[StreamEvent]:
        model = settings.model if settings.model.startswith("claude-") else self.default_model
        params: dict[str, object] = {}
        betas: list[str] = []
        if model in MODELS_WITH_FALLBACK_AND_EFFORT:
            # Chat replies rarely benefit from deep thinking; low effort keeps latency down.
            params["output_config"] = {"effort": "low"}
            # If a safety classifier declines, retry on Anthropic's recommended fallback model.
            params["fallbacks"] = "default"
            betas.append(FALLBACK_BETA)

        history: list[BetaMessageParam] = [{"role": m.role, "content": m.content} for m in messages]
        try:
            async with self.client.beta.messages.stream(
                model=model,
                max_tokens=MAX_TOKENS,
                system=build_system_prompt(settings.system_prompt),
                messages=history,
                betas=betas,
                **params,  # type: ignore[arg-type]
            ) as stream:
                async for event in stream:
                    if event.type == "text":
                        yield TextDelta(event.text)
                final = await stream.get_final_message()
        except anthropic.RateLimitError as exc:
            raise LLMError("The model is busy right now. Please try again shortly.") from exc
        except anthropic.AuthenticationError as exc:
            logger.error("anthropic_auth_failed")
            raise LLMError("The AI provider is misconfigured.", code="llm_config") from exc
        except anthropic.APIStatusError as exc:
            logger.warning("anthropic_api_error", extra={"status": exc.status_code})
            raise LLMError("The AI provider returned an error.") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Could not reach the AI provider.") from exc

        if final.stop_reason == "refusal":
            raise LLMError("The model declined to answer this request.", code="llm_refusal")
