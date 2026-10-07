import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from redis.asyncio import Redis

from app.cache.conversation_cache import conversation_list_key
from app.cache.redis import create_redis

BASE = "/api/v1/conversations"


async def _create(client: AsyncClient, headers: dict[str, str], title: str | None = None) -> str:
    body = {"title": title} if title else {}
    response = await client.post(BASE, json=body, headers=headers)
    assert response.status_code == 201, response.text
    conversation_id: str = response.json()["id"]
    return conversation_id


# --- CRUD ------------------------------------------------------------------------


async def test_create_get_rename_delete(client: AsyncClient, alice: dict[str, str]) -> None:
    created = await client.post(BASE, json={}, headers=alice)
    assert created.status_code == 201
    conversation = created.json()
    assert conversation["title"] == "New chat"
    url = f"{BASE}/{conversation['id']}"

    assert (await client.get(url, headers=alice)).json()["id"] == conversation["id"]

    renamed = await client.patch(url, json={"title": "  Trip planning  "}, headers=alice)
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Trip planning"

    deleted = await client.delete(url, headers=alice)
    assert deleted.status_code == 204
    missing = await client.get(url, headers=alice)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "conversation_not_found"


async def test_rename_validation(client: AsyncClient, alice: dict[str, str]) -> None:
    url = f"{BASE}/{await _create(client, alice)}"

    for body in ({"title": ""}, {"title": "   "}, {"title": "x" * 201}, {}):
        assert (await client.patch(url, json=body, headers=alice)).status_code == 422


async def test_malformed_id_is_422(client: AsyncClient, alice: dict[str, str]) -> None:
    assert (await client.get(f"{BASE}/not-a-uuid", headers=alice)).status_code == 422


async def test_requires_auth(client: AsyncClient) -> None:
    assert (await client.get(BASE)).status_code == 401
    assert (await client.post(BASE, json={})).status_code == 401


# --- list, pagination, search ------------------------------------------------------


