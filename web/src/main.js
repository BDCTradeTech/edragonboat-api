/**
 * Panel web E-DragonBoat — home, entrenamientos, competencias, equipo, cuenta.
 */

import { Chart, registerables } from "chart.js";
import { toJpeg } from "html-to-image";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as api from "./api.js";
import { countrySelectOptionsHtml, countryCellHtml } from "./countries.js";
import {
  UI_LANGUAGES,
  applyDocumentLang,
  getStoredUiLang,
  setStoredUiLang,
} from "./locale.js";
import panelPkg from "../package.json";

Chart.register(...registerables);

const SESSION_TEAM_FILTER_KEY = "edb_team_sessions_filter";

let chartInstances = [];

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function roleLabel(role) {
  const m = { captain: "Capitán", coach: "Entrenador", paddler: "Palista" };
  return m[role] || role;
}

function labelCompBoat(bt) {
  if (bt == null || bt === "") return "—";
  const x = String(bt).toLowerCase();
  if (x === "grande") return "Grande";
  if (x === "chico") return "Chico";
  return escapeHtml(String(bt));
}

function labelCompAge(k) {
  if (k == null || k === "") return "—";
  const m = { premier: "Premier", senior_a: "Senior A", senior_b: "Senior B", senior_c: "Senior C" };
  return m[k] || escapeHtml(String(k));
}

function labelCompTeamCat(k) {
  if (k == null || k === "") return "—";
  const m = { open: "Open", mixto: "Mixto", damas: "Damas", acs: "ACS" };
  return m[k] || escapeHtml(String(k));
}

function yn(v) {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return "—";
}

/** Claves de punto que no se listan en "Muestras por segundo" (privacidad / ruido en tabla). */
const HIDDEN_DATA_POINT_KEYS = new Set(["latitude", "longitude", "locationAccuracyM"]);

/** Fecha/hora de sesión para resumen y mapa: dd/mm/aaaa y hh:mm (local). */
function fmtSessionStartMap(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return String(iso);
  }
}

function boatTypeLabelEsp(bt) {
  if (bt == null || String(bt).trim() === "") return "—";
  const x = String(bt).trim().toLowerCase();
  if (x === "grande") return "Grande";
  if (x === "chico") return "Chico";
  return escapeHtml(String(bt));
}

/** Resumen encima del mapa (pantalla y export JPG). */
function buildSessionMapSummaryHtml(s, last) {
  const meters =
    last != null && typeof last.distanceMeters === "number" && Number.isFinite(last.distanceMeters)
      ? Math.round(last.distanceMeters)
      : null;
  const team = s.teamName ? escapeHtml(s.teamName) : "—";
  const boat = boatTypeLabelEsp(s.boatType);
  const paddlers = s.paddlersCount != null ? escapeHtml(String(s.paddlersCount)) : "—";
  const fechaInicio = escapeHtml(fmtSessionStartMap(s.sessionStartTime));
  const distHtml = meters != null ? `${escapeHtml(String(meters))} m` : "—";
  return `
    <div class="session-map-summary-grid">
      <div><span class="sms-label">Fecha</span><span class="sms-val">${fechaInicio}</span></div>
      <div><span class="sms-label">Equipo</span><span class="sms-val">${team}</span></div>
      <div><span class="sms-label">Bote</span><span class="sms-val">${boat}</span></div>
      <div><span class="sms-label">Palistas</span><span class="sms-val">${paddlers}</span></div>
      <div><span class="sms-label">Distancia</span><span class="sms-val">${distHtml}</span></div>
    </div>
  `;
}

function safeMapJpgTeamSegment(teamName) {
  const raw = teamName && String(teamName).trim();
  if (!raw) return "sin_equipo";
  const cleaned = raw
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned || "sin_equipo";
}

