"""Centralized JSON response with NaN-safe serialization.

ClickHouse aggregate functions (quantile, avg) return nan on empty result sets.
Python's standard json.dumps rejects nan as non-JSON-compliant (RFC 7159).
This module provides a JSONResponse subclass that replaces non-finite floats
with null during serialization, applied as the app-wide default response class.
"""

import math
from typing import Any

from starlette.responses import JSONResponse as _StarletteJSONResponse

try:
    import orjson

    def _serialize(content: Any) -> bytes:
        return orjson.dumps(content, option=orjson.OPT_NON_STR_KEYS)

except ImportError:
    import json

    class _NanSafeEncoder(json.JSONEncoder):
        """JSON encoder that converts NaN and Inf floats to None (JSON null)."""

        def iterencode(self, o: Any, _one_shot: bool = False) -> Any:
            return super().iterencode(_sanitize(o), _one_shot)

    def _sanitize(obj: Any) -> Any:
        """Recursively replace non-finite floats with None."""
        if isinstance(obj, float):
            return None if not math.isfinite(obj) else obj
        if isinstance(obj, dict):
            return {k: _sanitize(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_sanitize(v) for v in obj]
        return obj

    def _serialize(content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            cls=_NanSafeEncoder,
        ).encode("utf-8")


class NanSafeJSONResponse(_StarletteJSONResponse):
    """JSONResponse that serializes NaN/Inf as null instead of crashing."""

    def render(self, content: Any) -> bytes:
        return _serialize(content)
