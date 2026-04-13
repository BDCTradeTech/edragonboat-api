/**
 * Panel web E-DragonBoat — entrenamientos, regatas, equipos, cuenta.
 */

import { Chart, registerables } from "chart.js";
import { toJpeg } from "html-to-image";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as api from "./api.js";
import { countrySelectOptionsHtml } from "./countries.js";

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

function fmtSessionStartLong(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "long",
      timeStyle: "short",
    });
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
function buildSessionMapSummaryHtml(s, data, last) {
  const km =
    last != null && typeof last.distanceMeters === "number" && Number.isFinite(last.distanceMeters)
      ? (last.distanceMeters / 1000).toFixed(2)
      : null;
  const team = s.teamName ? escapeHtml(s.teamName) : "—";
  const boat = boatTypeLabelEsp(s.boatType);
  const paddlers = s.paddlersCount != null ? escapeHtml(String(s.paddlersCount)) : "—";
  const fechaInicio = escapeHtml(fmtSessionStartLong(s.sessionStartTime));
  const fechaSubida = escapeHtml(fmtDate(data.created_at));
  const distHtml = km != null ? `${escapeHtml(km)} km` : "—";
  return `
    <div class="session-map-summary-grid">
      <div><span class="sms-label">Fecha / inicio</span><span class="sms-val">${fechaInicio}</span></div>
      <div><span class="sms-label">Subida al panel</span><span class="sms-val">${fechaSubida}</span></div>
      <div><span class="sms-label">Equipo</span><span class="sms-val">${team}</span></div>
      <div><span class="sms-label">Bote</span><span class="sms-val">${boat}</span></div>
      <div><span class="sms-label">Palistas</span><span class="sms-val">${paddlers}</span></div>
      <div><span class="sms-label">Distancia</span><span class="sms-val">${distHtml}</span></div>
    </div>
  `;
}