async def test_list_is_most_recent_first_with_cursor_pagination(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    ids = [await _create(client, alice, f"Chat {i}") for i in range(5)]

    first = (await client.get(BASE, params={"limit": 2}, headers=alice)).json()
    second = (
        await client.get(BASE, params={"limit": 2, "cursor": first["next_cursor"]}, headers=alice)
    ).json()
    third = (
        await client.get(BASE, params={"limit": 2, "cursor": second["next_cursor"]}, headers=alice)
    ).json()

    seen = [c["id"] for page in (first, second, third) for c in page["items"]]
    assert seen == list(reversed(ids))
    assert third["next_cursor"] is None


async def test_renaming_moves_conversation_to_top(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    older = await _create(client, alice, "Older")
    await _create(client, alice, "Newer")

    await client.patch(f"{BASE}/{older}", json={"title": "Older, renamed"}, headers=alice)

    items = (await client.get(BASE, headers=alice)).json()["items"]
    assert items[0]["id"] == older


async def test_invalid_cursor_is_400(client: AsyncClient, alice: dict[str, str]) -> None:
    response = await client.get(BASE, params={"cursor": "garbage!"}, headers=alice)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_cursor"


async def test_search_matches_titles_and_message_content(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    by_title = await _create(client, alice, "Kubernetes notes")
    by_message = await _create(client, alice)
    await client.post(
        f"{BASE}/{by_message}/messages",
        json={"content": "how do I size a kubernetes pod?"},
        headers=alice,
    )
    await _create(client, alice, "Unrelated")

    found = (await client.get(BASE, params={"search": "KUBERNETES"}, headers=alice)).json()

    assert {c["id"] for c in found["items"]} == {by_title, by_message}


async def test_search_treats_wildcards_literally(
    client: AsyncClient, alice: dict[str, str]
) -> None:
    await _create(client, alice, "100% done")
    await _create(client, alice, "1000 things")

    found = (await client.get(BASE, params={"search": "100%"}, headers=alice)).json()

    assert [c["title"] for c in found["items"]] == ["100% done"]


async def test_deleted_conversations_are_hidden(client: AsyncClient, alice: dict[str, str]) -> None:
    keep = await _create(client, alice, "Keep")
    gone = await _create(client, alice, "Gone")
    await client.delete(f"{BASE}/{gone}", headers=alice)

    items = (await client.get(BASE, headers=alice)).json()["items"]

    assert [c["id"] for c in items] == [keep]


# --- ownership: another user's conversation is indistinguishable from a missing one --


async def test_other_users_conversation_is_404_everywhere(
    client: AsyncClient, alice: dict[str, str], bob: dict[str, str]
) -> None:
    conversation_id = await _create(client, alice, "Alice's secret")
    url = f"{BASE}/{conversation_id}"

    responses = [
        await client.get(url, headers=bob),
        await client.patch(url, json={"title": "pwned"}, headers=bob),
        await client.delete(url, headers=bob),
        await client.get(f"{url}/messages", headers=bob),
        await client.post(f"{url}/messages", json={"content": "hi"}, headers=bob),
        await client.get(f"{url}/export", headers=bob),
    ]

    for response in responses:
        assert response.status_code == 404, response.request.url
        assert response.json()["error"]["code"] == "conversation_not_found"
    assert (await client.get(BASE, headers=bob)).json()["items"] == []
    # Alice's data is untouched.
    assert (await client.get(url, headers=alice)).json()["title"] == "Alice's secret"


# --- caching -----------------------------------------------------------------------


async def test_list_is_cached_and_invalidated_on_every_write(
    client: AsyncClient, alice: dict[str, str], redis: Redis
) -> None:
    me = (await client.get("/api/v1/users/me", headers=alice)).json()
    key = conversation_list_key(me["id"])
    conversation_id = await _create(client, alice, "First")

    async def assert_write_invalidates(write: object) -> None:
        await client.get(BASE, headers=alice)
        assert await redis.exists(key), "list should be cached after a read"
        await write  # type: ignore[misc]
        assert not await redis.exists(key), "write should delete the cached list"

    await assert_write_invalidates(client.post(BASE, json={}, headers=alice))
    await assert_write_invalidates(
        client.patch(f"{BASE}/{conversation_id}", json={"title": "Renamed"}, headers=alice)
    )
    await assert_write_invalidates(
        client.post(f"{BASE}/{conversation_id}/messages", json={"content": "hi"}, headers=alice)
    )
    await assert_write_invalidates(client.delete(f"{BASE}/{conversation_id}", headers=alice))


async def test_cache_hit_is_served_without_db(
    client: AsyncClient, alice: dict[str, str], redis: Redis
) -> None:
    """A cached page is returned as-is (proves reads go through the cache)."""
    me = (await client.get("/api/v1/users/me", headers=alice)).json()
    await _create(client, alice, "Real")
    await client.get(BASE, headers=alice)
    await redis.set(conversation_list_key(me["id"]), '{"items": [], "next_cursor": null}', ex=60)

    assert (await client.get(BASE, headers=alice)).json()["items"] == []
    # Searches and later pages bypass the cache.
    assert (
        len((await client.get(BASE, params={"search": "Real"}, headers=alice)).json()["items"]) == 1
    )


async def test_works_when_redis_is_down(
    client: AsyncClient, alice: dict[str, str], app: FastAPI
) -> None:
    await _create(client, alice, "Still works")
    app.state.redis = create_redis("redis://localhost:1/0")

    response = await client.get(BASE, headers=alice)
    created = await client.post(BASE, json={}, headers=alice)

    assert response.status_code == 200
    assert response.json()["items"][0]["title"] == "Still works"
    assert created.status_code == 201
    await app.state.redis.aclose()


# --- export ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("fmt", "media_type", "extension"),
    [("md", "text/markdown", "md"), ("json", "application/json", "json")],
)
async def test_export(
    client: AsyncClient, alice: dict[str, str], fmt: str, media_type: str, extension: str
) -> None:
    conversation_id = await _create(client, alice, "Trip: Lisbon / Porto")
    await client.post(
        f"{BASE}/{conversation_id}/messages", json={"content": "Show me a table"}, headers=alice
    )

    response = await client.get(
        f"{BASE}/{conversation_id}/export", params={"format": fmt}, headers=alice
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(media_type)
    assert f'filename="trip-lisbon-porto.{extension}"' in response.headers["content-disposition"]
    if fmt == "json":
        body = response.json()
        assert body["conversation"]["title"] == "Trip: Lisbon / Porto"
        assert [m["role"] for m in body["messages"]] == ["user", "assistant"]
    else:
        assert response.text.startswith("# Trip: Lisbon / Porto")
        assert "**You:**" in response.text and "| Language |" in response.text


async def test_export_rejects_unknown_format(client: AsyncClient, alice: dict[str, str]) -> None:
    conversation_id = await _create(client, alice)

    response = await client.get(
        f"{BASE}/{conversation_id}/export", params={"format": "pdf"}, headers=alice
    )

    assert response.status_code == 422
