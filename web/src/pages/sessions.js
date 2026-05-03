/**
 * Página: Lista de sesiones y detalle de sesión.
 */

import { Chart } from "chart.js";
import { toJpeg } from "html-to-image";
import L from "leaflet";
import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { getUiLocale } from "../locale.js";
import {
  humanizeApiError,
  fmtDate,
  fmtSessionStartMap,
  localDateKeyFromIso,
  fmtDateDdMmYyFromYmdKey,
  formatIntEsThousands,
  labelCompBoat,
  formatCellVal,
  safeMapJpgTeamSegment,
  buildSessionMapJpegFileName,
} from "../utils/format.js";
import { route } from "../router.js";

const SESSION_TEAM_FILTER_KEY = "edb_team_sessions_filter";

/** @type {Chart[]} */
let _chartInstances = [];

export function destroySessionCharts() {
  _chartInstances.forEach((c) => c.destroy());
  _chartInstances = [];
}

const HIDDEN_DATA_POINT_KEYS = new Set(["latitude", "longitude", "locationAccuracyM"]);

// ─── Helpers de mapa/GPS ──────────────────────────────────────────────────────

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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function latLonAtFractionAlongPolyline(pts, fraction) {
  if (!pts || pts.length === 0) return null;
  if (pts.length === 1) return pts[0];
  const fr = Math.max(0, Math.min(1, fraction));
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    lens.push(haversineMeters(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  const total = lens.reduce((a, b) => a + b, 0);
  if (total < 0.05) return pts[Math.floor(pts.length / 2)];
  let target = total * fr;
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i];
    if (target <= len + 1e-6) {
      const tFrac = len > 1e-6 ? target / len : 0;
      const p0 = pts[i];
      const p1 = pts[i + 1];
      return [p0[0] + tFrac * (p1[0] - p0[0]), p0[1] + tFrac * (p1[1] - p0[1])];
    }
    target -= len;
  }
  return pts[pts.length - 1];
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingAtFractionAlongPolyline(pts, fraction) {
  const eps = 0.035;
  const a = latLonAtFractionAlongPolyline(pts, Math.max(0, fraction - eps));
  const b = latLonAtFractionAlongPolyline(pts, Math.min(1, fraction + eps));
  if (!a || !b) return 0;
  let br = bearingDeg(a[0], a[1], b[0], b[1]);
  if (!Number.isFinite(br)) return 0;
  if (haversineMeters(a[0], a[1], b[0], b[1]) < 0.4) {
    const b2 = latLonAtFractionAlongPolyline(pts, Math.min(1, fraction + 0.12));
    if (b2) br = bearingDeg(a[0], a[1], b2[0], b2[1]);
  }
  return br;
}

function leafletRouteIndexIcon(num, strokeColor, bearingDegVal) {
  const n = Number.isFinite(Number(num)) ? String(Math.floor(Number(num))) : "1";
  const safeColor = String(strokeColor).replace(/[<>"']/g, "");
  const b = Number.isFinite(Number(bearingDegVal)) ? Number(bearingDegVal) : 0;
  const rot = b - 90;
  const titleText = `Tramo ${n} — sentido del recorrido en el punto medio`;
  return L.divIcon({
    className: "map-route-index-marker",
    html: `<div class="map-route-index-stack" title="${escapeHtml(titleText)}">
  <span class="map-route-index-arrow" style="color:${safeColor};transform:rotate(${rot}deg)" aria-hidden="true">→</span>
  <span class="map-route-index-disc" style="border-color:${safeColor};color:${safeColor}">${escapeHtml(n)}</span>
</div>`,
    iconSize: [24, 34],
    iconAnchor: [12, 17],
  });
}

function waitForTiles(map) {
  return new Promise((resolve) => {
    if (!map._loading) return resolve();
    map.once("load", resolve);
    setTimeout(resolve, 2000);
  });
}

function hslGradientTrackColors(n) {
  if (n <= 0) return [];
  const h0 = 215, h1 = 12, out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const h = Math.round(h0 + (h1 - h0) * t);
    out.push(`hsl(${h}, 88%, 42%)`);
  }
  return out;
}

function sessionSortTimeMs(sess) {
  const raw = sess.sessionStartTime || sess.created_at || "";
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function initMultiSessionDayMap(loaded, mapHostEl) {
  if (mapHostEl._edbMap) { mapHostEl._edbMap.remove(); mapHostEl._edbMap = null; }
  mapHostEl.innerHTML = "";
  mapHostEl.classList.remove("session-map-empty");
  const layers = [];
  for (const item of loaded) {
    const pts = extractTrackLatLng(item.dataPoints);
    if (pts.length > 0) layers.push({ pts });
  }
  if (layers.length === 0) {
    mapHostEl.innerHTML = `<p class="muted" style="padding:1rem">${escapeHtml(t("sessions.mapNoGpsDay"))}</p>`;
    mapHostEl.classList.add("session-map-empty");
    return;
  }
  const colors = hslGradientTrackColors(layers.length);
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 });
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri — Earthstar Geographics, Maxar", maxZoom: 19 });
  const map = L.map(mapHostEl, { layers: [osm] });
  L.control.layers({ [t("sessionDetail.mapLayerMap")]: osm, [t("sessionDetail.mapLayerSatellite")]: satellite }, {}, { position: "topright" }).addTo(map);
  let groupBounds = null;
  for (let i = 0; i < layers.length; i++) {
    const { pts } = layers[i];
    const color = colors[i];
    const latlngs = pts.map(([a, b]) => L.latLng(a, b));
    const line = L.polyline(latlngs, { color, weight: 5, opacity: 0.9 }).addTo(map);
    const lb = line.getBounds();
    groupBounds = groupBounds == null ? lb : groupBounds.extend(lb);
    const mid = latLonAtFractionAlongPolyline(pts, 0.5);
    if (mid) {
      const br = bearingAtFractionAlongPolyline(pts, 0.5);
      L.marker(mid, { icon: leafletRouteIndexIcon(i + 1, color, br), zIndexOffset: 1800 }).addTo(map);
    }
  }
  if (groupBounds) map.fitBounds(groupBounds, { padding: [48, 48], maxZoom: 17 });
  mapHostEl._edbMap = map;
  const resizeObserver = new ResizeObserver(() => map.invalidateSize());
  resizeObserver.observe(mapHostEl);
  mapHostEl._edbMapObserver = resizeObserver;
}

function closeDayModal() {
  const overlay = document.getElementById("day-modal-overlay");
  if (overlay) {
    const mapEl = document.getElementById("modal-map");
    if (mapEl && mapEl._edbMap) { mapEl._edbMap.remove(); mapEl._edbMap = null; }
    overlay.remove();
  }
}

export async function openDayModal(clickedSession, allSessions) {
  closeDayModal();
  const clickedDayKey = localDateKeyFromIso(clickedSession.created_at);
  const clickedTeamId = clickedSession.team_id;
  const daySessions = allSessions.filter(
    (s) => localDateKeyFromIso(s.created_at) === clickedDayKey &&
      (clickedTeamId == null || s.team_id == null || s.team_id === clickedTeamId)
  );
  const totalDistKm = daySessions.reduce((sum, s) => sum + (s.distance_meters != null ? s.distance_meters : 0), 0) / 1000;
  const avgPaddlers = daySessions.length
    ? Math.round(daySessions.reduce((sum, s) => sum + (s.paddlers_count != null ? s.paddlers_count : 0), 0) / daySessions.length)
    : 0;
  const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const dayDate = new Date(clickedSession.created_at);
  const dayLabel = `${dayDate.getDate()} de ${MONTH_NAMES[dayDate.getMonth()]} ${dayDate.getFullYear()}`;
  const teamLabel = escapeHtml(clickedSession.team_name || "");
  const statCardStyle = "background:#f8fafc;border-radius:10px;border:0.5px solid #e2e8f0;padding:14px 16px;text-align:center";
  const overlay = document.createElement("div");
  overlay.id = "day-modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px";
  overlay.innerHTML = `
    <div id="day-modal" style="background:#fff;border-radius:16px;width:100%;max-width:860px;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column">
      <div style="padding:20px 24px 0;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <div style="font-size:17px;font-weight:700;color:#1e293b">Resumen del día</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px">${escapeHtml(dayLabel)}${teamLabel ? " · " + teamLabel : ""}</div>
        </div>
        <button id="modal-close-btn" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:0 4px">×</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 24px 0">
        <div style="${statCardStyle}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Sesiones</div><div style="font-size:22px;font-weight:700;color:#185fa5">${daySessions.length}</div></div>
        <div style="${statCardStyle}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Distancia total</div><div style="font-size:22px;font-weight:700;color:#185fa5">${totalDistKm.toFixed(2)} km</div></div>
        <div style="${statCardStyle}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Palistas prom.</div><div style="font-size:22px;font-weight:700;color:#185fa5">${avgPaddlers || "—"}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 24px">
        <div>
          <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:8px">Recorridos</div>
          <div id="modal-map" style="height:220px;border-radius:10px;overflow:hidden;border:0.5px solid #e2e8f0"></div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:8px">Sesiones del día</div>
          <div id="modal-sessions-list" style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto"></div>
        </div>
      </div>
      <div style="padding:12px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:0.5px solid #e2e8f0;margin-top:4px">
        <button id="modal-download-btn" style="padding:7px 16px;font-size:13px;border-radius:8px;border:0.5px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer">Descargar JPG</button>
        <button id="modal-close-btn2" style="padding:7px 16px;font-size:13px;border-radius:8px;border:none;background:#185fa5;color:#fff;cursor:pointer">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDayModal(); });
  document.getElementById("modal-close-btn").addEventListener("click", closeDayModal);
  document.getElementById("modal-close-btn2").addEventListener("click", closeDayModal);

  const listEl = document.getElementById("modal-sessions-list");
  if (listEl) {
    listEl.innerHTML = daySessions.map((s) => {
      const hora = s.created_at ? new Date(s.created_at).toLocaleTimeString(getUiLocale(), { hour: "2-digit", minute: "2-digit" }) : "—";
      const dist = s.distance_meters != null ? `${(s.distance_meters / 1000).toFixed(2)} km` : "—";
      const dur = s.total_seconds != null ? `${s.total_seconds} s` : "—";
      return `<div style="background:#f8fafc;border-radius:8px;border:0.5px solid #e2e8f0;padding:10px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:13px;font-weight:600;color:#1e293b">${escapeHtml(hora)}</span>
          <a href="#/session/${s.id}" id="modal-detail-link-${s.id}" style="color:#185fa5;font-size:12px;text-decoration:none">Ver detalle →</a>
        </div>
        <div style="font-size:12px;color:#64748b;display:flex;gap:12px">
          <span>Dist: ${escapeHtml(dist)}</span>
          <span>Dur: ${escapeHtml(dur)}</span>
        </div>
      </div>`;
    }).join("");
    daySessions.forEach((s) => {
      document.getElementById(`modal-detail-link-${s.id}`)?.addEventListener("click", closeDayModal);
    });
  }

  const mapEl = document.getElementById("modal-map");
  if (mapEl) {
    try {
      const fetched = await Promise.all(daySessions.map((s) => api.apiGetSession(s.id)));
      const loaded = fetched.map((d) => ({ session: d.session, dataPoints: d.session.dataPoints || [] }));
      loaded.sort((a, b) => sessionSortTimeMs(a.session) - sessionSortTimeMs(b.session));
      const hasGps = loaded.some((l) => extractTrackLatLng(l.dataPoints).length > 0);
      if (!hasGps) {
        mapEl.innerHTML = `<p style="color:#94a3b8;font-size:13px;padding:16px">Sin datos de recorrido</p>`;
      } else {
        initMultiSessionDayMap(loaded, mapEl);
      }
    } catch {
      mapEl.innerHTML = `<p style="color:#94a3b8;font-size:13px;padding:16px">Sin datos de recorrido</p>`;
    }
  }

  document.getElementById("modal-download-btn")?.addEventListener("click", async () => {
    const modalEl = document.getElementById("day-modal");
    if (!modalEl) return;
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const mapWrap = modalEl.querySelector("[id*='map']");
    if (mapWrap?._edbMap) await waitForTiles(mapWrap._edbMap);
    try {
      const pixelRatio = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
      const dataUrl = await toJpeg(modalEl, { quality: 0.92, pixelRatio, cacheBust: true, backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${safeMapJpgTeamSegment(clickedSession.team_name || "")}-${fmtDateDdMmYyFromYmdKey(clickedDayKey)}.jpg`;
      a.click();
    } catch (e) {
      console.error(e);
      alert(t("sessions.jpgExportError"));
    }
  });
}

