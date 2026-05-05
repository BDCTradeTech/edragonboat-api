from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LibreSessionUpload(Base):
    """Sesión libre o de competencia subida desde la app (JSON completo + columnas SQL de métricas y metadatos)."""

    __tablename__ = "libre_session_uploads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # JSON completo de la sesión (renombrado desde json_payload en migración b2c3d4e5f6a7).
    session_json: Mapped[str] = mapped_column(Text, nullable=False)
    """JSON completo de la sesión tal como lo envía la app Android.
    Contiene dataPoints, GPS, y todos los metadatos.
    Usar columnas SQL individuales para filtrado; este blob es solo para
    devolver el detalle completo al cliente autorizado.
    """

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    session_kind: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    # ------------------------------------------------------------------
    # Metadatos de sesión extraídos del JSON (migración a1b2c3d4e5f6).
    # Nullable para compatibilidad con registros anteriores al backfill.
    # ------------------------------------------------------------------
    team_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    """Nombre del equipo (JSON: teamName)."""
    boat_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    """Tipo de embarcación: 'grande' | 'chico' u otro (JSON: boatType)."""
    session_start_time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """ISO-8601 timestamp de inicio de la sesión (JSON: sessionStartTime)."""
    target_distance_meters: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    """Meta de carrera en metros (JSON: targetDistanceMeters; solo competencia)."""
    drummer: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    """True si la carrera incluye baterista (JSON: drummer; solo competencia)."""
    age_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    """Categoría etaria (JSON: ageCategory; solo competencia)."""
    team_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    """Categoría del equipo (JSON: teamCategory; solo competencia)."""
    virada: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    """True si la carrera incluye vuelta / virada (JSON: virada; solo competencia)."""
    team_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    """País del equipo (JSON: teamCountry; solo competencia)."""

    # ------------------------------------------------------------------
    # Métricas extraídas del JSON para filtrado SQL eficiente (migración e2e697f683f7).
    # ------------------------------------------------------------------
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
