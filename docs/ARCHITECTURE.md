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

### Conversations and messages

- **Ownership:** every query goes through `ConversationRepository.get_for_user(user_id, id)`, which also excludes soft-deleted rows. Another user's conversation returns `404 conversation_not_found` on every route: read, rename, delete, history, send and export. A test checks each one.
- **Pagination** uses opaque keyset cursors on `(updated_at, id)` for conversations and `(created_at, id)` for messages, not `OFFSET`. Pages stay fast at any depth and don't skip or repeat rows when new rows arrive.
  - Message history returns the **newest** page first, oldest-first within the page. `next_cursor` walks back in time, which suits "load earlier messages".
- **Search:** `?search=` matches conversation titles **or** any message text with `ILIKE`. The `pg_trgm` GIN indexes make the leading-wildcard search fast. User input has `%`, `_` and `\` escaped, so they match literally.
- **Titles:** a new conversation is called "New chat" until its first message, which becomes the title (truncated at a word boundary to 60 characters). Custom titles are never overwritten.
- **Timestamps** are set in Python, not by Postgres `now()`, which is the transaction start time. Rows written in one transaction, such as a user message and its assistant placeholder, would otherwise tie and sort in either order. The bug was caught by a pagination test.
- **Export:** `GET /conversations/{id}/export?format=md|json` returns a download with `Content-Disposition`.

### Streaming (SSE)

Sending a message has two phases (see [the diagram](diagrams.md#send-message--sse-streaming)):

1. **Prepare**, inside the request:
   - check ownership and the per-user rate limit
   - save the user message and an empty assistant placeholder (`status=streaming`)
   - commit and invalidate the cache

   Every failure here is a normal JSON error with the right status (404, 422, 429). Errors are never hidden inside a `200` stream.
2. **Stream**, inside `EventSourceResponse`:
   - events in order: `message_start` → `delta`* → `actions` → `message_end`, or `error`
   - this phase uses **its own DB session**, because it outlives the request-scoped one
   - a `finally` block, shielded from cancellation, finalizes the placeholder: `complete` on success, or `error` with the partial text on a provider failure or **client disconnect**

   No message is ever left stuck in `streaming`. Tests cover all three outcomes, and the disconnect case was also observed live.

The SSE path is buffer-free from end to end:
- the request-id middleware is pure ASGI
- nginx has `proxy_buffering off`, and the backend sends `X-Accel-Buffering: no`

Measured through nginx, the first chunk arrives about 20 ms after the request.

### LLM providers

`LLMProvider` is a Protocol: `stream(messages, settings) -> AsyncIterator[TextDelta | ActionsEvent]`. One instance is created at startup and injected with `Depends`; tests replace it with a scripted or failing provider.

- **`MockProvider` (default):** needs no key. It picks a canned answer by whole-word keyword (`table`, `list`, `code`, `chart`, `image`), otherwise a default answer that repeats the topic back. It streams word by word with a 20 ms delay and always emits 2–3 follow-up actions.
  - Charts are fenced ```` ```chart ```` blocks containing a JSON spec, which the frontend renders with Recharts.
  - Images are Markdown pointing at `/static/...`, served by the backend and proxied by nginx.
- **`AnthropicProvider`** (`LLM_PROVIDER=anthropic`):
  - streams from the Anthropic SDK, using the user's selected model (default `claude-opus-5-5`) and their custom instructions on top of a base system prompt
  - the base system prompt also teaches the model the `chart` block format
  - Opus/Sonnet 5.5 use `effort: low`, which suits chat latency, plus server-side **refusal fallbacks** (`fallbacks: "default"`)
  - SDK errors become user-safe `LLMError`s

  It does not generate follow-up actions.
- **Context:** the last 20 *completed* messages are sent; failed or partial replies are excluded.

### Caching

- **Cache-aside:** only the default sidebar view (first page, no search) is cached, under `user:{id}:conversations` with a 60 s TTL. Searches and later pages always hit Postgres.
- **Invalidation:** every create, rename or delete, and every new message (at prepare *and* finalize), deletes the key rather than updating it.
- **Redis down:** all cache errors are logged and treated as a miss, and a test checks that the app keeps working.

### Testing

Tests run against a real PostgreSQL database (`chatgpt_test`), created on demand and built by the real Alembic migrations. Each test runs inside a transaction that is rolled back at the end; the services' `commit()` calls become savepoint releases. Redis is replaced by fakeredis, except in the outage test, which points at a closed port.

## Frontend

- Feature folders: `features/auth`, `features/chat`, `features/settings`. Shared UI lives in `components/`, and helpers such as the SSE parser in `lib/`.
- **Theme:** one MUI theme with CSS variables and `light` / `dark` color schemes. `useColorScheme()` switches between `light`, `dark` and `system`, which matches `user_settings.theme`.
- **State:**
  - RTK Query (`app/api.ts`) handles REST calls. Features add their endpoints with `injectEndpoints`.
  - Redux slices hold client-only state: the access token (in memory only) and the in-flight stream.
