from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LibreSessionUpload(Base):
    """Sesión libre subida desde la app (JSON completo + columnas SQL de métricas)."""

    __tablename__ = "libre_session_uploads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    json_payload: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    session_kind: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    # Métricas extraídas del JSON para permitir filtrado SQL eficiente.
    # Todas nullable=True para compatibilidad con registros previos al backfill.
    distance_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Distancia total en metros (último dataPoint.distanceMeters)."""
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Duración total en segundos (totalSeconds del JSON)."""
    stroke_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Total de paladas (último dataPoint.paladas)."""
    avg_spm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """SPM promedio calculado sobre todos los dataPoints con spm > 0."""
    max_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Velocidad máxima en km/h (max de dataPoints.speedKmh)."""
    avg_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    """Velocidad promedio en km/h (promedio de dataPoints.speedKmh con speed > 0)."""
    has_gps: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    """True si al menos un dataPoint tiene latitude y longitude no nulos."""
    paddlers_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Cantidad de palistas (paddlersCount del JSON raíz)."""
