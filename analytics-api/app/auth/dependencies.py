import logging

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import decode_access_token
from app.models.auth import OrgContext
from app.services import redis_cache

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


async def get_org_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> OrgContext:
    """Extract org context from JWT token. Returns 401 if missing/invalid."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials

    # Check Redis deny-list (logged-out tokens)
    try:
        redis_client = redis_cache.get_client()
        if redis_client.exists(f"deny:{token}"):
            raise HTTPException(status_code=401, detail="Token has been revoked")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Redis unavailable for deny-list check — denying request")
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    claims = decode_access_token(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = claims.get("sub")
    org_id = claims.get("org_id")
    role = claims.get("role")
    team_id = claims.get("team_id")

    if not user_id or not org_id or not role:
        raise HTTPException(status_code=401, detail="Invalid token claims")

    return OrgContext(org_id=org_id, user_id=user_id, role=role, team_id=team_id)
