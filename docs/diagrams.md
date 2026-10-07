# Diagrams

All diagrams are [Mermaid](https://mermaid.js.org/) and render natively on GitHub.

- [System architecture](#system-architecture)
- [Backend layering](#backend-layering)
- [Entity-relationship diagram](#entity-relationship-diagram)
- [Request lifecycle](#request-lifecycle)
- [Authentication flow](#authentication-flow)
- [Refresh-token rotation and reuse detection](#refresh-token-rotation-and-reuse-detection)
- [Send message + SSE streaming](#send-message--sse-streaming)
- [Conversation list caching](#conversation-list-caching)
- [Frontend structure](#frontend-structure)

---

## System architecture

```mermaid
flowchart LR
    user([Browser])

    subgraph compose[docker compose]
        direction LR
        fe["frontend<br/>nginx: static SPA<br/>+ /api reverse proxy"]
        be["backend<br/>FastAPI + Uvicorn"]
        db[("db<br/>PostgreSQL 16<br/>pg_trgm")]
        cache[("redis<br/>Redis 7")]
    end

    llm["LLM provider<br/>MockProvider (default)<br/>or Anthropic API"]

    user -- "HTTPS :3000<br/>SPA + /api/v1/*" --> fe
    fe -- "proxy /api (buffering off for SSE)" --> be
    be -- "asyncpg" --> db
    be -- "cache-aside, rate limits" --> cache
    be -- "stream()" --> llm
```

The browser only ever talks to one origin. nginx serves the built React app and
forwards `/api/*` to the backend, so the refresh-token cookie is first-party and
there is no CORS preflight in the Docker setup.

## Backend layering

```mermaid
flowchart TB
    subgraph api["api/v1 (routers)"]
        r1[auth] --- r2[users] --- r3[conversations] --- r4[messages]
    end
    subgraph services["services (business rules)"]
        s1[AuthService] --- s2[ConversationService] --- s3[ChatService]
    end
    subgraph repos["repositories (SQL only)"]
        p1[UserRepo] --- p2[TokenRepo] --- p3[ConversationRepo] --- p4[MessageRepo]
    end
    models[(SQLAlchemy models)]
    infra["core: config, security, errors, logging<br/>cache: redis, rate limiter<br/>llm: LLMProvider protocol"]

    api -->|Depends| services
    services --> repos
    repos --> models
    services -.-> infra
```

Routers parse and validate input, then call one service method. Services hold the
rules: ownership checks, token rotation, when to invalidate the cache. Repositories
only run queries and always take a `user_id` for user-owned data.

## Entity-relationship diagram

```mermaid
erDiagram
    users ||--|| user_settings : "has"
    users ||--o{ refresh_tokens : "issues"
    users ||--o{ conversations : "owns"
    conversations ||--o{ messages : "contains"

    users {
        uuid id PK
        varchar email UK "lowercase (CHECK)"
        varchar password_hash "bcrypt"
        varchar display_name
        timestamptz created_at
        timestamptz updated_at
    }
    user_settings {
        uuid user_id PK, FK "ON DELETE CASCADE"
        varchar theme "light | dark | system"
        varchar model
        text system_prompt "nullable"
        timestamptz updated_at
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK "indexed"
        varchar token_hash UK "sha256 hex"
        timestamptz expires_at
        timestamptz revoked_at "nullable"
        timestamptz created_at
    }
    conversations {
        uuid id PK
        uuid user_id FK
        varchar title "GIN trigram index"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "soft delete, nullable"
    }
    messages {
        uuid id PK
        uuid conversation_id FK "ON DELETE CASCADE"
        varchar role "user | assistant | system"
        text content "GIN trigram index"
        jsonb metadata "actions, attachments"
        varchar status "complete | streaming | error"
        timestamptz created_at
    }
```

**Indexes**

| Index | Purpose |
|---|---|
| `ix_conversations_user_id_updated_at` on `(user_id, updated_at DESC) WHERE deleted_at IS NULL` | Sidebar list and keyset pagination; the partial index skips soft-deleted rows |
| `ix_messages_conversation_id_created_at` | Load a conversation's history in order |
| `ix_conversations_title_trgm`, `ix_messages_content_trgm` (GIN, `gin_trgm_ops`) | `ILIKE '%term%'` search without a sequential scan |
| `uq_refresh_tokens_token_hash` | O(1) lookup of a presented refresh token |
| `ix_refresh_tokens_user_id` | Revoke all of a user's tokens on reuse detection |

## Request lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant MW as RequestIdMiddleware
    participant R as Router
    participant D as Depends()
    participant S as Service
    participant Repo as Repository
    participant EH as Exception handlers

    C->>MW: HTTP request (optional X-Request-ID)
    MW->>MW: set request_id contextvar
    MW->>R: forward
    R->>D: resolve DB session, current user, settings
    R->>S: call use case
    S->>Repo: query (always scoped by user_id)
    alt success
        Repo-->>S: rows
        S-->>R: domain result
        R-->>MW: 2xx Pydantic response
    else AppError / validation / unexpected
        S--xEH: raise
        EH-->>MW: {"error": {code, message, details}}
    end
    MW->>MW: log JSON line (method, path, status, duration, request_id)
    MW-->>C: response + X-Request-ID header
```

## Authentication flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as React app
    participant API as FastAPI
    participant DB as PostgreSQL
    participant RL as Redis

    U->>FE: email + password
    FE->>API: POST /auth/login
    API->>RL: INCR login rate-limit window
    alt over limit
        API-->>FE: 429 rate_limited
    end
    API->>DB: find user by lowercase email
    API->>API: bcrypt.verify(password, hash)
    alt invalid credentials
        API-->>FE: 401 invalid_credentials (same message for unknown email)
    end
    API->>DB: INSERT refresh_tokens(token_hash = sha256(random))
    API-->>FE: 200 {access_token (JWT, 15 min)}<br/>Set-Cookie: refresh_token (httpOnly, Secure, SameSite=Lax, 7d)
    FE->>FE: keep access token in Redux memory only

    Note over FE,API: Authenticated calls
    FE->>API: GET /users/me (Authorization: Bearer <jwt>)
    API-->>FE: 200 user

    Note over FE,API: Page reload or access token expired
    FE->>API: POST /auth/refresh (cookie sent automatically)
    API-->>FE: 200 new access token + rotated cookie
```

## Refresh-token rotation and reuse detection

```mermaid
flowchart TD
    A[POST /auth/refresh with cookie] --> B{token_hash found?}
    B -- no --> X1[401 invalid_refresh_token]
    B -- yes --> C{revoked_at set?}
    C -- yes --> R["Reuse detected: likely stolen token<br/>revoke ALL tokens of this user"] --> X2[401, clear cookie]
    C -- no --> D{expired?}
    D -- yes --> X3[401, clear cookie]
    D -- no --> E[revoke presented token]
    E --> F[insert new token row]
    F --> G[issue new JWT + Set-Cookie new refresh token]
```

## Send message + SSE streaming

```mermaid
sequenceDiagram
    autonumber
    participant FE as React (fetch + ReadableStream)
    participant API as ChatService
    participant DB as PostgreSQL
    participant RC as Redis
    participant LLM as LLMProvider

    FE->>API: POST /conversations/{id}/messages {content}
    API->>RC: rate-limit check (429 if exceeded)
    API->>DB: verify conversation belongs to user (else 404)
    API->>DB: INSERT user message (status=complete)
    API->>DB: INSERT assistant message (status=streaming)
    API->>RC: DEL user:{id}:conversations
    API-->>FE: event: message_start {user_message_id, assistant_message_id}
    API->>LLM: stream(history, settings)
    loop each token
        LLM-->>API: text chunk
        API-->>FE: event: delta {text}
    end
    LLM-->>API: follow-up actions
    API-->>FE: event: actions [{label, prompt}, ...]
    alt completed
        API->>DB: UPDATE assistant message (content, metadata.actions, status=complete)
        API-->>FE: event: message_end {message}
    else provider error or client disconnect
        API->>DB: UPDATE assistant message (partial content, status=error)
        API-->>FE: event: error {code, message}
    end
```

## Conversation list caching

```mermaid
flowchart LR
    subgraph read[Read path: cache-aside]
        G[GET /conversations] --> K{"first page, no search?<br/>key user:{id}:conversations"}
        K -- hit --> H[return cached JSON]
        K -- miss --> Q[query Postgres] --> W[SET key, TTL 60s] --> H2[return]
    end
    subgraph write[Write path: invalidate]
        M["create / rename / delete conversation<br/>or new message"] --> DEL["DEL user:{id}:conversations"]
    end
    RD[(Redis down?)] -. log warning, skip cache .-> Q
```

Deleting the key on writes, instead of updating it, means a write can never leave
a stale or half-updated list in the cache.

## Frontend structure

```mermaid
flowchart TB
    main[main.tsx] --> App
    App --> Provider[Redux Provider] --> Theme["MUI ThemeProvider<br/>(light / dark / system)"] --> Router[React Router]
    Router --> Login["/login<br/>features/auth"]
    Router --> Chat["/ and /c/:id<br/>features/chat"]
    Chat --> Sidebar[Sidebar: list, search, rename, delete]
    Chat --> Thread[MessageList → MessageBubble → MarkdownRenderer]
    Chat --> Composer[Composer]
    Thread --> Rich["tables, lists, code highlighting,<br/>images, recharts, action buttons, copy"]

    subgraph state[State]
        RTK["RTK Query api<br/>(REST: auth, users, conversations)"]
        Slices["slices: auth (access token in memory),<br/>chat (in-flight stream)"]
        SSE["lib/sse: fetch + ReadableStream parser"]
    end
    Login -.-> RTK
    Sidebar -.-> RTK
    Composer -.-> SSE -.-> Slices
```
