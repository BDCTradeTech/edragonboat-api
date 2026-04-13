from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.models.membership import TeamMembership, TeamRole
from app.models.team import Team
from app.models.user import User
from app.db.session import get_db
from app.schemas.team import MyTeamRead, TeamCreate, TeamRead

router = APIRouter()


@router.post("", response_model=MyTeamRead, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> MyTeamRead:
    """Crea un equipo; el usuario autenticado queda como capitán."""
    team = Team(name=body.name.strip())
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
    rows = db.scalars(
        select(TeamMembership).where(TeamMembership.user_id == current.id)
    ).all()
    out: list[MyTeamRead] = []
    for m in rows:
        team = db.get(Team, m.team_id)
        if team is None:
            continue
        out.append(MyTeamRead(team=TeamRead.model_validate(team), role=m.role))
    return out


@router.get("/{team_id}", response_model=TeamRead)
def get_team(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> Team:
    m = db.scalar(
        select(TeamMembership).where(
            TeamMembership.user_id == current.id,
            TeamMembership.team_id == team_id,
        )
    )
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado o sin acceso")
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    return team
