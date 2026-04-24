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
    is_platform_admin: bool = False

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=200)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
