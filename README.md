# ChatGPT Clone

A full-stack clone of the ChatGPT chat UI: FastAPI + PostgreSQL + Redis on the backend,
React + TypeScript + Material UI on the frontend, with streamed responses over SSE.
It runs with **one command and no API key**.

> **Status:** Phase 1 (scaffolding and infrastructure) is complete. Features are being added in phases.

- Architecture and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Diagrams (system, ER, auth flow, streaming, caching): [docs/diagrams.md](docs/diagrams.md)

## Quick start (Docker)

Prerequisite: Docker Desktop (or OrbStack) running.

```bash
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:3000 | Web app |
| http://localhost:8000/docs | OpenAPI / Swagger UI |
| http://localhost:8000/api/v1/health | Liveness check |

Database migrations run automatically when the backend container starts.
To override defaults, copy `.env.example` to `.env` and edit it.

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
| `JWT_SECRET` | dev placeholder | **Set a long random value outside local dev** |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TTL_DAYS` | `7` | Refresh token lifetime |
| `COOKIE_SECURE` | `true` | `Secure` flag on the refresh cookie (browsers allow it on `localhost`) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Allowed browser origins |
| `LLM_PROVIDER` | `mock` | `mock` (no key) or `anthropic` |
| `ANTHROPIC_API_KEY` | empty | Required only when `LLM_PROVIDER=anthropic` |
| `LOG_LEVEL` | `INFO` | Log level for the JSON logs |

## Repository layout

```
backend/    FastAPI app (api → services → repositories → models), Alembic, tests
frontend/   React + Vite app (features/auth, features/chat, features/settings), nginx config
docs/       Architecture notes and Mermaid diagrams
```

## Built with a coding agent

This project was built with Claude Code. [`CLAUDE.md`](CLAUDE.md) is the brief the agent
follows: stack, layering rules, schema, API contract, security rules, and workflow.
Work was done in phases, each planned first, then implemented, then checked with ruff,
mypy and tests, and committed in small conventional commits.
