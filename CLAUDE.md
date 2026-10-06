# CLAUDE.md — ChatGPT Clone (Blue Yonder take-home)

This file briefs the coding agent. Read it fully before every task.

## Goal
A full-stack clone of the ChatGPT chat UI: users, auth, conversations, messages,
settings, streamed responses, rich content (markdown, tables, lists, code, images,
charts), and action buttons. Must run with `docker compose up` and **no API key**.

Evaluation focus: code quality, architecture, security, REST API design, DB design,
documentation, UX, and effective use of a coding agent. Prefer clarity over cleverness.

## Stack (do not change without asking)

### Backend
- Python 3.12, FastAPI (async), Uvicorn
- PostgreSQL 16, SQLAlchemy 2.0 async (asyncpg), Alembic migrations
- Pydantic v2 + pydantic-settings for config
- Redis 7 (redis.asyncio) for caching and rate limiting
- Auth: PyJWT, passwords hashed with bcrypt
- Streaming: Server-Sent Events (SSE) via `sse-starlette`
- Tests: pytest, pytest-asyncio, httpx AsyncClient
- Quality: ruff (lint + format), mypy

### Frontend
- React + TypeScript + Vite
- Material UI (MUI) with a custom theme (light + dark)
- Redux Toolkit for client state; RTK Query for REST calls
- Streaming: `fetch` + ReadableStream SSE parser (EventSource cannot POST)
- react-markdown + remark-gfm (tables, lists), syntax highlighting for code blocks,
  recharts for charts
- React Router
- Tests: Vitest + React Testing Library (key components only)

### Infra
- Docker Compose: `db` (postgres), `redis`, `backend`, `frontend`
- Backend container runs `alembic upgrade head` before starting the app

## Repository layout
```
/backend
  app/
    main.py                # app factory, middleware, routers
    core/                  # config, security (jwt, hashing), logging, errors
    db/                    # engine, session, base model
    models/                # SQLAlchemy models
    schemas/               # Pydantic request/response models
    repositories/          # DB access only, no business logic
    services/              # business logic (auth, conversations, chat)
    llm/                   # LLMProvider protocol, MockProvider, AnthropicProvider
    api/v1/                # routers: auth, users, conversations, messages
    cache/                 # redis client, cache helpers, rate limiter
  alembic/
  tests/
  pyproject.toml
  Dockerfile
/frontend
  src/
    app/                   # store, theme, router
    features/auth/         # slice, pages, api
    features/chat/         # slice, components, hooks, streaming client
    features/settings/
    components/            # shared UI (MessageBubble, MarkdownRenderer, ...)
    lib/                   # api client, sse parser, utils
  Dockerfile
docker-compose.yml
.env.example
README.md
docs/ARCHITECTURE.md
```

## Architecture rules
- Layering: `api` → `services` → `repositories` → `models`. Routers stay thin.
- Dependency injection through FastAPI `Depends` (db session, current user,
  LLM provider, cache). No global mutable state.
- The LLM is behind an `LLMProvider` Protocol with
  `async def stream(messages, settings) -> AsyncIterator[StreamEvent]`.
  `LLM_PROVIDER=mock` (default) or `anthropic` (needs `ANTHROPIC_API_KEY`).
- Every user-owned query filters by `user_id`. Accessing another user's
  resource returns **404** (do not reveal it exists).

## Database schema
- `users`: id (uuid pk), email (unique, lowercase), password_hash, display_name,
  created_at, updated_at
- `user_settings`: user_id (pk, fk users), theme (`light|dark|system`),
  model, system_prompt, updated_at
- `refresh_tokens`: id, user_id (fk), token_hash (sha256), expires_at,
  revoked_at, created_at — rotate on every refresh
- `conversations`: id (uuid pk), user_id (fk, indexed), title, created_at,
  updated_at, deleted_at (soft delete). Index: (user_id, updated_at desc)
