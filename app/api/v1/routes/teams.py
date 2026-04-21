from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
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
    TeamMemberRosterUpdate,
    TeamMemberUpdate,
    TeamRead,
    TeamUpdate,
)

router = APIRouter()


def _team_logo_disk_path(team_id: int) -> Path:
    return Path(get_settings().data_dir) / "team_logos" / f"{team_id}.png"


def _team_read(team: Team) -> TeamRead:
    return TeamRead(
        id=team.id,
        name=team.name,
        country=team.country,
        logo_url=f"/api/v1/teams/{team.id}/logo" if team.logo_file else None,
    )


def _bytes_look_like_png_or_jpeg(raw: bytes) -> bool:
    if len(raw) < 12:
        return False
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if raw[:2] == b"\xff\xd8":
        return True
    return False


def _process_uploaded_logo(raw: bytes) -> bytes:
    """Normaliza a PNG RGB 512 px; tolera JPEG/PNG con EXIF, CMYK, LA, paleta, etc."""
    try:
        from PIL import Image, ImageFile, ImageOps
    except ImportError as e:
        raise ValueError(
            "Falta el paquete Pillow en el servidor. Instalá: pip install Pillow"
        ) from e

    ImageFile.LOAD_TRUNCATED_IMAGES = True
    try:
        Image.MAX_IMAGE_PIXELS = 30_000_000
    except Exception:
        pass

    if not raw or len(raw) < 24:
        raise ValueError("Archivo vacío o demasiado pequeño.")

    buf = BytesIO(raw)
    try:
        im = Image.open(buf)
        im.load()
    except Exception as e:
        raise ValueError(f"No se pudo abrir la imagen. Usá PNG o JPEG (error: {e!s})") from e

    try:
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass

    def _to_rgb_on_white(src: Image.Image) -> Image.Image:
        if src.mode == "RGB":
            return src
        if src.mode == "RGBA":
            bg = Image.new("RGB", src.size, (255, 255, 255))
            bg.paste(src, mask=src.split()[3])
            return bg
        if src.mode == "LA":
            bg = Image.new("RGB", src.size, (255, 255, 255))
            bg.paste(src.convert("RGBA"), mask=src.split()[1])
            return bg
        if src.mode == "P":
            return _to_rgb_on_white(src.convert("RGBA"))
        if src.mode == "CMYK":
            return src.convert("RGB")
        if src.mode in ("I", "I;16", "F", "L", "1"):
            return src.convert("RGB")
        return src.convert("RGB")

    im = _to_rgb_on_white(im)
    im.thumbnail((512, 512), Image.Resampling.LANCZOS)
    out = BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _age_years(birth: date) -> int:
    today = date.today()
    age = today.year - birth.year
    if (today.month, today.day) < (birth.month, birth.day):
        age -= 1
    return age


def _member_read(m: TeamMembership, u: User) -> TeamMemberRead:
    age = _age_years(m.birth_date) if m.birth_date else None
    return TeamMemberRead(
        user_id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=m.role,
        document_number=m.document_number,
        birth_date=m.birth_date,
        age_years=age,
        height_cm=m.height_cm,
        weight_kg=m.weight_kg,
        preferred_side=m.preferred_side,
        sex=m.sex if m.sex in ("female", "male") else None,
    )


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
    membership = TeamMembership(user_id=current.id, team_id=team.id, role=TeamRole.captain, sex="female")
    db.add(membership)
    db.commit()
    db.refresh(team)
    return MyTeamRead(team=_team_read(team), role=TeamRole.captain)


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
            out.append(MyTeamRead(team=_team_read(team), role=role))
        return out
    rows = db.scalars(
        select(TeamMembership).where(TeamMembership.user_id == current.id)
    ).all()
    out = []
    for m in rows:
        team = db.get(Team, m.team_id)
        if team is None:
            continue
        out.append(MyTeamRead(team=_team_read(team), role=m.role))
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
        out.append(_member_read(m, u))
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
    m = TeamMembership(user_id=target.id, team_id=team_id, role=body.role, sex="female")
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

    return _member_read(m, target).model_copy(
        update={"account_created": account_created, "invite_email_sent": email_sent}
    )


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberRead)
def update_member(
    team_id: int,
    user_id: int,
    body: TeamMemberUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamMemberRead:
    m = _membership(db, user_id, team_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")
    u = db.get(User, user_id)
    assert u is not None

    if body.email is not None:
        if not current.is_platform_admin:
            actor = _membership(db, current.id, team_id)
            if actor is None or actor.role != TeamRole.captain:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo el capitán o el administrador pueden cambiar emails del equipo",
                )
        email_key = _invite_email_key(str(body.email))
        conflict = db.scalar(
            select(User).where(func.lower(User.email) == email_key, User.id != user_id)
        )
        if conflict is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un usuario con ese email",
            )
        u.email = email_key

    if body.role is not None:
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
        else:
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
    db.refresh(m)
    db.refresh(u)
    return _member_read(m, u)