/** dd-mm-aa y hora (HH-MM,24 h) desde ISO, hora local. */
function sessionInstantForMapJpgFilename(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const aa = String(d.getFullYear()).slice(-2);
    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${aa}-${HH}-${MM}`;
  } catch {
    return null;
  }
}

/** Nombre de archivo: Equipo_dd-mm-aa-HH-MM.jpg */
function buildSessionMapJpegFileName(s, sessionId, fallbackIso) {
  const team = safeMapJpgTeamSegment(s.teamName);
  const stamp =
    sessionInstantForMapJpgFilename(s.sessionStartTime) ||
    sessionInstantForMapJpgFilename(fallbackIso) ||
    `sesion-${sessionId}`;
  return `${team}_${stamp}.jpg`;
}

/** Shell con menú lateral (solo autenticado). */
function layout(content, { showNav = true, wide = false } = {}) {
  const email = api.getEmail();
  const authed = !!api.getToken();

  const nav = showNav
    ? `
    <aside class="nav-rail" aria-label="Menú principal">
      <div class="nav-brand">E-DragonBoat</div>
      <nav class="nav-links">
        <a class="nav-item" href="#/" data-match="home">Home</a>
        <a class="nav-item" href="#/teams" data-match="teams">Equipo</a>
        <a class="nav-item" href="#/sessions" data-match="sessions">Entrenamientos</a>
        <a class="nav-item" href="#/competencias" data-match="competencias">Competencias</a>
        <a class="nav-item" href="#/cuenta" data-match="cuenta">Cuenta</a>
      </nav>
      <div class="nav-footer">
        <span class="nav-version">Panel v${escapeHtml(String(panelPkg.version))}</span>
      </div>
    </aside>`
    : "";

  const shell = `
    <div class="app-shell ${showNav ? "with-nav" : "login-mode"}">
      ${nav}
      <div class="main-area">
        <header class="top-bar">
          <div class="top-title"></div>
          <div class="top-actions">
            ${
              authed
                ? `<span class="muted user-chip">${escapeHtml(email)}</span>
                   <button type="button" class="secondary btn-sm" id="btn-logout">Salir</button>`
                : ""
            }
          </div>
        </header>
        <div class="page-body${wide ? " page-body--wide" : ""}">${content}</div>
      </div>
    </div>
  `;

  document.getElementById("app").innerHTML = shell;

  const logout = document.getElementById("btn-logout");
  if (logout) {
    logout.addEventListener("click", () => {
      destroyCharts();
      api.clearSession();
      location.hash = "#/login";
      route();
    });
  }

  highlightNav();
}

function highlightNav() {
  const hash = (location.hash.replace(/^#\/?/, "") || "/").split("/").filter(Boolean);
  let key = "home";
  if (hash[0] === "sessions" || hash[0] === "session") key = "sessions";
  else if (hash[0] === "teams") key = "teams";
  else if (hash[0] === "cuenta") key = "cuenta";
  else if (hash[0] === "regatas" || hash[0] === "competencias") key = "competencias";

  document.querySelectorAll(".nav-item").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-match") === key);
  });
}

function renderHome() {
  layout(`
    <div class="card home-hero">
      <h2 class="card-title">E-DragonBoat</h2>
      <p class="home-lead">
        Plataforma para equipos de <strong>dragon boat</strong>: registrá entrenamientos libres desde la app móvil,
        revisalos en este panel con gráficos, mapas GPS y exportación, y organizá tu plantel.
      </p>
      <ul class="home-features">
        <li><strong>Entrenamientos:</strong> sesiones subidas desde la app, filtradas por tu equipo; detalle con resumen, tablas, gráficos (distancia, velocidad, SPM, paladas) y mapa del recorrido.</li>
        <li><strong>Mapas y JPG:</strong> recorrido sobre mapa (mapa o satélite); podés descargar una imagen con el mapa y un resumen (fecha, equipo, bote, palistas, distancia en m).</li>
        <li><strong>Equipo:</strong> datos del club y roles (capitán, entrenador, palista). El <strong>capitán</strong> puede editar nombre y país del equipo, eliminarlo e <strong>invitar</strong> por email. El <strong>entrenador</strong> ve lo mismo en entrenamientos y plantel, y puede cambiar roles y quitar miembros, pero no invita ni modifica los datos del equipo.</li>
        <li><strong>Cuenta:</strong> tu perfil, contraseña e idioma. El plantel está en <strong>Equipo</strong>.</li>
        <li><strong>Competencias:</strong> carreras subidas desde la app al pulsar <em>Completado</em>; mismo detalle que entrenamientos (gráficos, mapa).</li>
      </ul>
      <div class="home-actions">
        <a class="btn-inline primary" href="#/sessions">Ir a entrenamientos</a>
        <a class="btn-inline" href="#/teams">Ir a equipo</a>
        <a class="btn-inline" href="#/cuenta">Ir a cuenta</a>
      </div>
    </div>
  `);
}

function humanizeApiError(text) {
  if (!text) return "Error desconocido";
  const t = String(text);
  if (t.includes('"Not Found"') || t === "Not Found" || t.includes("404")) {
    return "No se encontró el recurso (404). Subí el archivo app/main.py actualizado (rutas /api/v1/profile y DELETE /api/v1/equipo/{id}) o todo el proyecto, y reiniciá: sudo systemctl restart edragonboat-api.";
  }
  return t;
}

function route() {
  destroyCharts();
  applyDocumentLang(getStoredUiLang());

  const hash = location.hash.replace(/^#\/?/, "") || "/";
  const parts = hash.split("/").filter(Boolean);

  if (!api.getToken() && parts[0] !== "login" && parts[0] !== "register") {
    location.hash = "#/login";
    return renderLogin();
  }

  if (api.getToken() && (parts[0] === "login" || parts[0] === "register")) {
    location.hash = "#/";
    return route();
  }

  if (parts[0] === "login") return renderLogin();
  if (parts[0] === "register") return renderRegister();
  if (parts[0] === "session" && parts[1]) {
    if (!/^\d+$/.test(parts[1])) {
      layout(
        `<div class="card"><p class="msg-error">ID de sesión inválido.</p><p><a class="link" href="#/sessions">Volver</a></p></div>`
      );
      return;
    }
    return renderSessionDetail(parts[1]);
  }
  if (parts[0] === "teams") {
    if (!parts[1]) return renderTeamsList();
    if (parts[1] === "new") return renderTeamNew();
    if (!/^\d+$/.test(parts[1])) {
      layout(
        `<div class="card"><p class="msg-error">ID de equipo inválido (solo números).</p><p><a class="link" href="#/teams">Volver al equipo</a></p></div>`
      );
      return;
    }
    return renderTeamDetail(parts[1]);
  }
  if (parts[0] === "regatas") {
    location.hash = "#/competencias";
    return route();
  }
  if (parts[0] === "competencias") return renderCompetencias();
  if (parts[0] === "cuenta") return renderAccount();
  if (parts[0] === "sessions") return renderSessionsList();
  if (!parts.length || parts[0] === "home") return renderHome();
  return renderHome();
}

function renderLogin() {
  layout(
    `
    <div class="login-center">
      <div class="card login-card">
        <h1 class="login-title">Iniciar sesión</h1>
        <p class="muted">Mismo usuario que en la app móvil y la API.</p>
        <form id="form-login">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username" required />
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
          <button type="submit" class="btn-block">Entrar</button>
          <p id="login-err" class="msg-error"></p>
        </form>
        <p class="muted small" style="margin-top:0.75rem;text-align:center">¿No tenés cuenta? <a class="link" href="#/register">Crear cuenta</a></p>
      </div>
    </div>
  `,
    { showNav: false }
  );

  document.getElementById("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("login-err");
    err.textContent = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    try {
      const data = await api.apiLogin(email, password);
      api.setSession(data.access_token, email);
      location.hash = "#/";
      route();
    } catch (ex) {
      err.textContent = ex.message || "No se pudo iniciar sesión.";
    }
  });
}

function renderRegister() {
  layout(
    `
    <div class="login-center">
      <div class="card login-card">
        <h1 class="login-title">Crear cuenta</h1>
        <p class="muted">Registro con email y contraseña (sin correo de verificación). Luego podés crear tu equipo en <strong>Equipo</strong>.</p>
        <form id="form-register">
          <label for="reg-email">Email</label>
          <input id="reg-email" name="email" type="email" autocomplete="username" required />
          <label for="reg-name">Nombre (opcional)</label>
          <input id="reg-name" name="full_name" type="text" maxlength="200" autocomplete="name" />
          <label for="reg-password">Contraseña</label>
          <input id="reg-password" name="password" type="password" autocomplete="new-password" required minlength="8" />
          <label for="reg-password2">Repetir contraseña</label>
          <input id="reg-password2" name="password2" type="password" autocomplete="new-password" required minlength="8" />
          <button type="submit" class="btn-block">Registrarse</button>
          <p id="reg-err" class="msg-error"></p>
        </form>
        <p class="muted small" style="margin-top:0.75rem;text-align:center">¿Ya tenés cuenta? <a class="link" href="#/login">Iniciar sesión</a></p>
      </div>
    </div>
  `,
    { showNav: false }
  );

  document.getElementById("form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("reg-err");
    err.textContent = "";
    const email = document.getElementById("reg-email").value.trim();
    const fullName = document.getElementById("reg-name").value.trim();
    const password = document.getElementById("reg-password").value;
    const password2 = document.getElementById("reg-password2").value;
    if (password !== password2) {
      err.textContent = "Las contraseñas no coinciden.";
      return;
    }
    if (password.length < 8) {
      err.textContent = "La contraseña debe tener al menos 8 caracteres.";
      return;
    }
    try {
      await api.apiRegister(email, password, fullName || null);
      const data = await api.apiLogin(email, password);
      api.setSession(data.access_token, email);
      location.hash = "#/";
      route();
    } catch (ex) {
      err.textContent = humanizeApiError(ex.message) || String(ex.message);
    }
  });
}

async function renderSessionsList() {
  layout(`<p class="loading-line">Cargando entrenamientos…</p>`);
  try {
    const teams = await api.apiMyTeams();
    let teamFilter = sessionStorage.getItem(SESSION_TEAM_FILTER_KEY);
    let teamIdParam = null;

    if (teams.length >= 1) {
      const valid = teams.some((x) => String(x.team.id) === teamFilter);
      if (!teamFilter || !valid) {
        teamFilter = String(teams[0].team.id);
        sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, teamFilter);
      }
      teamIdParam = Number(teamFilter);
    }

    const rows = await api.apiListSessions(teamIdParam);

    const currentTeamName =
      teams.find((x) => String(x.team.id) === teamFilter)?.team?.name || "";

    const filterBlock =
      teams.length >= 1
        ? `<div class="session-team-filter">
            <label for="sel-session-team">Equipo</label>
            <select id="sel-session-team">
              ${teams
                .map(
                  (x) =>
                    `<option value="${x.team.id}" ${String(x.team.id) === teamFilter ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`
                )
                .join("")}
            </select>
            <p class="muted small">Solo se listan sesiones cuyo <code>teamName</code> en la app coincide con el nombre de este equipo (sin distinguir mayúsculas).</p>
          </div>`
        : `<p class="muted">No tenés equipo: se muestran <strong>todos</strong> tus entrenamientos. Creá uno desde el menú <strong>Equipo</strong> para filtrar por nombre.</p>`;

    if (!rows.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">Entrenamientos libres</h2>
          ${filterBlock}
          <p>No hay sesiones para este criterio.</p>
          <p class="muted">
            ${
              teams.length >= 1
                ? `En la app, el entrenamiento debe usar el mismo nombre de equipo que <strong>${escapeHtml(currentTeamName)}</strong>.`
                : "Pausá un entrenamiento en la app con esta cuenta."
            }
          </p>
        </div>
      `);
      document.getElementById("sel-session-team")?.addEventListener("change", (e) => {
        sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, e.target.value);
        route();
      });
      return;
    }

    const theadRow = `
              <tr>
                <th data-sort="id" class="th-sortable" title="Ordenar">Id</th>
                <th data-sort="created_at" class="th-sortable" title="Ordenar">Fecha</th>
                <th data-sort="team_name" class="th-sortable" title="Ordenar">Equipo</th>
                <th data-sort="total_seconds" class="th-sortable" title="Ordenar">Tiempo</th>
                <th data-sort="distance_meters" class="th-sortable" title="Ordenar">Distancia</th>
                <th data-sort="paladas" class="th-sortable" title="Ordenar">Paladas</th>
              </tr>`;

    const sortState = { sortKey: "created_at", sortDir: "desc" };

    function renderSessionsTableBody() {
      const sorted = [...rows].sort((a, b) => compareSessionRows(sortState.sortKey, sortState.sortDir, a, b));
      const tableRows = sorted
        .map(
          (r) => `
      <tr>
        <td><a class="link" href="#/session/${r.id}">#${r.id}</a></td>
        <td>${fmtDate(r.created_at)}</td>
        <td>${escapeHtml(r.team_name || "—")}</td>
        <td>${r.total_seconds != null ? r.total_seconds + " s" : "—"}</td>
        <td>${r.distance_meters != null ? r.distance_meters.toFixed(0) + " m" : "—"}</td>
        <td>${r.paladas != null ? r.paladas : "—"}</td>
      </tr>
    `
        )
        .join("");
      const tbody = document.getElementById("sessions-tbody");
      if (tbody) tbody.innerHTML = tableRows;
    }

    layout(`
      <div class="card">
        <h2 class="card-title">Entrenamientos libres</h2>
        ${filterBlock}
        <div class="table-scroll">
          <table class="sessions-list-table">
            <thead id="sessions-thead">${theadRow}</thead>
            <tbody id="sessions-tbody"></tbody>
          </table>
        </div>
      </div>
    `);
    renderSessionsTableBody();
    document.getElementById("sessions-thead")?.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      const key = th.getAttribute("data-sort");
      if (!key) return;
      if (sortState.sortKey === key) {
        sortState.sortDir = sortState.sortDir === "asc" ? "desc" : "asc";
      } else {
        sortState.sortKey = key;
        sortState.sortDir = key === "created_at" || key === "id" ? "desc" : "asc";
      }
      renderSessionsTableBody();
    });
    document.getElementById("sel-session-team")?.addEventListener("change", (e) => {
      sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, e.target.value);
      route();
    });
  } catch (ex) {
    layout(`
      <div class="card">
        <p class="msg-error">Error al cargar: ${escapeHtml(humanizeApiError(ex.message))}</p>
        <button type="button" id="btn-retry">Reintentar</button>
      </div>
    `);
    document.getElementById("btn-retry").addEventListener("click", route);
  }
}

