"""Alembic env.py — E-DragonBoat API.

Obtiene la DATABASE_URL desde las settings de Pydantic (app.core.config)
para no hardcodear credenciales en alembic.ini.
Soporta SQLite (dev) y PostgreSQL (producción) sin cambios.
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ---------------------------------------------------------------------------
# Configuración de Alembic
# ---------------------------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Importar todos los modelos para que Alembic los detecte en autogenerate.
# El orden de importación importa: Base debe cargarse antes que los modelos.
# ---------------------------------------------------------------------------
from app.db.base import Base  # noqa: E402

import app.models.user  # noqa: F401, E402
import app.models.team  # noqa: F401, E402
import app.models.membership  # noqa: F401, E402
import app.models.routine  # noqa: F401, E402
import app.models.community_message  # noqa: F401, E402
import app.models.libre_session_upload  # noqa: F401, E402
import app.models.forum  # noqa: F401, E402

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Obtener DATABASE_URL desde las settings de Pydantic (no desde alembic.ini).
# ---------------------------------------------------------------------------
from app.core.config import get_settings  # noqa: E402


def _get_database_url() -> str:
    """Lee la DATABASE_URL desde las settings de Pydantic."""
    return get_settings().database_url


# ---------------------------------------------------------------------------
# Modo offline: genera SQL sin conexión real a la DB.
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configura el contexto con la URL directamente, sin crear un Engine.
    Útil para generar scripts SQL para aplicar manualmente.
    """
    url = _get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Comparar tipos de columna para detectar cambios (ej. VARCHAR length)
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Modo online: conecta al DB y aplica migraciones.
# ---------------------------------------------------------------------------
def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Crea un Engine real y ejecuta las migraciones contra la DB.
    """
    # Sobreescribir la URL del .ini con la que viene de Pydantic settings.
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Comparar tipos de columna para detectar cambios (ej. VARCHAR length)
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