- **Streaming client:** `EventSource` cannot send a POST, so messages are sent with `fetch`, and `lib/sse.ts` parses the response body from a `ReadableStream`.
  - The parser handles named events, multi-line data and keep-alive comments. It copes with chunk boundaries anywhere, including in the middle of a CRLF or a multi-byte character. A test tries every possible split point.
  - `chatSlice.sendMessage` is a thunk that holds the in-flight reply (optimistic user message, live text, actions). When the stream closes, it merges the messages into the RTK Query cache and refetches that conversation's history.
  - The refetch fixes a race: on a brand-new chat, the history request can land *after* the stream ends and would otherwise leave the server's `streaming` placeholder on screen.
  - **Stop** aborts the `fetch`. The server sees the disconnect and saves the partial reply as `status=error`, and the UI shows it as "Response interrupted".
- **Chat layout:** `ChatLayout` is a parent route holding the sidebar and the stream controller (`useChatStream`). The in-flight stream and its Stop button therefore survive the navigation from `/` to `/c/:id` when a new chat is created. Thread pages get `send` and `stop` through the outlet context.
- **Rendering:** `MarkdownRenderer` uses react-markdown with GFM: tables, nested and task lists, strikethrough.
  - **No raw HTML is rendered**, and unsafe URLs such as `javascript:` are dropped. Tests cover script injection and bad links.
  - Fenced code is highlighted with Prism and has a language label and a copy button.
  - ```` ```chart ```` blocks hold a JSON spec rendered with Recharts.
    - The chart palette is a colour-blind-safe categorical palette, picked separately for light and dark, as the dataviz guidance recommends.
    - The legend uses text colours and keeps series order, and a "View data" table is the accessible alternative.
    - While a reply is streaming, an unfinished chart shows a placeholder instead of flashing raw JSON.
- **Thread behaviour:**
  - Follow-up action buttons appear on the latest reply. Their visible label is also their accessible name, with the full prompt as a tooltip description.
  - Every reply has a copy button, and "load earlier" keeps your scroll position.
  - The thread stays pinned to the bottom while you're there, including when content grows *after* rendering (lazy charts, images), which a `ResizeObserver` handles. Scrolling up stops the auto-scroll.
- **Bundle:** routes and the chart renderer are code-split. Recharts (about 110 kB gzipped) loads only when a reply contains a chart, and the initial JavaScript is about 76 kB gzipped.
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

- Single-region, single-instance deployment. Rate limits use a fixed window, which is simple but allows bursts at window edges.
- `/api/v1/health` is a liveness check only. It does not check the DB or Redis.
- **Rate limits are per IP.** Users behind one NAT share a budget. A per-account limit on failed logins would add protection against credential stuffing.
- **Page-load cost for logged-out visitors:** each load makes two refresh attempts, the second 250 ms after the first, before showing the login page. This is the price of handling the two-tab race.
- **The mock model ignores the conversation history.** It answers from the last message only. Anthropic-backed replies have no follow-up actions; generating them would need a second model call or structured output.
- **Interrupted replies** stay saved with `status=error` and are shown as "Response interrupted". You can retry the prompt, but the stream doesn't resume.
- **One stream at a time per tab.** While a reply streams, sending is disabled everywhere. That keeps the UI simple and matches ChatGPT.
- **No message editing or regenerate, and no file uploads.** The `metadata.attachments` column is reserved for uploads.
- **Possible scroll edge case:** once in manual testing, a large image loading for the first time, uncached, left the thread short of the bottom. It didn't happen again, and a sampled re-run stayed pinned throughout.
- **Search uses `ILIKE`** with trigram indexes: good for substring search, but there's no relevance ranking or stemming. Postgres full-text search or a search engine would be the next step.
- **No account features** for email verification, password reset or "log out everywhere". The data model supports the last one: it is `revoke_all_for_user`.

## With more time

1. **Real streaming resilience:** resume an interrupted stream instead of only showing the partial text. This would mean keeping generation in a background task that writes to Redis Streams, with the client reconnecting using `Last-Event-ID`.
2. **Follow-up actions from real models**, via structured output or a cheap second call, so they also work with Claude, not just the mock.
3. **Ranked search** with Postgres full-text search (`tsvector` with weights) or OpenSearch, plus highlighted matches.
4. **Observability:**
   - OpenTelemetry traces across nginx, the API, the DB and the LLM
   - a readiness probe that checks the DB and Redis
   - per-route latency and error metrics
5. **Security hardening:**
   - a Content-Security-Policy
   - a per-account login-failure limit in addition to the per-IP one
   - email verification and password reset
   - "log out everywhere" in the UI, which the backend already supports
6. **Product features:**
   - editing a message and regenerating the reply
   - file and image uploads (`metadata.attachments`)
   - shareable read-only links
   - conversation folders
7. **Deployment:** CI running the existing lint, type and test commands, image builds, and a hosted demo.
