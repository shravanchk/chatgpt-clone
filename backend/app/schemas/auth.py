from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints

from app.schemas.user import UserOut


def _validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    # bcrypt only uses the first 72 bytes; reject longer input rather than silently truncating.
    if len(value.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return value


NewPassword = Annotated[str, AfterValidator(_validate_password)]
NormalizedEmail = Annotated[EmailStr, AfterValidator(str.lower)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class RegisterRequest(BaseModel):
    email: NormalizedEmail
    password: NewPassword
    display_name: DisplayName


class LoginRequest(BaseModel):
    email: NormalizedEmail
    password: str = Field(min_length=1, max_length=1024)


class AuthResponse(BaseModel):
    """Returned by register, login and refresh. The refresh token travels in a cookie."""

    user: UserOut
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105  (OAuth2 token type, not a secret)
    expires_in: int
