from pydantic import BaseModel, ConfigDict


class LibreDataPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    second: int
    distanceMeters: float
    speedKmh: float
    paladas: int
    spm: int


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
