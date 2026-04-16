from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.mail import INVITE_DEFAULT_PASSWORD, send_team_invite_email
from app.core.security import hash_password
from app.db.session import get_db
from app.models.membership import TeamMembership, TeamRole
from app.models.team import Team
from app.models.user import User
from app.schemas.team import (
    MyTeamRead,
    TeamCreate,
    TeamMemberCreate,
    TeamMemberRead,
    TeamMemberRoleUpdate,
    TeamRead,
    TeamUpdate,
)

router = APIRouter()


def _invite_email_key(email: str) -> str:
    return str(email).strip().lower()


def _membership(db: Session, user_id: int, team_id: int) -> TeamMembership | None:
    return db.scalar(
        select(TeamMembership).where(
            TeamMembership.user_id == user_id,
            TeamMembership.team_id == team_id,
        )
    )


def _require_team_exists(db: Session, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    return team


def _require_team_access(db: Session, current: User, team_id: int) -> None:
    if current.is_platform_admin:
        _require_team_exists(db, team_id)
        return
    if _membership(db, current.id, team_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado o sin acceso")


def _require_access(db: Session, current: User, team_id: int) -> TeamMembership:
    """Miembro del equipo (no aplica a admin de plataforma sin fila de membresía)."""
    m = _membership(db, current.id, team_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado o sin acceso")
    return m


def _require_captain(db: Session, current: User, team_id: int) -> TeamMembership:
    m = _require_access(db, current, team_id)
    if m.role != TeamRole.captain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el capitán puede realizar esta acción",
        )
    return m


def _require_captain_or_coach(db: Session, current: User, team_id: int) -> TeamMembership:
    m = _require_access(db, current, team_id)
    if m.role not in (TeamRole.captain, TeamRole.coach):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el capitán o el entrenador pueden realizar esta acción",
        )
    return m


def _require_captain_or_platform_admin(db: Session, current: User, team_id: int) -> None:
    if current.is_platform_admin:
        _require_team_exists(db, team_id)
        return
    _require_captain(db, current, team_id)


def _require_captain_coach_or_platform_admin(db: Session, current: User, team_id: int) -> None:
    if current.is_platform_admin:
        _require_team_exists(db, team_id)
        return
    _require_captain_or_coach(db, current, team_id)


def _non_captain_roles(role: TeamRole) -> None:
    if role == TeamRole.captain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rol capitán no se asigna desde aquí",
        )


@router.post("", response_model=MyTeamRead, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MyTeamRead:
    """Crea un equipo; el usuario autenticado queda como capitán. Un usuario solo puede pertenecer a un equipo."""
    existing_n = db.scalar(
        select(func.count()).select_from(TeamMembership).where(TeamMembership.user_id == current.id)
    )
    if existing_n and existing_n > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya pertenecés a un equipo. Solo puede haber uno por usuario.",
        )
    country = body.country.strip() if body.country else None
    team = Team(name=body.name.strip(), country=country or None)
    db.add(team)
    db.flush()
    membership = TeamMembership(user_id=current.id, team_id=team.id, role=TeamRole.captain)
    db.add(membership)
    db.commit()
    db.refresh(team)
    return MyTeamRead(team=TeamRead.model_validate(team), role=TeamRole.captain)


