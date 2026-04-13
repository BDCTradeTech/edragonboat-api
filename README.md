# EDragonboat API

Backend en **FastAPI** con **SQLite** (MVP), **JWT** y roles de equipo (`captain`, `coach`, `paddler`). OpenAPI / Swagger en `/docs`.

Dominio previsto: **https://api.edragonboat.com**

## Requisitos locales

- Python 3.11+
- Entorno virtual recomendado

```bash
cd edragonboat-api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Editá `.env` y poné un `SECRET_KEY` largo y aleatorio (nunca en git).

## Ejecutar en desarrollo

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Raíz: http://127.0.0.1:8000/
- Swagger: http://127.0.0.1:8000/docs
- Salud: http://127.0.0.1:8000/api/v1/health

### Flujo mínimo en Swagger

1. `POST /api/v1/auth/register` — crear usuario.
2. `POST /api/v1/auth/login` — en **username** poné el **email**; en **password** la contraseña. Copiá el `access_token`.
3. Botón **Authorize** → pegá `Bearer <token>` o solo el token según el diálogo.
4. `POST /api/v1/teams` — crear equipo (quedás como **captain**).
5. `GET /api/v1/teams/me` — listar tus equipos.
6. `POST /api/v1/sessions/libre` — subir JSON de sesión libre (requiere `Authorization: Bearer …`; lo usa la app MiniDBoat).

## Nuevo droplet DigitalOcean

1. Crear droplet Ubuntu L24.x, clave SSH, firewall: **22**, **80**, **443**.
2. En DonWeb (DNS de `edragonboat.com`): registro **A** `api` → IP pública del droplet.
3. En el servidor (resumen):
   - Instalar `python3.12-venv` (o 3.11), `git`, `nginx` o **Caddy**.
   - Clonar este repo, `venv`, `pip install -r requirements.txt`, `.env` con `SECRET_KEY` fuerte.
   - Servir la app con **Uvicorn** en `127.0.0.1:8000` (systemd).
   - Reverse proxy + TLS: Caddy apuntando a `127.0.0.1:8000` para el host `api.edragonboat.com`.

Ejemplo mínimo **Caddyfile**:

```caddy
api.edragonboat.com {
    reverse_proxy 127.0.0.1:8000
}
```

Ejemplo **systemd** `/etc/systemd/system/edragonboat-api.service`:

```ini
[Unit]
Description=EDragonboat API
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/srv/edragonboat-api
EnvironmentFile=/srv/edragonboat-api/.env
ExecStart=/srv/edragonboat-api/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

(Ajustá rutas y usuario; en el primer deploy podés usar tu usuario hasta dejar `www-data` con permisos al venv.)

## CORS

Por defecto `allow_origins=["*"]` para desarrollo. En producción restringí a los orígenes de tu web y, si aplica, esquemas de la app.

## Siguientes pasos sugeridos

- Alembic para migraciones cuando cambien los modelos.
- PostgreSQL en el mismo droplet o DO Managed Database; cambiar `DATABASE_URL`.
- Invitaciones por email (entrenador / palista) y endpoints protegidos por rol.
- Rate limiting y HTTPS obligatorio en producción (Caddy ya da TLS).
