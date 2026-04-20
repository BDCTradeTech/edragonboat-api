from pydantic import BaseModel, Field


class RoutineExerciseRead(BaseModel):
    id: int
    sort_order: int
    kind: str
    metric: str
    value: float

    model_config = {"from_attributes": True}


class RoutineExerciseWrite(BaseModel):
    kind: str = Field(min_length=1, max_length=32)
    metric: str = Field(min_length=1, max_length=16)
    value: float = Field(ge=0, le=1e9)


class RoutineRead(BaseModel):
    id: int
    team_id: int
    name: str
    exercises: list[RoutineExerciseRead]

    model_config = {"from_attributes": True}


class RoutineCreate(BaseModel):
    team_id: int
    name: str = Field(min_length=1, max_length=200)


class RoutineSave(BaseModel):
    """Reemplaza nombre y lista completa de ejercicios (orden = orden del array)."""

    name: str = Field(min_length=1, max_length=200)
    exercises: list[RoutineExerciseWrite] = Field(default_factory=list)
