"""Regatas: listado público para el panel (placeholder hasta integrar datos reales)."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("")
def list_regatas(_current: Annotated[User, Depends(get_current_user)]) -> list[dict]:
    """Devuelve las regatas disponibles. Por ahora lista vacía; mismo contrato que usará la versión final."""
    return []
