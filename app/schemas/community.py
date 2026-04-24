from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer

_MAX_BODY = 8000


class CommunityTeamItem(BaseModel):
    team_id: int
    team_name: str
    country: str | None = None
    captain_name: str | None = None
    captain_email: str | None = None
    is_platform_inbox: bool = False
    message_count: int = Field(
        0,
        description="Mensajes con este interlocutor (según tus equipos de capitán en el hilo 1:1).",
    )

    @field_serializer("captain_email")
    def _mask_email(self, v: str | None) -> str | None:
        if v is None or "@" not in v:
            return v
        local, _, domain = v.partition("@")
        if len(local) <= 2:
            return f"{local[0]}…@{domain}"
        return f"{local[:2]}…@{domain}"


class CommunityMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    created_at: datetime
    from_team_id: int
    to_team_id: int
    from_my_team: bool
    is_mine: bool
    in_reply_to: int | None = None
    peer_team_id: int
    sender_caption: str = ""


class CommunityMessagesPage(BaseModel):
    messages: list[CommunityMessageOut]


class CommunityTeamsPage(BaseModel):
    teams: list[CommunityTeamItem]


class CommunityPostBody(BaseModel):
    other_team_id: int = Field(..., ge=1)
    body: str = Field(..., min_length=1, max_length=_MAX_BODY)
    in_reply_to: int | None = None
