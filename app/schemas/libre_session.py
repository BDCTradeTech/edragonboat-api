from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LibreDataPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    second: int
    distanceMeters: float
    speedKmh: float
    paladas: int
    spm: int
    latitude: float | None = None
    longitude: float | None = None
    locationAccuracyM: float | None = None


class LibreSessionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sessionStartTime: str
    totalSeconds: int
    dataPoints: list[LibreDataPoint]
    teamName: str | None = None
    boatType: str | None = None
    paddlersCount: int | None = None


class LibreSessionUploaded(BaseModel):
    id: int


class LibreSessionListItem(BaseModel):
    id: int
    created_at: datetime
    session_start_time: str | None = None
    total_seconds: int | None = None
    distance_meters: float | None = None
    paladas: int | None = None
    team_name: str | None = None


class LibreSessionDetailResponse(BaseModel):
    id: int
    created_at: datetime
    session: LibreSessionCreate
