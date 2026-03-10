"""Centralized JSON response using orjson.

orjson serializes NaN and Inf as null by default (RFC 7159 compliant),
which handles ClickHouse quantile()/avg() returning nan on empty result sets.
Also significantly faster than the standard library json module.
"""

from typing import Any

import orjson
from starlette.responses import JSONResponse as _StarletteJSONResponse


class ORJSONResponse(_StarletteJSONResponse):
    """JSONResponse backed by orjson.

    - NaN/Inf floats are serialized as null (orjson default behavior).
    - Non-string dict keys are supported via OPT_NON_STR_KEYS.
    """

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(content, option=orjson.OPT_NON_STR_KEYS)