function formatCellVal(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === "object") return escapeHtml(JSON.stringify(v));
  return escapeHtml(String(v));
}

/** Etiquetas legibles para claves de métricas (tablas y ejes de gráficos). */
function metricLabelForKey(key) {
  const m = {
    second: "Tiempo (segundos)",
    distanceMeters: "Distancia (metros)",
    speedKmh: "Velocidad (km/h)",
    spm: "SPM",
    paladas: "Paladas",
  };
  return m[key] ?? key;
}

function dataPointColumnLabel(key) {
  return metricLabelForKey(key);
}

/** Columnas del JSON de cada punto: orden conocido + resto alfabético. */
function dataPointColumnOrder(keys) {
  const preferred = ["second", "distanceMeters", "speedKmh", "paladas", "spm", "strokePeakAccelerationMs2"];
  const rest = keys.filter((k) => !preferred.includes(k)).sort();
  return preferred.filter((k) => keys.includes(k)).concat(rest);
}

function buildSessionMetadataTable(session) {
  const skip = new Set(["dataPoints"]);
  const rows = Object.keys(session)
    .filter((k) => !skip.has(k))
    .map((k) => {
      const v = session[k];
      let cell;
      if (v === null || v === undefined) cell = "—";
      else if (typeof v === "object") cell = escapeHtml(JSON.stringify(v));
      else cell = escapeHtml(String(v));
      return `<tr><th scope="row">${escapeHtml(k)}</th><td>${cell}</td></tr>`;
    })
    .join("");
  if (!rows) return `<p class="muted">Sin metadatos adicionales.</p>`;
  return `<table class="meta-table"><tbody>${rows}</tbody></table>`;
}

function buildDynamicDataPointsTable(points) {
  if (!points || !points.length)
    return `<p class="muted">Sin puntos de muestreo.</p>`;
  const keySet = new Set();
  points.forEach((p) =>
    Object.keys(p).forEach((k) => {
      if (!HIDDEN_DATA_POINT_KEYS.has(k)) keySet.add(k);
    })
  );
  const cols = dataPointColumnOrder([...keySet]);
  const th = cols.map((c) => `<th>${escapeHtml(dataPointColumnLabel(c))}</th>`).join("");
  const body = points
    .map((p) => {
      const tds = cols.map((c) => `<td>${formatCellVal(p[c])}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function numericKeysFromPoints(points) {
  const keys = new Set();
  for (const p of points || []) {
    for (const [k, v] of Object.entries(p)) {
      if (k === "second") continue;
      if (HIDDEN_DATA_POINT_KEYS.has(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) keys.add(k);
    }
  }
  const preferred = ["distanceMeters", "speedKmh", "spm", "paladas"];
  const rest = [...keys].filter((k) => !preferred.includes(k)).sort();
  return preferred.filter((k) => keys.has(k)).concat(rest);
}

function buildExploreControlsHtml(points) {
  const keys = numericKeysFromPoints(points);
  if (keys.length === 0) return "";
  const opts = keys
    .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(metricLabelForKey(k))}</option>`)
    .join("");
  return `
    <div class="explore-chart card-inset">
      <h4>Comparar métricas numéricas</h4>
      <p class="muted small">Eje inferior: tiempo (segundos). Eje superior: distancia en metros (cuando hay <code>distanceMeters</code>). Elegí una o dos series en Y.</p>
      <div class="explore-controls">
        <label>Eje Y (izquierda)
          <select id="explore-y1">${opts}</select>
        </label>
        <label>Eje Y (derecha, opcional)
          <select id="explore-y2">
            <option value="">— Ninguna —</option>
            ${opts}
          </select>
        </label>
        <button type="button" class="secondary btn-sm" id="btn-explore-apply">Actualizar gráfico</button>
      </div>
      <div class="chart-canvas-wrap explore-wrap"><canvas id="chart-explore"></canvas></div>
    </div>`;
}

function destroyExploreChart() {
  chartInstances = chartInstances.filter((c) => {
    if (c._edbExplore) {
      c.destroy();
      return false;
    }
    return true;
  });
}

function renderExploreChart(points) {
  const y1Key = document.getElementById("explore-y1")?.value;
  const y2Sel = document.getElementById("explore-y2");
  const y2Key = y2Sel?.value || "";
  const canvas = document.getElementById("chart-explore");
  if (!canvas || !y1Key || !points?.length) return;

  destroyExploreChart();

  const labels = points.map((p) => p.second);
  const ds1 = points.map((p) => (typeof p[y1Key] === "number" ? p[y1Key] : null));
  const hasDistance = points.some(
    (p) => typeof p.distanceMeters === "number" && Number.isFinite(p.distanceMeters)
  );

  const lineDataset = {
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0.2,
  };

  const datasets = [
    {
      label: metricLabelForKey(y1Key),
      data: ds1,
      borderColor: "#1565c0",
      backgroundColor: "rgba(21, 101, 192, 0.08)",
      yAxisID: "y1",
      xAxisID: "x",
      ...lineDataset,
    },
  ];

  const scales = {
    x: {
      title: { display: true, text: "Tiempo (segundos)" },
      ticks: { maxTicksLimit: 14 },
    },
    y1: {
      position: "left",
      title: { display: true, text: metricLabelForKey(y1Key) },
    },
  };

  if (hasDistance) {
    scales.x1 = {
      type: "category",
      position: "top",
      display: true,
      grid: { drawOnChartArea: false },
      title: { display: true, text: "Distancia (metros)" },
      ticks: {
        maxTicksLimit: 14,
        callback(tickValue) {
          const p = points[tickValue];
          if (!p || p.distanceMeters == null || !Number.isFinite(p.distanceMeters)) return "";
          return String(Math.round(p.distanceMeters));
        },
      },
    };
  }

  if (y2Key && y2Key !== y1Key) {
    const ds2 = points.map((p) => (typeof p[y2Key] === "number" ? p[y2Key] : null));
    datasets.push({
      label: metricLabelForKey(y2Key),
      data: ds2,
      borderColor: "#e65100",
      yAxisID: "y2",
      xAxisID: "x",
      ...lineDataset,
    });
    scales.y2 = {
      position: "right",
      title: { display: true, text: metricLabelForKey(y2Key) },
      grid: { drawOnChartArea: false },
    };
  }

  const ch = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
          },
        },
      },
      elements: {
        point: { radius: 0, hoverRadius: 0 },
      },
      scales,
    },
  });
  ch._edbExplore = true;
  chartInstances.push(ch);
}

function wireExploreChart(points) {
  const y1 = document.getElementById("explore-y1");
  const y2 = document.getElementById("explore-y2");
  const keys = numericKeysFromPoints(points);
  if (!y1 || !keys.length) return;
  if (keys.includes("speedKmh")) y1.value = "speedKmh";
  else y1.value = keys[0];
  if (y2) {
    const second =
      keys.find((k) => k !== y1.value && k === "spm") ||
      keys.find((k) => k !== y1.value);
    y2.value = second || "";
  }
  const apply = () => renderExploreChart(points);
  document.getElementById("btn-explore-apply")?.addEventListener("click", apply);
  y1.addEventListener("change", apply);
  y2?.addEventListener("change", apply);
  apply();
}