// ─── Lista de sesiones ────────────────────────────────────────────────────────

export async function renderSessionsList(layout) {
  layout(`<p class="loading-line">${escapeHtml(t("sessions.loading"))}</p>`);
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
    const currentTeamName = teams.find((x) => String(x.team.id) === teamFilter)?.team?.name || "";
    const teamSelectOptions = teams.map((x) => `<option value="${x.team.id}" ${String(x.team.id) === teamFilter ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`).join("");

    const MONTH_NAMES_FILTER = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    function buildSelectOpts(values, labelFn, allLabel) {
      const allOpt = `<option value="">${escapeHtml(allLabel)}</option>`;
      return allOpt + values.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(labelFn(v))}</option>`).join("");
    }
    const selectStyle = "padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;background:#fff;cursor:pointer;width:auto";
    const allYears = [...new Set(rows.map((r) => new Date(r.created_at).getFullYear()))].sort((a, b) => b - a);
    const filterRowHtml = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      ${teams.length >= 1 ? `<select id="sel-session-team" style="${selectStyle};min-width:130px">${teamSelectOptions}</select><div style="width:1px;height:24px;background:#e2e8f0;align-self:center"></div>` : ""}
      <select id="filter-year" style="${selectStyle};min-width:130px">${buildSelectOpts(allYears, (y) => String(y), "Todos los años")}</select>
      <select id="filter-month" style="${selectStyle};min-width:130px"><option value="">Todos los meses</option></select>
      <select id="filter-day" style="${selectStyle};min-width:130px"><option value="">Todos los días</option></select>
    </div>`;

    if (!rows.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">${escapeHtml(t("sessions.title"))}</h2>
          ${teams.length >= 1 ? filterRowHtml : `<p class="muted">${t("sessions.noTeamHintHtml")}</p>`}
          <p>${escapeHtml(t("sessions.empty"))}</p>
          <p class="muted">${teams.length >= 1 ? t("sessions.emptyHintWithTeamHtml", { teamName: escapeHtml(currentTeamName) }) : escapeHtml(t("sessions.emptyHintNoTeam"))}</p>
        </div>
      `);
      document.getElementById("sel-session-team")?.addEventListener("change", (e) => {
        if (e.target?.value) { sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, e.target.value); route(); }
      });
      return;
    }

    layout(`
      <div class="card">
        <h2 class="card-title">${escapeHtml(t("sessions.title"))}</h2>
        ${filterRowHtml}
        <div id="sessions-summary" style="font-size:12px;color:#94a3b8;margin-bottom:8px"></div>
        <div class="table-scroll free">
          <table>
            <thead><tr><th>#</th><th>Equipo</th><th>Fecha</th><th>Palistas</th><th>Distancia</th><th>Duración</th><th></th></tr></thead>
            <tbody id="sessions-tbody"></tbody>
          </table>
        </div>
      </div>
    `, { wide: true });

    function getFilteredRows() {
      const yr = document.getElementById("filter-year")?.value || "";
      const mo = document.getElementById("filter-month")?.value || "";
      const dy = document.getElementById("filter-day")?.value || "";
      return rows.filter((r) => {
        const d = new Date(r.created_at);
        if (yr && d.getFullYear() !== Number(yr)) return false;
        if (mo && d.getMonth() !== Number(mo)) return false;
        if (dy && d.getDate() !== Number(dy)) return false;
        return true;
      });
    }
    function rebuildMonthSelect(yearVal) {
      const moSel = document.getElementById("filter-month");
      if (!moSel) return;
      const filtered = yearVal ? rows.filter((r) => new Date(r.created_at).getFullYear() === Number(yearVal)) : rows;
      const months = [...new Set(filtered.map((r) => new Date(r.created_at).getMonth()))].sort((a, b) => a - b);
      moSel.innerHTML = buildSelectOpts(months, (m) => MONTH_NAMES_FILTER[m], "Todos los meses");
      moSel.value = "";
    }
    function rebuildDaySelect(yearVal, monthVal) {
      const dySel = document.getElementById("filter-day");
      if (!dySel) return;
      const filtered = rows.filter((r) => {
        const d = new Date(r.created_at);
        if (yearVal && d.getFullYear() !== Number(yearVal)) return false;
        if (monthVal !== "" && d.getMonth() !== Number(monthVal)) return false;
        return true;
      });
      const days = [...new Set(filtered.map((r) => new Date(r.created_at).getDate()))].sort((a, b) => a - b);
      dySel.innerHTML = buildSelectOpts(days, (d) => String(d), "Todos los días");
      dySel.value = "";
    }
    function updateSummary(filtered) {
      const summaryEl = document.getElementById("sessions-summary");
      if (!summaryEl) return;
      const yr = document.getElementById("filter-year")?.value || "";
      const mo = document.getElementById("filter-month")?.value || "";
      const dy = document.getElementById("filter-day")?.value || "";
      let periodo = "";
      if (yr && mo !== "" && dy) periodo = `${dy} de ${MONTH_NAMES_FILTER[Number(mo)]} ${yr}`;
      else if (yr && mo !== "") periodo = `${MONTH_NAMES_FILTER[Number(mo)]} ${yr}`;
      else if (yr) periodo = yr;
      else periodo = "todos los períodos";
      summaryEl.textContent = `Mostrando ${filtered.length} sesiones · ${periodo}`;
    }
    function applyFilters() {
      const filtered = getFilteredRows();
      updateSummary(filtered);
      const tbody = document.getElementById("sessions-tbody");
      if (!tbody) return;
      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">Sin sesiones para el período seleccionado</td></tr>`;
        return;
      }
      const em = escapeHtml(t("account.emptyDash"));
      tbody.innerHTML = filtered
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((s) => {
          const initial = (s.team_name || "?")[0].toUpperCase();
          const dist = s.distance_meters != null ? `${Math.round(s.distance_meters)} m` : em;
          const dur = s.total_seconds != null ? `${Math.floor(s.total_seconds / 60)}:${String(s.total_seconds % 60).padStart(2, "0")}` : em;
          return `<tr>
            <td><span style="color:#94a3b8;font-size:12px">#${s.id}</span></td>
            <td><span class="team-avatar">${escapeHtml(initial)}</span>${escapeHtml(s.team_name || "—")}</td>
            <td>${escapeHtml(fmtDate(s.created_at))}</td>
            <td>${s.paddlers_count != null ? s.paddlers_count : em}</td>
            <td>${escapeHtml(dist)}</td>
            <td>${escapeHtml(dur)}</td>
            <td><button class="btn btn-ver" data-id="${s.id}" style="padding:4px 10px;font-size:12px;background:#f1f5f9;color:#185fa5;border:0.5px solid #e2e8f0">Ver</button></td>
          </tr>`;
        }).join("");
      tbody.querySelectorAll(".btn-ver").forEach((btn) => {
        btn.addEventListener("click", () => { location.hash = `#/session/${btn.dataset.id}`; });
      });
    }

    rebuildMonthSelect("");
    rebuildDaySelect("", "");
    applyFilters();
    document.getElementById("filter-year")?.addEventListener("change", (e) => { rebuildMonthSelect(e.target.value); rebuildDaySelect(e.target.value, ""); applyFilters(); });
    document.getElementById("filter-month")?.addEventListener("change", (e) => { rebuildDaySelect(document.getElementById("filter-year")?.value || "", e.target.value); applyFilters(); });
    document.getElementById("filter-day")?.addEventListener("change", applyFilters);
    document.getElementById("sel-session-team")?.addEventListener("change", (e) => {
      if (e.target?.value) { sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, e.target.value); route(); }
    });
  } catch (ex) {
    layout(`
      <div class="card">
        <p class="msg-error">${escapeHtml(t("sessions.errorLoad", { detail: humanizeApiError(ex.message) }))}</p>
        <button type="button" id="btn-retry">${escapeHtml(t("sessions.retry"))}</button>
      </div>
    `);
    document.getElementById("btn-retry").addEventListener("click", route);
  }
}

