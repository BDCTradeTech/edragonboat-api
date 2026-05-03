from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.deps_teams import _membership, _require_team_access
from app.db.session import get_db
from app.models.routine import Routine, RoutineExercise
from app.models.user import User
from app.schemas.routine import RoutineCreate, RoutineExerciseRead, RoutineRead, RoutineSave, RoutineExerciseWrite

router = APIRouter()

ALLOWED_KINDS = frozenset({"warmup", "salida", "r1", "r2", "r3", "r4", "descanso"})
ALLOWED_METRICS = frozenset({"time", "distance", "strokes"})


def _validate_exercises(items: list[RoutineExerciseWrite]) -> None:
    for ex in items:
        if ex.kind not in ALLOWED_KINDS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tipo de ejercicio inválido: {ex.kind}",
            )
        if ex.metric not in ALLOWED_METRICS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Métrica inválida: {ex.metric}",
            )


def _routine_to_read(r: Routine) -> RoutineRead:
    ex_list = sorted(r.exercises, key=lambda x: x.sort_order)
    return RoutineRead(
        id=r.id,
        team_id=r.team_id,
        name=r.name,
        exercises=[
            RoutineExerciseRead(
                id=e.id,
                sort_order=e.sort_order,
                kind=e.kind,
                metric=e.metric,
                value=e.value,
            )
            for e in ex_list
        ],
    )


@router.get("", response_model=list[RoutineRead])
def list_routines(
    team_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> list[RoutineRead]:
    _require_team_access(db, current, team_id)
    rows = db.scalars(select(Routine).where(Routine.team_id == team_id).order_by(Routine.name.asc())).all()
    return [_routine_to_read(r) for r in rows]


@router.post("", response_model=RoutineRead, status_code=status.HTTP_201_CREATED)
def create_routine(
    body: RoutineCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> RoutineRead:
    _require_team_access(db, current, body.team_id)
    r = Routine(team_id=body.team_id, name=body.name.strip())
    db.add(r)
    db.commit()
    db.refresh(r)
    return _routine_to_read(r)


@router.get("/{routine_id}", response_model=RoutineRead)
def get_routine(
    routine_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> RoutineRead:
    r = db.get(Routine, routine_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada")
    _require_team_access(db, current, r.team_id)
    return _routine_to_read(r)


@router.put("/{routine_id}", response_model=RoutineRead)
def save_routine(
    routine_id: int,
    body: RoutineSave,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> RoutineRead:
    r = db.get(Routine, routine_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada")
    _require_team_access(db, current, r.team_id)
    _validate_exercises(body.exercises)
    r.name = body.name.strip()
    db.execute(delete(RoutineExercise).where(RoutineExercise.routine_id == routine_id))
    for i, ex in enumerate(body.exercises):
        db.add(
            RoutineExercise(
                routine_id=routine_id,
                sort_order=i,
                kind=ex.kind,
                metric=ex.metric,
                value=float(ex.value),
            )
        )
    db.commit()
    db.refresh(r)
    return _routine_to_read(r)


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(
    routine_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    r = db.get(Routine, routine_id)
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rutina no encontrada")
    _require_team_access(db, current, r.team_id)
    db.delete(r)
    db.commit()
