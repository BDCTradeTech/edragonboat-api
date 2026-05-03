from datetime import datetime

from pydantic import BaseModel, Field

from app.models.forum import ForumCategory


class ForumPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1)
    category: ForumCategory = ForumCategory.general


class ForumPostRead(BaseModel):
    id: int
    title: str
    content: str
    category: ForumCategory
    author_id: int
    author_name: str
    team_id: int | None
    team_name: str | None
    is_pinned: bool
    view_count: int
    comment_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ForumCommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class ForumCommentRead(BaseModel):
    id: int
    post_id: int
    content: str
    author_id: int
    author_name: str
    team_id: int | None
    team_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
