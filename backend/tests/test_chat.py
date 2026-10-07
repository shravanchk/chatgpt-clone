import uuid
from collections.abc import AsyncIterator

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.llm.base import (
    ActionsEvent,
    ChatMessage,
    GenerationSettings,
    LLMError,
    StreamEvent,
    TextDelta,
)
from app.models import Message
from app.services.chat_service import title_from_message
from tests.conftest import parse_sse

BASE = "/api/v1/conversations"


async def _new_conversation(client: AsyncClient, headers: dict[str, str]) -> str:
    conversation_id: str = (await client.post(BASE, json={}, headers=headers)).json()["id"]
    return conversation_id


async def _send(client: AsyncClient, headers: dict[str, str], cid: str, content: str):  # type: ignore[no-untyped-def]
    return await client.post(f"{BASE}/{cid}/messages", json={"content": content}, headers=headers)


async def _messages_in_db(app: FastAPI, conversation_id: str) -> list[Message]:
    factory: async_sessionmaker[AsyncSession] = app.state.session_factory
    async with factory() as session:
        rows = await session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
        return list(rows.all())


class RecordingProvider:
    """Streams fixed chunks and remembers what it was asked."""

    def __init__(self, chunks: list[str], fail_after: int | None = None) -> None:
        self.chunks = chunks
        self.fail_after = fail_after
        self.calls: list[tuple[list[ChatMessage], GenerationSettings]] = []

    async def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[StreamEvent]:
        self.calls.append((messages, settings))
        for i, chunk in enumerate(self.chunks):
            if self.fail_after is not None and i == self.fail_after:
                raise LLMError("Provider exploded", code="llm_error")
            yield TextDelta(chunk)
        yield ActionsEvent([])


# --- streaming contract & persistence ---------------------------------------------