@router.patch("/{team_id}/members/{user_id}/roster", response_model=TeamMemberRead)
def update_member_roster(
    team_id: int,
    user_id: int,
    body: TeamMemberRosterUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamMemberRead:
    _require_captain_coach_or_platform_admin(db, current, team_id)
    m = _membership(db, user_id, team_id)
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miembro no encontrado")
    data = body.model_dump(exclude_unset=True)
    if "document_number" in data:
        dn = data["document_number"]
        m.document_number = None if dn is None else str(dn).strip() or None
    if "birth_date" in data:
        m.birth_date = data["birth_date"]
    if "height_cm" in data:
        m.height_cm = data["height_cm"]
    if "weight_kg" in data:
        m.weight_kg = data["weight_kg"]
    if "preferred_side" in data:
        ps = data["preferred_side"]
        if ps is not None and ps not in ("right", "left", "either"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="preferred_side debe ser right, left o either",
            )
        m.preferred_side = ps
    if "sex" in data:
        sx = data["sex"]
        if sx is not None and sx not in ("female", "male"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="sex debe ser female o male",
            )
        m.sex = sx
    db.commit()
    db.refresh(m)
    u = db.get(User, user_id)
    assert u is not None
    return _member_read(m, u)


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
    logo_path = _team_logo_disk_path(team_id)
    if logo_path.is_file():
        logo_path.unlink()
    db.delete(team)
    db.commit()


@router.get("/{team_id}/logo")
def get_team_logo_image(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    """Logo público (para etiqueta img en el panel)."""
    team = db.get(Team, team_id)
    if team is None or not team.logo_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sin logo")
    path = _team_logo_disk_path(team_id)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sin logo")
    # Misma URL siempre (/teams/{id}/logo): sin esto el navegador puede seguir mostrando
    # la imagen vieja tras subir un logo nuevo; mapas JPG y listados deben ver el archivo actual.
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/{team_id}/logo", response_model=TeamRead)
async def upload_team_logo(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> TeamRead:
    _require_captain_or_platform_admin(db, current, team_id)
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Máximo 5 MB")
    if not _bytes_look_like_png_or_jpeg(raw):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se aceptan archivos PNG o JPEG (los primeros bytes del archivo no coinciden).",
        )
    try:
        processed = _process_uploaded_logo(raw)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se pudo procesar la imagen: {e!s}",
        ) from e
    path = _team_logo_disk_path(team_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(processed)
    team.logo_file = f"{team_id}.png"
    db.commit()
    db.refresh(team)
    return _team_read(team)


@router.delete("/{team_id}/logo", response_model=TeamRead)
def delete_team_logo(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamRead:
    _require_captain_or_platform_admin(db, current, team_id)
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    path = _team_logo_disk_path(team_id)
    if path.is_file():
        path.unlink()
    team.logo_file = None
    db.commit()
    db.refresh(team)
    return _team_read(team)


@router.patch("/{team_id}", response_model=TeamRead)
def update_team(
    team_id: int,
    body: TeamUpdate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamRead:
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
    return _team_read(team)


@router.get("/{team_id}", response_model=TeamRead)
def get_team(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TeamRead:
    _require_team_access(db, current, team_id)
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    return _team_read(team)
