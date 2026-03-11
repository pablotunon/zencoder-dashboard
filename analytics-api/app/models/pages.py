from pydantic import BaseModel, Field
from typing import Optional


class PageSummary(BaseModel):
    page_id: str
    name: str
    slug: str
    icon: str
    sort_order: int


class PageDetail(PageSummary):
    layout: list  # DashboardRow[] JSON


class PageCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    icon: str = Field(max_length=64, default="squares-2x2")
    template: Optional[str] = None  # template ID


class PageUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=64)
    layout: Optional[list] = None


class PageReorderRequest(BaseModel):
    page_ids: list[str]


class TemplateSummary(BaseModel):
    id: str
    name: str
    icon: str
    description: str
