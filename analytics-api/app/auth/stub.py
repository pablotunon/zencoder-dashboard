from app.models.auth import OrgContext


async def get_stub_org_context() -> OrgContext:
    """Phase A stub: returns hardcoded org context. Replaced by JWT auth in Phase B."""
    return OrgContext(org_id="org_acme", user_id="user_admin", role="admin")
