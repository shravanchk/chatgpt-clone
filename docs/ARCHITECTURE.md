# Architecture

> Diagrams (system, ER, auth, streaming, caching) live in [diagrams.md](diagrams.md).

## Overview

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI (async) on Uvicorn | Typed request/response models, OpenAPI for free, first-class async for SSE |
| DB | PostgreSQL 16 + SQLAlchemy 2.0 async + Alembic | Relational data with ownership; `jsonb` for message metadata; `pg_trgm` for search |
| Cache / limits | Redis 7 | Cache-aside for the sidebar list; fixed-window rate limiting |
| Streaming | Server-Sent Events | One-way server→client stream over plain HTTP; simpler than WebSockets for this need |
| Frontend | React + TS (strict) + Vite, MUI, Redux Toolkit / RTK Query | Required stack; RTK Query handles REST caching, a slice handles the live stream |
| Packaging | Docker Compose, nginx serves the SPA and proxies `/api` | `docker compose up` runs everything, and the browser sees a single origin |

## Backend

### Layering

`api/v1` (routers) → `services` (business rules) → `repositories` (SQL) → `models`.

- **Routers** stay thin: they validate input with Pydantic, resolve dependencies, call one service method, and return a response schema.
- **Services** own the rules: ownership, token rotation, cache invalidation, and stream persistence.
- **Repositories** only run queries. Every user-owned query takes `user_id`, so a resource owned by another user cannot be found. The API returns **404** for it, never 403, so it does not reveal that the resource exists.
- **Dependency injection** goes through `Depends`: DB session, current user, settings, LLM provider, and cache. Long-lived resources (the DB engine and the Redis client) and the `Settings` object are created in `create_app` / `lifespan` and stored on `app.state`. There is no module-level mutable state, and tests swap in their own settings, DB connection and fakeredis.

### Cross-cutting concerns (`app/core`)

- **Config:** `pydantic-settings`. Every value comes from the environment, with safe development defaults.
- **Logging:** one JSON line per log record. A pure-ASGI `RequestIdMiddleware` assigns (or accepts) an `X-Request-ID` and stores it in a `contextvar`, so every log line carries it. The id is also returned to the client. The middleware is pure ASGI rather than `BaseHTTPMiddleware` so that SSE responses are not buffered.
- **Errors:** handlers registered in one place map `AppError` subclasses, validation errors, HTTP errors, and unexpected exceptions into one envelope:
  ```json
  {"error": {"code": "conversation_not_found", "message": "Conversation not found", "details": null}}
  ```
  Unexpected exceptions are logged with a stack trace and return a generic 500 with no internal details.

### Database

