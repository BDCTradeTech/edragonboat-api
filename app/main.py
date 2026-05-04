from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.mail import INVITE_DEFAULT_PASSWORD, send_team_invite_email
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine, get_db
from app.models.membership import TeamMembership, TeamRole
from app.models.team import Team
from app.models.user import User
from app.schemas.user import UserRead


class PanelInviteMemberBody(BaseModel):
    """Cuerpo del POST panel invitar (no depende de schemas/team.py del servidor)."""

    email: EmailStr
    role: TeamRole
    full_name: str | None = Field(None, max_length=200)




def _bootstrap_platform_admin_emails() -> None:
    """Marca como admin de plataforma los usuarios listados en PLATFORM_ADMIN_EMAILS (solo promueve, no quita el flag)."""
    cfg = get_settings()
    raw = (cfg.platform_admin_emails or "").strip()
    if not raw:
        return
    emails = {e.strip().casefold() for e in raw.split(",") if e.strip()}
    if not emails:
        return
    db = SessionLocal()
    try:
        users = db.scalars(select(User).where(func.lower(User.email).in_(emails))).all()
        changed = False
        for u in users:
            if not u.is_platform_admin:
                u.is_platform_admin = True
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()


def _ensure_platform_inbox_team() -> None:
    """Crea el equipo de contacto (Comunidad) y hace capitán a platform_contact_email si el usuario existe."""
    cfg = get_settings()
    email = (cfg.platform_contact_email or "").strip().lower()
    if not email:
        return
    tname = (cfg.platform_inbox_team_name or "E-DragonBoat (Admin)").strip() or "E-DragonBoat (Admin)"
    _legacy = "E-DragonBoat (Administración)"
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(func.lower(User.email) == email))
        if user is None:
            return
        team = db.scalar(select(Team).where(Team.name == tname).limit(1))
        if team is None:
            team = db.scalar(select(Team).where(Team.name == _legacy).limit(1))
        if team is None:
            team = Team(name=tname, country=None)
            db.add(team)
            db.flush()
        if team is not None and team.name != tname:
            team.name = tname
        existing = db.scalar(
            select(TeamMembership).where(
                TeamMembership.user_id == user.id,
                TeamMembership.team_id == team.id,
            )
        )
        if existing is None:
            db.add(
                TeamMembership(
                    user_id=user.id,
                    team_id=team.id,
                    role=TeamRole.captain,
                    sex="female",
                )
            )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.models.community_message  # noqa: F401
    import app.models.forum  # noqa: F401
    import app.models.libre_session_upload  # noqa: F401
    import app.models.membership  # noqa: F401
    import app.models.team  # noqa: F401
    import app.models.routine  # noqa: F401
    import app.models.user  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _bootstrap_platform_admin_emails()
    _ensure_platform_inbox_team()
    data_dir = Path(get_settings().data_dir)
    (data_dir / "team_logos").mkdir(parents=True, exist_ok=True)
    yield


settings = get_settings()


def _cors_allow_origins() -> list[str]:
    raw = settings.cors_origins.strip()
    if raw == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(
    title=settings.app_name,
    description="API para EDragonboat — equipos, roles y futuras sesiones desde la app.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/api/v1/deploy-check")
def deploy_check(current: Annotated[User, Depends(get_current_user)]) -> dict[str, object]:
    """Requiere autenticación: verificá que el proceso usa este código (curl con Bearer token o vía Caddy)."""
    return {
        "ok": True,
        "build": "community-messages-2026-04-05",
        "has_panel_routes": True,
        "has_community_routes": True,
        "invite_creates_user": True,
        "panel_invite_path": "/api/v1/panel/teams/{team_id}/members",
    }


@app.get("/api/v1/profile", tags=["auth"], include_in_schema=False)
def panel_profile_redirect() -> RedirectResponse:
    """Redirect permanente a /api/v1/auth/me (canónico)."""
    return RedirectResponse(url="/api/v1/auth/me", status_code=301)


@app.delete("/api/v1/equipo/{team_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["teams"])
def panel_delete_team(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Borrar equipo y membresías (solo capitán). Alias de DELETE /teams/{id}."""
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
        if m.role != TeamRole.captain:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el capitán puede eliminar el equipo",
            )
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado")
    db.delete(team)
    db.commit()


@app.post(
    "/api/v1/panel/teams/{team_id}/members",
    status_code=status.HTTP_201_CREATED,
    tags=["teams"],
)
def panel_add_team_member(
    team_id: int,
    body: PanelInviteMemberBody,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Invitar palista/entrenador; crea cuenta si el email no existe. Definido en main.py para deploys viejos de teams.py."""
    if not current.is_platform_admin:
        m_cap = db.scalar(
            select(TeamMembership).where(
                TeamMembership.user_id == current.id,
                TeamMembership.team_id == team_id,
            )
        )
        if m_cap is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Equipo no encontrado o sin acceso",
            )
        if m_cap.role != TeamRole.captain:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el capitán puede realizar esta acción",
            )
    if body.role == TeamRole.captain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rol capitán no se asigna desde aquí",
        )

    cfg = get_settings()
    email_key = str(body.email).strip().lower()
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

    dup = db.scalar(
        select(TeamMembership).where(
            TeamMembership.user_id == target.id,
            TeamMembership.team_id == team_id,
        )
    )
    if dup is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esa persona ya está en el equipo",
        )

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
            cfg,
            to_email=str(target.email),
            team_name=team_name,
            temp_password=INVITE_DEFAULT_PASSWORD,
        )

    return jsonable_encoder(
        {
            "user_id": target.id,
            "email": target.email,
            "full_name": target.full_name,
            "role": m.role,
            "account_created": account_created,
            "invite_email_sent": email_sent,
        }
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "docs": "/docs", "health": "/api/v1/health"}
