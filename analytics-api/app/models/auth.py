from pydantic import BaseModel
from typing import Literal, Optional


class OrgContext(BaseModel):
    org_id: str
    user_id: str
    role: Literal["admin", "team_lead", "viewer"]
    team_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: "UserProfile"
    org: "OrgProfile"


class UserProfile(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    team_id: Optional[str] = None


class OrgProfile(BaseModel):
    org_id: str
    name: str
    plan: str