@router.get("/me", response_model=list[MyTeamRead])
def my_teams(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[MyTeamRead]:
    if current.is_platform_admin:
        teams = db.scalars(select(Team).order_by(Team.name.asc())).all()
        out: list[MyTeamRead] = []
        for team in teams:
            m = _membership(db, current.id, team.id)
            role = m.role if m is not None else TeamRole.paddler
            out.append(MyTeamRead(team=TeamRead.model_validate(team), role=role))
        return out
    rows = db.scalars(
        select(TeamMembership).where(TeamMembership.user_id == current.id)
    ).all()
    out = []
    for m in rows:
        team = db.get(Team, m.team_id)
        if team is None:
            continue
        out.append(MyTeamRead(team=TeamRead.model_validate(team), role=m.role))
    return out


@router.get("/countries", response_model=list[str])
def list_distinct_team_countries(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[str]:
    """Países distintos asignados a algún equipo (filtros del panel de competencias)."""
    rows = db.scalars(select(Team.country).where(Team.country.isnot(None))).all()
    out = sorted({(c or "").strip() for c in rows if c and str(c).strip()})
    return out


@router.get("/{team_id}/members", response_model=list[TeamMemberRead])
def list_team_members(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[TeamMemberRead]:
    _require_team_access(db, current, team_id)
    rows = db.scalars(
        select(TeamMembership).where(TeamMembership.team_id == team_id)
    ).all()
    out: list[TeamMemberRead] = []
    for m in rows:
        u = db.get(User, m.user_id)
        if u is None:
            continue
        out.append(
            TeamMemberRead(
                user_id=u.id,
                email=u.email,
                full_name=u.full_name,
                role=m.role,
            )
        )
    return sorted(out, key=lambda x: (x.role != TeamRole.captain, x.email))


@router.post("/{team_id}/members", response_model=TeamMemberRead, status_code=status.HTTP_201_CREATED)
def add_team_member(
    team_id: int,
    body: TeamMemberCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamMemberRead:
    _require_captain_or_platform_admin(db, current, team_id)
    _non_captain_roles(body.role)
    settings = get_settings()

    email_key = _invite_email_key(body.email)
    target = db.scalar(select(User).where(func.lower(User.email) == email_key))
    account_created = False
    if target is None:
        fn = (body.full_name or "").strip() or None
        target = User(
            email=email_key,
            hashed_password=hash_password(INVITE_DEFAULT_PASSWORD),
            full_name=fn,
        )
        db.add(target)
        db.flush()
        account_created = True
    else:
        other = db.scalar(select(TeamMembership).where(TeamMembership.user_id == target.id))
        if other is not None and other.team_id != team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esa persona ya pertenece a otro equipo",
            )

    existing = _membership(db, target.id, team_id)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esa persona ya está en el equipo")
    m = TeamMembership(user_id=target.id, team_id=team_id, role=body.role)
    db.add(m)
    db.commit()
    db.refresh(m)
    db.refresh(target)

    email_sent = False
    if account_created:
        team = db.get(Team, team_id)
        team_name = team.name if team else "E-DragonBoat"
        email_sent = send_team_invite_email(
            settings,
            to_email=str(target.email),
            team_name=team_name,
            temp_password=INVITE_DEFAULT_PASSWORD,
        )

    return TeamMemberRead(
        user_id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=m.role,
        account_created=account_created,
        invite_email_sent=email_sent,
    )


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberRead)
def update_member_role(
    team_id: int,
    user_id: int,
    body: TeamMemberRoleUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamMemberRead:
    m = _membership(db, user_id, team_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")

    if current.is_platform_admin:
        _require_team_exists(db, team_id)
        if body.role == TeamRole.captain:
            for om in db.scalars(
                select(TeamMembership).where(TeamMembership.team_id == team_id)
            ).all():
                if om.role == TeamRole.captain and om.user_id != user_id:
                    om.role = TeamRole.paddler
            m.role = TeamRole.captain
        else:
            if m.role == TeamRole.captain and body.role != TeamRole.captain:
                cap_n = sum(
                    1
                    for om in db.scalars(
                        select(TeamMembership).where(TeamMembership.team_id == team_id)
                    ).all()
                    if om.role == TeamRole.captain
                )
                if cap_n <= 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="El equipo debe tener al menos un capitán. Designá otro capitán primero.",
                    )
            m.role = body.role
        db.commit()
        u = db.get(User, user_id)
        assert u is not None
        return TeamMemberRead(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role)

    actor = _require_captain_or_coach(db, current, team_id)
    _non_captain_roles(body.role)
    if m.role == TeamRole.captain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede cambiar el rol del capitán desde aquí",
        )
    if actor.role == TeamRole.coach:
        if body.role == TeamRole.coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el capitán puede asignar el rol entrenador",
            )
        if m.role == TeamRole.coach:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el capitán puede modificar a otros entrenadores",
            )
    m.role = body.role
    db.commit()
    u = db.get(User, user_id)
    assert u is not None
    return TeamMemberRead(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role)


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_team_member(
    team_id: int,
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    m = _membership(db, user_id, team_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")
    if m.role == TeamRole.captain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar al capitán del equipo",
        )
    if current.is_platform_admin:
        _require_team_exists(db, team_id)
        db.delete(m)
        db.commit()
        return
    actor = _require_captain_or_coach(db, current, team_id)
    if m.role == TeamRole.coach and actor.role != TeamRole.captain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el capitán puede quitar a un entrenador",
        )
    db.delete(m)
    db.commit()


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Elimina el equipo y sus membresías (solo capitán o admin de plataforma)."""
    _require_captain_or_platform_admin(db, current, team_id)
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    db.delete(team)
    db.commit()


@router.patch("/{team_id}", response_model=TeamRead)
def update_team(
    team_id: int,
    body: TeamUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Team:
    _require_captain_or_platform_admin(db, current, team_id)
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        team.name = str(data["name"]).strip()
    if "country" in data:
        c = data["country"]
        team.country = str(c).strip() if c and str(c).strip() else None
    db.commit()
    db.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamRead)
def get_team(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Team:
    _require_team_access(db, current, team_id)
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    return team
