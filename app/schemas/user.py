from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=200)


class UserRead(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    is_active: bool

    model_config = {"from_attributes": True}
