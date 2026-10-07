import json
import logging

from app.core.logging import JsonFormatter


def test_json_formatter_emits_extras_and_drops_color_message() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "hello", None, None)
    record.path = "/x"
    record.color_message = "\x1b[36mhello\x1b[0m"

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "hello"
    assert payload["path"] == "/x"
    assert "color_message" not in payload
