# E-DragonBoat Web Panel — Contexto del frontend

## Qué es esta carpeta
Panel web de administración. Frontend vanilla JS bundleado con Vite 5.
Ruta: `C:\Users\Diego\AndroidStudioProjects\edragonboat-api\web`

## Stack
- **Vite 5** — dev server + build (ES modules nativos, sin transpilación extra)
- **Vanilla JS** — sin React/Vue/Angular, módulos ES nativos
- **Chart.js** — gráficos de estadísticas
- **Leaflet** — mapas para ubicaciones/rutas
- **html-to-image** — exportar vistas como imagen
- **i18n-iso-countries** — nombres de países localizados
- **JSON locales** — archivos de traducción propios

## Convenciones esperadas
- Imports con rutas relativas o alias de Vite (`@/`)
- Cada página/vista en su propio módulo JS
- Estilos en CSS o módulos CSS, sin CSS-in-JS
- Fetch nativo o wrapper propio para llamadas a la API

## i18n
```bash
npm run i18n:check   # verifica keys faltantes entre locales
```

## Build
```bash
npm run dev      # dev server con HMR
npm run build    # build de producción en dist/
npm run preview  # previsualizar build de producción
```
