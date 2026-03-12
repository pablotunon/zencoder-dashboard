from pydantic import BaseModel, EmailStr, Field
from typing import Literal, Optional


class OrgContext(BaseModel):
    org_id: str
    user_id: str
    role: Literal["admin", "team_lead", "viewer"]
    team_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class LoginResponse(BaseModel):
    token: str
    refresh_token: str
    user: "UserProfile"
    org: "OrgProfile"


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    refresh_token: str


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
