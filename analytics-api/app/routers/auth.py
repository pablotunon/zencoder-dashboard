import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_token_remaining_ttl,
    verify_password,
)
from app.auth.dependencies import get_org_context
from app.models.auth import (
    LoginRequest,
    LoginResponse,
    OrgContext,
    OrgProfile,
    RefreshRequest,
    RefreshResponse,
    UserProfile,
)
from app.services import page_service
from app.services import postgres as pg_service
from app.services import redis_cache

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

LOGIN_RATE_LIMIT = 10  # max attempts per window
LOGIN_RATE_WINDOW = 60  # seconds


def _check_login_rate_limit(email: str) -> None:
    """Raise 429 if too many login attempts for this email."""
    try:
        client = redis_cache.get_client()
        key = f"login_attempts:{email}"
        attempts = client.get(key)
        if attempts is not None and int(attempts) >= LOGIN_RATE_LIMIT:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, LOGIN_RATE_WINDOW)
        pipe.execute()
    except HTTPException:
        raise
    except Exception:
        # If Redis is down, allow the attempt rather than blocking all logins
        logger.warning("Redis unavailable for rate limiting — skipping check")


@router.post("/api/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """Authenticate with email + password, return JWT token."""
    _check_login_rate_limit(body.email)

    user = await pg_service.get_user_by_email(body.email)

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("is_active", False):
        raise HTTPException(status_code=401, detail="Account is disabled")

    password_hash = user.get("password_hash")
    if not password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Create JWT with user claims (no email — not needed for authorization)
    claims = {
        "sub": user["user_id"],
        "org_id": user["org_id"],
        "role": user["role"],
        "team_id": user.get("team_id"),
    }
    token = create_access_token(claims)
    refresh = create_refresh_token(claims)

    # Seed default pages on first login (or first login after feature ships)
    try:
        await page_service.seed_default_pages(user["user_id"], user["org_id"])
    except Exception:
        logger.warning("Failed to seed default pages for user %s", user["user_id"])

    return LoginResponse(
        token=token,
        refresh_token=refresh,
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
        ttl = get_token_remaining_ttl(token)
        if ttl > 0:
            redis_client.setex(f"deny:{token}", ttl, "1")
    except Exception:
        logger.exception("Failed to add token to deny-list")
        raise HTTPException(status_code=503, detail="Logout failed — please try again")

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


@router.post("/api/auth/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    # Check deny-list
    try:
        redis_client = redis_cache.get_client()
        if redis_client.exists(f"deny:{body.refresh_token}"):
            raise HTTPException(status_code=401, detail="Refresh token has been revoked")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Redis unavailable for deny-list check")
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    claims = decode_refresh_token(body.refresh_token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Revoke the old refresh token (rotation: each refresh token is single-use)
    try:
        ttl = get_token_remaining_ttl(body.refresh_token)
        if ttl > 0:
            redis_client.setex(f"deny:{body.refresh_token}", ttl, "1")
    except Exception:
        logger.warning("Failed to revoke old refresh token")

    # Issue new token pair with the same claims
    new_claims = {
        "sub": claims["sub"],
        "org_id": claims["org_id"],
        "role": claims["role"],
        "team_id": claims.get("team_id"),
    }
    return RefreshResponse(
        token=create_access_token(new_claims),
        refresh_token=create_refresh_token(new_claims),
    )
