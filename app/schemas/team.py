from pydantic import BaseModel, EmailStr, Field

from app.models.membership import TeamRole


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    country: str | None = Field(None, max_length=100)


class TeamUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    country: str | None = Field(None, max_length=100)


class TeamRead(BaseModel):
    id: int
    name: str
    country: str | None = None

    model_config = {"from_attributes": True}


class MyTeamRead(BaseModel):
    team: TeamRead
    role: TeamRole


class TeamMemberRead(BaseModel):
    user_id: int
    email: EmailStr
    full_name: str | None
    role: TeamRole
    account_created: bool = False
    invite_email_sent: bool = False


class TeamMemberCreate(BaseModel):
    email: EmailStr
    role: TeamRole
    full_name: str | None = Field(None, max_length=200)


class TeamMemberRoleUpdate(BaseModel):
    role: TeamRole
