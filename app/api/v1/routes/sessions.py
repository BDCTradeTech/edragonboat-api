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
    tcat = raw.get("teamCategory")
    if tcat is not None:
        out["team_category"] = str(tcat)
    if "virada" in raw:
        out["virada"] = bool(raw.get("virada"))
    tcountry = raw.get("teamCountry")
    if tcountry is not None and str(tcountry).strip() != "":
        out["team_country"] = str(tcountry).strip()
    return out


def _team_country_lookup_map(db: Session) -> dict[str, str | None]:
    """Nombre de equipo (casefold) → país según tabla teams (si el JSON no trajera país)."""
    rows = db.scalars(select(Team)).all()
    out: dict[str, str | None] = {}
    for t in rows:
        key = t.name.strip().casefold()
        c = (t.country or "").strip() or None
        if key not in out:
            out[key] = c
    return out


def _team_logo_url_lookup_map(db: Session) -> dict[str, str]:
    """Nombre de equipo (casefold) → ruta relativa del logo (solo equipos con logo_file)."""
    rows = db.scalars(select(Team)).all()
    out: dict[str, str] = {}
    for t in rows:
        key = t.name.strip().casefold()
        if key not in out and t.logo_file:
            out[key] = f"/api/v1/teams/{t.id}/logo"
    return out


def _team_logo_url_for_name(
    team_logo_lookup: dict[str, str] | None, team_name: str | None
) -> str | None:
    if not team_logo_lookup or team_name is None or not str(team_name).strip():
        return None
    return team_logo_lookup.get(str(team_name).strip().casefold())


def _can_view_competencia_session(db: Session, current: User, row: LibreSessionUpload) -> bool:
    """Control de acceso robusto: compara team_id de membresías, no nombres de equipo.

    Un usuario puede ver el detalle completo si:
    - Es admin de plataforma, o
    - Es quien subió la sesión, o
    - Comparte al menos un equipo con quien la subió (por team_id, no por nombre).
    """
    if current.is_platform_admin:
        return True
    if row.user_id == current.id:
        return True
    return _users_share_team(db, current.id, row.user_id)


