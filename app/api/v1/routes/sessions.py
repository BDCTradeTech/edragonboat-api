import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.libre_session_upload import LibreSessionUpload
from app.models.membership import TeamMembership, TeamRole
from app.models.team import Team
from app.models.user import User
from app.schemas.libre_session import (
    LibreSessionCreate,
    LibreSessionListItem,
    LibreSessionUploaded,
)

router = APIRouter()


def _users_share_team(db: Session, uid_a: int, uid_b: int) -> bool:
    if uid_a == uid_b:
        return True
    teams_a = set(db.scalars(select(TeamMembership.team_id).where(TeamMembership.user_id == uid_a)).all())
    teams_b = set(db.scalars(select(TeamMembership.team_id).where(TeamMembership.user_id == uid_b)).all())
    return bool(teams_a & teams_b)


def _session_team_name_key(json_payload: str) -> str | None:
    try:
        d = json.loads(json_payload)
        t = d.get("teamName")
        if t is None or str(t).strip() == "":
            return None
        return str(t).strip().casefold()
    except Exception:
        return None


def _can_delete_libre_session(db: Session, current: User, row: LibreSessionUpload) -> bool:
    if current.is_platform_admin:
        return True
    if row.user_id == current.id:
        return True
    key = _session_team_name_key(row.json_payload)
    if key is None:
        return False
    memberships = db.scalars(select(TeamMembership).where(TeamMembership.user_id == current.id)).all()
    for m in memberships:
        if m.role not in (TeamRole.captain, TeamRole.coach):
            continue
        team = db.get(Team, m.team_id)
        if team is not None and team.name.strip().casefold() == key:
            return True
    return False


def _can_view_libre_session(db: Session, current: User, upload_user_id: int) -> bool:
    if current.is_platform_admin:
        return True
    if current.id == upload_user_id:
        return True
    return _users_share_team(db, current.id, upload_user_id)


def _raw_session_kind_and_target(json_payload: str) -> tuple[str | None, int | None]:
    try:
        raw = json.loads(json_payload)
        kind = raw.get("sessionKind")
        if kind == "competencia":
            td = raw.get("targetDistanceMeters")
            tdi = int(td) if td is not None else None
            return "competencia", tdi
        return "libre", None
    except Exception:
        return None, None


def _is_competencia_payload(json_payload: str) -> bool:
    k, _ = _raw_session_kind_and_target(json_payload)
    return k == "competencia"