- `messages`: id (uuid pk), conversation_id (fk, cascade delete), role
  (`user|assistant|system`), content (text), metadata (jsonb: actions,
  attachments), status (`complete|streaming|error`), created_at.
  Index: (conversation_id, created_at)
- Search: `pg_trgm` GIN index on conversations.title and messages.content
- All schema changes go through Alembic migrations. Never `create_all` in app code.

## REST API (prefix `/api/v1`)
| Method | Path | Purpose |
|---|---|---|
| POST | /auth/register | create user → 201 |
| POST | /auth/login | access token in body, refresh token in httpOnly cookie |
| POST | /auth/refresh | rotate refresh token, new access token |
| POST | /auth/logout | revoke refresh token → 204 |
| GET | /users/me | current user |
| GET / PATCH | /users/me/settings | read / update settings |
| GET | /conversations?search=&cursor=&limit= | list (cursor pagination) |
| POST | /conversations | create → 201 |
| GET / PATCH / DELETE | /conversations/{id} | read / rename / soft delete (204) |
| GET | /conversations/{id}/messages?cursor= | message history |
| POST | /conversations/{id}/messages | send message; response is an SSE stream |
| GET | /conversations/{id}/export?format=md\|json | export |
| GET | /health | liveness |

SSE events: `message_start` (ids), `delta` (text chunk), `actions`
(list of `{label, prompt}`), `message_end` (final message), `error`.
Persist the user message before streaming; persist the assistant message on
completion (status `error` if the stream fails midway).

Error format for every non-2xx response:
```json
{"error": {"code": "conversation_not_found", "message": "Conversation not found", "details": null}}
```
Use correct status codes: 200, 201, 204, 400, 401, 404, 409, 422, 429, 500.

## Security
- Access token: JWT, 15 min, sent as `Authorization: Bearer`, kept in memory on
  the frontend (not localStorage).
- Refresh token: random, 7 days, httpOnly + Secure + SameSite=Lax cookie,
  stored hashed in DB, rotated on use; reuse of a revoked token revokes all
  of that user's tokens.
- bcrypt for passwords. Rate limit login and message send via Redis (429).
- CORS restricted to the frontend origin from config. No secrets in the repo;
  everything via `.env` (provide `.env.example`).
- Never log passwords, tokens, or full message content.

## Caching (Redis)
- Cache-aside for the conversation list: key `user:{id}:conversations`,
  TTL 60s. On any conversation create/rename/delete or new message,
  **delete** the key (do not update it).
- Rate limiting: fixed window counter per user/IP.
- App must still work if Redis is down (log a warning, skip cache).

## MockProvider behaviour
Streams tokens with a small delay (~20 ms) so streaming is visible. Picks a
response by keywords in the last user message, so every rich-content type
can be demoed on demand:
- "table" → markdown table, "list" → nested lists, "code" → fenced code
  (python + ts), "chart" → fenced ```chart block with JSON for recharts,
  "image" → markdown image served from backend `/static`
- default → a helpful markdown answer that echoes the topic
Always emits 2–3 follow-up `actions`.

## Coding standards
- Python: full type hints, Pydantic models at API boundaries, small functions,
  structured logging (JSON) with a request/correlation id, custom exception
  classes mapped to the error format in one handler. Async all the way.
- TypeScript: `strict` mode, no `any`, functional components and hooks,
  feature-based folders, MUI `sx`/theme instead of ad-hoc CSS.
- Tests for: auth flow, ownership (user A cannot read user B), message
  streaming persistence, cache invalidation, MarkdownRenderer.
- Run `ruff`, `mypy`, and tests before saying a task is done.

## Workflow rules for the agent
- Work in the phase you are asked for only. Plan first, then implement.
- Small, focused commits with conventional messages
  (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- If something in this file is ambiguous or conflicts, ask instead of guessing.
- Keep `README.md` and `docs/ARCHITECTURE.md` updated as features land.
