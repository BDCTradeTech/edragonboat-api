import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.libre_session_upload import LibreSessionUpload
from app.models.membership import TeamMembership
from app.models.team import Team
from app.models.user import User
from app.schemas.libre_session import (
    LibreSessionCreate,
    LibreSessionListItem,
    LibreSessionUploaded,
)

router = APIRouter()


def _summarize_row(row: LibreSessionUpload) -> LibreSessionListItem:
    try:
        parsed = LibreSessionCreate.model_validate_json(row.json_payload)
        last = parsed.dataPoints[-1] if parsed.dataPoints else None
        return LibreSessionListItem(
            id=row.id,
            created_at=row.created_at,
            session_start_time=parsed.sessionStartTime,
            total_seconds=parsed.totalSeconds,
            distance_meters=last.distanceMeters if last else None,
            paladas=last.paladas if last else None,
            team_name=parsed.teamName,
        )
    except Exception:
        return LibreSessionListItem(
            id=row.id,
            created_at=row.created_at,
            session_start_time=None,
            total_seconds=None,
            distance_meters=None,
            paladas=None,
            team_name=None,
        )


@router.post(
    "/libre",
    response_model=LibreSessionUploaded,
    status_code=status.HTTP_201_CREATED,
)
async def upload_libre_session(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> LibreSessionUploaded:
    """Recibe el mismo JSON que guarda la app. Guardamos el cuerpo tal cual (incl. latitude/longitude)."""
    raw_bytes = await request.body()
    try:
        LibreSessionCreate.model_validate_json(raw_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"JSON de sesión inválido: {e}",
        ) from e
    row = LibreSessionUpload(
        user_id=current.id,
        json_payload=raw_bytes.decode("utf-8"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LibreSessionUploaded(id=row.id)


@router.get("/libre", response_model=list[LibreSessionListItem])
def list_libre_sessions(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    team_id: int | None = Query(None, description="Filtrar por nombre de equipo en el JSON de la sesión"),
) -> list[LibreSessionListItem]:
    """Sesiones libres del usuario. Con team_id, solo las que en JSON tienen teamName igual al nombre del equipo (misma membresía)."""
    base = (
        select(LibreSessionUpload)
        .where(LibreSessionUpload.user_id == current.id)
        .order_by(LibreSessionUpload.created_at.desc())
    )
    if team_id is None:
        stmt = base.offset(skip).limit(limit)
        rows = db.scalars(stmt).all()
        return [_summarize_row(r) for r in rows]

    m = db.scalar(
        select(TeamMembership).where(
            TeamMembership.user_id == current.id,
            TeamMembership.team_id == team_id,
        )
    )
    if m is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipo no encontrado o sin acceso",
        )
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    target_name = team.name.strip().casefold()

    cap = min(2000, max(500, (skip + limit) * 20))
    rows = db.scalars(base.limit(cap)).all()
    matched: list[LibreSessionListItem] = []
    for r in rows:
        item = _summarize_row(r)
        if item.team_name and item.team_name.strip().casefold() == target_name:
            matched.append(item)
    return matched[skip : skip + limit]


@router.get("/libre/{session_id}")
def get_libre_session(
    session_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Devuelve el JSON guardado tal cual (incluye latitude/longitude aunque sean null)."""
    row = db.get(LibreSessionUpload, session_id)
    if row is None or row.user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")
    try:
        session_payload: dict[str, Any] = json.loads(row.json_payload)
        LibreSessionCreate.model_validate(session_payload)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JSON de sesión corrupto en el servidor",
        )
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JSON de sesión inválido en el servidor",
        )
    return {
        "id": row.id,
        "created_at": row.created_at,
        "session": session_payload,
    }