function initSessionCharts(dataPoints) {
  destroyCharts();
  if (!dataPoints || !dataPoints.length) return;

  const labels = dataPoints.map((p) => p.second);
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false } },
    elements: {
      point: { radius: 0, hoverRadius: 0 },
    },
    scales: {
      x: { title: { display: true, text: "Tiempo (segundos)" }, ticks: { maxTicksLimit: 12 } },
    },
  };

  const lineDs = {
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0.2,
  };

  const elSpeed = document.getElementById("chart-speed");
  const elSpm = document.getElementById("chart-spm");
  if (!elSpeed || !elSpm) return;

  chartInstances.push(
    new Chart(elSpeed, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Velocidad (km/h)",
            data: dataPoints.map((p) => p.speedKmh),
            borderColor: "#e65100",
            ...lineDs,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: "Velocidad (km/h)" } },
        },
      },
    })
  );

  chartInstances.push(
    new Chart(elSpm, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "SPM",
            data: dataPoints.map((p) => p.spm),
            borderColor: "#2e7d32",
            ...lineDs,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: "SPM" } },
        },
      },
    })
  );
}

function extractTrackLatLng(points) {
  if (!points?.length) return [];
  const out = [];
  for (const p of points) {
    const lat = p.latitude;
    const lng = p.longitude ?? p.lng ?? p.lon;
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push([lat, lng]);
    }
  }
  return out;
}

function initSessionMap(points) {
  const el = document.getElementById("session-map");
  if (!el) return;
  const track = extractTrackLatLng(points);
  if (track.length === 0) {
    el.innerHTML =
      '<p class="muted" style="padding:1rem">No hay coordenadas GPS en esta sesión (grabación anterior o sin señal).</p>';
    el.classList.add("session-map-empty");
    return;
  }
  el.classList.remove("session-map-empty");
  if (el._edbMap) {
    el._edbMap.remove();
    el._edbMap = null;
  }
  el.innerHTML = "";
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri — Earthstar Geographics, Maxar",
      maxZoom: 19,
    }
  );
  const map = L.map(el, { layers: [osm] });
  L.control
    .layers(
      {
        Mapa: osm,
        Satélite: satellite,
      },
      {},
      { position: "topright" }
    )
    .addTo(map);
  const latlngs = track.map(([a, b]) => L.latLng(a, b));
  const line = L.polyline(latlngs, { color: "#0d47a1", weight: 5, opacity: 0.88 }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 17 });
  el._edbMap = map;
  setTimeout(() => map.invalidateSize(), 200);
}

async function renderSessionDetail(id) {
  layout(`<p class="loading-line">Cargando sesión #${escapeHtml(id)}…</p>`);
  try {
    const [data, myTeams, me] = await Promise.all([
      api.apiGetSession(id),
      api.apiMyTeams(),
      api.apiMe(),
    ]);
    const s = data.session;
    const myRole = myTeams.length ? myTeams[0].role : null;
    const isPlatformAdmin = me.is_platform_admin === true;
    const isPaddler = !isPlatformAdmin && myRole === "paddler";
    const canDelete = data.can_delete === true;

    const last =
      s.dataPoints && s.dataPoints.length ? s.dataPoints[s.dataPoints.length - 1] : null;
    const stats = `
      <div class="stats">
        <div class="stat">Fecha<strong>${escapeHtml(fmtSessionStartMap(s.sessionStartTime))}</strong></div>
        <div class="stat">Tiempo total<strong>${s.totalSeconds != null ? s.totalSeconds + " s" : "—"}</strong></div>
        <div class="stat">Distancia final<strong>${last ? last.distanceMeters.toFixed(0) + " m" : "—"}</strong></div>
        <div class="stat">Paladas<strong>${last ? last.paladas : "—"}</strong></div>
      </div>
    `;

    const sessionMapSummaryHtml = buildSessionMapSummaryHtml(s, last);

    const tabButtons = isPaddler
      ? `
            <button type="button" class="tab-btn active" data-tab="resumen" role="tab">Resumen</button>
            <button type="button" class="tab-btn" data-tab="mapas" role="tab">Mapas</button>`
      : `
            <button type="button" class="tab-btn active" data-tab="resumen" role="tab">Resumen</button>
            <button type="button" class="tab-btn" data-tab="tabla" role="tab">Datos</button>
            <button type="button" class="tab-btn" data-tab="graficos" role="tab">Gráficos</button>
            <button type="button" class="tab-btn" data-tab="mapas" role="tab">Mapas</button>
            <button type="button" class="tab-btn" data-tab="json" role="tab">JSON completo</button>`;

    let tablaGraficosPanels = "";
    if (!isPaddler) {
      const metaTable = buildSessionMetadataTable(s);
      const pointsTable = buildDynamicDataPointsTable(s.dataPoints);
      const exploreBlock = buildExploreControlsHtml(s.dataPoints);
      tablaGraficosPanels = `
          <div id="panel-tabla" class="tab-panel" role="tabpanel">
            <h3 class="subheading">Campos del entrenamiento (JSON raíz)</h3>
            <div class="table-scroll">${metaTable}</div>
            <h3 class="subheading">Muestras por segundo (todas las claves de cada punto)</h3>
            <div class="table-scroll tall">${pointsTable}</div>
          </div>
          <div id="panel-graficos" class="tab-panel" role="tabpanel">
            <div class="chart-grid">
              <div class="chart-box"><h4>Velocidad (km/h)</h4><div class="chart-canvas-wrap"><canvas id="chart-speed"></canvas></div></div>
              <div class="chart-box"><h4>Ritmo (SPM)</h4><div class="chart-canvas-wrap"><canvas id="chart-spm"></canvas></div></div>
            </div>
            ${exploreBlock}
          </div>`;
    }

    const mapasPanel = `
          <div id="panel-mapas" class="tab-panel" role="tabpanel">
            <p class="muted small">Recorrido del bote con los puntos GPS que envía la app (una posición por segundo, si hay señal).</p>
            <div id="session-map-export-root" class="session-map-export-root">
              <div id="session-map-export-summary" class="session-map-export-summary">
                ${sessionMapSummaryHtml}
              </div>
              <div id="session-map" class="session-map-host" role="region" aria-label="Mapa del recorrido"></div>
            </div>
            <p class="muted small map-export-hint">Descargá el mapa con el resumen del entrenamiento (JPG).</p>
            <button type="button" class="secondary btn-sm" id="btn-session-map-jpg">Descargar mapa (JPG)</button>
          </div>`;

    const jsonPanel = isPaddler
      ? ""
      : `
          <div id="panel-json" class="tab-panel" role="tabpanel">
            <pre class="json">${escapeHtml(JSON.stringify(data.session, null, 2))}</pre>
          </div>`;

    const deleteBtn = canDelete
      ? `<button type="button" class="btn-danger btn-sm" id="btn-delete-session">Borrar sesión</button>`
      : "";

    layout(`
      <p><a class="link" href="#/sessions">← Volver a entrenamientos</a></p>
      <div class="card session-card">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.75rem;justify-content:space-between;margin-bottom:0.35rem">
          <h2 class="card-title" style="margin:0">Sesión #${data.id}</h2>
          ${deleteBtn}
        </div>
        <p class="muted">Fecha: ${fmtDate(data.created_at)}</p>
        ${isPaddler ? `<p class="muted small">Como <strong>palista</strong> solo ves el resumen y el mapa.</p>` : ""}
        <div class="tabs" id="session-tabs">
          <div class="tab-list" role="tablist">
            ${tabButtons}
          </div>
          <div id="panel-resumen" class="tab-panel active" role="tabpanel">
            ${stats}
            ${s.teamName ? `<p><strong>Equipo (en sesión):</strong> ${escapeHtml(s.teamName)}</p>` : ""}
            ${s.boatType ? `<p><strong>Bote:</strong> ${escapeHtml(s.boatType)}</p>` : ""}
            ${s.paddlersCount != null ? `<p><strong>Cant. palistas:</strong> ${escapeHtml(String(s.paddlersCount))}</p>` : ""}
          </div>
          ${tablaGraficosPanels}
          ${mapasPanel}
          ${jsonPanel}
        </div>
      </div>
    `);

    const tabRoot = document.getElementById("session-tabs");
    const panels = isPaddler ? ["resumen", "mapas"] : ["resumen", "tabla", "graficos", "mapas", "json"];
    const sessionUiState = { chartsReady: false, mapReady: false };

    function activateSessionTab(name, { focusButton } = {}) {
      if (focusButton && name) {
        const b = tabRoot.querySelector(`.tab-btn[data-tab="${name}"]`);
        if (b) {
          tabRoot.querySelectorAll(".tab-btn").forEach((x) => x.classList.toggle("active", x === b));
        }
      } else if (name) {
        tabRoot.querySelectorAll(".tab-btn").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-tab") === name);
        });
      }
      panels.forEach((p) => {
        const el = document.getElementById(`panel-${p}`);
        if (el) el.classList.toggle("active", p === name);
      });
      if (name === "graficos" && !sessionUiState.chartsReady) {
        initSessionCharts(s.dataPoints);
        wireExploreChart(s.dataPoints);
        sessionUiState.chartsReady = true;
      }
      if (name === "mapas") {
        if (!sessionUiState.mapReady) {
          initSessionMap(s.dataPoints);
          sessionUiState.mapReady = true;
        } else {
          const wrap = document.getElementById("session-map");
          if (wrap?._edbMap) setTimeout(() => wrap._edbMap.invalidateSize(), 200);
        }
      }
    }

    tabRoot.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-tab");
        activateSessionTab(name, { focusButton: true });
      });
    });

    document.getElementById("btn-delete-session")?.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta sesión de entrenamiento? No se puede deshacer.")) return;
      try {
        await api.apiDeleteSession(id);
        location.hash = "#/sessions";
        route();
      } catch (ex) {
        alert(humanizeApiError(ex.message) || ex.message || "Error");
      }
    });

    document.getElementById("btn-session-map-jpg")?.addEventListener("click", async () => {
      activateSessionTab("mapas");
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 400));
      const wrap = document.getElementById("session-map");
      if (wrap?._edbMap) {
        wrap._edbMap.invalidateSize();
        await new Promise((r) => setTimeout(r, 700));
      } else {
        await new Promise((r) => setTimeout(r, 200));
      }
      const root = document.getElementById("session-map-export-root");
      if (!root) return;
      try {
        const dataUrl = await toJpeg(root, {
          quality: 0.92,
          pixelRatio: 2,
          cacheBust: true,
        });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = buildSessionMapJpegFileName(s, data.id, data.created_at);
        a.click();
      } catch (e) {
        console.error(e);
        alert(
          "No se pudo generar el JPG (a veces por las teselas del mapa). Esperá a que cargue el mapa y reintentá, o usá captura de pantalla."
        );
      }
    });
  } catch (ex) {
    layout(`
      <p><a class="link" href="#/sessions">← Volver</a></p>
      <div class="card"><p class="msg-error">${escapeHtml(ex.message)}</p></div>
    `);
  }
}