// ─── Detalle de sesión ────────────────────────────────────────────────────────

function metricLabelForKey(key) {
  const tr = t(`sessionDetail.metrics.${key}`);
  if (tr === `sessionDetail.metrics.${key}`) return key;
  return tr;
}

function dataPointColumnOrder(keys) {
  const preferred = ["second", "distanceMeters", "speedKmh", "paladas", "spm", "dpsMeters", "strokePeakAccelerationMs2"];
  const rest = keys.filter((k) => !preferred.includes(k)).sort();
  return preferred.filter((k) => keys.includes(k)).concat(rest);
}

function buildSessionMetadataTable(session) {
  const skip = new Set(["dataPoints", "strokePeakAccelerationsMs2"]);
  const rows = Object.keys(session).filter((k) => !skip.has(k)).map((k) => {
    const v = session[k];
    let cell;
    if (v === null || v === undefined) cell = "—";
    else if (typeof v === "object") cell = escapeHtml(JSON.stringify(v));
    else cell = escapeHtml(String(v));
    return `<tr><th scope="row">${escapeHtml(k)}</th><td>${cell}</td></tr>`;
  }).join("");
  if (!rows) return `<p class="muted">${escapeHtml(t("sessionDetail.noMetadata"))}</p>`;
  return `<table class="meta-table"><tbody>${rows}</tbody></table>`;
}

