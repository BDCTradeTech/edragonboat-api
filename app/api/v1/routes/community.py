"""Mensajería 1:1 entre capitanes de equipos distintos."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.community_message import CommunityMessage
from app.models.membership import TeamMembership, TeamRole
from app.models.team import Team
from app.models.user import User
from app.schemas.community import (
    CommunityMessageOut,
    CommunityMessagesPage,
    CommunityPostBody,
    CommunityTeamItem,
    CommunityTeamsPage,
)

router = APIRouter()


def _captain_team_ids(db: Session, user_id: int) -> list[int]:
    return list(
        db.scalars(
            select(TeamMembership.team_id)
            .where(
                TeamMembership.user_id == user_id,
                TeamMembership.role == TeamRole.captain,
            )
            .order_by(TeamMembership.team_id)
        ).all()
    )


def _resolve_captain_from_team(db: Session, current: User, other_team_id: int) -> int:
    captains = _captain_team_ids(db, current.id)
    if not captains:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los capitanes pueden usar la mensajería de comunidad",
        )
    if other_team_id in captains:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Elegí otro equipo distinto al tuyo",
        )
    if len(captains) == 1:
        return captains[0]
    for tid in captains:
        hit = db.scalar(
            select(CommunityMessage.id).where(
                or_(
                    and_(
                        CommunityMessage.from_team_id == tid,
                        CommunityMessage.to_team_id == other_team_id,
                    ),
                    and_(
                        CommunityMessage.from_team_id == other_team_id,
                        CommunityMessage.to_team_id == tid,
                    ),
                )
            ).limit(1)
        )
        if hit is not None:
            return tid
    return captains[0]


def _distinct_partners_for_other(db: Session, other_team_id: int) -> set[int]:
    rows = db.execute(
        select(CommunityMessage.from_team_id, CommunityMessage.to_team_id).where(
            or_(
                CommunityMessage.from_team_id == other_team_id,
                CommunityMessage.to_team_id == other_team_id,
            )
        )
    ).all()
    out: set[int] = set()
    for a, b in rows:
        out.add(b if a == other_team_id else a)
    return out


def _resolve_read_from_team(
    db: Session,
    current: User,
    other_team_id: int,
    from_team_id: int | None,
) -> int | None:
    """
    Identifica 'nuestro' lado del hilo 1:1. None = sin mensajes aún (solo admin, sin from_team_id).
    """
    if not current.is_platform_admin:
        return _resolve_captain_from_team(db, current, other_team_id)

    if from_team_id is not None:
        if from_team_id == other_team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="from_team_id debe ser distinto de other_team_id",
            )
        if db.get(Team, from_team_id) is None or db.get(Team, other_team_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
        return from_team_id

    part = _distinct_partners_for_other(db, other_team_id)
    if len(part) == 1:
        return next(iter(part))
    if len(part) == 0:
        return None
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Varios hilos con este equipo: añadí from_team_id en la query",
    )


def _thread_filter(from_team: int, other: int):
    return or_(
        and_(
            CommunityMessage.from_team_id == from_team,
            CommunityMessage.to_team_id == other,
        ),
        and_(
            CommunityMessage.from_team_id == other,
            CommunityMessage.to_team_id == from_team,
        ),
    )


@router.get("/teams", response_model=CommunityTeamsPage, tags=["community"])
def list_community_directory(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> CommunityTeamsPage:
    if not current.is_platform_admin and not _captain_team_ids(db, current.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los capitanes pueden ver el directorio de comunidad",
        )

    team_ids = list(
        db.scalars(
            select(TeamMembership.team_id)
            .where(TeamMembership.role == TeamRole.captain)
            .group_by(TeamMembership.team_id)
            .order_by(TeamMembership.team_id)
        ).all()
    )
    if not team_ids:
        return CommunityTeamsPage(teams=[])

    out: list[CommunityTeamItem] = []
    for team_id in team_ids:
        team = db.get(Team, team_id)
        if team is None:
            continue
        row = db.execute(
            select(TeamMembership, User)
            .join(User, User.id == TeamMembership.user_id)
            .where(
                TeamMembership.team_id == team_id,
                TeamMembership.role == TeamRole.captain,
            )
            .order_by(TeamMembership.id)
            .limit(1)
        ).first()
        if not row:
            continue
        _m, cap_user = row
        cname = (cap_user.full_name or "").strip() or None
        out.append(
            CommunityTeamItem(
                team_id=team.id,
                team_name=team.name,
                country=team.country,
                captain_name=cname,
                captain_email=cap_user.email,
            )
        )
    return CommunityTeamsPage(teams=out)


@router.get("/messages", response_model=CommunityMessagesPage, tags=["community"])
def list_community_messages(
    other_team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    from_team_id: int | None = None,
) -> CommunityMessagesPage:
    if other_team_id < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="other_team_id inválido")
    oteam = db.get(Team, other_team_id)
    if oteam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")

    from_side = _resolve_read_from_team(db, current, other_team_id, from_team_id)
    if from_side is None:
        return CommunityMessagesPage(messages=[])

    q = (
        select(CommunityMessage)
        .where(_thread_filter(from_side, other_team_id))
        .order_by(CommunityMessage.created_at.asc(), CommunityMessage.id.asc())
    )
    rows = list(db.scalars(q).all())
    out: list[CommunityMessageOut] = []
    for m in rows:
        out.append(
            CommunityMessageOut(
                id=m.id,
                body=m.body,
                created_at=m.created_at,
                from_team_id=m.from_team_id,
                to_team_id=m.to_team_id,
                from_my_team=m.from_team_id == from_side,
                in_reply_to=m.in_reply_to_id,
            )
        )
    return CommunityMessagesPage(messages=out)


@router.post("/messages", response_model=CommunityMessageOut, status_code=status.HTTP_201_CREATED, tags=["community"])
def post_community_message(
    body: CommunityPostBody,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> CommunityMessageOut:
    oteam = db.get(Team, body.other_team_id)
    if oteam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")

    if current.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La mensajería de comunidad es entre capitanes; los administradores no publican aquí",
        )

    from_team = _resolve_captain_from_team(db, current, body.other_team_id)
    o_cap = db.scalar(
        select(TeamMembership)
        .where(
            TeamMembership.team_id == body.other_team_id,
            TeamMembership.role == TeamRole.captain,
        )
        .limit(1)
    )
    if o_cap is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El equipo destino no tiene capitán; no se puede enviar un mensaje",
        )

    if body.in_reply_to is not None:
        parent = db.get(CommunityMessage, body.in_reply_to)
        if parent is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mensaje citado no encontrado")
        if not (
            (parent.from_team_id == from_team and parent.to_team_id == body.other_team_id)
            or (parent.from_team_id == body.other_team_id and parent.to_team_id == from_team)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La respuesta no pertenece a este hilo",
            )

    msg = CommunityMessage(
        from_team_id=from_team,
        to_team_id=body.other_team_id,
        author_user_id=current.id,
        body=body.body,
        in_reply_to_id=body.in_reply_to,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return CommunityMessageOut(
        id=msg.id,
        body=msg.body,
        created_at=msg.created_at,
        from_team_id=msg.from_team_id,
        to_team_id=msg.to_team_id,
        from_my_team=True,
        in_reply_to=msg.in_reply_to_id,
    )


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["community"])
def delete_community_message(
    message_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    m = db.get(CommunityMessage, message_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensaje no encontrado")

    if current.is_platform_admin:
        db.delete(m)
        db.commit()
        return

    if m.author_user_id == current.id:
        db.delete(m)
        db.commit()
        return

    from_t = m.from_team_id
    cap = db.scalar(
        select(TeamMembership)
        .where(
            TeamMembership.user_id == current.id,
            TeamMembership.team_id == from_t,
            TeamMembership.role == TeamRole.captain,
        )
    )
    if cap is not None:
        db.delete(m)
        db.commit()
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No se puede eliminar este mensaje")