async def test_send_message_streams_events_and_persists_both_messages(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    cid = await _new_conversation(client, alice)

    response = await _send(client, alice, cid, "Show me a table of languages")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    names = [name for name, _ in events]
    assert names[0] == "message_start"
    assert names[-2:] == ["actions", "message_end"]
    assert set(names[1:-2]) == {"delta"}

    start, end = events[0][1], events[-1][1]["message"]
    streamed_text = "".join(data["text"] for name, data in events if name == "delta")
    assert start["user_message"]["content"] == "Show me a table of languages"
    assert end["id"] == start["assistant_message_id"]
    assert end["content"] == streamed_text
    assert "| Language |" in streamed_text
    assert 2 <= len(end["metadata"]["actions"]) <= 3

    user_msg, assistant_msg = await _messages_in_db(app, cid)
    assert (user_msg.role, user_msg.status) == ("user", "complete")
    assert (assistant_msg.role, assistant_msg.status) == ("assistant", "complete")
    assert assistant_msg.content == streamed_text
    assert assistant_msg.meta["actions"] == end["metadata"]["actions"]


async def test_history_endpoint_returns_the_conversation(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    cid = await _new_conversation(client, alice)
    await _send(client, alice, cid, "first")
    await _send(client, alice, cid, "second")

    page = (await client.get(f"{BASE}/{cid}/messages", headers=alice)).json()

    assert [(m["role"], m["content"][:6]) for m in page["items"]][::2] == [
        ("user", "first"),
        ("user", "second"),
    ]
    assert [m["role"] for m in page["items"]] == ["user", "assistant", "user", "assistant"]
    assert page["next_cursor"] is None


async def test_history_paginates_backwards(client: AsyncClient, alice: dict[str, str]) -> None:
    cid = await _new_conversation(client, alice)
    for word in ("one", "two", "three"):
        await _send(client, alice, cid, word)

    latest = (await client.get(f"{BASE}/{cid}/messages", params={"limit": 2}, headers=alice)).json()
    earlier = (
        await client.get(
            f"{BASE}/{cid}/messages",
            params={"limit": 2, "cursor": latest["next_cursor"]},
            headers=alice,
        )
    ).json()

    assert latest["items"][0]["content"] == "three"  # oldest-first within the page
    assert earlier["items"][0]["content"] == "two"


async def test_first_message_names_the_conversation(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    cid = await _new_conversation(client, alice)

    events = parse_sse((await _send(client, alice, cid, "Plan a weekend in Lisbon")).text)
    await _send(client, alice, cid, "something else entirely")

    assert events[0][1]["title"] == "Plan a weekend in Lisbon"
    conversation = (await client.get(f"{BASE}/{cid}", headers=alice)).json()
    assert conversation["title"] == "Plan a weekend in Lisbon"


async def test_custom_title_is_not_overwritten(client: AsyncClient, alice: dict[str, str]) -> None:
    cid = (await client.post(BASE, json={"title": "My title"}, headers=alice)).json()["id"]

    await _send(client, alice, cid, "hello")

    assert (await client.get(f"{BASE}/{cid}", headers=alice)).json()["title"] == "My title"


def test_title_from_long_message_is_truncated_on_a_word() -> None:
    title = title_from_message("word " * 40)

    assert len(title) <= 60
    assert title.endswith("…")
    assert not title.endswith(" …")


async def test_provider_receives_history_and_user_settings(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    provider = RecordingProvider(["ok"])
    app.state.llm = provider
    await client.patch(
        "/api/v1/users/me/settings",
        json={"system_prompt": "Be brief."},
        headers=alice,
    )
    cid = await _new_conversation(client, alice)

    await _send(client, alice, cid, "first")
    await _send(client, alice, cid, "second")

    messages, settings = provider.calls[-1]
    assert [(m.role, m.content) for m in messages] == [
        ("user", "first"),
        ("assistant", "ok"),
        ("user", "second"),
    ]
    assert settings == GenerationSettings(model="mock", system_prompt="Be brief.")


# --- failure midway ------------------------------------------------------------------


async def test_provider_failure_saves_partial_reply_with_error_status(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    app.state.llm = RecordingProvider(["Hello ", "wor", "ld"], fail_after=2)
    cid = await _new_conversation(client, alice)

    response = await _send(client, alice, cid, "hi")

    events = parse_sse(response.text)
    assert [name for name, _ in events] == ["message_start", "delta", "delta", "error"]
    assert events[-1][1]["code"] == "llm_error"
    assert events[-1][1]["message"] == "Provider exploded"
    user_msg, assistant_msg = await _messages_in_db(app, cid)
    assert user_msg.status == "complete"
    assert (assistant_msg.status, assistant_msg.content) == ("error", "Hello wor")


async def test_unexpected_exception_does_not_leak_details(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    class Broken:
        async def stream(
            self, messages: list[ChatMessage], settings: GenerationSettings
        ) -> AsyncIterator[StreamEvent]:
            yield TextDelta("partial")
            raise RuntimeError("db password is hunter2")

    app.state.llm = Broken()
    cid = await _new_conversation(client, alice)

    response = await _send(client, alice, cid, "hi")

    assert "hunter2" not in response.text
    assert parse_sse(response.text)[-1][0] == "error"
    assert (await _messages_in_db(app, cid))[-1].status == "error"


async def test_failed_replies_are_excluded_from_llm_context(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    app.state.llm = RecordingProvider(["bro", "ken"], fail_after=1)
    cid = await _new_conversation(client, alice)
    await _send(client, alice, cid, "first")

    provider = RecordingProvider(["fine"])
    app.state.llm = provider
    await _send(client, alice, cid, "retry")

    messages, _ = provider.calls[-1]
    assert [(m.role, m.content) for m in messages] == [("user", "first"), ("user", "retry")]


# --- validation & limits -------------------------------------------------------------


async def test_empty_message_is_rejected(client: AsyncClient, alice: dict[str, str]) -> None:
    cid = await _new_conversation(client, alice)

    for content in ("", "   "):
        assert (await _send(client, alice, cid, content)).status_code == 422


async def test_message_send_is_rate_limited_per_user(
    client: AsyncClient,
    alice: dict[str, str],
    bob: dict[str, str],
    app: FastAPI,
    frozen_rate_limit_clock: None,
) -> None:
    limit = app.state.settings.rate_limit_messages_per_minute
    cid = await _new_conversation(client, alice)
    for _ in range(limit):
        assert (await _send(client, alice, cid, "hi")).status_code == 200

    limited = await _send(client, alice, cid, "hi")

    assert limited.status_code == 429
    assert "retry-after" in limited.headers
    # Bob has his own budget.
    bob_cid = await _new_conversation(client, bob)
    assert (await _send(client, bob, bob_cid, "hi")).status_code == 200


async def test_sending_to_deleted_conversation_is_404(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    cid = await _new_conversation(client, alice)
    await client.delete(f"{BASE}/{cid}", headers=alice)

    assert (await _send(client, alice, cid, "hi")).status_code == 404


async def test_static_image_is_served(client: AsyncClient) -> None:
    response = await client.get("/static/images/mountain-lake.svg")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")


async def test_client_disconnect_mid_stream_saves_partial_reply(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    """Closing the stream early (tab closed / Stop clicked) must not leave a 'streaming' row."""
    from app.cache.conversation_cache import ConversationListCache
    from app.services.chat_service import ChatService

    cid = await _new_conversation(client, alice)
    me = (await client.get("/api/v1/users/me", headers=alice)).json()
    factory: async_sessionmaker[AsyncSession] = app.state.session_factory
    provider = RecordingProvider(["Hello ", "there ", "friend"])
    async with factory() as session:
        chat = ChatService(
            session,
            factory,
            provider,
            ConversationListCache(app.state.redis, 60),
            app.state.settings,
        )
        turn = await chat.prepare(uuid.UUID(me["id"]), uuid.UUID(cid), "hi")
        stream = chat.stream(turn)
        assert (await anext(stream)).event == "message_start"
        assert (await anext(stream)).event == "delta"
        await stream.aclose()  # what sse-starlette does when the client goes away

    assistant = (await _messages_in_db(app, cid))[-1]
    assert (assistant.status, assistant.content) == ("error", "Hello ")