def _competencia_extras_from_raw(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    bt = raw.get("boatType")
    if bt is not None:
        out["boat_type"] = str(bt) if not isinstance(bt, str) else bt
    pc = raw.get("paddlersCount")
    if pc is not None:
        try:
            out["paddlers_count"] = int(pc)
        except (TypeError, ValueError):
            out["paddlers_count"] = None
    if "drummer" in raw:
        out["drummer"] = bool(raw.get("drummer"))
    ac = raw.get("ageCategory")
    if ac is not None:
        out["age_category"] = str(ac)
    tc = raw.get("teamCategory")
    if tc is not None:
        out["team_category"] = str(tc)
    if "virada" in raw:
        out["virada"] = bool(raw.get("virada"))
    return out


def _summarize_row(row: LibreSessionUpload) -> LibreSessionListItem:
    sk, tgt = _raw_session_kind_and_target(row.json_payload)
    try:
        raw = json.loads(row.json_payload)
    except Exception:
        raw = {}
    try:
        parsed = LibreSessionCreate.model_validate_json(row.json_payload)
        last = parsed.dataPoints[-1] if parsed.dataPoints else None
        if sk == "competencia":
            extras = _competencia_extras_from_raw(raw)
            if extras.get("boat_type") is None and parsed.boatType is not None:
                extras["boat_type"] = parsed.boatType
            if extras.get("paddlers_count") is None and parsed.paddlersCount is not None:
                extras["paddlers_count"] = parsed.paddlersCount
        else:
            extras = {}
            if parsed.boatType is not None:
                extras["boat_type"] = parsed.boatType
            if parsed.paddlersCount is not None:
                extras["paddlers_count"] = parsed.paddlersCount
        return LibreSessionListItem(
            id=row.id,
            created_at=row.created_at,
            session_start_time=parsed.sessionStartTime,
            total_seconds=parsed.totalSeconds,
            distance_meters=last.distanceMeters if last else None,
            paladas=last.paladas if last else None,
            team_name=parsed.teamName,
            session_kind=sk,
            target_distance_meters=tgt,
            boat_type=extras.get("boat_type"),
            paddlers_count=extras.get("paddlers_count"),
            drummer=extras.get("drummer"),
            age_category=extras.get("age_category"),
            team_category=extras.get("team_category"),
            virada=extras.get("virada"),
        )
    except Exception:
        extras_e = _competencia_extras_from_raw(raw) if sk == "competencia" else {}
        return LibreSessionListItem(
            id=row.id,
            created_at=row.created_at,
            session_start_time=None,
            total_seconds=None,
            distance_meters=None,
            paladas=None,
            team_name=None,
            session_kind=sk,
            target_distance_meters=tgt,
            boat_type=extras_e.get("boat_type"),
            paddlers_count=extras_e.get("paddlers_count"),
            drummer=extras_e.get("drummer"),
            age_category=extras_e.get("age_category"),
            team_category=extras_e.get("team_category"),
            virada=extras_e.get("virada"),
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
            detail=f"JSON de sesi?n inv?lido: {e}",
        ) from e
    row = LibreSessionUpload(
        user_id=current.id,
        json_payload=raw_bytes.decode("utf-8"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LibreSessionUploaded(id=row.id)


@router.post(
    "/competencia",
    response_model=LibreSessionUploaded,
    status_code=status.HTTP_201_CREATED,
)
async def upload_competencia_session(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> LibreSessionUploaded:
    """Misma tabla y validaci?n base que libre; el JSON incluye sessionKind y metadatos de competencia."""
    raw_bytes = await request.body()
    try:
        LibreSessionCreate.model_validate_json(raw_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"JSON de sesi?n inv?lido: {e}",
        ) from e
    row = LibreSessionUpload(
        user_id=current.id,
        json_payload=raw_bytes.decode("utf-8"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LibreSessionUploaded(id=row.id)


@router.get("/competencia", response_model=list[LibreSessionListItem])
def list_competencia_sessions(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> list[LibreSessionListItem]:
    """Listado global: todas las sesiones con sessionKind=competencia, de todos los usuarios (requiere login)."""
    cap = min(8000, max(2000, (skip + limit) * 25))
    rows = db.scalars(
        select(LibreSessionUpload).order_by(LibreSessionUpload.created_at.desc()).limit(cap)
    ).all()
    matched = [r for r in rows if _is_competencia_payload(r.json_payload)]
    page = matched[skip : skip + limit]
    return [_summarize_row(r) for r in page]


@router.get("/libre", response_model=list[LibreSessionListItem])
def list_libre_sessions(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    team_id: int | None = Query(None, description="Filtrar por nombre de equipo en el JSON de la sesi?n"),
) -> list[LibreSessionListItem]:
    """Sin team_id: solo sesiones que subi? el usuario. Con team_id: sesiones de cualquier miembro del equipo cuyo JSON teamName coincide con el nombre del equipo."""
    base = (
        select(LibreSessionUpload)
        .where(LibreSessionUpload.user_id == current.id)
        .order_by(LibreSessionUpload.created_at.desc())
    )
    if team_id is None:
        cap = min(2000, max(500, (skip + limit) * 10))
        rows = db.scalars(base.limit(cap)).all()
        libre_rows = [r for r in rows if not _is_competencia_payload(r.json_payload)]
        page = libre_rows[skip : skip + limit]
        return [_summarize_row(r) for r in page]

    if not current.is_platform_admin:
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

    # Capit?n, entrenador y palistas: ven entrenamientos subidos por cualquier miembro del equipo
    # (mismo criterio: teamName en el JSON coincide con el nombre del equipo).
    member_ids = select(TeamMembership.user_id).where(TeamMembership.team_id == team_id)
    base = (
        select(LibreSessionUpload)
        .where(LibreSessionUpload.user_id.in_(member_ids))
        .order_by(LibreSessionUpload.created_at.desc())
    )

    cap = min(2000, max(500, (skip + limit) * 20))
    rows = db.scalars(base.limit(cap)).all()
    matched: list[LibreSessionListItem] = []
    for r in rows:
        if _is_competencia_payload(r.json_payload):
            continue
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
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesi?n no encontrada")
    # Competencias: visibles para cualquier usuario autenticado (listado global en el panel).
    if not _is_competencia_payload(row.json_payload) and not _can_view_libre_session(
        db, current, row.user_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesi?n no encontrada")
    try:
        session_payload: dict[str, Any] = json.loads(row.json_payload)
        LibreSessionCreate.model_validate(session_payload)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JSON de sesi?n corrupto en el servidor",
        )
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JSON de sesi?n inv?lido en el servidor",
        )
    return {
        "id": row.id,
        "created_at": row.created_at,
        "uploaded_by_user_id": row.user_id,
        "can_delete": _can_delete_libre_session(db, current, row),
        "session": session_payload,
    }


@router.delete("/libre/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_libre_session(
    session_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    row = db.get(LibreSessionUpload, session_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesi?n no encontrada")
    if not _can_delete_libre_session(db, current, row):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No ten?s permiso para borrar esta sesi?n")
    db.delete(row)
    db.commit()
