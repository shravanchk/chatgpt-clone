import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RefreshToken


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, *, user_id: uuid.UUID, token_hash: str, expires_at: datetime) -> None:
        self.session.add(
            RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        )
        await self.session.flush()

    async def get_by_hash_for_update(self, token_hash: str) -> RefreshToken | None:
        """Row-lock the token so two concurrent refreshes cannot both rotate it."""
        result = await self.session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        )
        return result.scalar_one_or_none()

    async def revoke_all_for_user(self, user_id: uuid.UUID, at: datetime) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=at)
        )