async function renderTeamsList() {
  layout(`<p class="loading-line">Cargando equipo…</p>`);
  try {
    const [list, me] = await Promise.all([api.apiMyTeams(), api.apiMe()]);
    const isPlatformAdmin = me.is_platform_admin === true;
    if (!list.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">Equipo</h2>
          <p>Todavía no pertenecés a ningún equipo.</p>
          <a class="btn-inline" href="#/teams/new">Crear equipo</a>
        </div>
      `);
      return;
    }
    const rows = list
      .map(
        (x) => `
      <tr>
        <td><a class="link" href="#/teams/${x.team.id}">${escapeHtml(x.team.name)}</a></td>
        <td>${escapeHtml(x.team.country || "—")}</td>
        <td>${roleLabel(x.role)}</td>
      </tr>
    `
      )
      .join("");
    layout(`
      ${
        list.length === 0
          ? `<div class="page-actions"><a class="btn-inline primary" href="#/teams/new">+ Nuevo equipo</a></div>`
          : ""
      }
      <div class="card">
        <h2 class="card-title">${isPlatformAdmin ? "Todos los equipos" : "Mi equipo"}</h2>
        <p class="muted">${
          isPlatformAdmin
            ? "Vista de administrador: podés abrir cualquier equipo y gestionar el plantel en la ficha del equipo. Los demás usuarios no te ven en sus planteles."
            : "Un usuario solo puede tener <strong>un</strong> equipo. En la ficha del equipo el capitán puede cambiar nombre, país y eliminar el equipo; el capitán o el entrenador gestionan el plantel y solo el capitán invita."
        }</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Nombre</th><th>País</th><th>${isPlatformAdmin ? "Tu rol (si estás en el equipo)" : "Tu rol"}</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `);
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p></div>`
    );
  }
}

async function renderTeamNew() {
  let existing;
  let me;
  try {
    [existing, me] = await Promise.all([api.apiMyTeams(), api.apiMe()]);
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">Volver</a></p></div>`
    );
    return;
  }
  if (existing.length > 0 && me.is_platform_admin !== true) {
    location.hash = "#/teams";
    route();
    return;
  }

  const countryOpts = countrySelectOptionsHtml("");

  layout(`
    <p><a class="link" href="#/teams">← Equipo</a></p>
    <div class="card narrow">
      <h2 class="card-title">Nuevo equipo</h2>
      <form id="form-new-team">
        <label for="t-name">Nombre del equipo</label>
        <input id="t-name" required maxlength="200" />
        <label for="t-country">País (opcional)</label>
        <select id="t-country">${countryOpts}</select>
        <button type="submit">Crear</button>
        <p id="team-err" class="msg-error"></p>
      </form>
    </div>
  `);

  document.getElementById("form-new-team").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("team-err");
    err.textContent = "";
    const name = document.getElementById("t-name").value.trim();
    const countryRaw = document.getElementById("t-country").value.trim();
    const body = { name };
    if (countryRaw) body.country = countryRaw;
    try {
      const created = await api.apiCreateTeam(body);
      const tid = created?.team?.id;
      if (tid != null) location.hash = `#/teams/${tid}`;
      else location.hash = "#/teams";
      route();
    } catch (ex) {
      err.textContent = humanizeApiError(ex.message) || "Error al crear.";
    }
  });
}

