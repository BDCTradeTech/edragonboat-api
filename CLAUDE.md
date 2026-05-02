# E-DragonBoat API — Contexto del proyecto

## Qué es este proyecto
Backend REST + panel web de administración para gestión de equipos de Dragon Boat.
Compuesto por dos partes: una API Python (FastAPI) y un frontend web (Vite + vanilla JS).

## Rutas
- Repo raíz: `C:\Users\Diego\AndroidStudioProjects\edragonboat-api`
- Frontend web: `C:\Users\Diego\AndroidStudioProjects\edragonboat-api\web`
- App Android que consume esta API: `C:\Users\Diego\AndroidStudioProjects\MiniDBoat`

## Estructura esperada
```
edragonboat-api/
├── app/                  # código Python (routes, models, schemas, etc.)
├── web/                  # frontend Vite
├── requirements.txt      # dependencias Python
├── CLAUDE.md             # este archivo
└── .claude/
    └── agents/
        ├── api-expert.md
        ├── web-expert.md
        └── security-expert.md
```

## Stack — API (Python)
| Capa | Tecnología |
|------|-----------|
| Framework | FastAPI |
| Servidor | Uvicorn |
| ORM | SQLAlchemy 2 |
| Validación | Pydantic / pydantic-settings |
| Auth | JWT (python-jose) + bcrypt |
| Upload | python-multipart |
| Email | email-validator |
| Imágenes | Pillow |

## Stack — Web (Frontend)
| Capa | Tecnología |
|------|-----------|
| Bundler | Vite 5 |
| JS | Vanilla ES modules (sin framework) |
| Gráficos | Chart.js |
| Mapas | Leaflet |
| Exportar | html-to-image |
| i18n países | i18n-iso-countries |
| Traducciones | JSON locales + `npm run i18n:check` |

## Comandos útiles
```bash
# API Python
pip install -r requirements.txt
uvicorn app.main:app --reload

# Web frontend
cd web
npm install
npm run dev
npm run build
npm run i18n:check
```

## Agentes disponibles
- `api-expert` — FastAPI, SQLAlchemy, autenticación, endpoints
- `web-expert` — Vite, Chart.js, Leaflet, i18n, JS modular
- `security-expert` — JWT, permisos, OWASP, vulnerabilidades