/** Shell con menú lateral (solo autenticado). */
function layout(content, { showNav = true } = {}) {
  const email = api.getEmail();
  const authed = !!api.getToken();

  const nav = showNav
    ? `
    <aside class="nav-rail" aria-label="Menú principal">
      <div class="nav-brand">E-DragonBoat</div>
      <nav class="nav-links">
        <a class="nav-item" href="#/" data-match="sessions">Entrenamientos</a>
        <a class="nav-item" href="#/regatas" data-match="regatas">Regatas</a>
        <a class="nav-item" href="#/teams" data-match="teams">Equipos</a>
        <a class="nav-item" href="#/cuenta" data-match="cuenta">Cuenta</a>
      </nav>
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
        <div class="page-body">${content}</div>
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
  let key = "sessions";
  if (hash[0] === "teams") key = "teams";
  else if (hash[0] === "cuenta") key = "cuenta";
  else if (hash[0] === "regatas") key = "regatas";
  else if (hash[0] === "session") key = "sessions";

  document.querySelectorAll(".nav-item").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-match") === key);
  });
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
  const hash = location.hash.replace(/^#\/?/, "") || "/";
  const parts = hash.split("/").filter(Boolean);

  if (!api.getToken() && parts[0] !== "login") {
    location.hash = "#/login";
    return renderLogin();
  }

  if (api.getToken() && parts[0] === "login") {
    location.hash = "#/";
    return route();
  }

  if (parts[0] === "login") return renderLogin();
  if (parts[0] === "session" && parts[1]) {
    if (!/^\d+$/.test(parts[1])) {
      layout(
        `<div class="card"><p class="msg-error">ID de sesión inválido.</p><p><a class="link" href="#/">Volver</a></p></div>`
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
        `<div class="card"><p class="msg-error">ID de equipo inválido (solo números).</p><p><a class="link" href="#/teams">Volver a equipos</a></p></div>`
      );
      return;
    }
    return renderTeamDetail(parts[1]);
  }
  if (parts[0] === "regatas") return renderRegatas();
  if (parts[0] === "cuenta") return renderAccount();
  return renderSessionsList();
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
        : `<p class="muted">No tenés equipos: se muestran <strong>todos</strong> tus entrenamientos. Creá un equipo en el menú para filtrar por nombre.</p>`;

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

    const tableRows = rows
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
    layout(`
      <div class="card">
        <h2 class="card-title">Entrenamientos libres</h2>
        ${filterBlock}
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Subida</th>
                <th>Equipo (sesión)</th>
                <th>Tiempo</th>
                <th>Dist.</th>
                <th>Paladas</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `);
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

/** Columnas del JSON de cada punto: orden conocido + resto alfabético. */
function dataPointColumnOrder(keys) {
  const preferred = [
    "second",
    "distanceMeters",
    "speedKmh",
    "paladas",
    "spm",
    "latitude",
    "longitude",
    "locationAccuracyM",
  ];
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
  points.forEach((p) => Object.keys(p).forEach((k) => keySet.add(k)));
  const cols = dataPointColumnOrder([...keySet]);
  const th = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
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
  const opts = keys.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");
  return `
    <div class="explore-chart card-inset">
      <h4>Comparar métricas numéricas</h4>
      <p class="muted small">Elegí una o dos series respecto al tiempo (segundo).</p>
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

  const datasets = [
    {
      label: y1Key,
      data: ds1,
      borderColor: "#1565c0",
      backgroundColor: "rgba(21, 101, 192, 0.08)",
      yAxisID: "y1",
      tension: 0.2,
    },
  ];

  const scales = {
    x: { title: { display: true, text: "Segundo" }, ticks: { maxTicksLimit: 14 } },
    y1: {
      position: "left",
      title: { display: true, text: y1Key },
    },
  };

  if (y2Key && y2Key !== y1Key) {
    const ds2 = points.map((p) => (typeof p[y2Key] === "number" ? p[y2Key] : null));
    datasets.push({
      label: y2Key,
      data: ds2,
      borderColor: "#e65100",
      yAxisID: "y2",
      tension: 0.2,
    });
    scales.y2 = {
      position: "right",
      title: { display: true, text: y2Key },
      grid: { drawOnChartArea: false },
    };
  }

  const ch = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "bottom" } },
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
  if (keys.includes("distanceMeters")) y1.value = "distanceMeters";
  else y1.value = keys[0];
  if (y2) {
    const second =
      keys.find((k) => k !== y1.value && (k === "speedKmh" || k === "spm")) ||
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
    plugins: { legend: { display: false } },
    scales: {
      x: { title: { display: true, text: "Segundo" }, ticks: { maxTicksLimit: 12 } },
    },
  };

  const elDist = document.getElementById("chart-dist");
  const elSpeed = document.getElementById("chart-speed");
  const elSpm = document.getElementById("chart-spm");
  const elPal = document.getElementById("chart-pal");
  if (!elDist || !elSpeed || !elSpm || !elPal) return;

  chartInstances.push(
    new Chart(elDist, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Distancia (m)",
            data: dataPoints.map((p) => p.distanceMeters),
            borderColor: "#1565c0",
            backgroundColor: "rgba(21, 101, 192, 0.12)",
            fill: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: "Metros" } },
        },
      },
    })
  );

  chartInstances.push(
    new Chart(elSpeed, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Velocidad km/h",
            data: dataPoints.map((p) => p.speedKmh),
            borderColor: "#e65100",
            tension: 0.2,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: "km/h" } },
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
            tension: 0.2,
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

  chartInstances.push(
    new Chart(elPal, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Paladas",
            data: dataPoints.map((p) => p.paladas),
            borderColor: "#6a1b9a",
            tension: 0.2,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: "Paladas" } },
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
  const map = L.map(el);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  const latlngs = track.map(([a, b]) => L.latLng(a, b));
  const line = L.polyline(latlngs, { color: "#0d47a1", weight: 5, opacity: 0.88 }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 17 });
  el._edbMap = map;
  setTimeout(() => map.invalidateSize(), 200);
}

