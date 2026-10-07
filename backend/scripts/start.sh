#!/bin/sh
# Container entrypoint: apply migrations, then serve.
#
# compose's depends_on only orders the first start; when the Docker daemon restarts,
# containers come back in any order. Retry migrations briefly instead of crashing while
# the database is still unreachable.
set -e

attempt=1
until alembic upgrade head; do
  if [ "$attempt" -ge 15 ]; then
    echo "Database not reachable after $attempt attempts; giving up." >&2
    exit 1
  fi
  echo "Migration attempt $attempt failed; retrying in 2s..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

# exec: uvicorn becomes PID 1 and receives SIGTERM directly for graceful shutdown.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
