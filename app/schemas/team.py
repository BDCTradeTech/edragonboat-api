from datetime import date

from pydantic import BaseModel, EmailStr, Field, model_validator

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
    logo_url: str | None = None


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
    document_number: str | None = None
    birth_date: date | None = None
    age_years: int | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    preferred_side: str | None = None


class TeamMemberCreate(BaseModel):
    email: EmailStr
    role: TeamRole
    full_name: str | None = Field(None, max_length=200)


class TeamMemberUpdate(BaseModel):
    """PATCH parcial: al menos uno de rol o email."""

    role: TeamRole | None = None
    email: EmailStr | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "TeamMemberUpdate":
        if self.role is None and self.email is None:
            raise ValueError("Indicá al menos rol o email")
        return self


class TeamMemberRosterUpdate(BaseModel):
    document_number: str | None = Field(None, max_length=80)
    birth_date: date | None = None
    height_cm: float | None = Field(None, ge=0, le=400)
    weight_kg: float | None = Field(None, ge=0, le=400)
    preferred_side: str | None = None
