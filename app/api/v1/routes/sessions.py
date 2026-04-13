from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.libre_session_upload import LibreSessionUpload
from app.models.user import User
from app.schemas.libre_session import LibreSessionCreate, LibreSessionUploaded

router = APIRouter()


@router.post(
    "/libre",
    response_model=LibreSessionUploaded,
    status_code=status.HTTP_201_CREATED,
)
def upload_libre_session(
    body: LibreSessionCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> LibreSessionUploaded:
    """Recibe el mismo JSON que guarda la app en disco (sesión libre)."""
    row = LibreSessionUpload(
        user_id=current.id,
        json_payload=body.model_dump_json(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LibreSessionUploaded(id=row.id)
