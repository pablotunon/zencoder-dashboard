"""Pages API — CRUD for user dashboard pages."""
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_org_context
from app.models.auth import OrgContext
from app.models.pages import (
    PageCreateRequest,
    PageDetail,
    PageReorderRequest,
    PageSummary,
    PageUpdateRequest,
    TemplateSummary,
)
from app.services import page_service
from app.services.page_templates import TEMPLATES, TEMPLATE_LIST

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/pages", response_model=list[PageSummary])
async def list_pages(ctx: OrgContext = Depends(get_org_context)):
    """List all pages for the current user (sidebar)."""
    return await page_service.get_user_pages(ctx.user_id)


@router.get("/api/pages/templates", response_model=list[TemplateSummary])
async def list_templates(ctx: OrgContext = Depends(get_org_context)):
    """List available page templates."""
    return [
        TemplateSummary(id=t.id, name=t.name, icon=t.icon, description=t.description)
        for t in TEMPLATE_LIST
    ]


@router.post("/api/pages", response_model=PageDetail, status_code=201)
async def create_page(
    body: PageCreateRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    """Create a new page (blank or from a template)."""
    layout: list = []
    if body.template:
        t = TEMPLATES.get(body.template)
        if t is not None:
            layout = t.layout

    page = await page_service.create_page(
        user_id=ctx.user_id,
        org_id=ctx.org_id,
        name=body.name,
        icon=body.icon,
        layout=layout,
    )
    return page


@router.get("/api/pages/{slug}", response_model=PageDetail)
async def get_page(slug: str, ctx: OrgContext = Depends(get_org_context)):
    """Get a single page with its layout."""
    page = await page_service.get_page_by_slug(ctx.user_id, slug)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/api/pages/{slug}", response_model=PageDetail)
async def update_page(
    slug: str,
    body: PageUpdateRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    """Update a page (name, icon, layout — all optional)."""
    page = await page_service.update_page(
        user_id=ctx.user_id,
        slug=slug,
        name=body.name,
        icon=body.icon,
        layout=body.layout,
    )
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.patch("/api/pages/reorder", status_code=204)
async def reorder_pages(
    body: PageReorderRequest,
    ctx: OrgContext = Depends(get_org_context),
):
    """Reorder pages by providing the full list of page_ids in desired order."""
    await page_service.reorder_pages(ctx.user_id, body.page_ids)


@router.delete("/api/pages/{slug}", status_code=204)
async def delete_page(slug: str, ctx: OrgContext = Depends(get_org_context)):
    """Delete a page."""
    deleted = await page_service.delete_page(ctx.user_id, slug)
    if not deleted:
        raise HTTPException(status_code=404, detail="Page not found")
