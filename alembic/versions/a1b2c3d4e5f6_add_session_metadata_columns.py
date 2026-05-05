"""add_session_metadata_columns

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-05-04 14:00:00.000000

Agrega 9 columnas de metadatos a libre_session_uploads que antes solo existían
dentro del blob json_payload, y hace backfill de los 121 registros existentes.

Columnas nuevas:
  team_name             — str, nombre del equipo (JSON: teamName)
  boat_type             — str, tipo de embarcación (JSON: boatType)
  session_start_time    — str, ISO-8601 timestamp de inicio (JSON: sessionStartTime)
  target_distance_meters— int, meta de carrera en metros (JSON: targetDistanceMeters, competencia only)
  drummer               — bool, si hay baterista (JSON: drummer, competencia only)
  age_category          — str, categoría etaria (JSON: ageCategory, competencia only)
  team_category         — str, categoría del equipo (JSON: teamCategory, competencia only)
  virada                — bool, si la carrera incluye virada (JSON: virada, competencia only)
  team_country          — str, país del equipo (JSON: teamCountry, competencia only)
"""

from typing import Sequence, Union
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Agregar las 9 columnas nuevas (todas nullable para compatibilidad con registros
    #    existentes antes del backfill, y porque algunos campos son solo de competencia).
    op.add_column('libre_session_uploads', sa.Column('team_name', sa.String(length=200), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('boat_type', sa.String(length=100), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('session_start_time', sa.String(length=50), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('target_distance_meters', sa.Integer(), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('drummer', sa.Boolean(), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('age_category', sa.String(length=100), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('team_category', sa.String(length=100), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('virada', sa.Boolean(), nullable=True))
    op.add_column('libre_session_uploads', sa.Column('team_country', sa.String(length=100), nullable=True))

    # 2. Backfill: leer cada fila y extraer los valores del json_payload.
    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, json_payload FROM libre_session_uploads")).fetchall()

    for row_id, json_payload in rows:
        if not json_payload:
            continue
        try:
            raw = json.loads(json_payload)
        except (json.JSONDecodeError, TypeError):
            continue

        team_name = raw.get("teamName")
        if team_name is not None:
            team_name = str(team_name).strip() or None

        boat_type = raw.get("boatType")
        if boat_type is not None:
            boat_type = str(boat_type).strip() or None

        session_start_time = raw.get("sessionStartTime")
        if session_start_time is not None:
            session_start_time = str(session_start_time).strip() or None

        # targetDistanceMeters — solo competencia
        td = raw.get("targetDistanceMeters")
        try:
            target_distance_meters = int(td) if td is not None else None
        except (TypeError, ValueError):
            target_distance_meters = None

        # drummer
        drummer_raw = raw.get("drummer")
        drummer = bool(drummer_raw) if drummer_raw is not None else None

        # ageCategory
        ac = raw.get("ageCategory")
        age_category = str(ac).strip() if ac is not None and str(ac).strip() else None

        # teamCategory
        tcat = raw.get("teamCategory")
        team_category = str(tcat).strip() if tcat is not None and str(tcat).strip() else None

        # virada
        virada_raw = raw.get("virada")
        virada = bool(virada_raw) if virada_raw is not None else None

        # teamCountry
        tc = raw.get("teamCountry")
        team_country = str(tc).strip() if tc is not None and str(tc).strip() else None

        conn.execute(
            text(
                """
                UPDATE libre_session_uploads
                SET
                    team_name              = :team_name,
                    boat_type              = :boat_type,
                    session_start_time     = :session_start_time,
                    target_distance_meters = :target_distance_meters,
                    drummer                = :drummer,
                    age_category           = :age_category,
                    team_category          = :team_category,
                    virada                 = :virada,
                    team_country           = :team_country
                WHERE id = :id
                """
            ),
            {
                "id": row_id,
                "team_name": team_name,
                "boat_type": boat_type,
                "session_start_time": session_start_time,
                "target_distance_meters": target_distance_meters,
                "drummer": drummer,
                "age_category": age_category,
                "team_category": team_category,
                "virada": virada,
                "team_country": team_country,
            },
        )


def downgrade() -> None:
    op.drop_column('libre_session_uploads', 'team_country')
    op.drop_column('libre_session_uploads', 'virada')
    op.drop_column('libre_session_uploads', 'team_category')
    op.drop_column('libre_session_uploads', 'age_category')
    op.drop_column('libre_session_uploads', 'drummer')
    op.drop_column('libre_session_uploads', 'target_distance_meters')
    op.drop_column('libre_session_uploads', 'session_start_time')
    op.drop_column('libre_session_uploads', 'boat_type')
    op.drop_column('libre_session_uploads', 'team_name')