async function renderTeamDetail(id) {
  const teamId = Number(id);
  if (!Number.isFinite(teamId) || teamId < 1) {
    layout(
      `<div class="card"><p class="msg-error">Equipo inválido.</p><p><a class="link" href="#/teams">Volver</a></p></div>`
    );
    return;
  }
  layout(`<p class="loading-line">Cargando equipo…</p>`);
  try {
    const [team, myTeams, me, members] = await Promise.all([
      api.apiGetTeam(teamId),
      api.apiMyTeams(),
      api.apiMe(),
      api.apiListMembers(teamId),
    ]);
    const myEntry = myTeams.find((t) => t.team.id === teamId);
    const myRole = myEntry?.role;
    const isPlatformAdmin = me.is_platform_admin === true;
    const isCaptain = myRole === "captain" || isPlatformAdmin;
    const isCoach = myRole === "coach";
    const countryOptsEdit = countrySelectOptionsHtml(team.country || "");

    const roleLine =
      myRole != null
        ? roleLabel(myRole)
        : isPlatformAdmin
          ? "Administrador (plataforma)"
          : "—";

    let inviteBlock = "";
    if (myRole === "captain" || isPlatformAdmin) {
      inviteBlock = `
        <details class="disclosure-card" style="margin-top:0.75rem">
          <summary class="disclosure-summary">
            <span>Invitar al equipo</span>
            <span class="disclosure-chev" aria-hidden="true"></span>
          </summary>
          <div class="disclosure-body">
            <p class="muted small">Podés invitar por email aunque no tengan cuenta: se crea el usuario con contraseña <strong>12345678</strong> (que deberían cambiar en Cuenta). Si el servidor tiene SMTP, reciben un correo con el acceso.</p>
            <form id="form-invite-${teamId}">
              <label for="inv-name-${teamId}">Nombre (opcional)</label>
              <input id="inv-name-${teamId}" type="text" maxlength="200" autocomplete="name" />
              <label for="inv-email-${teamId}">Email</label>
              <input id="inv-email-${teamId}" type="email" required autocomplete="email" />
              <label for="inv-role-${teamId}">Rol</label>
              <select id="inv-role-${teamId}">
                <option value="coach">Entrenador</option>
                <option value="paddler" selected>Palista</option>
              </select>
              <button type="submit">Invitar</button>
              <p id="inv-err-${teamId}" class="msg-error"></p>
            </form>
          </div>
        </details>`;
    } else if (isCoach) {
      inviteBlock = `<p class="muted small">Solo el <strong>capitán</strong> puede invitar nuevas personas al equipo.</p>`;
    }

    const plantelCard = `
      <div class="card" style="margin-top:1rem">
        <h3 style="margin-top:0">Plantel</h3>
        <p class="muted small">Datos del plantel se guardan en el servidor. El capitán y el entrenador pueden editar filas y roles.</p>
        ${buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin }, teamId)}
        ${inviteBlock}
      </div>`;

    const editBlock = isCaptain
      ? `
      <div class="card sub-card">
        <h3>Datos del equipo</h3>
        <form id="form-edit-team">
          <label for="e-name">Nombre</label>
          <input id="e-name" value="${escapeHtml(team.name)}" required maxlength="200" />
          <label for="e-country">País</label>
          <select id="e-country">${countryOptsEdit}</select>
          <button type="submit">Guardar cambios</button>
          <p id="edit-err" class="msg-error"></p>
        </form>
      </div>
      <div class="card sub-card danger-zone">
        <h3>Eliminar equipo</h3>
        <p class="muted">Quita el equipo y las membresías. Los entrenamientos ya subidos no se borran.</p>
        <button type="button" class="btn-danger" id="btn-delete-team">Eliminar equipo</button>
        <p id="delete-team-err" class="msg-error"></p>
      </div>`
      : `<p class="muted">Solo el capitán puede cambiar el nombre, el país o eliminar el equipo.</p>`;

    layout(`
      <p><a class="link" href="#/teams">← Mi equipo</a></p>
      <div class="card">
        <h2 class="card-title">${escapeHtml(team.name)}</h2>
        <p class="muted">País: ${escapeHtml(team.country || "—")} · Tu rol: <strong>${escapeHtml(roleLine)}</strong></p>
        ${editBlock}
        ${plantelCard}
      </div>
    `);

    wireTeamPlantelPage(teamId, {
      canChangeRoles: isPlatformAdmin || myRole === "captain",
      canRemoveMember: isPlatformAdmin || myRole === "captain" || myRole === "coach",
    });

    document.getElementById(`form-invite-${teamId}`)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById(`inv-err-${teamId}`);
      errEl.textContent = "";
      errEl.classList.remove("msg-ok");
      errEl.classList.add("msg-error");
      try {
        const result = await api.apiAddMember(
          teamId,
          document.getElementById(`inv-email-${teamId}`).value.trim(),
          document.getElementById(`inv-role-${teamId}`).value,
          document.getElementById(`inv-name-${teamId}`)?.value || ""
        );
        errEl.classList.remove("msg-error");
        errEl.classList.add("msg-ok");
        let msg = "Listo: ya está en el equipo.";
        if (result.account_created) {
          msg = result.invite_email_sent
            ? "Cuenta nueva creada y email enviado con la contraseña provisional."
            : "Cuenta nueva creada (contraseña 12345678). No se envió email: configurá SMTP en el servidor.";
        }
        errEl.textContent = msg;
        document.getElementById(`inv-email-${teamId}`).value = "";
        const nameIn = document.getElementById(`inv-name-${teamId}`);
        if (nameIn) nameIn.value = "";
        location.hash = `#/teams/${teamId}`;
        route();
      } catch (ex) {
        errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
      }
    });

    if (isCaptain) {
      document.getElementById("form-edit-team").addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = document.getElementById("edit-err");
        errEl.textContent = "";
        try {
          await api.apiUpdateTeam(teamId, {
            name: document.getElementById("e-name").value.trim(),
            country: document.getElementById("e-country").value.trim() || null,
          });
          errEl.textContent = "Guardado.";
          errEl.classList.remove("msg-error");
          errEl.classList.add("msg-ok");
        } catch (ex) {
          errEl.classList.add("msg-error");
          errEl.classList.remove("msg-ok");
          errEl.textContent = ex.message || "Error";
        }
      });

      document.getElementById("btn-delete-team")?.addEventListener("click", async () => {
        const errEl = document.getElementById("delete-team-err");
        errEl.textContent = "";
        if (!confirm("¿Eliminar este equipo para siempre? No se puede deshacer.")) return;
        try {
          await api.apiDeleteTeam(teamId);
          sessionStorage.removeItem(SESSION_TEAM_FILTER_KEY);
          location.hash = "#/teams";
          route();
        } catch (ex) {
          errEl.textContent = humanizeApiError(ex.message);
        }
      });
    }
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">Volver al equipo</a></p></div>`
    );
  }
}

function rosterBirthInputValue(iso) {
  if (!iso) return "";
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  } catch {
    return "";
  }
}

function preferredSideLabel(side) {
  if (side === "right") return "Derecho";
  if (side === "left") return "Izquierdo";
  if (side === "either") return "Indistinto";
  return "—";
}

function preferredSideOptionsHtml(m) {
  const v = m.preferred_side || "";
  return `
    <option value="">—</option>
    <option value="right" ${v === "right" ? "selected" : ""}>Derecho</option>
    <option value="left" ${v === "left" ? "selected" : ""}>Izquierdo</option>
    <option value="either" ${v === "either" ? "selected" : ""}>Indistinto</option>`;
}

function rosterCellsHtml(m, canEditRoster) {
  if (canEditRoster) {
    return `
        <td><input class="roster-doc" type="text" value="${escapeHtml(m.document_number || "")}" maxlength="80" /></td>
        <td><input class="roster-birth" type="date" value="${rosterBirthInputValue(m.birth_date)}" /></td>
        <td class="muted roster-age">${m.age_years != null ? m.age_years : "—"}</td>
        <td><input class="roster-h" type="number" step="0.1" min="0" placeholder="cm" value="${m.height_cm != null ? escapeHtml(String(m.height_cm)) : ""}" /></td>
        <td><input class="roster-w" type="number" step="0.1" min="0" placeholder="kg" value="${m.weight_kg != null ? escapeHtml(String(m.weight_kg)) : ""}" /></td>
        <td><select class="roster-side">${preferredSideOptionsHtml(m)}</select></td>`;
  }
  return `
        <td>${escapeHtml(m.document_number || "—")}</td>
        <td>${m.birth_date ? escapeHtml(rosterBirthInputValue(m.birth_date)) : "—"}</td>
        <td>${m.age_years != null ? m.age_years : "—"}</td>
        <td>${m.height_cm != null ? escapeHtml(String(m.height_cm)) : "—"}</td>
        <td>${m.weight_kg != null ? escapeHtml(String(m.weight_kg)) : "—"}</td>
        <td>${preferredSideLabel(m.preferred_side)}</td>`;
}

/** Plantel en ficha Equipo: datos personales persistidos en membresía; roles como antes. */
function buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin }, teamId) {
  const canManage = isCaptain || isCoach || isPlatformAdmin;
  const canEditRoster = canManage;
  const saveBtn = (uid) =>
    canEditRoster
      ? `<button type="button" class="secondary btn-sm btn-roster-save" data-team="${teamId}" data-user="${uid}">Guardar</button> `
      : "";
  const thead = canManage
    ? `<thead><tr><th>Email</th><th>Nombre</th><th>Documento</th><th>Fecha nac.</th><th>Edad</th><th>Altura (cm)</th><th>Peso (kg)</th><th>Lado preferido</th><th>Rol</th><th>Gestión</th></tr></thead>`
    : `<thead><tr><th>Email</th><th>Nombre</th><th>Documento</th><th>Fecha nac.</th><th>Edad</th><th>Altura (cm)</th><th>Peso (kg)</th><th>Lado preferido</th><th>Rol</th></tr></thead>`;
  const rows = members
    .map((m) => {
      const rc = rosterCellsHtml(m, canEditRoster);
      if (!canManage) {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          ${rc}
          <td>${roleLabel(m.role)}</td>
        </tr>`;
      }
      if (isPlatformAdmin) {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          ${rc}
          <td>${roleLabel(m.role)}</td>
          <td class="actions-cell">
            ${saveBtn(m.user_id)}
            <select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="Rol">
              <option value="captain" ${m.role === "captain" ? "selected" : ""}>Capitán</option>
              <option value="coach" ${m.role === "coach" ? "selected" : ""}>Entrenador</option>
              <option value="paddler" ${m.role === "paddler" ? "selected" : ""}>Palista</option>
            </select>
            <button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}" ${
              m.role === "captain" ? 'disabled title="Promové a otro capitán antes de quitar"' : ""
            }>Quitar</button>
          </td>
        </tr>`;
      }
      if (m.role === "captain") {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          ${rc}
          <td>${roleLabel(m.role)}</td>
          <td class="actions-cell">${saveBtn(m.user_id)}<span class="muted">—</span></td>
        </tr>`;
      }
      if (isCoach && m.role === "coach") {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          ${rc}
          <td>${roleLabel(m.role)}</td>
          <td class="actions-cell">${saveBtn(m.user_id)}<span class="muted">Solo el capitán gestiona entrenadores</span></td>
        </tr>`;
      }
      if (isCaptain) {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          ${rc}
          <td>${roleLabel(m.role)}</td>
          <td class="actions-cell">
            ${saveBtn(m.user_id)}
            <select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="Rol">
              <option value="coach" ${m.role === "coach" ? "selected" : ""}>Entrenador</option>
              <option value="paddler" ${m.role === "paddler" ? "selected" : ""}>Palista</option>
            </select>
            <button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}">Quitar</button>
          </td>
        </tr>`;
      }
      return `<tr>
        <td>${escapeHtml(m.email)}</td>
        <td>${escapeHtml(m.full_name || "—")}</td>
        ${rc}
        <td>${roleLabel(m.role)}</td>
        <td class="actions-cell">
          ${saveBtn(m.user_id)}
          <button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}">Quitar</button>
        </td>
      </tr>`;
    })
    .join("");
  return `<div class="table-scroll"><table class="plantel-table">${thead}<tbody>${rows}</tbody></table></div>`;
}

function wireTeamPlantelPage(teamId, { canChangeRoles, canRemoveMember }) {
  document.querySelectorAll(`.btn-roster-save[data-team="${teamId}"]`).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = Number(btn.getAttribute("data-user"));
      const tr = btn.closest("tr");
      if (!tr) return;
      const doc = tr.querySelector(".roster-doc")?.value?.trim() ?? "";
      const birthRaw = tr.querySelector(".roster-birth")?.value || "";
      const hRaw = tr.querySelector(".roster-h")?.value ?? "";
      const wRaw = tr.querySelector(".roster-w")?.value ?? "";
      const sideRaw = tr.querySelector(".roster-side")?.value ?? "";
      const body = {
        document_number: doc || null,
        birth_date: birthRaw ? birthRaw : null,
        height_cm: hRaw === "" ? null : Number(hRaw),
        weight_kg: wRaw === "" ? null : Number(wRaw),
        preferred_side: sideRaw || null,
      };
      if (body.height_cm != null && (Number.isNaN(body.height_cm) || body.height_cm < 0)) {
        alert("Altura inválida.");
        return;
      }
      if (body.weight_kg != null && (Number.isNaN(body.weight_kg) || body.weight_kg < 0)) {
        alert("Peso inválido.");
        return;
      }
      try {
        await api.apiPatchMemberRoster(teamId, uid, body);
        location.hash = `#/teams/${teamId}`;
        route();
      } catch (ex) {
        alert(humanizeApiError(ex.message) || String(ex.message));
      }
    });
  });
  if (canChangeRoles) {
    document.querySelectorAll(`.role-select-acc[data-team="${teamId}"]`).forEach((sel) => {
      sel.addEventListener("change", async () => {
        const uid = Number(sel.getAttribute("data-user"));
        try {
          await api.apiPatchMemberRole(teamId, uid, sel.value);
          location.hash = `#/teams/${teamId}`;
          route();
        } catch (ex) {
          alert(ex.message || "Error al cambiar rol");
        }
      });
    });
  }
  if (canRemoveMember) {
    document.querySelectorAll(`.btn-remove-acc[data-team="${teamId}"]`).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user"));
        if (!confirm("¿Quitar a esta persona del equipo?")) return;
        try {
          await api.apiRemoveMember(teamId, uid);
          location.hash = `#/teams/${teamId}`;
          route();
        } catch (ex) {
          alert(ex.message || "Error");
        }
      });
    });
  }
}