async function renderSessionDetail(id) {
  layout(`<p class="loading-line">Cargando sesión #${escapeHtml(id)}…</p>`);
  try {
    const data = await api.apiGetSession(id);
    const s = data.session;
    const last =
      s.dataPoints && s.dataPoints.length ? s.dataPoints[s.dataPoints.length - 1] : null;
    const stats = `
      <div class="stats">
        <div class="stat">Inicio<strong>${escapeHtml(s.sessionStartTime || "—")}</strong></div>
        <div class="stat">Tiempo total<strong>${s.totalSeconds != null ? s.totalSeconds + " s" : "—"}</strong></div>
        <div class="stat">Distancia final<strong>${last ? last.distanceMeters.toFixed(0) + " m" : "—"}</strong></div>
        <div class="stat">Paladas<strong>${last ? last.paladas : "—"}</strong></div>
        <div class="stat">Muestras (1 Hz)<strong>${s.dataPoints ? s.dataPoints.length : 0}</strong></div>
      </div>
    `;

    const metaTable = buildSessionMetadataTable(s);
    const pointsTable = buildDynamicDataPointsTable(s.dataPoints);
    const exploreBlock = buildExploreControlsHtml(s.dataPoints);
    const sessionMapSummaryHtml = buildSessionMapSummaryHtml(s, data, last);

    layout(`
      <p><a class="link" href="#/">← Volver a entrenamientos</a></p>
      <div class="card session-card">
        <h2 class="card-title">Sesión #${data.id}</h2>
        <p class="muted">Subida: ${fmtDate(data.created_at)}</p>
        <div class="tabs" id="session-tabs">
          <div class="tab-list" role="tablist">
            <button type="button" class="tab-btn active" data-tab="resumen" role="tab">Resumen</button>
            <button type="button" class="tab-btn" data-tab="tabla" role="tab">Tablas y JSON</button>
            <button type="button" class="tab-btn" data-tab="graficos" role="tab">Gráficos</button>
            <button type="button" class="tab-btn" data-tab="mapas" role="tab">Mapas</button>
            <button type="button" class="tab-btn" data-tab="json" role="tab">JSON completo</button>
          </div>
          <div id="panel-resumen" class="tab-panel active" role="tabpanel">
            ${stats}
            ${s.teamName ? `<p><strong>Equipo (en sesión):</strong> ${escapeHtml(s.teamName)}</p>` : ""}
            ${s.boatType ? `<p><strong>Bote:</strong> ${escapeHtml(s.boatType)}</p>` : ""}
            ${s.paddlersCount != null ? `<p><strong>Cant. palistas:</strong> ${escapeHtml(String(s.paddlersCount))}</p>` : ""}
          </div>
          <div id="panel-tabla" class="tab-panel" role="tabpanel">
            <h3 class="subheading">Campos del entrenamiento (JSON raíz)</h3>
            <div class="table-scroll">${metaTable}</div>
            <h3 class="subheading">Muestras por segundo (todas las claves de cada punto)</h3>
            <div class="table-scroll tall">${pointsTable}</div>
          </div>
          <div id="panel-graficos" class="tab-panel" role="tabpanel">
            <div class="chart-grid">
              <div class="chart-box"><h4>Distancia acumulada</h4><div class="chart-canvas-wrap"><canvas id="chart-dist"></canvas></div></div>
              <div class="chart-box"><h4>Velocidad</h4><div class="chart-canvas-wrap"><canvas id="chart-speed"></canvas></div></div>
              <div class="chart-box"><h4>Ritmo (SPM)</h4><div class="chart-canvas-wrap"><canvas id="chart-spm"></canvas></div></div>
              <div class="chart-box"><h4>Paladas</h4><div class="chart-canvas-wrap"><canvas id="chart-pal"></canvas></div></div>
            </div>
            ${exploreBlock}
          </div>
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
          </div>
          <div id="panel-json" class="tab-panel" role="tabpanel">
            <pre class="json">${escapeHtml(JSON.stringify(data.session, null, 2))}</pre>
          </div>
        </div>
      </div>
    `);

    const tabRoot = document.getElementById("session-tabs");
    const panels = ["resumen", "tabla", "graficos", "mapas", "json"];
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
        document.getElementById(`panel-${p}`).classList.toggle("active", p === name);
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
        a.download = `edragonboat-mapa-sesion-${data.id}.jpg`;
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
      <p><a class="link" href="#/">← Volver</a></p>
      <div class="card"><p class="msg-error">${escapeHtml(ex.message)}</p></div>
    `);
  }
}

async function renderTeamsList() {
  layout(`<p class="loading-line">Cargando equipos…</p>`);
  try {
    const list = await api.apiMyTeams();
    if (!list.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">Equipos</h2>
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
        <h2 class="card-title">Mis equipos</h2>
        <p class="muted">Un usuario solo puede tener <strong>un</strong> equipo. En la ficha del equipo el capitán puede cambiar nombre, país y eliminar el equipo. El plantel y las invitaciones están en <a class="link" href="#/cuenta">Cuenta</a>.</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Nombre</th><th>País</th><th>Tu rol</th></tr>
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
  try {
    existing = await api.apiMyTeams();
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">Volver</a></p></div>`
    );
    return;
  }
  if (existing.length > 0) {
    location.hash = "#/teams";
    route();
    return;
  }

  const countryOpts = countrySelectOptionsHtml("");

  layout(`
    <p><a class="link" href="#/teams">← Equipos</a></p>
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
    const [team, myTeams] = await Promise.all([api.apiGetTeam(teamId), api.apiMyTeams()]);
    const myEntry = myTeams.find((t) => t.team.id === teamId);
    const myRole = myEntry?.role;
    const isCaptain = myRole === "captain";
    const countryOptsEdit = countrySelectOptionsHtml(team.country || "");

    const cuentaHint = `
      <p class="muted">El <strong>plantel</strong> y las <strong>invitaciones</strong> se gestionan en <a class="link" href="#/cuenta">Cuenta</a>.</p>`;

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
      <p><a class="link" href="#/teams">← Mis equipos</a></p>
      <div class="card">
        <h2 class="card-title">${escapeHtml(team.name)}</h2>
        <p class="muted">País: ${escapeHtml(team.country || "—")} · Tu rol: <strong>${roleLabel(myRole || "")}</strong></p>
        ${editBlock}
        ${cuentaHint}
      </div>
    `);

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
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">Volver a equipos</a></p></div>`
    );
  }
}

