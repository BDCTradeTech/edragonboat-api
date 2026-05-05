"""
test_sessions.py — tests de los endpoints de sesiones.

Rutas relevantes:
  POST /api/v1/sessions/libre         → subir sesión libre
  GET  /api/v1/sessions/libre         → listar sesiones libres del usuario
  GET  /api/v1/sessions/libre/{id}    → detalle sesión libre
  POST /api/v1/sessions/competencia   → subir sesión de competencia
  GET  /api/v1/sessions/competencia   → listar sesiones de competencia (global)
  GET  /api/v1/sessions/competencia/{id} → detalle con control de acceso

Notas:
  - LibreSessionUpload NO tiene team_id; el acceso se determina comparando
    las membresías por user_id del uploader y del viewer.
  - Los uploads usan request.body() directamente (no form/multipart).
"""

import json
import pytest

# JSON mínimo válido para LibreSessionCreate
_MINIMAL_SESSION = {
    "sessionStartTime": "2024-01-01T10:00:00Z",
    "totalSeconds": 60,
    "dataPoints": [
        {
            "second": 60,
            "distanceMeters": 100.0,
            "speedKmh": 6.0,
            "paladas": 120,
            "spm": 60,
        }
    ],
}

_COMPETENCIA_SESSION = {
    **_MINIMAL_SESSION,
    "sessionKind": "competencia",
    "teamName": "Test Team",
    "boatType": "grande",
    "paddlersCount": 20,
}


# ---------------------------------------------------------------------------
# Acceso sin autenticación
# ---------------------------------------------------------------------------


def test_sessions_libre_sin_auth(client):
    r = client.get("/api/v1/sessions/libre")
    assert r.status_code == 401


def test_sessions_competencia_sin_auth(client):
    r = client.get("/api/v1/sessions/competencia")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Subir sesión libre
# ---------------------------------------------------------------------------


def test_subir_sesion_libre(client, auth_headers):
    r = client.post(
        "/api/v1/sessions/libre",
        content=json.dumps(_MINIMAL_SESSION),
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 201
    body = r.json()
    assert "id" in body
    assert isinstance(body["id"], int)


def test_subir_sesion_libre_json_invalido(client, auth_headers):
    """JSON que no cumple el schema de LibreSessionCreate debe dar 422."""
    bad = {"sessionStartTime": "2024-01-01T10:00:00Z"}  # falta totalSeconds y dataPoints
    r = client.post(
        "/api/v1/sessions/libre",
        content=json.dumps(bad),
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Listar sesiones libres
# ---------------------------------------------------------------------------


def test_listar_sesiones_libres(client, auth_headers, db, test_user):
    """Listar muestra las sesiones del usuario autenticado."""
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_MINIMAL_SESSION),
        session_kind="libre",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.get("/api/v1/sessions/libre", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    ids = [item["id"] for item in body]
    assert session_id in ids

    # Cleanup
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Detalle sesión libre
# ---------------------------------------------------------------------------


def test_detalle_sesion_libre_propia(client, auth_headers, db, test_user):
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_MINIMAL_SESSION),
        session_kind="libre",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.get(f"/api/v1/sessions/libre/{session_id}", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == session_id
    assert body["session"] is not None
    assert body["can_delete"] is True

    db.delete(row)
    db.commit()


def test_detalle_sesion_libre_ajena(client, other_auth_headers, db, test_user):
    """Un usuario sin equipo compartido no puede ver la sesión de otro (404)."""
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_MINIMAL_SESSION),
        session_kind="libre",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.get(f"/api/v1/sessions/libre/{session_id}", headers=other_auth_headers)
    assert r.status_code == 404

    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Sesiones de competencia
# ---------------------------------------------------------------------------


def test_subir_sesion_competencia(client, auth_headers):
    r = client.post(
        "/api/v1/sessions/competencia",
        content=json.dumps(_COMPETENCIA_SESSION),
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert r.status_code == 201
    assert "id" in r.json()


def test_listar_competencia(client, auth_headers):
    r = client.get("/api/v1/sessions/competencia", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_competencia_detail_usuario_propio(client, auth_headers, db, test_user):
    """El usuario que subió la sesión puede ver el detalle completo."""
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_COMPETENCIA_SESSION),
        session_kind="competencia",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.get(f"/api/v1/sessions/competencia/{session_id}", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["can_view_detail"] is True
    assert body["session"] is not None
    assert body["can_delete"] is True

    db.delete(row)
    db.commit()


def test_competencia_detail_equipo_compartido(client, db, test_user, test_team):
    """Un usuario del mismo equipo que el uploader puede ver el detalle."""
    from app.models.libre_session_upload import LibreSessionUpload
    from app.models.user import User
    from app.models.membership import TeamMembership, TeamRole
    from app.core.security import hash_password

    # Crear palista del mismo equipo
    paddler = User(
        email="paddler_shared@example.com",
        hashed_password=hash_password("paddlerpass"),
        is_active=True,
    )
    db.add(paddler)
    db.flush()
    m = TeamMembership(
        user_id=paddler.id,
        team_id=test_team.id,
        role=TeamRole.paddler,
        sex="female",
    )
    db.add(m)

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_COMPETENCIA_SESSION),
        session_kind="competencia",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    # Login como palista
    login = client.post(
        "/api/v1/auth/login",
        data={"username": "paddler_shared@example.com", "password": "paddlerpass"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    r = client.get(f"/api/v1/sessions/competencia/{session_id}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["can_view_detail"] is True
    assert body["session"] is not None

    # Cleanup
    db.delete(row)
    db.delete(m)
    db.delete(paddler)
    db.commit()


def test_competencia_detail_equipo_ajeno(client, db, test_user, test_team, other_user, other_auth_headers):
    """Un usuario de otro equipo solo recibe metadatos públicos (can_view_detail=False)."""
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_COMPETENCIA_SESSION),
        session_kind="competencia",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.get(f"/api/v1/sessions/competencia/{session_id}", headers=other_auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["can_view_detail"] is False
    assert body["session"] is None
    assert body["can_delete"] is False

    db.delete(row)
    db.commit()


def test_competencia_detail_not_found(client, auth_headers):
    r = client.get("/api/v1/sessions/competencia/99999", headers=auth_headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Eliminar sesión libre
# ---------------------------------------------------------------------------


def test_eliminar_sesion_propia(client, auth_headers, db, test_user):
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_MINIMAL_SESSION),
        session_kind="libre",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.delete(f"/api/v1/sessions/libre/{session_id}", headers=auth_headers)
    assert r.status_code == 204


def test_eliminar_sesion_ajena(client, other_auth_headers, db, test_user):
    from app.models.libre_session_upload import LibreSessionUpload

    row = LibreSessionUpload(
        user_id=test_user.id,
        session_json=json.dumps(_MINIMAL_SESSION),
        session_kind="libre",
    )
    db.add(row)
    db.commit()
    session_id = row.id

    r = client.delete(f"/api/v1/sessions/libre/{session_id}", headers=other_auth_headers)
    assert r.status_code in (403, 404)

    db.delete(row)
    db.commit()
