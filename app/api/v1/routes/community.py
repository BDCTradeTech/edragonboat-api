"""Mensajería 1:1 entre capitanes de equipos distintos."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
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


def _my_captain_team_id_set(db: Session, current: User) -> set[int]:
    return set(_captain_team_ids(db, current.id))


def _peer_for_message(m: CommunityMessage, my_tids: set[int]) -> int:
    if m.from_team_id in my_tids and m.to_team_id not in my_tids:
        return m.to_team_id
    if m.to_team_id in my_tids and m.from_team_id not in my_tids:
        return m.from_team_id
    if m.from_team_id in my_tids and m.to_team_id in my_tids:
        return m.to_team_id
    return m.to_team_id if m.from_team_id in my_tids else m.from_team_id


def _enrich_message_outs(
    db: Session,
    rows: list[CommunityMessage],
    current: User,
    my_tids: set[int],
) -> list[CommunityMessageOut]:
    if not rows:
        return []
    a_ids = {m.author_user_id for m in rows}
    t_ids = set()
    for m in rows:
        t_ids.add(m.from_team_id)
        t_ids.add(m.to_team_id)
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(a_ids)))}
    teams = {t.id: t for t in db.scalars(select(Team).where(Team.id.in_(t_ids)))}
    out: list[CommunityMessageOut] = []
    for m in rows:
        is_mine = m.author_user_id == current.id
        peer = _peer_for_message(m, my_tids)
        if is_mine:
            scap = ""
        else:
            au = users.get(m.author_user_id)
            t_from = teams.get(m.from_team_id)
            an = (au.full_name or "").strip() if au else ""
            if not an and au is not None:
                an = str(au.email)
            if not an:
                an = "?"
            tn = t_from.name if t_from else "?"
            scap = f"{an} · {tn}"
        out.append(
            CommunityMessageOut(
                id=m.id,
                body=m.body,
                created_at=m.created_at,
                from_team_id=m.from_team_id,
                to_team_id=m.to_team_id,
                from_my_team=is_mine,
                is_mine=is_mine,
                in_reply_to=m.in_reply_to_id,
                peer_team_id=peer,
                sender_caption=scap,
            )
        )
    return out


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

    contact_key = (get_settings().platform_contact_email or "").strip().casefold()
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
        is_inbox = bool(contact_key) and str(cap_user.email).strip().casefold() == contact_key
        out.append(
            CommunityTeamItem(
                team_id=team.id,
                team_name=team.name,
                country=team.country,
                captain_name=cname,
                captain_email=cap_user.email,
                is_platform_inbox=is_inbox,
            )
        )
    out.sort(key=lambda x: (0 if x.is_platform_inbox else 1, (x.team_name or "").casefold(), x.team_id))
    return CommunityTeamsPage(teams=out)


@router.get("/feed", response_model=CommunityMessagesPage, tags=["community"])
def list_community_feed(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> CommunityMessagesPage:
    """Todas las conversaciones del usuario (capitán) mezcladas, orden por fecha."""
    my_tids = _my_captain_team_id_set(db, current)
    if not my_tids and not current.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los capitanes pueden ver el buzón de comunidad",
        )
    if not my_tids:
        return CommunityMessagesPage(messages=[])
    q = (
        select(CommunityMessage)
        .where(
            or_(
                CommunityMessage.from_team_id.in_(my_tids),
                CommunityMessage.to_team_id.in_(my_tids),
            )
        )
        .order_by(CommunityMessage.created_at.asc(), CommunityMessage.id.asc())
    )
    rows = list(db.scalars(q).all())
    return CommunityMessagesPage(messages=_enrich_message_outs(db, rows, current, my_tids))


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

    my_tids = _my_captain_team_id_set(db, current)
    q = (
        select(CommunityMessage)
        .where(_thread_filter(from_side, other_team_id))
        .order_by(CommunityMessage.created_at.asc(), CommunityMessage.id.asc())
    )
    rows = list(db.scalars(q).all())
    return CommunityMessagesPage(messages=_enrich_message_outs(db, rows, current, my_tids))


@router.post("/messages", response_model=CommunityMessageOut, status_code=status.HTTP_201_CREATED, tags=["community"])
def post_community_message(
    body: CommunityPostBody,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> CommunityMessageOut:
    oteam = db.get(Team, body.other_team_id)
    if oteam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")

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
    my_tids = _my_captain_team_id_set(db, current)
    return _enrich_message_outs(db, [msg], current, my_tids)[0]


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
