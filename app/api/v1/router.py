from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.v1.routes import auth, community, health, regatas, routines, sessions, teams
from app.models.user import User
from app.schemas.user import UserRead

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(community.router, prefix="/community", tags=["community"])
api_router.include_router(routines.router, prefix="/routines", tags=["routines"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(regatas.router, prefix="/regatas", tags=["regatas"])


@api_router.get("/me", response_model=UserRead, tags=["auth"])
def read_me(current: Annotated[User, Depends(get_current_user)]) -> User:
    """Perfil del usuario (panel web). Ruta corta por si /auth/me no está en caché o proxy."""
    return current
