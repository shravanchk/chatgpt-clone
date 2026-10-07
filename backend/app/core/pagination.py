"""Opaque keyset cursors.

A cursor encodes the sort key `(timestamp, id)` of the last row on a page. Keyset
pagination stays fast at any depth and is stable while rows are inserted, unlike OFFSET.
"""

import base64
import binascii
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.errors import AppError


@dataclass(frozen=True)
class Cursor:
    at: datetime
    id: uuid.UUID


def encode_cursor(at: datetime, row_id: uuid.UUID) -> str:
    raw = json.dumps({"t": at.isoformat(), "i": str(row_id)}).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(value: str) -> Cursor:
    try:
        padded = value + "=" * (-len(value) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
        return Cursor(at=datetime.fromisoformat(data["t"]), id=uuid.UUID(data["i"]))
    except (ValueError, KeyError, TypeError, binascii.Error) as exc:
        raise AppError("Invalid pagination cursor", code="invalid_cursor") from exc
