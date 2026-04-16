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
7. `GET /api/v1/sessions/libre` — listar tus sesiones subidas.
8. `GET /api/v1/sessions/libre/{id}` — detalle (JSON parseado).

## Panel web (`web/`)

SPA liviana con **Vite** (HTML/CSS/JS): login, listado de entrenamientos libres y vista detalle con JSON.

### Desarrollo local

```bash
cd web
npm install
npm run dev
```

Abrí http://127.0.0.1:5173 — por defecto llama a `https://api.edragonboat.com`. Para otra API:

```bash
# web/.env.local
VITE_API_URL=http://127.0.0.1:8000
```

### Build para producción

```bash
cd web
npm install
npm run build
```

Subí el contenido de `web/dist/` al servidor (ej. `/var/www/edragonboat-web`).

### Por qué el panel no cambia tras `git pull` (importante)

- La carpeta **`web/dist/` no está en Git** (está en `.gitignore`). Solo se genera con `npm run build`.
- **`systemctl restart edragonboat-api`** solo reinicia **Python/FastAPI**. No toca los HTML/JS del sitio **`app.edragonboat.com`** (eso lo sirve Caddy/nginx desde una carpeta como `/var/www/edragonboat-web`).
- Por eso podés tener el código fuente del panel actualizado en el repo y seguir viendo **Panel v0.2.3** y textos viejos: el navegador sigue sirviendo los archivos **viejos** que copiaste la última vez a esa carpeta.

**En el droplet, cada vez que cambie el panel web**, después de `git pull`:

```bash
cd /srv/edragonboat-api/web   # o la ruta donde clonaste el repo
npm ci
npm run build
# Ajustá la ruta destino a la que tenga tu Caddyfile en root * ...
sudo rsync -av --delete dist/ /var/www/edragonboat-web/
sudo systemctl reload caddy
```

Si también cambió la API Python:

```bash
cd /srv/edragonboat-api && sudo systemctl restart edragonboat-api
```

**En tu PC** podés hacer `npm run build` en `web/` y subir **solo el contenido** de `web/dist/` por SFTP/SCP a `/var/www/edragonboat-web/` (sin subir la carpeta `dist` como contenedor; el *contenido* dentro).

### DNS y Caddy (ejemplo)

1. En DonWeb: registro **A** `app` → IP del droplet (panel en `https://app.edragonboat.com`).
2. En el servidor `.env` de la API, incluí el origen del panel (ya viene en `.env.example` como `CORS_ORIGINS`).
3. Tras cambios **solo de API**: `git pull` y `sudo systemctl restart edragonboat-api`. Tras cambios **del panel**: además build + copiar `dist/` + `reload caddy` (ver arriba).

**Caddyfile** con API + panel estático:

```caddy
api.edragonboat.com {
    reverse_proxy 127.0.0.1:8000
}

app.edragonboat.com {
    root * /var/www/edragonboat-web
    encode gzip
    file_server
    try_files {path} /index.html
}
```

Copiá los archivos de `web/dist/` a `/var/www/edragonboat-web` y `systemctl reload caddy`.

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

Variable **`CORS_ORIGINS`**: lista separada por comas (ej. `https://app.edragonboat.com,http://localhost:5173`). La app Android usa el host `api` directamente, no depende de CORS del navegador.

## Siguientes pasos sugeridos

- Alembic para migraciones cuando cambien los modelos.
- PostgreSQL en el mismo droplet o DO Managed Database; cambiar `DATABASE_URL`.
- Invitaciones por email (entrenador / palista) y endpoints protegidos por rol.
- Rate limiting y HTTPS obligatorio en producción (Caddy ya da TLS).
