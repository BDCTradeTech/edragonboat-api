from fastapi import APIRouter

from app.api.v1.routes import auth, health, sessions, teams

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(teams.router, prefix="/teams", tags=["teams"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