function compareSessionRows(sortKey, sortDir, a, b) {
  const dir = sortDir === "asc" ? 1 : -1;
  const va = a[sortKey];
  const vb = b[sortKey];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (sortKey === "created_at") {
    const ta = new Date(va).getTime();
    const tb = new Date(vb).getTime();
    return (ta - tb) * dir;
  }
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  return String(va).localeCompare(String(vb), "es") * dir;
}

function compareCompetenciaRows(sortKey, sortDir, a, b) {
  const dir = sortDir === "asc" ? 1 : -1;
  const va = a[sortKey];
  const vb = b[sortKey];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (sortKey === "created_at") {
    const ta = new Date(va).getTime();
    const tb = new Date(vb).getTime();
    return (ta - tb) * dir;
  }
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  if (typeof va === "boolean" && typeof vb === "boolean") {
    if (va === vb) return 0;
    return va ? -1 * dir : 1 * dir;
  }
  return String(va).localeCompare(String(vb), "es") * dir;
}

async function renderCompetencias() {
  layout(`<p class="loading-line">Cargando competencias…</p>`, { wide: true });
  try {
    const [allRows, teamCountriesRaw, me, myTeams] = await Promise.all([
      api.apiListCompetenciaSessions(),
      api.apiListTeamCountries().catch(() => []),
      api.apiMe(),
      api.apiMyTeams(),
    ]);
    const teamCountries = Array.isArray(teamCountriesRaw) ? teamCountriesRaw : [];

    const isPlatformAdmin = me.is_platform_admin === true;
    const myUserId = me.id != null ? Number(me.id) : null;
    const myTeamNameKeys = new Set(
      (myTeams || [])
        .map((x) => (x.team && x.team.name ? String(x.team.name).trim().toLowerCase() : ""))
        .filter(Boolean)
    );

    /** Detalle de sesión: solo mismo equipo (nombre en JSON), quien subió, o administrador. */
    function canOpenCompetenciaDetail(r) {
      if (isPlatformAdmin) return true;
      if (myUserId != null && r.uploaded_by_user_id != null && Number(r.uploaded_by_user_id) === myUserId) {
        return true;
      }
      const n = (r.team_name || "").trim().toLowerCase();
      return Boolean(n && myTeamNameKeys.has(n));
    }

    const introBlock = `<p class="muted small">Listado global: se muestran las competencias subidas por <strong>todos</strong> los equipos (requiere iniciar sesión). Podés abrir el detalle solo de las sesiones de <strong>tu equipo</strong> (o las que subiste vos).</p>`;

    if (!allRows.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">Competencias</h2>
          <p class="muted">Carreras registradas desde la app al terminar la distancia y pulsar <strong>Completado</strong> (requiere API con <code>POST /api/v1/sessions/competencia</code>).</p>
          ${introBlock}
          <p>No hay sesiones de competencia todavía.</p>
          <p class="muted">Cuando alguien complete una carrera y suba la sesión desde la app, aparecerá aquí.</p>
        </div>
      `,
        { wide: true },
      );
      return;
    }

    const countryFilterOptions =
      `<option value="todos" selected>Todos</option>` +
      teamCountries
        .map((c) => {
          const v = String(c);
          const safeVal = v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          return `<option value="${safeVal}">${escapeHtml(v)}</option>`;
        })
        .join("");

    const filterBar = `
      <div class="competencia-filters" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;margin-bottom:0.75rem">
        <div>
          <label for="comp-filter-pais" class="muted small" style="display:block">País</label>
          <select id="comp-filter-pais">
            ${countryFilterOptions}
          </select>
        </div>
        <div>
          <label for="comp-filter-boat" class="muted small" style="display:block">Bote</label>
          <select id="comp-filter-boat">
            <option value="todos" selected>Todos</option>
            <option value="grande">Grande</option>
            <option value="chico">Chico</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-paddlers" class="muted small" style="display:block">Palistas</label>
          <select id="comp-filter-paddlers">
            <option value="todos" selected>Todos</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-drummer" class="muted small" style="display:block">Drummer</label>
          <select id="comp-filter-drummer">
            <option value="todos" selected>Todos</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-age" class="muted small" style="display:block">Edad</label>
          <select id="comp-filter-age">
            <option value="todos" selected>Todos</option>
            <option value="premier">Premier</option>
            <option value="senior_a">Senior A</option>
            <option value="senior_b">Senior B</option>
            <option value="senior_c">Senior C</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-teamcat" class="muted small" style="display:block">Equipo</label>
          <select id="comp-filter-teamcat">
            <option value="todos" selected>Todos</option>
            <option value="open">Open</option>
            <option value="mixto">Mixto</option>
            <option value="damas">Damas</option>
            <option value="acs">ACS</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-dist" class="muted small" style="display:block">Distancia</label>
          <select id="comp-filter-dist">
            <option value="todas" selected>Todas</option>
            <option value="200">200 m</option>
            <option value="500">500 m</option>
            <option value="1000">1000 m</option>
            <option value="2000">2000 m</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-virada" class="muted small" style="display:block">Virada</label>
          <select id="comp-filter-virada">
            <option value="todas" selected>Todas</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>`;

    const theadRow = `
      <tr>
        <th data-sort="id" class="th-sortable" title="Ordenar">Id</th>
        <th data-sort="created_at" class="th-sortable" title="Ordenar">Fecha</th>
        <th data-sort="target_distance_meters" class="th-sortable" title="Ordenar">Meta</th>
        <th data-sort="boat_type" class="th-sortable" title="Ordenar">Bote</th>
        <th data-sort="paddlers_count" class="th-sortable" title="Ordenar">Palistas</th>
        <th data-sort="age_category" class="th-sortable" title="Ordenar">Edad</th>
        <th data-sort="team_category" class="th-sortable" title="Ordenar">Tipo</th>
        <th data-sort="drummer" class="th-sortable" title="Ordenar">Drummer</th>
        <th data-sort="virada" class="th-sortable" title="Ordenar">Virada</th>
        <th data-sort="team_name" class="th-sortable" title="Ordenar">Equipo</th>
        <th data-sort="team_country" class="th-sortable" title="Ordenar">País</th>
        <th data-sort="total_seconds" class="th-sortable" title="Ordenar">Tiempo</th>
      </tr>`;

    layout(`
      <div class="card">
        <h2 class="card-title">Competencias</h2>
        <p class="muted">Sesiones subidas al finalizar la carrera en la app. Podés abrir cada una para ver gráficos, tabla y mapa (igual que en Entrenamientos).</p>
        ${introBlock}
        ${filterBar}
        <div class="table-scroll competencias-scroll">
          <table class="competencias-table">
            <thead id="comp-thead">${theadRow}</thead>
            <tbody id="comp-tbody"></tbody>
          </table>
        </div>
      </div>
    `,
      { wide: true },
    );

    const state = {
      sortKey: "total_seconds",
      sortDir: "asc",
    };

    function rowMatchesFilters(r) {
      const pais = document.getElementById("comp-filter-pais").value;
      if (pais !== "todos") {
        const tc = (r.team_country || "").trim();
        if (tc !== pais) return false;
      }
      const boat = document.getElementById("comp-filter-boat").value;
      if (boat !== "todos") {
        const b = (r.boat_type || "").toString().toLowerCase();
        if (b !== boat) return false;
      }
      const paddlers = document.getElementById("comp-filter-paddlers").value;
      if (paddlers !== "todos") {
        const n = Number(paddlers);
        if (r.paddlers_count !== n) return false;
      }
      const drummer = document.getElementById("comp-filter-drummer").value;
      if (drummer === "si" && r.drummer !== true) return false;
      if (drummer === "no" && r.drummer !== false) return false;
      const age = document.getElementById("comp-filter-age").value;
      if (age !== "todos" && (r.age_category || "") !== age) return false;
      const teamcat = document.getElementById("comp-filter-teamcat").value;
      if (teamcat !== "todos" && (r.team_category || "") !== teamcat) return false;
      const dist = document.getElementById("comp-filter-dist").value;
      if (dist !== "todas") {
        const d = Number(dist);
        if (r.target_distance_meters !== d) return false;
      }
      const vir = document.getElementById("comp-filter-virada").value;
      if (vir === "si" && r.virada !== true) return false;
      if (vir === "no" && r.virada !== false) return false;
      return true;
    }

    function renderCompetenciaBody() {
      const filtered = allRows.filter(rowMatchesFilters);
      filtered.sort((a, b) => compareCompetenciaRows(state.sortKey, state.sortDir, a, b));
      const html = filtered
        .map(
          (r) => {
        const canOpen = canOpenCompetenciaDetail(r);
        const idCell = canOpen
          ? `<td><a class="link" href="#/session/${r.id}">#${r.id}</a></td>`
          : `<td><span class="muted" title="Solo podés abrir el detalle de tu equipo">#${r.id}</span></td>`;
        return `
      <tr>
        ${idCell}
        <td>${fmtDate(r.created_at)}</td>
        <td>${r.target_distance_meters != null ? r.target_distance_meters + " m" : "—"}</td>
        <td>${labelCompBoat(r.boat_type)}</td>
        <td>${r.paddlers_count != null ? r.paddlers_count : "—"}</td>
        <td>${labelCompAge(r.age_category)}</td>
        <td>${labelCompTeamCat(r.team_category)}</td>
        <td>${yn(r.drummer)}</td>
        <td>${yn(r.virada)}</td>
        <td>${escapeHtml(r.team_name || "—")}</td>
        <td>${countryCellHtml(r.team_country)}</td>
        <td>${r.total_seconds != null ? r.total_seconds + " s" : "—"}</td>
      </tr>
    `;
          }
        )
        .join("");
      document.getElementById("comp-tbody").innerHTML =
        html ||
        `<tr><td colspan="12" class="muted">Ninguna sesión coincide con los filtros.</td></tr>`;
    }

    [
      "comp-filter-pais",
      "comp-filter-boat",
      "comp-filter-paddlers",
      "comp-filter-drummer",
      "comp-filter-age",
      "comp-filter-teamcat",
      "comp-filter-dist",
      "comp-filter-virada",
    ].forEach((id) => {
      document.getElementById(id).addEventListener("change", renderCompetenciaBody);
    });

    document.getElementById("comp-thead").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      const key = th.getAttribute("data-sort");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "created_at" || key === "id" ? "desc" : "asc";
      }
      renderCompetenciaBody();
    });

    renderCompetenciaBody();
  } catch (ex) {
    layout(`
      <div class="card">
        <h2 class="card-title">Competencias</h2>
        <p class="msg-error">Error al cargar: ${escapeHtml(humanizeApiError(ex.message))}</p>
        <p class="muted small">Hace falta desplegar la API con <code>GET /api/v1/sessions/competencia</code> (panel v0.2.4+).</p>
        <button type="button" id="btn-retry-comp">Reintentar</button>
      </div>
    `,
      { wide: true },
    );
    document.getElementById("btn-retry-comp").addEventListener("click", route);
  }
}

