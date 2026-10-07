# ChatGPT Clone

A full-stack clone of the ChatGPT chat UI: FastAPI + PostgreSQL + Redis on the backend,
React + TypeScript + Material UI on the frontend, with streamed responses over SSE.
It runs with **one command and no API key**.

> **Status:** Feature-complete. All core requirements and every listed bonus feature are implemented (see below).

- Architecture and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Diagrams (system, ER, auth flow, streaming, caching): [docs/diagrams.md](docs/diagrams.md)

## Features

| Requirement | Where it lives |
|---|---|
| Users, auth, persistence | Register/login, JWT access token in memory + rotating httpOnly refresh cookie, PostgreSQL |
| Conversations & messages | Sidebar with recency groups, rename, delete, infinite list; paginated history |
| Settings | Theme (light/dark/system), model, custom instructions, stored per user |
| Streaming | Server-Sent Events over `fetch`, token by token, with a **Stop** button |
| Rich content | Markdown tables, nested and task lists, images, syntax-highlighted code |
| Action buttons | Follow-up suggestions under each reply; one click sends the prompt |
| **Bonus:** caching, Docker, migrations | Redis cache-aside and rate limits · `docker compose up` · Alembic |
| **Bonus:** charts, code highlighting, dark mode | Recharts from ```` ```chart ```` blocks · Prism · MUI color schemes |
| **Bonus:** search, copy, Markdown, export | Title and message search · copy buttons · react-markdown · export as `.md` or `.json` |

## Screenshots

| New chat (light) | Streamed table (dark) | Chart + follow-up actions |
|---|---|---|
| ![New chat](docs/screenshots/new-chat-light.jpg) | ![Table](docs/screenshots/table-dark.jpg) | ![Chart](docs/screenshots/chart-and-actions-dark.jpg) |

| Code highlighting | Sidebar with search and history |
|---|---|
| ![Code](docs/screenshots/code-dark.jpg) | ![Sidebar](docs/screenshots/sidebar-dark.jpg) |

## Quick start (Docker)

Prerequisite: Docker Desktop (or OrbStack) running.

```bash
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:3000 | Web app: register an account, then try the suggestions |
| http://localhost:8000/docs | OpenAPI / Swagger UI |
| http://localhost:8000/api/v1/health | Liveness check |

Database migrations run automatically when the backend container starts.
To override defaults, copy `.env.example` to `.env` and edit it.

## Try the API

The interactive docs at http://localhost:8000/docs cover every endpoint. To watch a streamed
reply in a terminal after registering and creating a conversation:

```bash
curl -N -X POST http://localhost:3000/api/v1/conversations/$CONVERSATION_ID/messages \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"content": "show me a chart"}'
```

The mock model answers by keyword: try **table**, **list**, **code**, **chart** or **image**.

## Local development (without Docker for app code)

Start only the infrastructure:

```bash
docker compose up -d db redis
```

Backend (Python 3.12 with [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv sync
export DATABASE_URL=postgresql+asyncpg://chatgpt:change-me@localhost:5432/chatgpt
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Frontend (Node 24; Vite proxies `/api` to `localhost:8000`):

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## Quality checks

Backend tests need Postgres running (`docker compose up -d db`); they create and migrate
a separate `chatgpt_test` database automatically.

```bash
# backend
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app tests && uv run pytest

# frontend
cd frontend && npm run lint && npm run typecheck && npm test
```

## Configuration

All configuration comes from environment variables. See [.env.example](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://…@db:5432/chatgpt` | Async SQLAlchemy URL |
| `REDIS_URL` | `redis://redis:6379/0` | Cache and rate limiting |
| `JWT_SECRET` | dev placeholder | **At least 32 characters; set a random value outside local dev** |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TTL_DAYS` | `7` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `RATE_LIMIT_LOGIN_PER_MINUTE` | `10` | Login attempts per IP per minute |
| `RATE_LIMIT_REGISTER_PER_MINUTE` | `5` | Sign-ups per IP per minute |
| `AVAILABLE_MODELS` | `claude-opus-5-5,claude-sonnet-5-5,claude-haiku-4-5` | Claude models selectable when `LLM_PROVIDER=anthropic` |
| `COOKIE_SECURE` | `true` | `Secure` flag on the refresh cookie (browsers allow it on `localhost`) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Allowed browser origins |
| `RATE_LIMIT_MESSAGES_PER_MINUTE` | `20` | Messages sent per user per minute |
| `CONVERSATION_CACHE_TTL_SECONDS` | `60` | TTL of the cached conversation list |
| `LLM_CONTEXT_MESSAGES` | `20` | Recent messages sent to the model as context |
| `LLM_PROVIDER` | `mock` | `mock` (no key) or `anthropic` |
| `MOCK_STREAM_DELAY_MS` | `20` | Delay between mock chunks, so streaming is visible |
| `ANTHROPIC_API_KEY` | empty | Required only when `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used when a user's setting is `mock` but the provider is Anthropic |
| `LOG_LEVEL` | `INFO` | Log level for the JSON logs |

## Repository layout

```
backend/    FastAPI app (api → services → repositories → models), Alembic, tests
frontend/   React + Vite app (features/auth, features/chat, features/settings), nginx config
docs/       Architecture notes and Mermaid diagrams
```

## Using a real model

The app runs fully offline with the mock model. To chat with Claude, set these in `.env`
and restart:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Users can then choose Opus, Sonnet or Haiku in **Settings**.

## Built with a coding agent

This project was built with Claude Code. [`CLAUDE.md`](CLAUDE.md) is the brief the agent
follows: stack, layering rules, schema, API contract, security rules, and workflow.
Work was done in phases. Each was planned first, then implemented, then checked with ruff,
mypy and tests, and committed in small conventional commits.

Checking the running app, not just the tests, caught several real bugs:

- **Ordering:** messages written in one transaction tied on Postgres `now()` and could sort randomly. Timestamps are now set in Python.
- **Redis outage:** redis-py's default retry backoff added about 3.5 s to every login while Redis was down. The client now fails fast.
- **Stuck placeholder:** a new chat's history request could race the stream and leave a stuck `streaming` placeholder. History is now refetched when a stream closes.
- **Settings:** saving the theme reset unsaved edits in the settings dialog.
- **Accessibility:** the action buttons' accessible names didn't match their visible labels (WCAG 2.5.3).
- **Docker restart:** the backend crash-looped after a Docker restart until migrations retried.
