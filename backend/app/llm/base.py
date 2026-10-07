"""Provider-neutral types for streaming chat completions."""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal, Protocol

Role = Literal["user", "assistant"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class GenerationSettings:
    model: str
    system_prompt: str | None = None


@dataclass(frozen=True)
class Action:
    """A follow-up suggestion rendered as a button; clicking sends `prompt`."""

    label: str
    prompt: str


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class ActionsEvent:
    actions: list[Action] = field(default_factory=list)


StreamEvent = TextDelta | ActionsEvent


class LLMError(Exception):
    """A provider failure that is safe to show the user (no internals)."""

    def __init__(self, message: str, *, code: str = "llm_error") -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class LLMProvider(Protocol):
    def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[StreamEvent]:
        """Yield text deltas as they are generated, optionally followed by actions."""
        ...


BASE_SYSTEM_PROMPT = """\
You are a helpful assistant in a ChatGPT-style web app. Format answers in GitHub-flavored \
Markdown (headings, lists, tables, fenced code blocks with a language tag).

To show a chart, emit a fenced code block with the language `chart` containing JSON:
{"type": "bar" | "line" | "area" | "pie", "title": str, "xKey": str,
 "series": [{"key": str, "name": str}], "data": [{...}]}
Only use charts when the user asks for one or numbers clearly benefit from it."""


def build_system_prompt(user_prompt: str | None) -> str:
    if not user_prompt:
        return BASE_SYSTEM_PROMPT
    return f"{BASE_SYSTEM_PROMPT}\n\nThe user's custom instructions:\n{user_prompt}"