async function renderAccount() {
  layout(`<p class="loading-line">Cargando perfil…</p>`);
  try {
    const [me, teams] = await Promise.all([api.apiMe(), api.apiMyTeams()]);

    const isPlatformAdmin = me.is_platform_admin === true;

    const noTeamMsg =
      teams.length === 0 && !isPlatformAdmin
        ? `<div class="card" style="margin-top:1rem"><p class="muted">No tenés equipo. Podés crear uno en <a class="link" href="#/teams/new">Equipo</a>.</p></div>`
        : "";

    const plantelHint =
      teams.length > 0
        ? `<p class="muted" style="margin-top:1rem">El <strong>plantel</strong> y las invitaciones están en <a class="link" href="#/teams">Equipo</a> → abrí tu equipo.</p>`
        : "";

    layout(`
      <div class="card narrow">
        <h2 class="card-title">Cuenta</h2>
        <p><strong>Email:</strong> ${escapeHtml(me.email)}</p>
        <p><strong>Nombre:</strong> ${escapeHtml(me.full_name || "—")}</p>
      </div>
      <details class="disclosure-card card narrow" style="margin-top:1rem">
        <summary class="disclosure-summary">
          <span>Cambiar contraseña</span>
          <span class="disclosure-chev" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
          <form id="form-change-password">
            <label for="pwd-current">Contraseña actual</label>
            <input id="pwd-current" type="password" required autocomplete="current-password" />
            <label for="pwd-new">Nueva contraseña</label>
            <input id="pwd-new" type="password" required minlength="8" autocomplete="new-password" />
            <label for="pwd-new2">Repetir nueva contraseña</label>
            <input id="pwd-new2" type="password" required minlength="8" autocomplete="new-password" />
            <button type="submit">Guardar nueva contraseña</button>
            <p id="pwd-err" class="msg-error"></p>
          </form>
        </div>
      </details>
      <div class="card narrow" style="margin-top:1rem">
        <h3 style="margin-top:0">Idioma</h3>
        <p class="muted small">Preferencia guardada en este navegador (por defecto: inglés).</p>
        <label for="sel-ui-lang">Idioma</label>
        <select id="sel-ui-lang">
          ${UI_LANGUAGES.map(
            (o) =>
              `<option value="${escapeHtml(o.code)}"${getStoredUiLang() === o.code ? " selected" : ""}>${escapeHtml(o.label)}</option>`
          ).join("")}
        </select>
      </div>
      ${noTeamMsg}
      ${plantelHint}
    `);

    document.getElementById("sel-ui-lang")?.addEventListener("change", (e) => {
      setStoredUiLang(e.target.value);
      applyDocumentLang(e.target.value);
    });

    document.getElementById("form-change-password").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("pwd-err");
      errEl.textContent = "";
      errEl.classList.remove("msg-ok");
      errEl.classList.add("msg-error");
      const cur = document.getElementById("pwd-current").value;
      const pw = document.getElementById("pwd-new").value;
      const pw2 = document.getElementById("pwd-new2").value;
      if (pw !== pw2) {
        errEl.textContent = "Las nuevas contraseñas no coinciden.";
        return;
      }
      try {
        await api.apiChangePassword(cur, pw);
        errEl.classList.remove("msg-error");
        errEl.classList.add("msg-ok");
        errEl.textContent = "Contraseña actualizada.";
        document.getElementById("pwd-current").value = "";
        document.getElementById("pwd-new").value = "";
        document.getElementById("pwd-new2").value = "";
      } catch (ex) {
        errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
      }
    });

  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p></div>`
    );
  }
}

window.addEventListener("hashchange", route);
route();
