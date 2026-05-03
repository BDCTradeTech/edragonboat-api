"""
test_auth.py — tests del módulo de autenticación.

Notas:
- Login usa OAuth2PasswordRequestForm: form data, campo 'username' (no 'email').
- El rate limiter de slowapi cuenta por IP. Con TestClient la IP siempre es la misma
  ('testclient'), así que los 5 intentos fallidos pueden activar el 429 en el 6° intento.
  Si el límite ya se consumió en otro test, este test puede fallar; por eso se usa
  un email inexistente propio para aislar el contador.
"""

import pytest


def test_login_correcto(client, test_user):
    r = client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["access_token"]


def test_login_password_incorrecto(client, test_user):
    r = client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "wrong_password"},
    )
    assert r.status_code == 401


def test_login_email_inexistente(client):
    r = client.post(
        "/api/v1/auth/login",
        data={"username": "noexiste@example.com", "password": "wrong"},
    )
    assert r.status_code == 401


def test_login_usuario_inactivo(client, db):
    """Un usuario con is_active=False debe recibir 403."""
    from app.models.user import User
    from app.core.security import hash_password

    inactive = User(
        email="inactive@example.com",
        hashed_password=hash_password("pass123"),
        full_name="Inactive",
        is_active=False,
    )
    db.add(inactive)
    db.commit()

    r = client.post(
        "/api/v1/auth/login",
        data={"username": "inactive@example.com", "password": "pass123"},
    )
    assert r.status_code == 403

    db.delete(inactive)
    db.commit()


def test_me_sin_token(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_me_token_invalido(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer token_invalido"})
    assert r.status_code == 401


def test_me_con_token(client, auth_headers, test_user):
    r = client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "test@example.com"
    assert body["full_name"] == "Test User"


def test_registro_nuevo_usuario(client):
    """POST /auth/register crea un usuario y devuelve 201."""
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "nuevo@example.com", "password": "password123", "full_name": "Nuevo"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "nuevo@example.com"


def test_registro_email_duplicado(client, test_user):
    """Registrar un email ya existente debe dar 400."""
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "cualquier", "full_name": "Dup"},
    )
    assert r.status_code == 400


def test_login_rate_limit(client):
    """Tras 5 intentos fallidos con la misma IP el 6° debe dar 429.

    NOTA: slowapi usa get_remote_address; TestClient envía todas las requests
    desde la misma IP virtual. Si otros tests en la misma sesión ya consumieron
    parte de la cuota, este test podría obtener el 429 antes del intento 6.
    Verificamos que alguno de los últimos intentos sea 429.
    """
    responses = [
        client.post(
            "/api/v1/auth/login",
            data={"username": "ratelimit_test@example.com", "password": "wrong"},
        )
        for _ in range(7)
    ]
    status_codes = [r.status_code for r in responses]
    # Al menos uno debe ser 429; los anteriores son 401.
    assert 429 in status_codes, (
        f"Esperaba 429 en alguna respuesta, obtuve: {status_codes}. "
        "El rate limiter puede no estar activo en el entorno de test."
    )


def test_change_password(client, auth_headers, test_user):
    """Cambiar contraseña y volver a hacer login con la nueva."""
    r = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpass123", "new_password": "newpass456"},
        headers=auth_headers,
    )
    assert r.status_code == 204

    # Login con nueva contraseña
    r2 = client.post(
        "/api/v1/auth/login",
        data={"username": "test@example.com", "password": "newpass456"},
    )
    assert r2.status_code == 200

    # Restaurar contraseña original para no romper otros tests
    new_token = r2.json()["access_token"]
    client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "newpass456", "new_password": "testpass123"},
        headers={"Authorization": f"Bearer {new_token}"},
    )


def test_update_me(client, auth_headers):
    """PATCH /auth/me actualiza full_name."""
    r = client.patch(
        "/api/v1/auth/me",
        json={"full_name": "Nombre Actualizado"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["full_name"] == "Nombre Actualizado"
