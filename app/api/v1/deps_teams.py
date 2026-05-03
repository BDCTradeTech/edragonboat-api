"""Dependencias compartidas para endpoints que operan sobre equipos."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.membership import TeamMembership
from app.models.team import Team
from app.models.user import User


def _membership(db: Session, user_id: int, team_id: int) -> TeamMembership | None:
    """Retorna la membresía del usuario en el equipo, o None si no existe."""
    return db.scalar(
        select(TeamMembership).where(
            TeamMembership.user_id == user_id,
            TeamMembership.team_id == team_id,
        )
    )


def _require_team_access(db: Session, current: User, team_id: int) -> None:
    """Verifica que el usuario tenga acceso al equipo. Lanza 404 si no (oculta existencia del equipo).

    Los administradores de plataforma tienen acceso a todos los equipos siempre que el
    equipo exista; para ellos se hace una comprobación de existencia explícita.
    """
    if current.is_platform_admin:
        team = db.get(Team, team_id)
        if team is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
        return
    if _membership(db, current.id, team_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipo no encontrado o sin acceso",
        )
