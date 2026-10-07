from httpx import AsyncClient

from tests.conftest import RegisterFn, bearer

SETTINGS = "/api/v1/users/me/settings"


async def test_settings_have_defaults(client: AsyncClient, register: RegisterFn) -> None:
    token = (await register())["access_token"]

    response = await client.get(SETTINGS, headers=bearer(token))

    assert response.status_code == 200
    body = response.json()
    assert body["theme"] == "system"
    assert body["model"] == "mock"
    assert body["system_prompt"] is None


async def test_patch_updates_only_given_fields(client: AsyncClient, register: RegisterFn) -> None:
    token = (await register())["access_token"]
    await client.patch(SETTINGS, headers=bearer(token), json={"system_prompt": "Be brief."})

    response = await client.patch(SETTINGS, headers=bearer(token), json={"theme": "dark"})

    assert response.status_code == 200
    assert response.json()["theme"] == "dark"
    assert response.json()["system_prompt"] == "Be brief."


async def test_patch_null_clears_system_prompt(client: AsyncClient, register: RegisterFn) -> None:
    token = (await register())["access_token"]
    await client.patch(SETTINGS, headers=bearer(token), json={"system_prompt": "Be brief."})

    response = await client.patch(SETTINGS, headers=bearer(token), json={"system_prompt": None})

    assert response.json()["system_prompt"] is None


async def test_patch_validation(client: AsyncClient, register: RegisterFn) -> None:
    token = (await register())["access_token"]

    bad_theme = await client.patch(SETTINGS, headers=bearer(token), json={"theme": "neon"})
    null_theme = await client.patch(SETTINGS, headers=bearer(token), json={"theme": None})
    unknown_field = await client.patch(SETTINGS, headers=bearer(token), json={"is_admin": True})
    bad_model = await client.patch(SETTINGS, headers=bearer(token), json={"model": "gpt-99"})

    for response in (bad_theme, null_theme, unknown_field, bad_model):
        assert response.status_code == 422
    assert bad_model.json()["error"]["code"] == "invalid_model"
    assert "mock" in bad_model.json()["error"]["details"]["available_models"]


async def test_users_only_see_their_own_data(client: AsyncClient, register: RegisterFn) -> None:
    alice = await register(email="alice@example.com", display_name="Alice")
    bob = await register(email="bob@example.com", display_name="Bob")
    await client.patch(SETTINGS, headers=bearer(alice["access_token"]), json={"theme": "dark"})

    bob_me = await client.get("/api/v1/users/me", headers=bearer(bob["access_token"]))
    bob_settings = await client.get(SETTINGS, headers=bearer(bob["access_token"]))

    assert bob_me.json()["email"] == "bob@example.com"
    assert bob_settings.json()["theme"] == "system"  # unaffected by Alice's change


async def test_settings_require_auth(client: AsyncClient) -> None:
    assert (await client.get(SETTINGS)).status_code == 401
    assert (await client.patch(SETTINGS, json={"theme": "dark"})).status_code == 401


async def test_models_lists_available_models(client: AsyncClient, register: RegisterFn) -> None:
    token = (await register())["access_token"]

    response = await client.get("/api/v1/models", headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == {
        "models": ["mock", "claude-sonnet-5-5", "claude-haiku-4-5"],
        "default": "mock",
    }
