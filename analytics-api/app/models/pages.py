from pydantic import BaseModel, Field
from typing import Optional


class PageResponse(BaseModel):
    page_id: str
    name: str
    icon: str
    layout: list  # DashboardRow[] as JSON
    sort_order: int


class CreatePageRequest(BaseModel):
    name: str = Field(max_length=255)
    icon: str = Field(max_length=64, default="squares-2x2")
    layout: list = Field(default_factory=list)


class UpdatePageRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=64)
    layout: Optional[list] = None


class ReorderPagesRequest(BaseModel):
    page_ids: list[str]
