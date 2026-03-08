from pydantic import BaseModel
from typing import Literal


class OrgContext(BaseModel):
    org_id: str
    user_id: str
    role: Literal["admin", "team_lead", "viewer"]
