"""
conftest.py — fixtures compartidos para toda la suite de tests.

Diseño:
- SECRET_KEY se inyecta por env var ANTES de importar cualquier módulo de la app,
  porque config.py usa @lru_cache y el validator rechaza la clave por defecto.
- Un único engine SQLite en memoria con StaticPool para que todas las conexiones
  (la del test y la del endpoint vía override_get_db) compartan el mismo estado.
- Base.metadata.create_all() se llama una sola vez al inicio de la sesión.
- Login usa OAuth2PasswordRequestForm → form data con campo 'username' (no 'email').
- El cleanup de fixtures usa sesiones independientes para evitar el error
  "Cannot operate on a closed database" que ocurre al reutilizar sesiones cerradas.
"""

import os

# Debe ir ANTES de cualquier import del proyecto para que lru_cache no cachee la config vieja.
os.environ["SECRET_KEY"] = "test_secret_key_long_enough_for_tests_xxxxxxxxxxxx"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

# Importar Base y TODOS los modelos para que Base los conozca antes de create_all.
from app.db.base import Base
import app.models.user  # noqa: F401
import app.models.team  # noqa: F401
import app.models.membership  # noqa: F401
import app.models.libre_session_upload  # noqa: F401
import app.models.routine  # noqa: F401
import app.models.community_message  # noqa: F401
import app.models.forum  # noqa: F401

from app.models.user import User
from app.models.team import Team
from app.models.membership import TeamMembership, TeamRole
from app.core.security import hash_password

# ---------------------------------------------------------------------------
# Engine único con StaticPool — todas las sesiones comparten la misma conexión.
# Esto es imprescindible para SQLite :memory:: sin StaticPool cada create_engine
# crea una base de datos distinta e independiente.
# ---------------------------------------------------------------------------
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ---------------------------------------------------------------------------
# Override de get_db — debe hacerse ANTES de importar app.main para que el
# override quede registrado en el objeto app que usa TestClient.
# ---------------------------------------------------------------------------
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.core.limiter import limiter  # noqa: E402


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Crea todas las tablas al inicio y las destruye al final de la sesión."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Resetea el storage del rate limiter antes de cada test.

    slowapi usa MemoryStorage con un contador global por IP. En tests, todas las
    requests provienen de la misma IP virtual ("testclient"), por lo que el contador
    acumula entre tests. Llamar reset() limpia todos los contadores.
    """
    limiter._storage.reset()
    yield


def _new_session():
    """Abre una sesión nueva para inserciones/cleanup en fixtures."""
    return TestingSessionLocal()


@pytest.fixture
def test_user():
    """Usuario activo. Cleanup explícito al final de cada test."""
    db = _new_session()
    user = User(
        email="test@example.com",
        hashed_password=hash_password("testpass123"),
        full_name="Test User",
        is_active=True,
        is_platform_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()

    yield user

    # Cleanup con sesión fresca para evitar "closed database"
    cleanup_db = _new_session()
    u = cleanup_db.get(User, user_id)
    if u:
        cleanup_db.delete(u)
        cleanup_db.commit()
    cleanup_db.close()


@pytest.fixture
def test_team(test_user):
    """Equipo con test_user como capitán."""
    db = _new_session()
    team = Team(name="Test Team", country="AR")
    db.add(team)
    db.flush()
    membership = TeamMembership(
        user_id=test_user.id,
        team_id=team.id,
        role=TeamRole.captain,
        sex="female",
    )
    db.add(membership)
    db.commit()
    db.refresh(team)
    team_id = team.id
    db.close()

    yield team

    # Cleanup: borrar equipo (cascade borra membresías)
    cleanup_db = _new_session()
    t = cleanup_db.get(Team, team_id)
    if t:
        cleanup_db.delete(t)
        cleanup_db.commit()
    cleanup_db.close()


@pytest.fixture
def other_user():
    """Usuario sin membresía en ningún equipo."""
    db = _new_session()
    user = User(
        email="other@example.com",
        hashed_password=hash_password("otherpass123"),
        full_name="Other User",
        is_active=True,
        is_platform_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()

    yield user

    cleanup_db = _new_session()
    u = cleanup_db.get(User, user_id)
    if u:
        cleanup_db.delete(u)
        cleanup_db.commit()
    cleanup_db.close()


@pytest.fixture
def db():
    """Sesión directa para tests que necesitan insertar registros.
    No hace rollback automático — el test es responsable de limpiar sus datos.
    """
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    """TestClient síncrono. El lifespan se omite (tablas ya creadas por setup_db)."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def auth_headers(client, test_user):
    """Headers con Bearer token para test_user.
    Login usa OAuth2PasswordRequestForm: form data, campo 'username' (= email).
    """
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    assert response.status_code == 200, f"Login falló: {response.text}"
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers(client, other_user):
    """Headers con Bearer token para other_user."""
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "other@example.com", "password": "otherpass123"},
    )
    assert response.status_code == 200, f"Login falló: {response.text}"
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
