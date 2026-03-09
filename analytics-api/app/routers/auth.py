import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import create_access_token, verify_password
from app.auth.dependencies import get_org_context
from app.config import settings
from app.models.auth import (
    LoginRequest,
    LoginResponse,
    OrgContext,
    OrgProfile,
    UserProfile,
)
from app.services import postgres as pg_service
from app.services import redis_cache

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)


@router.post("/api/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """Authenticate with email + password, return JWT token."""
    user = await pg_service.get_user_by_email(None, body.email)

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("is_active", False):
        raise HTTPException(status_code=401, detail="Account is disabled")

    password_hash = user.get("password_hash")
    if not password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Create JWT with user claims
    token = create_access_token({
        "sub": user["user_id"],
        "org_id": user["org_id"],
        "role": user["role"],
        "team_id": user.get("team_id"),
        "email": user["email"],
    })

    return LoginResponse(
        token=token,
        user=UserProfile(
            user_id=user["user_id"],
            name=user["name"],
            email=user["email"],
            role=user["role"],
            avatar_url=user.get("avatar_url"),
            team_id=user.get("team_id"),
        ),
        org=OrgProfile(
            org_id=user["org_id"],
            name=user["org_name"],
            plan=user["org_plan"],
        ),
    )


@router.post("/api/auth/logout", status_code=204)
async def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    """Invalidate the current token by adding it to the Redis deny-list."""
    if credentials is None:
        return

    token = credentials.credentials
    try:
        redis_client = redis_cache.get_client()
        # Add token to deny-list with TTL matching token expiry
        redis_client.setex(
            f"deny:{token}",
            settings.jwt_expiry_hours * 3600,
            "1",
        )
    except Exception:
        logger.warning("Failed to add token to deny-list")

    return


@router.get("/api/auth/me", response_model=UserProfile)
async def get_me(ctx: OrgContext = Depends(get_org_context)):
    """Return the current user's profile from the database."""
    pool = await pg_service.get_pool()
    row = await pool.fetchrow(
        """SELECT u.user_id, u.org_id, u.team_id, u.name, u.email, u.avatar_url, u.role
           FROM users u WHERE u.user_id = $1 AND u.org_id = $2""",
        ctx.user_id, ctx.org_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    return UserProfile(
        user_id=row["user_id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        avatar_url=row.get("avatar_url"),
        team_id=row.get("team_id"),
    )
