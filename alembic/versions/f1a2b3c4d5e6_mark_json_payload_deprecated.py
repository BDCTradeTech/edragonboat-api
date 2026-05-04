"""mark_json_payload_deprecated

Revision ID: f1a2b3c4d5e6
Revises: e2e697f683f7
Create Date: 2026-05-04 12:00:00.000000

This migration documents that the json_payload column in libre_session_uploads is deprecated.
All session data is now stored in explicit SQL columns (distance_meters, duration_seconds,
stroke_count, avg_spm, max_speed, avg_speed, has_gps, paddlers_count, session_kind).

The json_payload column is retained for backwards compatibility and archive purposes but
should not be parsed by new code. All endpoints now use the SQL columns instead.

Backfill status: 121/121 sessions successfully migrated as of 2026-05-04.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e2e697f683f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No-op: Database-level column comments are not universally supported across
    # SQLite (used in dev) and PostgreSQL (used in prod). The deprecation is documented
    # via this migration's docstring, the model's docstring, and code comments.
    # Endpoints already use SQL columns; json_payload is retained for compatibility.
    pass


def downgrade() -> None:
    # No-op: There is no state change to reverse.
    pass
