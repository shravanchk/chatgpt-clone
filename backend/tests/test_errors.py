from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.errors import NotFoundError


async def test_unknown_route_uses_error_format(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "Not Found", "details": None}
    }


async def test_app_error_maps_to_error_format(app: FastAPI, client: AsyncClient) -> None:
    async def boom() -> None:
        raise NotFoundError("Conversation not found", code="conversation_not_found")

    app.add_api_route("/boom", boom)

    response = await client.get("/boom")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "conversation_not_found",
            "message": "Conversation not found",
            "details": None,
        }
    }


async def test_unhandled_exception_returns_500_without_leaking(app: FastAPI) -> None:
    async def crash() -> None:
        raise RuntimeError("secret internals")

    app.add_api_route("/crash", crash)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/crash")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "secret" not in response.text
