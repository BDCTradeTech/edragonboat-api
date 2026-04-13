from pydantic import BaseModel, Field

from app.models.membership import TeamRole


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class TeamRead(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class MyTeamRead(BaseModel):
    team: TeamRead
    role: TeamRole
