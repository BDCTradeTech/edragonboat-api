"""
test_teams.py — tests de los endpoints de equipos.

Rutas:
  POST   /api/v1/teams                          → crear equipo (capitán automático)
  GET    /api/v1/teams/me                       → mis equipos
  GET    /api/v1/teams/{id}                     → detalle del equipo
  GET    /api/v1/teams/{id}/members             → miembros
  POST   /api/v1/teams/{id}/members             → invitar miembro
  PATCH  /api/v1/teams/{id}/members/{uid}       → actualizar rol
  DELETE /api/v1/teams/{id}/members/{uid}       → eliminar miembro
  DELETE /api/v1/teams/{id}                     → eliminar equipo

Notas:
  - Un usuario solo puede pertenecer a un equipo. El fixture test_user ya tiene
    membresía en test_team, por lo que no puede crear otro equipo.
  - Para tests que crean un equipo se usa un usuario separado sin membresía.
"""

import pytest


# ---------------------------------------------------------------------------
# Acceso sin autenticación
# ---------------------------------------------------------------------------


def test_teams_me_sin_auth(client):
    r = client.get("/api/v1/teams/me")
    assert r.status_code == 401


def test_teams_detail_sin_auth(client, test_team):
    r = client.get(f"/api/v1/teams/{test_team.id}")
    assert r.status_code == 401


def test_teams_members_sin_auth(client, test_team):
    r = client.get(f"/api/v1/teams/{test_team.id}/members")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Consultas con autenticación
# ---------------------------------------------------------------------------


def test_mis_equipos(client, auth_headers, test_team):
    r = client.get("/api/v1/teams/me", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    ids = [item["team"]["id"] for item in body]
    assert test_team.id in ids


def test_detalle_equipo_propio(client, auth_headers, test_team):
    r = client.get(f"/api/v1/teams/{test_team.id}", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == test_team.id
    assert body["name"] == "Test Team"


def test_detalle_equipo_ajeno(client, other_auth_headers, test_team):
    """Un usuario sin membresía en el equipo recibe 404."""
    r = client.get(f"/api/v1/teams/{test_team.id}", headers=other_auth_headers)
    assert r.status_code == 404


def test_team_members_con_auth(client, auth_headers, test_team, test_user):
    r = client.get(f"/api/v1/teams/{test_team.id}/members", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    emails = [m["email"] for m in body]
    assert "test@example.com" in emails


# ---------------------------------------------------------------------------
# Crear equipo
# ---------------------------------------------------------------------------


def test_crear_equipo(client, db):
    """Un usuario sin equipo puede crear uno y queda como capitán."""
    from app.models.user import User
    from app.core.security import hash_password

    creator = User(
        email="creator@example.com",
        hashed_password=hash_password("creatorpass"),
        full_name="Creator",
        is_active=True,
    )
    db.add(creator)
    db.commit()

    login = client.post(
        "/api/v1/auth/login",
        data={"username": "creator@example.com", "password": "creatorpass"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    r = client.post(
        "/api/v1/teams",
        json={"name": "Nuevo Equipo", "country": "BR"},
        headers=headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["team"]["name"] == "Nuevo Equipo"
    assert body["role"] == "captain"

    # Cleanup
    from app.models.team import Team
    from app.models.membership import TeamMembership
    from sqlalchemy import select

    session = db
    memberships = session.scalars(
        select(TeamMembership).where(TeamMembership.user_id == creator.id)
    ).all()
    for m in memberships:
        team = session.get(Team, m.team_id)
        session.delete(m)
        if team:
            session.delete(team)
    session.delete(creator)
    session.commit()


def test_crear_equipo_usuario_ya_con_equipo(client, auth_headers, test_team):
    """Un usuario que ya pertenece a un equipo no puede crear otro (400)."""
    r = client.post(
        "/api/v1/teams",
        json={"name": "Segundo Equipo"},
        headers=auth_headers,
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Invitar miembro
# ---------------------------------------------------------------------------


def test_invitar_miembro_como_capitan(client, auth_headers, test_team, db):
    """El capitán puede invitar a un usuario nuevo al equipo."""
    r = client.post(
        f"/api/v1/teams/{test_team.id}/members",
        json={
            "email": "paddler@example.com",
            "role": "paddler",
            "full_name": "Paddler Test",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "paddler"
    assert body["email"] == "paddler@example.com"

    # Cleanup
    from app.models.user import User
    from app.models.membership import TeamMembership
    from sqlalchemy import select, func

    paddler = db.scalar(select(User).where(func.lower(User.email) == "paddler@example.com"))
    if paddler:
        m = db.scalar(
            select(TeamMembership).where(
                TeamMembership.user_id == paddler.id,
                TeamMembership.team_id == test_team.id,
            )
        )
        if m:
            db.delete(m)
        db.delete(paddler)
        db.commit()


def test_invitar_miembro_sin_ser_capitan(client, other_auth_headers, test_team, db):
    """Un usuario sin membresía no puede invitar (404 o 403)."""
    r = client.post(
        f"/api/v1/teams/{test_team.id}/members",
        json={"email": "xtra@example.com", "role": "paddler"},
        headers=other_auth_headers,
    )
    assert r.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Eliminar equipo
# ---------------------------------------------------------------------------


def test_eliminar_equipo_ajeno(client, other_auth_headers, test_team):
    """Un usuario sin membresía no puede eliminar el equipo (404 o 403)."""
    r = client.delete(f"/api/v1/teams/{test_team.id}", headers=other_auth_headers)
    assert r.status_code in (403, 404)


def test_eliminar_equipo_propio(client, db):
    """El capitán puede eliminar su propio equipo."""
    from app.models.user import User
    from app.models.team import Team
    from app.models.membership import TeamMembership, TeamRole
    from app.core.security import hash_password

    # Crear usuario y equipo propios para no tocar los fixtures compartidos
    owner = User(
        email="owner_delete@example.com",
        hashed_password=hash_password("ownerpass"),
        is_active=True,
    )
    db.add(owner)
    db.flush()
    team = Team(name="Equipo a Borrar")
    db.add(team)
    db.flush()
    m = TeamMembership(user_id=owner.id, team_id=team.id, role=TeamRole.captain, sex="female")
    db.add(m)
    db.commit()

    login = client.post(
        "/api/v1/auth/login",
        data={"username": "owner_delete@example.com", "password": "ownerpass"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    r = client.delete(f"/api/v1/teams/{team.id}", headers=headers)
    assert r.status_code == 204

    # El owner ya no tiene equipo, borrarlo
    db.delete(owner)
    db.commit()