function buildDynamicDataPointsTable(points) {
  if (!points || !points.length) return `<p class="muted">${escapeHtml(t("sessionDetail.noSamples"))}</p>`;
  const keySet = new Set();
  points.forEach((p) => Object.keys(p).forEach((k) => { if (!HIDDEN_DATA_POINT_KEYS.has(k)) keySet.add(k); }));
  const cols = dataPointColumnOrder([...keySet]);
  const th = cols.map((c) => `<th>${escapeHtml(metricLabelForKey(c))}</th>`).join("");
  const body = points.map((p) => `<tr>${cols.map((c) => `<td>${formatCellVal(p[c])}</td>`).join("")}</tr>`).join("");
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
  if (points.length >= 2 && points.some((p) => typeof p.paladas === "number")) keys.add("dpsMeters");
  const preferred = ["distanceMeters", "speedKmh", "spm", "dpsMeters", "paladas", "strokePeakAccelerationMs2"];
  const rest = [...keys].filter((k) => !preferred.includes(k)).sort();
  return preferred.filter((k) => keys.has(k)).concat(rest);
}

function buildExploreControlsHtml(points) {
  const keys = numericKeysFromPoints(points);
  if (keys.length === 0) return "";
  const opts = keys.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(metricLabelForKey(k))}</option>`).join("");
  return `
    <div class="explore-chart card-inset">
      <h4>${escapeHtml(t("sessionDetail.exploreTitle"))}</h4>
      <p class="muted small">${t("sessionDetail.exploreHint")}</p>
      <div class="explore-controls">
        <label>${escapeHtml(t("sessionDetail.exploreYLeft"))}<select id="explore-y1">${opts}</select></label>
        <label>${escapeHtml(t("sessionDetail.exploreYRight1"))}<select id="explore-y2"><option value="">${escapeHtml(t("sessionDetail.exploreNone"))}</option>${opts}</select></label>
        <label>${escapeHtml(t("sessionDetail.exploreYRight2"))}<select id="explore-y3"><option value="">${escapeHtml(t("sessionDetail.exploreNone"))}</option>${opts}</select></label>
        <button type="button" class="secondary btn-sm" id="btn-explore-apply">${escapeHtml(t("sessionDetail.exploreUpdate"))}</button>
      </div>
      <div class="chart-canvas-wrap explore-wrap"><canvas id="chart-explore"></canvas></div>
    </div>`;
}

function dpsSeriesFallbackFromPoints(points) {
  if (!points?.length) return [];
  let lastFilled = 0;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0) { out.push(0); continue; }
    const dp = points[i].paladas - points[i - 1].paladas;
    const dd = points[i].distanceMeters - points[i - 1].distanceMeters;
    if (dp > 0 && typeof dd === "number" && Number.isFinite(dd)) lastFilled = Math.max(0, dd / dp);
    out.push(lastFilled);
  }
  return out;
}

function buildDpsSeriesForChart(points) {
  const fallback = dpsSeriesFallbackFromPoints(points);
  return points.map((p, i) => {
    if (typeof p.dpsMeters === "number" && Number.isFinite(p.dpsMeters)) return p.dpsMeters;
    return fallback[i] ?? 0;
  });
}

function destroyExploreChart() {
  _chartInstances = _chartInstances.filter((c) => {
    if (c._edbExplore) { c.destroy(); return false; }
    return true;
  });
}

function renderExploreChart(points) {
  const y1Key = document.getElementById("explore-y1")?.value;
  const y2Sel = document.getElementById("explore-y2");
  const y3Sel = document.getElementById("explore-y3");
  const y2Key = y2Sel?.value || "";
  const y3Key = y3Sel?.value || "";
  const canvas = document.getElementById("chart-explore");
  if (!canvas || !y1Key || !points?.length) return;
  destroyExploreChart();
  const labels = points.map((p) => p.second);
  const lineDataset = { borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0.2 };
  const dpsSeries = buildDpsSeriesForChart(points);
  const valAt = (p, key, i) => {
    if (key === "dpsMeters") { const v = dpsSeries[i]; return typeof v === "number" && Number.isFinite(v) ? v : null; }
    return typeof p[key] === "number" ? p[key] : null;
  };
  const hasDistance = points.some((p) => typeof p.distanceMeters === "number" && Number.isFinite(p.distanceMeters));
  function exploreDataset(key, yAxisId, borderColor, fillRgba) {
    const data = points.map((p, i) => valAt(p, key, i));
    const isForce = key === "strokePeakAccelerationMs2";
    if (isForce) return { type: "bar", label: metricLabelForKey(key), data, yAxisID: yAxisId, xAxisID: "x", backgroundColor: "rgba(94, 53, 177, 0.72)", borderColor: "rgba(62, 39, 120, 0.95)", borderWidth: 0, borderRadius: 2, maxBarThickness: 14, order: 0 };
    return { type: "line", label: metricLabelForKey(key), data, borderColor, backgroundColor: fillRgba, yAxisID: yAxisId, xAxisID: "x", order: 1, ...lineDataset };
  }
  const datasets = [exploreDataset(y1Key, "y1", "#1565c0", "rgba(21, 101, 192, 0.08)")];
  const scales = {
    x: { title: { display: true, text: t("sessionDetail.metrics.second") }, ticks: { maxTicksLimit: 14 } },
    y1: { position: "left", title: { display: true, text: metricLabelForKey(y1Key) }, ...(y1Key === "strokePeakAccelerationMs2" ? { beginAtZero: true } : {}) },
  };
  if (hasDistance) {
    scales.x1 = { type: "category", position: "top", display: true, grid: { drawOnChartArea: false }, title: { display: true, text: t("sessionDetail.metrics.distanceMeters") }, ticks: { maxTicksLimit: 14, callback(tickValue) { const p = points[tickValue]; if (!p || p.distanceMeters == null || !Number.isFinite(p.distanceMeters)) return ""; return String(Math.round(p.distanceMeters)); } } };
  }
  if (y2Key && y2Key !== y1Key) {
    datasets.push(exploreDataset(y2Key, "y2", "#e65100", "rgba(230, 81, 0, 0.06)"));
    scales.y2 = { position: "right", title: { display: true, text: metricLabelForKey(y2Key) }, grid: { drawOnChartArea: false }, ...(y2Key === "strokePeakAccelerationMs2" ? { beginAtZero: true } : {}) };
  }
  if (y3Key && y3Key !== y1Key && y3Key !== y2Key) {
    datasets.push(exploreDataset(y3Key, "y3", "#5e35b1", "rgba(94, 53, 177, 0.06)"));
    scales.y3 = { position: "right", title: { display: true, text: metricLabelForKey(y3Key) }, grid: { drawOnChartArea: false }, offset: true, ...(y3Key === "strokePeakAccelerationMs2" ? { beginAtZero: true } : {}) };
  }
  const anyBar = datasets.some((d) => d.type === "bar");
  const allBar = datasets.length > 0 && datasets.every((d) => d.type === "bar");
  const rootChartType = allBar ? "bar" : "line";
  const ch = new Chart(canvas, {
    type: rootChartType,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 12 } } },
      elements: { point: { radius: 0, hoverRadius: 0 } },
      ...(anyBar ? { datasets: { bar: { borderSkipped: false } } } : {}),
      scales,
    },
  });
  ch._edbExplore = true;
  _chartInstances.push(ch);
}

function wireExploreChart(points) {
  const y1 = document.getElementById("explore-y1");
  const y2 = document.getElementById("explore-y2");
  const y3 = document.getElementById("explore-y3");
  const keys = numericKeysFromPoints(points);
  if (!y1 || !keys.length) return;
  if (keys.includes("speedKmh")) y1.value = "speedKmh"; else y1.value = keys[0];
  if (y2) { const second = keys.find((k) => k !== y1.value && k === "spm") || keys.find((k) => k !== y1.value); y2.value = second || ""; }
  if (y3) { const used = new Set([y1.value, y2?.value || ""].filter(Boolean)); const third = keys.find((k) => !used.has(k) && k === "strokePeakAccelerationMs2") || keys.find((k) => !used.has(k)); y3.value = third || ""; }
  const apply = () => renderExploreChart(points);
  document.getElementById("btn-explore-apply")?.addEventListener("click", apply);
  y1.addEventListener("change", apply);
  y2?.addEventListener("change", apply);
  y3?.addEventListener("change", apply);
  apply();
}

function initSessionCharts(dataPoints) {
  destroySessionCharts();
  if (!dataPoints || !dataPoints.length) return;
  const labels = dataPoints.map((p) => p.second);
  const common = { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false } }, elements: { point: { radius: 0, hoverRadius: 0 } }, scales: { x: { title: { display: true, text: t("sessionDetail.metrics.second") }, ticks: { maxTicksLimit: 12 } } } };
  const lineDs = { borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0.2 };
  const elSpeed = document.getElementById("chart-speed");
  const elSpm = document.getElementById("chart-spm");
  const elDps = document.getElementById("chart-dps");
  const elForce = document.getElementById("chart-stroke-force");
  if (!elSpeed || !elSpm || !elDps || !elForce) return;
  const dpsSeries = buildDpsSeriesForChart(dataPoints);
  _chartInstances.push(new Chart(elSpeed, { type: "line", data: { labels, datasets: [{ label: metricLabelForKey("speedKmh"), data: dataPoints.map((p) => p.speedKmh), borderColor: "#1565c0", ...lineDs }] }, options: { ...common, scales: { ...common.scales, y: { title: { display: true, text: metricLabelForKey("speedKmh") } } } } }));
  _chartInstances.push(new Chart(elSpm, { type: "line", data: { labels, datasets: [{ label: metricLabelForKey("spm"), data: dataPoints.map((p) => p.spm), borderColor: "#e65100", ...lineDs }] }, options: { ...common, scales: { ...common.scales, y: { title: { display: true, text: metricLabelForKey("spm") } } } } }));
  _chartInstances.push(new Chart(elDps, { type: "line", data: { labels, datasets: [{ label: metricLabelForKey("dpsMeters"), data: dpsSeries, borderColor: "#00897b", ...lineDs }] }, options: { ...common, scales: { ...common.scales, y: { title: { display: true, text: metricLabelForKey("dpsMeters") } } } } }));
  _chartInstances.push(new Chart(elForce, { type: "bar", data: { labels, datasets: [{ label: metricLabelForKey("strokePeakAccelerationMs2"), data: dataPoints.map((p) => typeof p.strokePeakAccelerationMs2 === "number" && Number.isFinite(p.strokePeakAccelerationMs2) ? p.strokePeakAccelerationMs2 : null), backgroundColor: "rgba(94, 53, 177, 0.75)", borderColor: "rgba(62, 39, 120, 0.95)", borderWidth: 0, borderRadius: 2, maxBarThickness: 14 }] }, options: { ...common, datasets: { bar: { borderSkipped: false } }, scales: { ...common.scales, y: { beginAtZero: true, title: { display: true, text: t("common.unitMPerS2") } } } } }));
}

function initSessionMap(points) {
  const el = document.getElementById("session-map");
  if (!el) return;
  const track = extractTrackLatLng(points);
  if (track.length === 0) {
    el.innerHTML = `<p class="muted" style="padding:1rem">${escapeHtml(t("sessionDetail.mapNoGps"))}</p>`;
    el.classList.add("session-map-empty");
    return;
  }
  el.classList.remove("session-map-empty");
  if (el._edbMap) { el._edbMap.remove(); el._edbMap = null; }
  el.innerHTML = "";
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 });
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri — Earthstar Geographics, Maxar", maxZoom: 19 });
  const map = L.map(el, { layers: [osm] });
  L.control.layers({ [t("sessionDetail.mapLayerMap")]: osm, [t("sessionDetail.mapLayerSatellite")]: satellite }, {}, { position: "topright" }).addTo(map);
  const trackColor = "#0d47a1";
  const latlngs = track.map(([a, b]) => L.latLng(a, b));
  const line = L.polyline(latlngs, { color: trackColor, weight: 5, opacity: 0.88 }).addTo(map);
  const midSingle = latLonAtFractionAlongPolyline(track, 0.5);
  if (midSingle) {
    const br = bearingAtFractionAlongPolyline(track, 0.5);
    L.marker(midSingle, { icon: leafletRouteIndexIcon(1, trackColor, br), zIndexOffset: 1800 }).addTo(map);
  }
  map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 17 });
  el._edbMap = map;
  const resizeObserver = new ResizeObserver(() => map.invalidateSize());
  resizeObserver.observe(el);
  el._edbMapObserver = resizeObserver;
}

async function exportVerticalMapJpeg(rootEl, _mapHostEl, fileName) {
  const prevRoot = rootEl.getAttribute("style") || "";
  try {
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));
    rootEl.style.background = "#ffffff";
    rootEl.style.boxSizing = "border-box";
    const pixelRatio = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
    const dataUrl = await toJpeg(rootEl, { quality: 0.92, pixelRatio, cacheBust: true, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  } finally {
    if (prevRoot) rootEl.setAttribute("style", prevRoot);
    else rootEl.removeAttribute("style");
  }
}

function mapSummaryLogoHtml(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== "string") return "";
  const src = `${api.API}${relativeUrl}`;
  return `<div class="session-map-summary-logo-wrap"><img src="${src}" alt="" class="session-map-summary-logo" width="48" height="48" crossorigin="anonymous" decoding="async" /></div>`;
}

function buildSessionMapSummaryHtml(s, last, teamLogoUrl) {
  const meters = last != null && typeof last.distanceMeters === "number" && Number.isFinite(last.distanceMeters) ? Math.round(last.distanceMeters) : null;
  const team = s.teamName ? escapeHtml(s.teamName) : escapeHtml(t("account.emptyDash"));
  const boat = labelCompBoat(s.boatType);
  const paddlers = s.paddlersCount != null ? escapeHtml(String(s.paddlersCount)) : escapeHtml(t("account.emptyDash"));
  const fechaInicio = escapeHtml(fmtSessionStartMap(s.sessionStartTime));
  const distHtml = meters != null ? `${escapeHtml(String(meters))} m` : escapeHtml(t("account.emptyDash"));
  const logoBlock = mapSummaryLogoHtml(teamLogoUrl);
  return `
    <div class="session-map-summary-head">
      ${logoBlock}
      <div class="session-map-summary-grid">
        <div><span class="sms-label">${escapeHtml(t("sessionDetail.smsDate"))}</span><span class="sms-val">${fechaInicio}</span></div>
        <div><span class="sms-label">${escapeHtml(t("sessionDetail.smsTeam"))}</span><span class="sms-val">${team}</span></div>
        <div><span class="sms-label">${escapeHtml(t("sessionDetail.smsBoat"))}</span><span class="sms-val">${boat}</span></div>
        <div><span class="sms-label">${escapeHtml(t("sessionDetail.smsPaddlers"))}</span><span class="sms-val">${paddlers}</span></div>
        <div><span class="sms-label">${escapeHtml(t("sessionDetail.smsDistance"))}</span><span class="sms-val">${distHtml}</span></div>
      </div>
    </div>
  `;
}

export async function renderSessionDetail(id, layout) {
  layout(`<p class="loading-line">${escapeHtml(t("sessionDetail.loading", { id: String(id) }))}</p>`);
  try {
    const [data, myTeams, me] = await Promise.all([api.apiGetSession(id), api.apiMyTeams(), api.apiMe()]);
    const s = data.session;
    const myRole = myTeams.length ? myTeams[0].role : null;
    const isPlatformAdmin = me.is_platform_admin === true;
    const isPaddler = !isPlatformAdmin && myRole === "paddler";
    const canDelete = data.can_delete === true;

    const last = s.dataPoints && s.dataPoints.length ? s.dataPoints[s.dataPoints.length - 1] : null;
    const em = escapeHtml(t("account.emptyDash"));
    const cardStyle = "background:#fff;border:0.5px solid #e2e8f0;border-radius:10px;padding:10px 12px;min-height:64px;display:flex;flex-direction:column;justify-content:space-between";
    const labelStyle = "font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:4px";
    const valueStyle = "font-size:18px;font-weight:700;color:#185fa5;line-height:1.2";

    const allCardsGrid = `
      <div style="position:sticky;top:0;z-index:10;background:#f0f4f8;padding:10px 0;margin-bottom:12px">
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px">
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statDate"))}</div><div style="${valueStyle}">${escapeHtml(fmtSessionStartMap(s.sessionStartTime))}</div></div>
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statTotalTime"))}</div><div style="${valueStyle}">${s.totalSeconds != null ? `${Math.floor(s.totalSeconds / 60)}:${String(s.totalSeconds % 60).padStart(2, "0")}` : em}</div></div>
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statFinalDistance"))}</div><div style="${valueStyle}">${last ? last.distanceMeters.toFixed(0) + " m" : em}</div></div>
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statStrokes"))}</div><div style="${valueStyle}">${last ? last.paladas : em}</div></div>
          ${s.teamName ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.teamInSession"))}</div><div style="${valueStyle}">${escapeHtml(s.teamName)}</div></div>` : `<div style="${cardStyle}"></div>`}
          ${s.boatType ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.boat"))}</div><div style="${valueStyle}">${escapeHtml(s.boatType.charAt(0).toUpperCase() + s.boatType.slice(1))}</div></div>` : `<div style="${cardStyle}"></div>`}
          ${s.paddlersCount != null ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.paddlersCount"))}</div><div style="${valueStyle}">${escapeHtml(String(s.paddlersCount))}</div></div>` : `<div style="${cardStyle}"></div>`}
          <div style="${cardStyle};border-color:#185fa5;background:#f0f7ff">
            <div style="${labelStyle}">ACCIONES</div>
            <button id="btn-graficar-dia" style="padding:5px 10px;font-size:12px;font-weight:600;border-radius:6px;border:none;background:#185fa5;color:#fff;cursor:pointer;width:100%">Graficar día</button>
          </div>
        </div>
      </div>
    `;

    const sessionMapSummaryHtml = buildSessionMapSummaryHtml(s, last, data.team_logo_url);
    const tabButtons = isPaddler
      ? `<button type="button" class="tab-btn active" data-tab="mapas" role="tab">${escapeHtml(t("sessionDetail.tabMaps"))}</button>`
      : `<button type="button" class="tab-btn active" data-tab="graficos" role="tab">${escapeHtml(t("sessionDetail.tabCharts"))}</button>
         <button type="button" class="tab-btn" data-tab="tabla" role="tab">${escapeHtml(t("sessionDetail.tabData"))}</button>
         <button type="button" class="tab-btn" data-tab="mapas" role="tab">${escapeHtml(t("sessionDetail.tabMaps"))}</button>
         <button type="button" class="tab-btn" data-tab="json" role="tab">${escapeHtml(t("sessionDetail.tabJson"))}</button>`;

    let tablaGraficosPanels = "";
    if (!isPaddler) {
      const metaTable = buildSessionMetadataTable(s);
      const pointsTable = buildDynamicDataPointsTable(s.dataPoints);
      const exploreBlock = buildExploreControlsHtml(s.dataPoints);
      tablaGraficosPanels = `
        <div id="panel-tabla" class="tab-panel" role="tabpanel">
          <h3 class="subheading">${escapeHtml(t("sessionDetail.headingMeta"))}</h3>
          <div class="table-scroll">${metaTable}</div>
          <h3 class="subheading">${escapeHtml(t("sessionDetail.headingSamples"))}</h3>
          <div class="table-scroll tall">${pointsTable}</div>
        </div>
        <div id="panel-graficos" class="tab-panel active" role="tabpanel">
          <div class="chart-grid">
            <div class="chart-box"><h4>${escapeHtml(t("sessionDetail.chartSpeed"))}</h4><div class="chart-canvas-wrap"><canvas id="chart-speed"></canvas></div></div>
            <div class="chart-box"><h4>${escapeHtml(t("sessionDetail.chartSpm"))}</h4><div class="chart-canvas-wrap"><canvas id="chart-spm"></canvas></div></div>
            <div class="chart-box"><h4>${escapeHtml(t("sessionDetail.chartDps"))}</h4><div class="chart-canvas-wrap"><canvas id="chart-dps"></canvas></div></div>
            <div class="chart-box"><h4>${escapeHtml(t("sessionDetail.chartForce"))}</h4><p class="muted small" style="margin:0 0 0.5rem">${escapeHtml(t("sessionDetail.chartForceHint"))}</p><div class="chart-canvas-wrap"><canvas id="chart-stroke-force"></canvas></div></div>
          </div>
          ${exploreBlock}
        </div>`;
    }

    const mapasPanel = `
      <div id="panel-mapas" class="tab-panel" role="tabpanel">
        <p class="muted small">${escapeHtml(t("sessionDetail.mapIntro"))}</p>
        <div id="session-map-export-root" class="session-map-export-root session-map-export-root--ig-story">
          <div id="session-map-export-summary" class="session-map-export-summary">${sessionMapSummaryHtml}</div>
          <div id="session-map" class="session-map-host session-map-host--ig" role="region" aria-label="${escapeHtml(t("sessionDetail.mapAria"))}"></div>
        </div>
        <p class="muted small map-export-hint">${escapeHtml(t("sessionDetail.mapDownloadHint"))}</p>
        <button type="button" class="secondary btn-sm" id="btn-session-map-jpg">${escapeHtml(t("sessionDetail.mapDownloadBtn"))}</button>
      </div>`;

    const jsonPanel = isPaddler ? "" : `
      <div id="panel-json" class="tab-panel" role="tabpanel">
        <pre class="json">${escapeHtml(JSON.stringify(data.session, null, 2))}</pre>
      </div>`;

    const deleteBtn = canDelete
      ? `<button type="button" class="btn-danger btn-sm" id="btn-delete-session">${escapeHtml(t("sessionDetail.delete"))}</button>`
      : "";

    layout(`
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <a class="link" href="#/sessions" style="font-size:13px;color:#185fa5;text-decoration:none">← Volver</a>
          <span style="color:#e2e8f0">|</span>
          <button id="btn-nav-prev" style="padding:4px 10px;font-size:12px;border-radius:6px;border:0.5px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer">← Anterior</button>
          <button id="btn-nav-next" style="padding:4px 10px;font-size:12px;border-radius:6px;border:0.5px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer">Siguiente →</button>
        </div>
        <h2 style="margin:0;font-size:16px;font-weight:700;color:#1e293b">${escapeHtml(t("sessionDetail.title", { id: String(data.id) }))}</h2>
        <div>${deleteBtn || "<div></div>"}</div>
      </div>
      ${allCardsGrid}
      <div class="card session-card">
        <p class="muted">${escapeHtml(t("sessionDetail.dateUploaded", { date: fmtDate(data.created_at) }))}</p>
        ${isPaddler ? `<p class="muted small">${t("sessionDetail.paddlerNoteHtml")}</p>` : ""}
        <div class="tabs" id="session-tabs">
          <div class="tab-list" role="tablist">${tabButtons}</div>
          ${tablaGraficosPanels}
          ${mapasPanel}
          ${jsonPanel}
        </div>
      </div>
    `);

    // Navegación prev/next
    (async () => {
      try {
        const teamId = myTeams.length ? myTeams[0].team.id : null;
        if (!teamId) return;
        const allSessions = await api.apiListSessions(teamId);
        const sorted = [...allSessions].sort((a, b) => a.id - b.id);
        const idx = sorted.findIndex((s) => s.id === Number(id));
        const prevSession = idx > 0 ? sorted[idx - 1] : null;
        const nextSession = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
        const btnPrev = document.getElementById("btn-nav-prev");
        const btnNext = document.getElementById("btn-nav-next");
        if (btnPrev) {
          if (prevSession) btnPrev.addEventListener("click", () => { location.hash = `#/session/${prevSession.id}`; });
          else { btnPrev.disabled = true; btnPrev.style.opacity = "0.4"; btnPrev.style.cursor = "default"; }
        }
        if (btnNext) {
          if (nextSession) btnNext.addEventListener("click", () => { location.hash = `#/session/${nextSession.id}`; });
          else { btnNext.disabled = true; btnNext.style.opacity = "0.4"; btnNext.style.cursor = "default"; }
        }
      } catch {}
    })();

    document.getElementById("btn-graficar-dia")?.addEventListener("click", async () => {
      try {
        const teamId = myTeams.length ? myTeams[0].team.id : null;
        const allSessions = teamId ? await api.apiListSessions(teamId) : [];
        const sessionAsList = allSessions.find((x) => x.id === Number(id)) || { id: Number(id), created_at: data.created_at, team_name: s.teamName, team_id: null };
        openDayModal(sessionAsList, allSessions.length ? allSessions : [sessionAsList]);
      } catch (e) { console.error(e); }
    });

    const tabRoot = document.getElementById("session-tabs");
    const panels = isPaddler ? ["mapas"] : ["graficos", "tabla", "mapas", "json"];
    const sessionUiState = { chartsReady: false, mapReady: false };

    if (!isPaddler) {
      initSessionCharts(s.dataPoints);
      wireExploreChart(s.dataPoints);
      sessionUiState.chartsReady = true;
    }

    function activateSessionTab(name, { focusButton } = {}) {
      if (focusButton && name) {
        const b = tabRoot.querySelector(`.tab-btn[data-tab="${name}"]`);
        if (b) tabRoot.querySelectorAll(".tab-btn").forEach((x) => x.classList.toggle("active", x === b));
      } else if (name) {
        tabRoot.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === name));
      }
      panels.forEach((p) => { const el = document.getElementById(`panel-${p}`); if (el) el.classList.toggle("active", p === name); });
      if (name === "graficos" && !sessionUiState.chartsReady) { initSessionCharts(s.dataPoints); wireExploreChart(s.dataPoints); sessionUiState.chartsReady = true; }
      if (name === "mapas") {
        if (!sessionUiState.mapReady) { initSessionMap(s.dataPoints); sessionUiState.mapReady = true; }
        else {
          const wrap = document.getElementById("session-map");
          if (wrap?._edbMap) {
            wrap._edbMap.invalidateSize();
            if (!wrap._edbMapObserver) { const ro = new ResizeObserver(() => wrap._edbMap.invalidateSize()); ro.observe(wrap); wrap._edbMapObserver = ro; }
          }
        }
      }
    }

    tabRoot.querySelectorAll(".tab-btn").forEach((btn) => btn.addEventListener("click", () => activateSessionTab(btn.getAttribute("data-tab"), { focusButton: true })));

    document.getElementById("btn-delete-session")?.addEventListener("click", async () => {
      if (!confirm(t("sessionDetail.deleteConfirm"))) return;
      try {
        await api.apiDeleteSession(id);
        location.hash = "#/sessions";
        route();
      } catch (ex) {
        alert(humanizeApiError(ex.message) || ex.message || t("sessionDetail.genericError"));
      }
    });

    document.getElementById("btn-session-map-jpg")?.addEventListener("click", async () => {
      activateSessionTab("mapas");
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const wrap = document.getElementById("session-map");
      if (wrap?._edbMap) await waitForTiles(wrap._edbMap);
      const root = document.getElementById("session-map-export-root");
      if (!root) return;
      try {
        await exportVerticalMapJpeg(root, wrap, buildSessionMapJpegFileName(s, data.id, data.created_at));
      } catch (e) { console.error(e); alert(t("sessions.jpgExportError")); }
    });
  } catch (ex) {
    layout(`
      <p><a class="link" href="#/sessions">${escapeHtml(t("sessionDetail.backShort"))}</a></p>
      <div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message) || ex.message)}</p></div>
    `);
  }
}