See the ER diagram in [diagrams.md](diagrams.md#entity-relationship-diagram).

- UUID primary keys (`gen_random_uuid()`) so ids cannot be guessed and enumerated.
- `timestamptz` everywhere.
- `role`, `status` and `theme` are `VARCHAR` with `CHECK` constraints rather than Postgres `ENUM` types. Adding a value is then a one-line migration with no `ALTER TYPE`.
- `messages.metadata` is `jsonb` for open-ended data (follow-up actions, attachments). In Python it is mapped to the attribute `Message.meta`, because `metadata` is reserved by SQLAlchemy.
- Conversations are soft-deleted (`deleted_at`). The sidebar index is a **partial** index on `(user_id, updated_at DESC) WHERE deleted_at IS NULL`, so deleted rows cost nothing.
- Search uses `pg_trgm` GIN indexes on `conversations.title` and `messages.content`, so `ILIKE '%term%'` can use an index.
- The schema changes only through Alembic migrations (async `env.py`; the URL comes from app settings). The backend container runs `alembic upgrade head` on start. The app never calls `create_all`.

### Authentication

- `POST /auth/register` returns **201** and logs the user in straight away: it returns the same body as login and sets the refresh cookie, so there is no extra round trip.
- **Access token:** `{sub, type: "access", iat, exp}`, signed HS256. The secret must be at least 32 bytes, which config enforces. `get_current_user` decodes it, then loads the user, so a deleted user's token stops working.
- **Refresh token:** 32 random bytes; the database stores only its SHA-256.
  - Refresh locks the token row (`SELECT … FOR UPDATE`) so that two concurrent refreshes can't both rotate it.
  - If a token that was revoked **more than 10 seconds ago** is presented again, all of that user's tokens are revoked, because this indicates theft.
  - Within 10 seconds it only returns a 401. That case is two tabs refreshing at the same moment, and the losing tab retries once with the cookie the browser now holds.
- **Cookie scope:** `Path=/api/v1/auth`, so the refresh token is never sent with ordinary API calls.
- **Rate limiting** applies to login (10 per minute per IP) and register (5 per minute per IP). It uses fixed windows in Redis.
  - If Redis is unavailable, requests are allowed through and a warning is logged.
  - The Redis client uses ~1 s timeouts and **no retry backoff**. The library's default retry behaviour added about 3.5 s to every request while Redis was down, which a test now guards against.

### Testing

Tests run against a real PostgreSQL database (`chatgpt_test`), created on demand and built by the real Alembic migrations. Each test runs inside a transaction that is rolled back at the end; the services' `commit()` calls become savepoint releases. Redis is replaced by fakeredis, except in the outage test, which points at a closed port.

## Frontend

- Feature folders: `features/auth`, `features/chat`, `features/settings`. Shared UI lives in `components/`, and helpers such as the SSE parser in `lib/`.
- **Theme:** one MUI theme with CSS variables and `light` / `dark` color schemes. `useColorScheme()` switches between `light`, `dark` and `system`, which matches `user_settings.theme`.
- **State:**
  - RTK Query (`app/api.ts`) handles REST calls. Features add their endpoints with `injectEndpoints`.
  - Redux slices hold client-only state: the access token (in memory only) and the in-flight stream.
- **Streaming:** `EventSource` cannot send a POST, so messages are sent with `fetch` and the SSE response body is parsed from a `ReadableStream`.
- **Routing:** `/login`, `/register`, `/` (new chat), `/c/:conversationId`.
  - `SessionGate` restores the session once at startup, via `POST /auth/refresh`, before rendering any route.
  - `RequireAuth` sends anonymous users to `/login`, remembering where they were going.
  - `GuestOnly` sends logged-in users back to that page.
- **Silent re-auth** (`app/baseQuery.ts`):
  - Every request gets `Authorization: Bearer`.
  - On a 401, the wrapper refreshes once and retries the request. A single-flight lock means parallel 401s, or React StrictMode's double effects, cause only one refresh.
  - If the refresh fails, the user is logged out.
- **Theme preference:** MUI applies and stores the mode locally, so the page paints in the right theme immediately. Once settings load, the server's value overrides the local one, so the preference follows the user across devices.

## Security summary

| Concern | Approach |
|---|---|
| Passwords | bcrypt |
| Access token | JWT, 15 min, `Authorization: Bearer`, held in memory on the frontend (not `localStorage`, to limit what XSS can steal) |
| Refresh token | 256-bit random value, stored as SHA-256 in the DB, sent in an `httpOnly; Secure; SameSite=Lax` cookie, rotated on every use. Reuse of a revoked token revokes all of the user's tokens |
| Authorization | Every query is scoped by `user_id`; resources owned by others return 404 |
| Abuse | Redis fixed-window rate limits on login and message send (429) |
| Transport | Same-origin through nginx; CORS restricted to configured origins for local development |
| Secrets | All from environment variables; `.env` is git-ignored; `.env.example` documents them |
| Logging | Never logs passwords, tokens or message bodies |
| Headers | nginx sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` |

## Decisions and trade-offs

| Decision | Alternative | Reasoning |
|---|---|---|
| SSE | WebSockets | Traffic is one-way (server → client). SSE works over plain HTTP through proxies and needs no connection state |
| Persist the user message, then stream, then finalize the assistant message | Persist only at the end | A crash or disconnect during the stream still leaves a consistent record (`status=error`) |
| Delete the cache key on writes | Update it in place | Simpler and avoids races; the next read refills it |
| `MockProvider` by default | Require an API key | Reviewers can run the full app with no credentials; the `LLMProvider` protocol keeps the real provider swappable |
| nginx reverse proxy | Separate origins with CORS | First-party cookies, no preflight, one URL to open |

## Assumptions and limitations

_Kept up to date as features land._

- Single-region, single-instance deployment. Rate limits use a fixed window, which is simple but allows bursts at window edges.
- `/api/v1/health` is a liveness check only. It does not check the DB or Redis.
- **Rate limits are per IP.** Users behind one NAT share a budget. A per-account limit on failed logins would add protection against credential stuffing.
- **Page-load cost for logged-out visitors:** each load makes two refresh attempts, the second 250 ms after the first, before showing the login page. This is the price of handling the two-tab race.
- **No account features** for email verification, password reset or "log out everywhere". The data model supports the last one: it is `revoke_all_for_user`.
