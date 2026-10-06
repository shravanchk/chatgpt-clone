"""initial schema: users, settings, refresh tokens, conversations, messages

Revision ID: 0001
Revises:
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_PK = sa.text("gen_random_uuid()")
NOW = sa.text("now()")


def _uuid_pk() -> sa.Column[sa.Uuid[object]]:
    return sa.Column("id", sa.Uuid(), primary_key=True, server_default=UUID_PK)


def _ts(name: str) -> sa.Column[sa.DateTime]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=NOW)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "user_settings",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_user_settings_user_id_users"),
            primary_key=True,
        ),
        sa.Column("theme", sa.String(10), nullable=False, server_default="system"),
        sa.Column("model", sa.String(100), nullable=False, server_default="mock"),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        _ts("updated_at"),
        sa.CheckConstraint(
            "theme IN ('light', 'dark', 'system')", name="ck_user_settings_theme_valid"
        ),
    )

    op.create_table(
        "refresh_tokens",
        _uuid_pk(),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_refresh_tokens_user_id_users"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        _ts("created_at"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "conversations",
        _uuid_pk(),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_conversations_user_id_users"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False, server_default="New chat"),
        _ts("created_at"),
        _ts("updated_at"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_conversations_user_id_updated_at",
        "conversations",
        ["user_id", sa.text("updated_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_conversations_title_trgm",
        "conversations",
        ["title"],
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )

    op.create_table(
        "messages",
        _uuid_pk(),
        sa.Column(
            "conversation_id",
            sa.Uuid(),
            sa.ForeignKey(
                "conversations.id",
                ondelete="CASCADE",
                name="fk_messages_conversation_id_conversations",
            ),
            nullable=False,
        ),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("status", sa.String(10), nullable=False, server_default="complete"),
        _ts("created_at"),
        sa.CheckConstraint(
            "role IN ('user', 'assistant', 'system')", name="ck_messages_role_valid"
        ),
        sa.CheckConstraint(
            "status IN ('complete', 'streaming', 'error')", name="ck_messages_status_valid"
        ),
    )
    op.create_index(
        "ix_messages_conversation_id_created_at", "messages", ["conversation_id", "created_at"]
    )
    op.create_index(
        "ix_messages_content_trgm",
        "messages",
        ["content"],
        postgresql_using="gin",
        postgresql_ops={"content": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("refresh_tokens")
    op.drop_table("user_settings")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
