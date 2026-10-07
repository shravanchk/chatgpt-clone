from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status

from app.api.deps import AppSettings, AuthSvc, rate_limit
from app.core.config import Settings
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from app.schemas.user import UserOut
from app.services.auth_service import AuthResult

router = APIRouter(prefix="/auth", tags=["auth"])

# The refresh cookie is only sent to the auth endpoints, never to the rest of the API.
REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/api/v1/auth"

RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _set_refresh_cookie(response: Response, result: AuthResult, settings: Settings) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=result.refresh_token,
        expires=result.refresh_expires_at,
        path=COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _auth_response(response: Response, result: AuthResult, settings: Settings) -> AuthResponse:
    _set_refresh_cookie(response, result, settings)
    return AuthResponse(
        user=UserOut.model_validate(result.user),
        access_token=result.access.token,
        expires_in=result.access.expires_in,
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register", lambda s: s.rate_limit_register_per_minute))],
)
async def register(
    body: RegisterRequest, response: Response, auth: AuthSvc, settings: AppSettings
) -> AuthResponse:
    """Create an account and log it in (access token in body, refresh token in cookie)."""
    return _auth_response(response, await auth.register(body), settings)


@router.post(
    "/login",
    dependencies=[Depends(rate_limit("login", lambda s: s.rate_limit_login_per_minute))],
)
async def login(
    body: LoginRequest, response: Response, auth: AuthSvc, settings: AppSettings
) -> AuthResponse:
    return _auth_response(response, await auth.login(body), settings)


@router.post("/refresh")
async def refresh(
    response: Response, auth: AuthSvc, settings: AppSettings, refresh_token: RefreshCookie = None
) -> AuthResponse:
    """Rotate the refresh-token cookie and return a fresh access token."""
    return _auth_response(response, await auth.refresh(refresh_token), settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response, auth: AuthSvc, settings: AppSettings, refresh_token: RefreshCookie = None
) -> None:
    await auth.logout(refresh_token)
    _clear_refresh_cookie(response, settings)
