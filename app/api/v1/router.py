from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.api.v1.routes import auth, community, forum, health, regatas, routines, sessions, teams

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(community.router, prefix="/community", tags=["community"])
api_router.include_router(routines.router, prefix="/routines", tags=["routines"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(regatas.router, prefix="/regatas", tags=["regatas"])
api_router.include_router(forum.router, prefix="/forum", tags=["forum"])


@api_router.get("/me", tags=["auth"], include_in_schema=False)
def read_me_redirect() -> RedirectResponse:
    """Redirect permanente a /api/v1/auth/me (canónico)."""
    return RedirectResponse(url="/api/v1/auth/me", status_code=301)
