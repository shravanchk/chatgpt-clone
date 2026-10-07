import json
import re

import pytest

from app.llm.base import ActionsEvent, ChatMessage, GenerationSettings, TextDelta
from app.llm.mock_provider import MockProvider, pick_response

SETTINGS = GenerationSettings(model="mock")


@pytest.mark.parametrize(
    ("prompt", "marker"),
    [
        ("Can you make a TABLE?", "| Language |"),
        ("give me a list please", "1. **Foundations**"),
        ("show me some code", "```python"),
        ("draw a chart", "```chart"),
        ("show an image", "![Mountain lake at sunset]"),
    ],
)
def test_keywords_pick_rich_content(prompt: str, marker: str) -> None:
    text, actions = pick_response(prompt)

    assert marker in text
    assert 2 <= len(actions) <= 3


def test_keywords_match_whole_words_only() -> None:
    text, _ = pick_response("is this decodable?")  # contains "code" inside a word

    assert "```python" not in text
    assert "decodable" in text  # default answer echoes the topic


def test_chart_block_is_valid_json() -> None:
    text, _ = pick_response("chart")
    block = re.search(r"```chart\n(.*?)```", text, re.S)

    assert block is not None
    spec = json.loads(block.group(1))
    assert spec["type"] == "bar"
    assert {s["key"] for s in spec["series"]} <= set(spec["data"][0])


async def test_stream_reassembles_to_full_text_then_emits_actions() -> None:
    provider = MockProvider(delay_seconds=0)
    expected, actions = pick_response("code")

    events = [e async for e in provider.stream([ChatMessage("user", "code")], SETTINGS)]

    deltas = [e.text for e in events if isinstance(e, TextDelta)]
    assert len(deltas) > 10  # actually streamed in chunks
    assert "".join(deltas) == expected
    assert events[-1] == ActionsEvent(list(actions))