def _summarize_row(
    row: LibreSessionUpload,
    *,
    team_country_lookup: dict[str, str | None] | None = None,
    team_logo_lookup: dict[str, str] | None = None,
) -> LibreSessionListItem:
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
        tc_row: str | None = extras.get("team_country")
        if sk == "competencia" and team_country_lookup is not None and not tc_row:
            tn = parsed.teamName if parsed else None
            if tn and str(tn).strip():
                tc_row = team_country_lookup.get(str(tn).strip().casefold())
        logo_row = _team_logo_url_for_name(team_logo_lookup, parsed.teamName)
        return LibreSessionListItem(
            id=row.id,
            created_at=row.created_at,
            uploaded_by_user_id=row.user_id,
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
            team_country=tc_row,
            team_logo_url=logo_row,
        )
    except Exception:
        extras_e = _competencia_extras_from_raw(raw) if sk == "competencia" else {}
        tc_e: str | None = extras_e.get("team_country")
        if sk == "competencia" and team_country_lookup is not None and not tc_e:
            tn = raw.get("teamName")
            if tn and str(tn).strip():
                tc_e = team_country_lookup.get(str(tn).strip().casefold())
        logo_e = _team_logo_url_for_name(team_logo_lookup, raw.get("teamName"))
        return LibreSessionListItem(
            id=row.id,
            created_at=row.created_at,
            uploaded_by_user_id=row.user_id,
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
            team_country=tc_e,
            team_logo_url=logo_e,
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
    payload_str = raw_bytes.decode("utf-8")
    try:
        _kind = json.loads(payload_str).get("sessionKind") or "libre"
    except Exception:
        _kind = "libre"
    row = LibreSessionUpload(
        user_id=current.id,
        json_payload=payload_str,
        session_kind=_kind,
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
    payload_str = raw_bytes.decode("utf-8")
    try:
        _kind = json.loads(payload_str).get("sessionKind") or "competencia"
    except Exception:
        _kind = "competencia"
    row = LibreSessionUpload(
        user_id=current.id,
        json_payload=payload_str,
        session_kind=_kind,
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
    """Listado global: todas las sesiones con sessionKind=competencia, de todos los usuarios (requiere login).

    Incluye `can_view_detail` calculado server-side por team_id (no por nombre de equipo).
    """
    page = db.scalars(
        select(LibreSessionUpload)
        .where(LibreSessionUpload.session_kind == "competencia")
        .order_by(LibreSessionUpload.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    country_lookup = _team_country_lookup_map(db)
    logo_lookup = _team_logo_url_lookup_map(db)

    # Precalculamos los team_ids del usuario actual para evitar N+1 queries.
    current_team_ids: set[int] = set(
        db.scalars(select(TeamMembership.team_id).where(TeamMembership.user_id == current.id)).all()
    )

    result: list[LibreSessionListItem] = []
    for r in page:
        item = _summarize_row(r, team_country_lookup=country_lookup, team_logo_lookup=logo_lookup)
        # can_view_detail: True si admin, si es el uploader, o si comparte equipo por team_id.
        if current.is_platform_admin or r.user_id == current.id:
            item.can_view_detail = True
        else:
            uploader_team_ids: set[int] = set(
                db.scalars(
                    select(TeamMembership.team_id).where(TeamMembership.user_id == r.user_id)
                ).all()
            )
            item.can_view_detail = bool(current_team_ids & uploader_team_ids)
        result.append(item)
    return result


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
        .where(
            LibreSessionUpload.user_id == current.id,
            LibreSessionUpload.session_kind != "competencia",
        )
        .order_by(LibreSessionUpload.created_at.desc())
    )
    if team_id is None:
        rows = db.scalars(base.offset(skip).limit(limit)).all()
        logo_lookup = _team_logo_url_lookup_map(db)
        return [_summarize_row(r, team_logo_lookup=logo_lookup) for r in rows]

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
    # session_kind filtra en SQL; teamName sigue filtrando en Python (está dentro del JSON).
    cap = min(2000, max(500, (skip + limit) * 20))
    rows = db.scalars(
        select(LibreSessionUpload)
        .where(
            LibreSessionUpload.user_id.in_(member_ids),
            LibreSessionUpload.session_kind != "competencia",
        )
        .order_by(LibreSessionUpload.created_at.desc())
        .limit(cap)
    ).all()
    logo_lookup = _team_logo_url_lookup_map(db)
    matched: list[LibreSessionListItem] = []
    for r in rows:
        item = _summarize_row(r, team_logo_lookup=logo_lookup)
        if item.team_name and item.team_name.strip().casefold() == target_name:
            matched.append(item)
    return matched[skip : skip + limit]


@router.get("/competencia/{session_id}")
def get_competencia_session(
    session_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Detalle de una sesión de competencia con control de acceso server-side.

    - Admin o mismo equipo (por team_id): devuelve el JSON completo en `session`.
    - Otros usuarios autenticados: devuelve metadatos públicos con `session=null`.
    """
    row = db.get(LibreSessionUpload, session_id)
    if row is None or not _is_competencia_payload(row.json_payload):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")

    can_view_full = _can_view_competencia_session(db, current, row)

    logo_lookup = _team_logo_url_lookup_map(db)
    country_lookup = _team_country_lookup_map(db)
    summary = _summarize_row(row, team_country_lookup=country_lookup, team_logo_lookup=logo_lookup)

    base: dict[str, Any] = {
        "id": row.id,
        "created_at": row.created_at,
        "uploaded_by_user_id": row.user_id,
        "can_view_detail": can_view_full,
        "team_name": summary.team_name,
        "team_country": summary.team_country,
        "team_logo_url": summary.team_logo_url,
        "session_kind": summary.session_kind,
        "target_distance_meters": summary.target_distance_meters,
        "boat_type": summary.boat_type,
        "paddlers_count": summary.paddlers_count,
        "drummer": summary.drummer,
        "age_category": summary.age_category,
        "team_category": summary.team_category,
        "virada": summary.virada,
        "total_seconds": summary.total_seconds,
        "distance_meters": summary.distance_meters,
    }

    if can_view_full:
        try:
            session_payload: dict[str, Any] = json.loads(row.json_payload)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JSON de sesión corrupto en el servidor",
            )
        base["session"] = session_payload
        base["can_delete"] = _can_delete_libre_session(db, current, row)
    else:
        base["session"] = None
        base["can_delete"] = False

    return base


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
    if _is_competencia_payload(row.json_payload):
        if not _can_view_competencia_session(db, current, row):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesi?n no encontrada")
    elif not _can_view_libre_session(db, current, row.user_id):
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
    logo_lookup = _team_logo_url_lookup_map(db)
    tn = session_payload.get("teamName")
    team_logo_url = _team_logo_url_for_name(
        logo_lookup, str(tn).strip() if tn is not None else None
    )
    return {
        "id": row.id,
        "created_at": row.created_at,
        "uploaded_by_user_id": row.user_id,
        "can_delete": _can_delete_libre_session(db, current, row),
        "team_logo_url": team_logo_url,
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