/** Tabla de plantel en Cuenta (gestión de roles solo si isCaptain). */
function buildAccountPlantelTable(members, isCaptain, teamId) {
  const thead = isCaptain
    ? `<thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Gestión</th></tr></thead>`
    : `<thead><tr><th>Email</th><th>Nombre</th><th>Rol</th></tr></thead>`;
  const rows = members
    .map((m) => {
      if (isCaptain && m.role === "captain") {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          <td>${roleLabel(m.role)}</td>
          <td class="muted">—</td>
        </tr>`;
      }
      if (isCaptain) {
        return `<tr>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.full_name || "—")}</td>
          <td>${roleLabel(m.role)}</td>
          <td class="actions-cell">
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
        <td>${roleLabel(m.role)}</td>
      </tr>`;
    })
    .join("");
  return `<div class="table-scroll"><table>${thead}<tbody>${rows}</tbody></table></div>`;
}

async function renderRegatas() {
  layout(`<p class="loading-line">Cargando regatas…</p>`);
  let rows = [];
  let apiOk = true;
  let apiErr = "";
  try {
    rows = await api.apiListRegatas();
    if (!Array.isArray(rows)) rows = [];
  } catch (ex) {
    apiOk = false;
    apiErr = humanizeApiError(ex.message);
  }
  const rowHtml =
    !apiOk
      ? `<tr><td colspan="4" class="muted">—</td></tr>`
      : rows.length === 0
        ? `<tr><td colspan="4" class="muted">No hay regatas cargadas. Cuando publiquemos datos por API aparecerán aquí.</td></tr>`
        : rows
          .map((r) => {
            if (r && typeof r === "object") {
              const id = r.id != null ? escapeHtml(String(r.id)) : "—";
              const name =
                r.name != null
                  ? escapeHtml(String(r.name))
                  : escapeHtml(JSON.stringify(r));
              const dt = r.date != null ? escapeHtml(String(r.date)) : "—";
              const place = r.place != null ? escapeHtml(String(r.place)) : "—";
              return `<tr><td>${id}</td><td>${name}</td><td>${dt}</td><td>${place}</td></tr>`;
            }
            return `<tr><td colspan="4">${escapeHtml(String(r))}</td></tr>`;
          })
          .join("");
  layout(`
    <div class="card">
      <h2 class="card-title">Regatas</h2>
      <p class="muted">Mismo enfoque que Entrenamientos: listado alimentado por la API. En desarrollo.</p>
      ${
        !apiOk
          ? `<p class="msg-error">No se pudo cargar: ${escapeHtml(apiErr)}. Hace falta desplegar la API con <code>GET /api/v1/regatas</code>.</p>`
          : ""
      }
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>ID</th><th>Nombre</th><th>Fecha</th><th>Lugar</th></tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </div>
  `);
}

async function renderAccount() {
  layout(`<p class="loading-line">Cargando perfil…</p>`);
  try {
    const [me, teams] = await Promise.all([api.apiMe(), api.apiMyTeams()]);
    const withMembers = await Promise.all(
      teams.map(async (entry) => ({
        entry,
        members: await api.apiListMembers(entry.team.id),
      }))
    );

    const plantelBlocks = withMembers
      .map(({ entry, members }) => {
        const tid = entry.team.id;
        const isCaptain = entry.role === "captain";
        const inviteForm = isCaptain
          ? `
        <details class="disclosure-card" style="margin-top:0.75rem">
          <summary class="disclosure-summary">
            <span>Invitar al equipo</span>
            <span class="disclosure-chev" aria-hidden="true"></span>
          </summary>
          <div class="disclosure-body">
            <p class="muted small">Podés invitar por email aunque no tengan cuenta: se crea el usuario con contraseña <strong>12345678</strong> (que deberían cambiar en Cuenta). Si el servidor tiene SMTP, reciben un correo con el acceso.</p>
            <form id="form-invite-${tid}">
              <label for="inv-name-${tid}">Nombre (opcional)</label>
              <input id="inv-name-${tid}" type="text" maxlength="200" autocomplete="name" />
              <label for="inv-email-${tid}">Email</label>
              <input id="inv-email-${tid}" type="email" required autocomplete="email" />
              <label for="inv-role-${tid}">Rol</label>
              <select id="inv-role-${tid}">
                <option value="coach">Entrenador</option>
                <option value="paddler" selected>Palista</option>
              </select>
              <button type="submit">Invitar</button>
              <p id="inv-err-${tid}" class="msg-error"></p>
            </form>
          </div>
        </details>`
          : `<p class="muted small">Solo el <strong>capitán</strong> puede invitar o gestionar roles del plantel.</p>`;

        return `
      <div class="card" style="margin-top:1rem">
        <h3 style="margin-top:0">Plantel — ${escapeHtml(entry.team.name)}</h3>
        <p class="muted small">Tu rol: <strong>${roleLabel(entry.role)}</strong></p>
        ${buildAccountPlantelTable(members, isCaptain, tid)}
        ${inviteForm}
      </div>`;
      })
      .join("");

    const noTeamMsg =
      teams.length === 0
        ? `<div class="card" style="margin-top:1rem"><p class="muted">No tenés equipo. Podés crear uno en <a class="link" href="#/teams/new">Equipos</a>.</p></div>`
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
      ${noTeamMsg}
      ${plantelBlocks}
    `);

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

    withMembers.forEach(({ entry }) => {
      const tid = entry.team.id;
      if (entry.role !== "captain") return;
      const form = document.getElementById(`form-invite-${tid}`);
      if (!form) return;
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = document.getElementById(`inv-err-${tid}`);
        errEl.textContent = "";
        errEl.classList.remove("msg-ok");
        errEl.classList.add("msg-error");
        try {
          const result = await api.apiAddMember(
            tid,
            document.getElementById(`inv-email-${tid}`).value.trim(),
            document.getElementById(`inv-role-${tid}`).value,
            document.getElementById(`inv-name-${tid}`)?.value || ""
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
          document.getElementById(`inv-email-${tid}`).value = "";
          const nameIn = document.getElementById(`inv-name-${tid}`);
          if (nameIn) nameIn.value = "";
        } catch (ex) {
          errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
        }
      });
    });

    withMembers.forEach(({ entry }) => {
      const tid = entry.team.id;
      if (entry.role !== "captain") return;
      document.querySelectorAll(`.role-select-acc[data-team="${tid}"]`).forEach((sel) => {
        sel.addEventListener("change", async () => {
          const uid = Number(sel.getAttribute("data-user"));
          try {
            await api.apiPatchMemberRole(tid, uid, sel.value);
            location.hash = "#/cuenta";
            route();
          } catch (ex) {
            alert(ex.message || "Error al cambiar rol");
          }
        });
      });
      document.querySelectorAll(`.btn-remove-acc[data-team="${tid}"]`).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const uid = Number(btn.getAttribute("data-user"));
          if (!confirm("¿Quitar a esta persona del equipo?")) return;
          try {
            await api.apiRemoveMember(tid, uid);
            location.hash = "#/cuenta";
            route();
          } catch (ex) {
            alert(ex.message || "Error");
          }
        });
      });
    });
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p></div>`
    );
  }
}

window.addEventListener("hashchange", route);
route();
