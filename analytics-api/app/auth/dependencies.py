from fastapi import Depends

from app.auth.stub import get_stub_org_context
from app.models.auth import OrgContext


async def get_org_context(
    ctx: OrgContext = Depends(get_stub_org_context),
) -> OrgContext:
    """Returns current org context. Phase A: stub. Phase B: JWT-based."""
    return ctx
