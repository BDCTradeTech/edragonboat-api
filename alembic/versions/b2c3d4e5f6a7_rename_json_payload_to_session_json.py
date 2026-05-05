"""rename_json_payload_to_session_json

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-04 14:30:00.000000

Renombra la columna json_payload → session_json en libre_session_uploads.

Usa batch_alter_table para compatibilidad con SQLite (dev) y PostgreSQL (prod).
En PostgreSQL, batch_alter_table emite un ALTER TABLE ... RENAME COLUMN.
En SQLite, recrea la tabla completa (comportamiento estándar de Alembic batch mode).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('libre_session_uploads', schema=None) as batch_op:
        batch_op.alter_column(
            'json_payload',
            new_column_name='session_json',
            existing_type=sa.Text(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('libre_session_uploads', schema=None) as batch_op:
        batch_op.alter_column(
            'session_json',
            new_column_name='json_payload',
            existing_type=sa.Text(),
            existing_nullable=False,
        )
