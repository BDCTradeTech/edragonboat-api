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

/** @type {Chart[]} — instancias del comparador, se destruyen al salir */
let _comparatorCharts = [];

/** IDs de sesiones seleccionadas para comparar (máx. 2) */
let _compareSelection = new Set();

export function destroySessionCharts() {
  _chartInstances.forEach((c) => c.destroy());
  _chartInstances = [];
  _comparatorCharts.forEach((c) => c.destroy());
  _comparatorCharts = [];
  _compareSelection.clear();
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
  const MONTH_NAMES = t("sessions.monthNames").split(",");
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
          <div style="font-size:17px;font-weight:700;color:#1e293b">${escapeHtml(t("sessions.dayModalTitle"))}</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px">${escapeHtml(dayLabel)}${teamLabel ? " · " + teamLabel : ""}</div>
        </div>
        <button id="modal-close-btn" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:0 4px">×</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 24px 0">
        <div style="${statCardStyle}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">${escapeHtml(t("sessions.dayStatSessions"))}</div><div style="font-size:22px;font-weight:700;color:#185fa5">${daySessions.length}</div></div>
        <div style="${statCardStyle}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">${escapeHtml(t("sessions.dayStatDistance"))}</div><div style="font-size:22px;font-weight:700;color:#185fa5">${totalDistKm.toFixed(2)} km</div></div>
        <div style="${statCardStyle}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">${escapeHtml(t("sessions.dayStatAvgPaddlers"))}</div><div style="font-size:22px;font-weight:700;color:#185fa5">${avgPaddlers || "—"}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 24px">
        <div>
          <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:8px">${escapeHtml(t("sessions.dayMapTitle"))}</div>
          <div id="modal-map" style="height:220px;border-radius:10px;overflow:hidden;border:0.5px solid #e2e8f0"></div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:8px">${escapeHtml(t("sessions.daySessionsTitle"))}</div>
          <div id="modal-sessions-list" style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto"></div>
        </div>
      </div>
      <div style="padding:12px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:0.5px solid #e2e8f0;margin-top:4px">
        <button id="modal-download-btn" style="padding:7px 16px;font-size:13px;border-radius:8px;border:0.5px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer">${escapeHtml(t("sessions.btnDownloadJpg"))}</button>
        <button id="modal-close-btn2" style="padding:7px 16px;font-size:13px;border-radius:8px;border:none;background:#185fa5;color:#fff;cursor:pointer">${escapeHtml(t("sessions.btnClose"))}</button>
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

    const MONTH_NAMES_FILTER = t("sessions.monthNames").split(",");
    // Nombres de mes cortos (3 letras) para los headers de día
    const MONTH_NAMES_SHORT = t("home.monthNames").split(",");
    const DAY_NAMES_SHORT = t("sessions.dayNamesShort").split(","); // Lun,Mar,Mié,Jue,Vie,Sáb,Dom

    function buildSelectOpts(values, labelFn, allLabelKey) {
      const allLabel = typeof allLabelKey === "string" && allLabelKey.startsWith("sessions.") ? t(allLabelKey) : allLabelKey;
      const allOpt = `<option value="">${escapeHtml(allLabel)}</option>`;
      return allOpt + values.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(labelFn(v))}</option>`).join("");
    }
    const selectStyle = "padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;background:#fff;cursor:pointer;width:auto";

    if (!rows.length) {
      const allYears = [];
      const filterRowHtml = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        ${teams.length >= 1 ? `<select id="sel-session-team" style="${selectStyle};min-width:130px">${teamSelectOptions}</select><div style="width:1px;height:24px;background:#e2e8f0;align-self:center"></div>` : ""}
        <select id="filter-year" style="${selectStyle};min-width:130px">${buildSelectOpts(allYears, (y) => String(y), "sessions.allYears")}</select>
        <select id="filter-month" style="${selectStyle};min-width:130px"><option value="">${escapeHtml(t("sessions.allMonths"))}</option></select>
      </div>`;
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

    // ── SECCIÓN 1: Records del equipo (sobre TODAS las sesiones filtradas) ──
    function getSpmMax(s) {
      // Intenta obtener el máximo real de SPM desde session_json o similar
      const pts = s.session_json?.dataPoints?.spm
               ?? s.json?.dataPoints?.spm
               ?? s.data?.dataPoints?.spm
               ?? null;
      if (Array.isArray(pts) && pts.length > 0) return Math.max(...pts);
      return s.avg_spm ?? 0;
    }

    function computeRecords(allRows) {
      let bestDist = null, bestDistSession = null;
      let bestSpeed = null, bestSpeedSession = null;
      let bestSpm = null, bestSpmSession = null;
      let bestAvgSpeed = null, bestAvgSpeedSession = null;
      for (const s of allRows) {
        if (s.distance_meters != null && (bestDist === null || s.distance_meters > bestDist)) {
          bestDist = s.distance_meters; bestDistSession = s;
        }
        if (s.max_speed != null && (bestSpeed === null || s.max_speed > bestSpeed)) {
          bestSpeed = s.max_speed; bestSpeedSession = s;
        }
        // Usar SPM máximo real desde session_json si disponible, fallback a avg_spm
        const spmVal = getSpmMax(s);
        if (spmVal != null && (bestSpm === null || spmVal > bestSpm)) {
          bestSpm = spmVal; bestSpmSession = s;
        }
        if (s.avg_speed != null && (bestAvgSpeed === null || s.avg_speed > bestAvgSpeed)) {
          bestAvgSpeed = s.avg_speed; bestAvgSpeedSession = s;
        }
      }
      return [
        { icon: "📏", key: "bestDistance", val: bestDist != null ? `${Math.round(bestDist).toLocaleString()} m` : "—", sess: bestDistSession },
        { icon: "⚡", key: "bestSpeed",    val: bestSpeed != null ? `${bestSpeed.toFixed(1)} km/h` : "—", sess: bestSpeedSession },
        { icon: "🥁", key: "bestSpm",      val: bestSpm != null ? `${Math.round(bestSpm)} spm` : "—", sess: bestSpmSession },
        { icon: "🏃", key: "bestAvgSpeed", val: bestAvgSpeed != null ? `${bestAvgSpeed.toFixed(1)} km/h` : "—", sess: bestAvgSpeedSession },
      ];
    }

    function fmtSessionRef(s) {
      if (!s) return "—";
      const d = new Date(s.created_at);
      const mon = MONTH_NAMES_SHORT[d.getMonth()] || "";
      return `#${s.id} · ${d.getDate()} ${mon} ${d.getFullYear()}`;
    }

    const records = computeRecords(rows);
    const recordsHtml = records.map((r) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8fafc;border:0.5px solid #e2e8f0;border-radius:10px">
        <span style="font-size:18px;flex-shrink:0">${r.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;line-height:1.2">${escapeHtml(t(`sessions.${r.key}`))}</div>
          <div style="font-size:15px;font-weight:700;color:#185fa5;line-height:1.3">${escapeHtml(r.val)}</div>
        </div>
        <div style="font-size:11px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${escapeHtml(fmtSessionRef(r.sess))}</div>
      </div>`).join("");

    // ── SECCIÓN 2: Stats del mes actual ──
    function computeMonthStats(allRows) {
      const now = new Date();
      const curY = now.getFullYear();
      const curM = now.getMonth();
      const monthRows = allRows.filter((r) => {
        const d = new Date(r.created_at);
        return d.getFullYear() === curY && d.getMonth() === curM;
      });
      const totalKm = monthRows.reduce((s, r) => s + (r.distance_meters != null ? r.distance_meters : 0), 0) / 1000;
      const spms = monthRows.filter((r) => r.avg_spm != null).map((r) => r.avg_spm);
      const avgSpm = spms.length ? spms.reduce((a, b) => a + b, 0) / spms.length : null;
      const totalStrokes = monthRows.reduce((sum, r) => {
        if (r.avg_spm != null && r.total_seconds != null) {
          return sum + Math.round(r.avg_spm * r.total_seconds / 60);
        }
        return sum;
      }, 0);
      // DPS promedio: distance_meters / (avg_spm × total_seconds / 60)
      const dpsValues = monthRows.filter((r) => r.distance_meters != null && r.avg_spm != null && r.total_seconds != null && r.avg_spm > 0 && r.total_seconds > 0).map((r) => r.distance_meters / (r.avg_spm * r.total_seconds / 60));
      const avgDps = dpsValues.length ? dpsValues.reduce((a, b) => a + b, 0) / dpsValues.length : null;
      // Palistas promedio (campo paddlers_count si existe)
      const paddlersCounts = monthRows.filter((r) => r.paddlers_count != null && r.paddlers_count > 0).map((r) => r.paddlers_count);
      const avgPaddlers = paddlersCounts.length ? paddlersCounts.reduce((a, b) => a + b, 0) / paddlersCounts.length : null;
      return { count: monthRows.length, km: totalKm, avgSpm, totalStrokes, avgDps, avgPaddlers };
    }

    const mStats = computeMonthStats(rows);
    const statBarColors = ["#185fa5", "#0d9488", "#7c3aed", "#d97706", "#ea580c", "#0891b2"];
    const statCardStyle = "background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:14px 16px;text-align:center";
    function makeStatCard(labelKey, value, colorIdx) {
      const color = statBarColors[colorIdx] || "#185fa5";
      return `<div style="${statCardStyle}">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:4px">${escapeHtml(t(labelKey))}</div>
        <div style="font-size:20px;font-weight:700;color:${color};margin-bottom:6px">${escapeHtml(String(value))}</div>
        <div style="height:3px;border-radius:2px;background:${color};opacity:0.25"></div>
      </div>`;
    }
    const monthStatsHtml =
      makeStatCard("sessions.sessionsMonth", mStats.count, 0) +
      makeStatCard("sessions.kmMonth", mStats.km.toFixed(1), 1) +
      makeStatCard("sessions.avgDpsMonth", mStats.avgDps != null ? mStats.avgDps.toFixed(1) + " m" : "—", 2) +
      makeStatCard("sessions.avgPaddlersMonth", mStats.avgPaddlers != null ? Math.round(mStats.avgPaddlers) : "—", 3) +
      makeStatCard("sessions.totalStrokesMonth", mStats.totalStrokes > 0 ? mStats.totalStrokes.toLocaleString() : "—", 4) +
      makeStatCard("sessions.avgSpmMonth", mStats.avgSpm != null ? Math.round(mStats.avgSpm) : "—", 5);

    // ── FILTROS: Equipo, Año, Mes (sin Día) ──
    const allYears = [...new Set(rows.map((r) => new Date(r.created_at).getFullYear()))].sort((a, b) => b - a);
    const filterColHtml = `<div style="display:flex;flex-direction:column;gap:10px">
      ${teams.length >= 1 ? `<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(t("sessions.filterLabel"))}</label><select id="sel-session-team" style="${selectStyle};width:100%">${teamSelectOptions}</select></div>` : ""}
      <div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(t("sessions.year"))}</label><select id="filter-year" style="${selectStyle};width:100%">${buildSelectOpts(allYears, (y) => String(y), "sessions.allYears")}</select></div>
      <div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(t("sessions.month"))}</label><select id="filter-month" style="${selectStyle};width:100%"><option value="">${escapeHtml(t("sessions.allMonths"))}</option></select></div>
    </div>`;

    const divider = `<div style="background:#e5e7eb;align-self:stretch"></div>`;

    layout(`
      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="card">
          <div style="display:grid;grid-template-columns:auto 1px 1fr 1px 1fr;gap:0 20px;align-items:start">

            <div>
              <h2 class="card-title" style="margin-bottom:12px">${escapeHtml(t("sessions.filterTitle"))}</h2>
              ${filterColHtml}
            </div>

            ${divider}

            <div style="background:#f8fafc; border:0.5px solid #e2e8f0; border-radius:12px;padding:14px 16px">
              <h2 class="card-title" style="margin-bottom:12px">${escapeHtml(`\u{1F4CA} Stats ${MONTH_NAMES_FILTER[new Date().getMonth()]} ${new Date().getFullYear()}`)}</h2>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                ${monthStatsHtml}
              </div>
            </div>

            ${divider}

            <div style="background:#f8fafc; border:0.5px solid #e2e8f0; border-radius:12px;padding:14px 16px">
              <h2 class="card-title" style="margin-bottom:12px">🏆 ${escapeHtml(t("sessions.records"))}</h2>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${recordsHtml}
              </div>
            </div>

          </div>
        </div>

        <div id="sessions-day-list" style="display:flex;flex-direction:column;gap:10px"></div>

      </div>
    `, { wide: true });

    // ── SECCIÓN 4: Lista agrupada por día ──
    function fmtDayBadge(dateKey) {
      // dateKey: "YYYY-MM-DD"
      const [y, m, d] = dateKey.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const dow = DAY_NAMES_SHORT[date.getDay()] || "";
      const mon = MONTH_NAMES_SHORT[date.getMonth()] || "";
      return `${dow} ${d} ${mon}`;
    }

    function fmtDur(secs) {
      if (secs == null || !Number.isFinite(secs)) return "—";
      return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
    }

    function fmtTime(isoStr) {
      if (!isoStr) return "—";
      return new Date(isoStr).toLocaleTimeString(getUiLocale(), { hour: "2-digit", minute: "2-digit" });
    }

    function getFilteredRows() {
      const yr = document.getElementById("filter-year")?.value || "";
      const mo = document.getElementById("filter-month")?.value || "";
      return rows.filter((r) => {
        const d = new Date(r.created_at);
        if (yr && d.getFullYear() !== Number(yr)) return false;
        if (mo && d.getMonth() !== Number(mo)) return false;
        return true;
      });
    }

    function rebuildMonthSelect(yearVal) {
      const moSel = document.getElementById("filter-month");
      if (!moSel) return;
      const filtered = yearVal ? rows.filter((r) => new Date(r.created_at).getFullYear() === Number(yearVal)) : rows;
      const months = [...new Set(filtered.map((r) => new Date(r.created_at).getMonth()))].sort((a, b) => a - b);
      moSel.innerHTML = buildSelectOpts(months, (mo) => MONTH_NAMES_FILTER[mo], "sessions.allMonths");
      moSel.value = "";
    }

    function renderDayList() {
      const listEl = document.getElementById("sessions-day-list");
      if (!listEl) return;

      const filtered = getFilteredRows().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (!filtered.length) {
        listEl.innerHTML = `<div class="card"><p style="color:#94a3b8;text-align:center;padding:20px">${escapeHtml(t("sessions.noSessionsForPeriod"))}</p></div>`;
        return;
      }

      // Agrupar por día (YYYY-MM-DD en hora local)
      const dayMap = new Map();
      for (const s of filtered) {
        const key = localDateKeyFromIso(s.created_at);
        if (!dayMap.has(key)) dayMap.set(key, []);
        dayMap.get(key).push(s);
      }
      // dayMap ya está ordenado porque filtered está ordenado y localDateKeyFromIso es monotónico
      const dayKeys = [...dayMap.keys()]; // más reciente primero

      const em = "—";
      const html = dayKeys.map((dayKey) => {
        const daySessions = dayMap.get(dayKey);

        // Métricas del header del día
        const totalDist = daySessions.reduce((s, r) => s + (r.distance_meters != null ? r.distance_meters : 0), 0);
        const spmsDay = daySessions.filter((r) => r.avg_spm != null).map((r) => r.avg_spm);
        const avgSpmDay = spmsDay.length ? spmsDay.reduce((a, b) => a + b, 0) / spmsDay.length : null;
        const speedsDay = daySessions.filter((r) => r.avg_speed != null).map((r) => r.avg_speed);
        const avgSpeedDay = speedsDay.length ? speedsDay.reduce((a, b) => a + b, 0) / speedsDay.length : null;

        // Paladas del día: suma de Math.round(s.avg_spm * s.total_seconds / 60)
        const totalStrokesDay = daySessions.reduce((sum, s) => {
          if (s.avg_spm != null && s.total_seconds != null) {
            return sum + Math.round(s.avg_spm * s.total_seconds / 60);
          }
          return sum;
        }, 0);

        // Palistas del día: suma de s.paddlers_count (null/undefined → 0)
        const totalPaddlersDay = daySessions.reduce((sum, s) => {
          return sum + (s.paddlers_count != null ? s.paddlers_count : 0);
        }, 0);

        const badgeLabel = escapeHtml(fmtDayBadge(dayKey));
        const distLabel = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)} km` : `${Math.round(totalDist)} m`;

        // Distancia máxima del día (para barras proporcionales)
        const maxDistDay = Math.max(...daySessions.map((s) => s.distance_meters ?? 0), 1);

        // Filas de sesiones individuales
        const sessionRows = daySessions.map((s) => {
          const distM = s.distance_meters ?? 0;
          const barPct = Math.round((distM / maxDistDay) * 100);
          const distStr = s.distance_meters != null ? `${Math.round(s.distance_meters)} m` : em;
          const durStr = fmtDur(s.total_seconds);
          const hora = fmtTime(s.created_at);
          const checked = _compareSelection.has(s.id) ? "checked" : "";
          const paladas = (s.avg_spm != null && s.total_seconds != null)
            ? Math.round(s.avg_spm * s.total_seconds / 60)
            : null;
          const paladasStr = paladas != null ? String(paladas) : em;
          return `<div class="day-session-row" data-id="${s.id}" style="display:grid;grid-template-columns:24px 36px 48px 1fr 64px 52px 48px 36px;gap:6px;align-items:center;padding:6px 0;border-bottom:0.5px solid #f1f5f9">
            <input type="checkbox" class="compare-checkbox" data-id="${s.id}" ${checked} style="width:14px;height:14px;accent-color:#185fa5" />
            <span style="font-size:11px;color:#94a3b8">#${s.id}</span>
            <span style="font-size:12px;color:#334155">${escapeHtml(hora)}</span>
            <div style="background:#e2e8f0;border-radius:4px;height:6px;overflow:hidden">
              <div style="background:#185fa5;height:100%;width:${barPct}%;border-radius:4px"></div>
            </div>
            <span style="font-size:12px;color:#334155;text-align:right">${escapeHtml(distStr)}</span>
            <span style="font-size:12px;color:#94a3b8">${escapeHtml(durStr)}</span>
            <span style="font-size:11px;color:#94a3b8;text-align:right" title="${escapeHtml(t("sessions.totalStrokes"))}">${escapeHtml(paladasStr)}</span>
            <button class="btn-ver-session" data-id="${s.id}" style="padding:3px 8px;font-size:11px;background:#f1f5f9;color:#185fa5;border:0.5px solid #e2e8f0;border-radius:6px;cursor:pointer;white-space:nowrap">${escapeHtml(t("sessions.btnView"))}</button>
          </div>`;
        }).join("");

        // Fecha completa en header del día
        const dateObj = new Date(dayKey + 'T00:00:00');
        const dateLabel = dateObj.toLocaleDateString(getUiLocale(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        return `<div class="card day-group-card" style="padding:0;overflow:hidden">
          <div class="day-group-header" data-day="${escapeHtml(dayKey)}" style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;user-select:none;background:#f8fafc;border-bottom:0.5px solid #e2e8f0">
            <span class="day-chevron" style="font-size:13px;color:#94a3b8;transition:transform .15s">▶</span>
            <span style="font-size:13px;font-weight:700;color:#1e293b">${escapeHtml(dateLabel)}</span>
            <div style="display:flex;gap:12px;flex-wrap:wrap;flex:1;font-size:12px;color:#64748b">
              <span>${escapeHtml(t("sessions.sessions"))}: <strong>${daySessions.length}</strong></span>
              <span>${escapeHtml(t("sessions.distance"))}: <strong>${escapeHtml(distLabel)}</strong></span>
              <span>${escapeHtml(t("sessions.totalStrokes"))}: <strong>${totalStrokesDay.toLocaleString()}</strong></span>
              <span>${escapeHtml(t("sessions.paddlers"))}: <strong>${totalPaddlersDay > 0 ? totalPaddlersDay : em}</strong></span>
              <span>${escapeHtml(t("sessions.avgSpmShort"))}: <strong>${avgSpmDay != null ? Math.round(avgSpmDay) : em}</strong></span>
              <span>${escapeHtml(t("sessions.avgSpeedShort"))}: <strong>${avgSpeedDay != null ? avgSpeedDay.toFixed(1) + " km/h" : em}</strong></span>
            </div>
            <button class="btn-compare-selected" data-day="${escapeHtml(dayKey)}" style="padding:4px 10px;font-size:12px;background:#059669;color:#fff;border:none;border-radius:8px;white-space:nowrap;flex-shrink:0;opacity:0.4;cursor:not-allowed;pointer-events:none">${escapeHtml(t("sessions.compareSelected"))}</button>
            <button class="btn-compare-day" data-day="${escapeHtml(dayKey)}" style="padding:4px 10px;font-size:12px;background:#185fa5;color:#fff;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0">${escapeHtml(t("sessions.resumeDay"))} →</button>
          </div>
          <div class="day-group-body" style="padding:0 16px;display:none">
            ${sessionRows}
          </div>
        </div>`;
      }).join("");

      listEl.innerHTML = html;

      // Wiring: toggle de acordeón
      listEl.querySelectorAll(".day-group-header").forEach((header) => {
        header.addEventListener("click", (e) => {
          // No colapsar si se hace click en los botones de acción del header
          if (e.target.closest(".btn-compare-day") || e.target.closest(".btn-compare-selected")) return;
          const card = header.closest(".day-group-card");
          const body = card.querySelector(".day-group-body");
          const chevron = header.querySelector(".day-chevron");
          const isOpen = body.style.display !== "none";
          body.style.display = isOpen ? "none" : "block";
          chevron.textContent = isOpen ? "▶" : "▼";
        });
      });

      // Wiring: botón "Ver" sesión individual
      listEl.querySelectorAll(".btn-ver-session").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          location.hash = `#/session/${btn.dataset.id}`;
        });
      });

      // Wiring: checkboxes para comparar (global entre días)
      function _updateAllDayCompareBtns() {
        // Actualiza TODOS los botones de compare en función de _compareSelection.size === 2
        const isValidSelection = _compareSelection.size === 2;
        listEl.querySelectorAll(".btn-compare-selected").forEach((btn) => {
          if (isValidSelection) {
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            btn.style.pointerEvents = "auto";
          } else {
            btn.style.opacity = "0.4";
            btn.style.cursor = "not-allowed";
            btn.style.pointerEvents = "none";
          }
        });
      }

      listEl.querySelectorAll(".compare-checkbox").forEach((cb) => {
        cb.addEventListener("change", (e) => {
          e.stopPropagation();
          const id = Number(cb.dataset.id);
          if (cb.checked) {
            // Si ya hay 2 seleccionadas, desseleccionar la tercera
            if (_compareSelection.size >= 2) {
              cb.checked = false;
              return;
            }
            _compareSelection.add(id);
          } else {
            _compareSelection.delete(id);
          }
          // Actualizar TODOS los botones (comparación global)
          _updateAllDayCompareBtns();
        });
      });

      // Wiring: botón "Comparar seleccionadas" por día (ahora compara desde Set global)
      listEl.querySelectorAll(".btn-compare-selected").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (_compareSelection.size !== 2) return;
          const ids = Array.from(_compareSelection);
          location.hash = `#/sessions/compare?a=${ids[0]}&b=${ids[1]}`;
        });
      });

      // Inicializar estado de botones
      _updateAllDayCompareBtns();

      // Wiring: botón "Comparar día →"
      listEl.querySelectorAll(".btn-compare-day").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const dayKey = btn.dataset.day;
          const daySessionsForModal = dayMap.get(dayKey) || [];
          if (!daySessionsForModal.length) return;
          openDayModal(daySessionsForModal[0], rows);
        });
      });
    }

    rebuildMonthSelect("");
    renderDayList();

    document.getElementById("filter-year")?.addEventListener("change", (e) => {
      rebuildMonthSelect(e.target.value);
      renderDayList();
    });
    document.getElementById("filter-month")?.addEventListener("change", () => {
      renderDayList();
    });
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

// ─── Comparador de sesiones ───────────────────────────────────────────────────

function _fmtDur(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/** Calcula métricas inline para el header de cada gráfico del comparador */
function _computeComparatorMetrics(sA, sB) {
  const dpA = sA.dataPoints || [];
  const dpB = sB.dataPoints || [];

  function seriesStats(arr, key) {
    const vals = arr.map((p) => {
      const v = p[key];
      return (typeof v === "number" && Number.isFinite(v) && v > 0) ? v : null;
    });
    const valid = vals.filter((v) => v != null);
    if (!valid.length) return { max: null, avg: null };
    const max = Math.max(...valid);
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return { max, avg };
  }

  /** DPS real = totalDistance / totalStrokes desde la sesión */
  function dpsRealAvg(session) {
    const dist = session.totalDistance;
    const strokes = session.totalStrokes;
    if (!dist || !strokes || dist <= 0 || strokes <= 0) return null;
    return dist / strokes;
  }

  const speedA = seriesStats(dpA, "speedKmh");
  const speedB = seriesStats(dpB, "speedKmh");
  const spmA = seriesStats(dpA, "spm");
  const spmB = seriesStats(dpB, "spm");
  const forceA = seriesStats(dpA, "strokePeakAccelerationMs2");
  const forceB = seriesStats(dpB, "strokePeakAccelerationMs2");

  return {
    maxSpeedA: speedA.max, avgSpeedA: speedA.avg,
    maxSpeedB: speedB.max, avgSpeedB: speedB.avg,
    avgSpmA: spmA.avg,
    avgSpmB: spmB.avg,
    avgDpsA: dpsRealAvg(sA),
    avgDpsB: dpsRealAvg(sB),
    avgForceA: forceA.avg,
    avgForceB: forceB.avg,
  };
}

/**
 * Genera el HTML de métricas inline para el header de un gráfico del comparador.
 *
 * Modo velocidad (showMax = true):
 *   Vel. Máx. A: X km/h · Vel. Prom. A: X km/h · Vel. Máx. B: X km/h · Vel. Prom. B: X km/h · Δ X (+X%)
 *   El delta se calcula sobre el promedio.
 *
 * Modo SPM (unit = "spm"):
 *   Paladas Prom. A: X spm · Paladas Prom. B: X spm · Δ X (+X%)
 *
 * Modo DPS (unit = "m"):
 *   DPS Prom. A: X m · DPS Prom. B: X m · Δ X m (+X%)
 *
 * Modo fuerza (unit = ""):
 *   Fuerza Prom. A: X m/s² · Fuerza Prom. B: X m/s² · Δ X (+X%)
 *
 * decimals: número de decimales para formatear (0 para SPM, 1 para los demás).
 */
function _chartHeaderMetricsHtml({ maxA = null, avgA, maxB = null, avgB, unit, showMax = false, decimals = 1 }) {
  const em = "—";
  const fmt = (v) => (v != null && Number.isFinite(v)) ? v.toFixed(decimals) : em;
  const unitStr = unit ? ` ${unit}` : "";

  // El delta siempre se calcula sobre el promedio
  let deltaHtml = "";
  if (avgA != null && avgB != null && Number.isFinite(avgA) && Number.isFinite(avgB)) {
    const diff = avgA - avgB;
    const pct = avgB !== 0 ? (diff / Math.abs(avgB)) * 100 : null;
    const sign = diff >= 0 ? "+" : "−";
    const absDiff = Math.abs(diff).toFixed(decimals);
    const absPct = pct != null ? Math.abs(pct).toFixed(1) : null;
    const pctPart = absPct != null ? ` (${sign}${absPct}%)` : "";
    const unitLabel = unit === "m" ? " m" : unitStr;
    deltaHtml = `<span class="cmp-chart-sep">·</span><span class="cmp-chart-delta" style="color:#64748b">Δ ${sign}${absDiff}${unitLabel}${escapeHtml(pctPart)}</span>`;
  }

  let parts;
  if (showMax) {
    // Velocidad: Vel. Máx. A / Vel. Prom. A / Vel. Máx. B / Vel. Prom. B
    const aAvgNull = avgA == null || !Number.isFinite(avgA);
    const bAvgNull = avgB == null || !Number.isFinite(avgB);
    parts = [
      `<span class="cmp-chart-val-a" style="color:#185fa5">Vel. Máx. A: ${fmt(maxA)}${unitStr}</span>`,
      `<span class="cmp-chart-sep">·</span>`,
      `<span class="cmp-chart-val-a" style="color:#185fa5">Vel. Prom. A: ${aAvgNull ? em : fmt(avgA)}${unitStr}</span>`,
      `<span class="cmp-chart-sep">·</span>`,
      `<span class="cmp-chart-val-b" style="color:#7c3aed">Vel. Máx. B: ${fmt(maxB)}${unitStr}</span>`,
      `<span class="cmp-chart-sep">·</span>`,
      `<span class="cmp-chart-val-b" style="color:#7c3aed">Vel. Prom. B: ${bAvgNull ? em : fmt(avgB)}${unitStr}</span>`,
      deltaHtml,
    ];
  } else if (unit === "spm") {
    parts = [
      `<span class="cmp-chart-val-a" style="color:#185fa5">Paladas Prom. A: ${fmt(avgA)}${unitStr}</span>`,
      `<span class="cmp-chart-sep">·</span>`,
      `<span class="cmp-chart-val-b" style="color:#7c3aed">Paladas Prom. B: ${fmt(avgB)}${unitStr}</span>`,
      deltaHtml,
    ];
  } else if (unit === "m") {
    // DPS
    parts = [
      `<span class="cmp-chart-val-a" style="color:#185fa5">DPS Prom. A: ${fmt(avgA)}${unitStr}</span>`,
      `<span class="cmp-chart-sep">·</span>`,
      `<span class="cmp-chart-val-b" style="color:#7c3aed">DPS Prom. B: ${fmt(avgB)}${unitStr}</span>`,
      deltaHtml,
    ];
  } else {
    // Fuerza (unit = "" → mostramos m/s²)
    const forceUnit = " m/s²";
    parts = [
      `<span class="cmp-chart-val-a" style="color:#185fa5">Fuerza Prom. A: ${fmt(avgA)}${forceUnit}</span>`,
      `<span class="cmp-chart-sep">·</span>`,
      `<span class="cmp-chart-val-b" style="color:#7c3aed">Fuerza Prom. B: ${fmt(avgB)}${forceUnit}</span>`,
      deltaHtml,
    ];
  }

  return parts.join("");
}

/**
 * Calcula el percentil p (0-100) de un array de números usando interpolación lineal.
 * Filtra nulls y no-finitos. Retorna null si hay menos de 4 valores válidos.
 */
function _percentile(arr, p) {
  const valid = arr.filter((v) => v != null && Number.isFinite(v));
  if (valid.length < 4) return null;
  valid.sort((a, b) => a - b);
  const idx = (p / 100) * (valid.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return valid[lo];
  return valid[lo] + (valid[hi] - valid[lo]) * (idx - lo);
}

function _buildComparatorSelectorHtml(which, session) {
  console.warn("[cmp-selector] session:", JSON.stringify(session));
  const label = t(`sessions.session${which.toUpperCase()}`);
  if (!session) {
    return `<div class="cmp-pill cmp-pill-${which}" id="selector-card-${which}" role="button" tabindex="0" aria-label="${escapeHtml(t('sessions.selectSession'))}">
      <span class="cmp-pill-label">${escapeHtml(label)}</span>
      <span class="cmp-pill-text">${escapeHtml(t("sessions.selectSession"))}…</span>
      <span class="cmp-pill-edit" aria-hidden="true">✏️</span>
    </div>`;
  }
  // Distancia en metros: preferir session.totalDistance, fallback al último dataPoint
  let distM = null;
  if (session.totalDistance != null && session.totalDistance > 0) {
    distM = session.totalDistance;
  } else {
    const dp = session.dataPoints || [];
    const last = dp.length ? dp[dp.length - 1] : null;
    if (last?.distanceMeters != null) distM = last.distanceMeters;
  }
  let distStr;
  if (distM == null) {
    distStr = "—";
  } else {
    const rounded = Math.round(distM);
    distStr = `${rounded} m`;
  }
  // Fecha corta tipo "12 abr"
  const MONTH_SHORT = t("home.monthNames");
  const months = Array.isArray(MONTH_SHORT) ? MONTH_SHORT : (typeof MONTH_SHORT === "string" ? MONTH_SHORT.split(",") : []);
  let dateStr = "—";
  if (session.sessionStartTime) {
    const d = new Date(session.sessionStartTime);
    const mon = months[d.getMonth()] || "";
    dateStr = `${d.getDate()} ${mon}`;
  }
  const sessionId = session.id ?? "?";
  return `<div class="cmp-pill cmp-pill-${which}" id="selector-card-${which}" role="button" tabindex="0" aria-label="${escapeHtml(label)}">
    <span class="cmp-pill-label">${escapeHtml(label)}</span>
    <span class="cmp-pill-id">#${sessionId}</span>
    <span class="cmp-pill-text">${escapeHtml(dateStr)} · ${escapeHtml(distStr)}</span>
    <span class="cmp-pill-edit" aria-hidden="true">✏️</span>
  </div>`;
}

/**
 * Calcula el rango Y (min-max) basado en percentiles p5-p95.
 * Helpers para escala distorsionada por percentiles.
 * El espacio de display [0-100] se divide en tres zonas:
 *   [0, 8]   → datos por debajo del p5 (comprimidos)
 *   [8, 92]  → zona central p5-p95 (expandida, usa el 84% del espacio)
 *   [92, 100] → datos por encima del p95 (comprimidos)
 */
function calcP(arr, pct) {
  const s = [...arr].filter(v => v > 0).sort((a, b) => a - b);
  return s[Math.floor(s.length * pct / 100)] || 0;
}
function toDisplay(val, p5, p95, maxVal) {
  if (val <= 0) return 0;
  if (val <= p5) return (val / p5) * 8;
  if (val <= p95) return 8 + ((val - p5) / (p95 - p5)) * 84;
  return 92 + ((val - p95) / (maxVal - p95)) * 8;
}
function fromDisplay(pct, p5, p95, maxVal) {
  if (pct <= 8) return (pct / 8) * p5;
  if (pct <= 92) return p5 + ((pct - 8) / 84) * (p95 - p5);
  return p95 + ((pct - 92) / 8) * (maxVal - p95);
}

function _initComparatorCharts(dpA, dpB, sA, sB) {
  _comparatorCharts.forEach((c) => c.destroy());
  _comparatorCharts = [];

  const COLOR_A = "#0ea5e9";
  const COLOR_B = "#f97316";
  const commonLine = { borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0.3 };

  /** Opciones base compartidas por todos los gráficos del comparador */
  function makeOpts() {
    return {
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
            padding: 10,
            font: { size: 11 },
            // Ocultar datasets con label vacío (los scatter de máximos)
            filter: (item) => item.text !== "",
          },
        },
      },
      elements: { point: { radius: 0, hoverRadius: 0 } },
      scales: { x: { ticks: { maxTicksLimit: 10 } } },
    };
  }

  function labelsAndData(dpSrc, key) {
    return dpSrc.map((p) => {
      const v = p[key];
      return (typeof v === "number" && Number.isFinite(v)) ? v : null;
    });
  }

  const labelsA = dpA.map((p) => p.second);
  const labelsB = dpB.map((p) => p.second);
  const mergedLabels = labelsA.length >= labelsB.length ? labelsA : labelsB;

  // ── Gráfico de Velocidad — 2 líneas sólidas ──
  const speedDataA = labelsAndData(dpA, "speedKmh");
  const speedDataB = labelsAndData(dpB, "speedKmh");

  const speedCanvas = document.getElementById("cmp-chart-speed");
  if (speedCanvas) {
    const hasSpeed = [...speedDataA, ...speedDataB].some((v) => v != null);
    if (!hasSpeed) {
      speedCanvas.closest(".comparator-chart-card")?.insertAdjacentHTML("beforeend", `<p class="muted small" style="padding:0.5rem 0">${escapeHtml(t("sessionDetail.noSamples"))}</p>`);
    } else {
      const opts = makeOpts();
      const speedCombined = [...speedDataA, ...speedDataB].filter(v => v != null && v > 0);
      const speedP5 = calcP(speedCombined, 5);
      const speedP95 = calcP(speedCombined, 95);
      const speedMax = (speedCombined.length ? Math.max(...speedCombined) : 1) * 1.02;
      const usePercentileSpeed = speedCombined.length >= 2 && speedP95 > speedP5 && speedMax > speedP95;
      let displaySpeedA = speedDataA;
      let displaySpeedB = speedDataB;
      if (usePercentileSpeed) {
        displaySpeedA = speedDataA.map(v => v == null ? null : toDisplay(v, speedP5, speedP95, speedMax));
        displaySpeedB = speedDataB.map(v => v == null ? null : toDisplay(v, speedP5, speedP95, speedMax));
        opts.scales.y = {
          type: "linear",
          min: 0,
          max: 100,
          afterBuildTicks(axis) {
            const points = [0, speedP5 * 0.4, speedP5, (speedP5 + speedP95) / 2, speedP95, speedMax].filter(v => v > 0);
            axis.ticks = points.map(v => ({ value: toDisplay(v, speedP5, speedP95, speedMax) }));
          },
          ticks: {
            callback(value) {
              const real = fromDisplay(value, speedP5, speedP95, speedMax);
              return real < 10 ? real.toFixed(1) : Math.round(real);
            },
          },
        };
        opts.plugins.tooltip = opts.plugins.tooltip || {};
        opts.plugins.tooltip.callbacks = opts.plugins.tooltip.callbacks || {};
        opts.plugins.tooltip.callbacks.label = function(ctx) {
          const real = fromDisplay(ctx.parsed.y, speedP5, speedP95, speedMax);
          const rounded = real < 10 ? real.toFixed(1) : Math.round(real);
          return `${ctx.dataset.label}: ${rounded}`;
        };
      }
      const ch = new Chart(speedCanvas, {
        type: "line",
        data: {
          labels: mergedLabels,
          datasets: [
            { label: "Sesión A", data: displaySpeedA, borderColor: COLOR_A, backgroundColor: "rgba(14,165,233,0.08)", ...commonLine },
            { label: "Sesión B", data: displaySpeedB, borderColor: COLOR_B, backgroundColor: "rgba(249,115,22,0.08)", ...commonLine },
          ],
        },
        options: opts,
      });
      _comparatorCharts.push(ch);
    }
  }

  // ── Gráfico de SPM — 2 líneas sólidas ──
  const spmDataA = labelsAndData(dpA, "spm");
  const spmDataB = labelsAndData(dpB, "spm");

  const spmCanvas = document.getElementById("cmp-chart-spm");
  if (spmCanvas) {
    const hasSpm = [...spmDataA, ...spmDataB].some((v) => v != null);
    if (!hasSpm) {
      spmCanvas.closest(".comparator-chart-card")?.insertAdjacentHTML("beforeend", `<p class="muted small" style="padding:0.5rem 0">${escapeHtml(t("sessionDetail.noSamples"))}</p>`);
    } else {
      const opts = makeOpts();
      const spmCombined = [...spmDataA, ...spmDataB].filter(v => v != null && v > 0);
      const spmP5 = calcP(spmCombined, 5);
      const spmP95 = calcP(spmCombined, 95);
      const spmMax = (spmCombined.length ? Math.max(...spmCombined) : 1) * 1.02;
      const usePercentileSpm = spmCombined.length >= 2 && spmP95 > spmP5 && spmMax > spmP95;
      let displaySpmA = spmDataA;
      let displaySpmB = spmDataB;
      if (usePercentileSpm) {
        displaySpmA = spmDataA.map(v => v == null ? null : toDisplay(v, spmP5, spmP95, spmMax));
        displaySpmB = spmDataB.map(v => v == null ? null : toDisplay(v, spmP5, spmP95, spmMax));
        opts.scales.y = {
          type: "linear",
          min: 0,
          max: 100,
          afterBuildTicks(axis) {
            const points = [0, spmP5 * 0.4, spmP5, (spmP5 + spmP95) / 2, spmP95, spmMax].filter(v => v > 0);
            axis.ticks = points.map(v => ({ value: toDisplay(v, spmP5, spmP95, spmMax) }));
          },
          ticks: {
            callback(value) {
              const real = fromDisplay(value, spmP5, spmP95, spmMax);
              return real < 10 ? real.toFixed(1) : Math.round(real);
            },
          },
        };
        opts.plugins.tooltip = opts.plugins.tooltip || {};
        opts.plugins.tooltip.callbacks = opts.plugins.tooltip.callbacks || {};
        opts.plugins.tooltip.callbacks.label = function(ctx) {
          const real = fromDisplay(ctx.parsed.y, spmP5, spmP95, spmMax);
          const rounded = real < 10 ? real.toFixed(1) : Math.round(real);
          return `${ctx.dataset.label}: ${rounded}`;
        };
      }
      const ch = new Chart(spmCanvas, {
        type: "line",
        data: {
          labels: mergedLabels,
          datasets: [
            { label: "Sesión A", data: displaySpmA, borderColor: COLOR_A, backgroundColor: "rgba(14,165,233,0.08)", ...commonLine },
            { label: "Sesión B", data: displaySpmB, borderColor: COLOR_B, backgroundColor: "rgba(249,115,22,0.08)", ...commonLine },
          ],
        },
        options: opts,
      });
      _comparatorCharts.push(ch);
    }
  }

  // ── Gráfico DPS — 2 líneas sólidas ──
  const dpsDataA = buildDpsSeriesForChart(dpA);
  const dpsDataB = buildDpsSeriesForChart(dpB);
  const dpsCanvas = document.getElementById("cmp-chart-dps");
  if (dpsCanvas) {
    const hasDps = [...dpsDataA, ...dpsDataB].some((v) => v != null && v !== 0);
    if (!hasDps) {
      dpsCanvas.closest(".comparator-chart-card")?.insertAdjacentHTML("beforeend", `<p class="muted small" style="padding:0.5rem 0">${escapeHtml(t("sessionDetail.noSamples"))}</p>`);
    } else {
      const opts = makeOpts();
      const dpsCombined = [...dpsDataA, ...dpsDataB].filter(v => v != null && v > 0);
      const dpsP5 = calcP(dpsCombined, 5);
      const dpsP95 = calcP(dpsCombined, 95);
      const dpsMax = (dpsCombined.length ? Math.max(...dpsCombined) : 1) * 1.02;
      const usePercentileDps = dpsCombined.length >= 2 && dpsP95 > dpsP5 && dpsMax > dpsP95;
      let displayDpsA = dpsDataA;
      let displayDpsB = dpsDataB;
      if (usePercentileDps) {
        displayDpsA = dpsDataA.map(v => v == null ? null : toDisplay(v, dpsP5, dpsP95, dpsMax));
        displayDpsB = dpsDataB.map(v => v == null ? null : toDisplay(v, dpsP5, dpsP95, dpsMax));
        opts.scales.y = {
          type: "linear",
          min: 0,
          max: 100,
          afterBuildTicks(axis) {
            const points = [0, dpsP5 * 0.4, dpsP5, (dpsP5 + dpsP95) / 2, dpsP95, dpsMax].filter(v => v > 0);
            axis.ticks = points.map(v => ({ value: toDisplay(v, dpsP5, dpsP95, dpsMax) }));
          },
          ticks: {
            callback(value) {
              const real = fromDisplay(value, dpsP5, dpsP95, dpsMax);
              return real < 10 ? real.toFixed(1) : Math.round(real);
            },
          },
        };
        opts.plugins.tooltip = opts.plugins.tooltip || {};
        opts.plugins.tooltip.callbacks = opts.plugins.tooltip.callbacks || {};
        opts.plugins.tooltip.callbacks.label = function(ctx) {
          const real = fromDisplay(ctx.parsed.y, dpsP5, dpsP95, dpsMax);
          const rounded = real < 10 ? real.toFixed(1) : Math.round(real);
          return `${ctx.dataset.label}: ${rounded}`;
        };
      }
      const ch = new Chart(dpsCanvas, {
        type: "line",
        data: {
          labels: mergedLabels,
          datasets: [
            { label: "Sesión A", data: displayDpsA, borderColor: COLOR_A, backgroundColor: "rgba(14,165,233,0.08)", ...commonLine },
            { label: "Sesión B", data: displayDpsB, borderColor: COLOR_B, backgroundColor: "rgba(249,115,22,0.08)", ...commonLine },
          ],
        },
        options: opts,
      });
      _comparatorCharts.push(ch);
    }
  }

  // ── Gráfico Force — 2 líneas sólidas ──
  const forceDataA = labelsAndData(dpA, "strokePeakAccelerationMs2");
  const forceDataB = labelsAndData(dpB, "strokePeakAccelerationMs2");
  const forceCanvas = document.getElementById("cmp-chart-force");
  if (forceCanvas) {
    const hasForce = [...forceDataA, ...forceDataB].some((v) => v != null);
    if (!hasForce) {
      forceCanvas.closest(".comparator-chart-card")?.insertAdjacentHTML("beforeend", `<p class="muted small" style="padding:0.5rem 0">${escapeHtml(t("sessionDetail.noSamples"))}</p>`);
    } else {
      const opts = makeOpts();
      const forceCombined = [...forceDataA, ...forceDataB].filter(v => v != null && v > 0);
      const forceP5 = calcP(forceCombined, 5);
      const forceP95 = calcP(forceCombined, 95);
      const forceMax = (forceCombined.length ? Math.max(...forceCombined) : 1) * 1.02;
      const usePercentileForce = forceCombined.length >= 2 && forceP95 > forceP5 && forceMax > forceP95;
      let displayForceA = forceDataA;
      let displayForceB = forceDataB;
      if (usePercentileForce) {
        displayForceA = forceDataA.map(v => v == null ? null : toDisplay(v, forceP5, forceP95, forceMax));
        displayForceB = forceDataB.map(v => v == null ? null : toDisplay(v, forceP5, forceP95, forceMax));
        opts.scales.y = {
          type: "linear",
          min: 0,
          max: 100,
          afterBuildTicks(axis) {
            const points = [0, forceP5 * 0.4, forceP5, (forceP5 + forceP95) / 2, forceP95, forceMax].filter(v => v > 0);
            axis.ticks = points.map(v => ({ value: toDisplay(v, forceP5, forceP95, forceMax) }));
          },
          ticks: {
            callback(value) {
              const real = fromDisplay(value, forceP5, forceP95, forceMax);
              return real < 10 ? real.toFixed(1) : Math.round(real);
            },
          },
        };
        opts.plugins.tooltip = opts.plugins.tooltip || {};
        opts.plugins.tooltip.callbacks = opts.plugins.tooltip.callbacks || {};
        opts.plugins.tooltip.callbacks.label = function(ctx) {
          const real = fromDisplay(ctx.parsed.y, forceP5, forceP95, forceMax);
          const rounded = real < 10 ? real.toFixed(1) : Math.round(real);
          return `${ctx.dataset.label}: ${rounded}`;
        };
      }
      const ch = new Chart(forceCanvas, {
        type: "line",
        data: {
          labels: mergedLabels,
          datasets: [
            { label: "Sesión A", data: displayForceA, borderColor: COLOR_A, backgroundColor: "rgba(14,165,233,0.08)", ...commonLine },
            { label: "Sesión B", data: displayForceB, borderColor: COLOR_B, backgroundColor: "rgba(249,115,22,0.08)", ...commonLine },
          ],
        },
        options: opts,
      });
      _comparatorCharts.push(ch);
    }
  }
}

function _openSessionPickerModal(allSessions, onPick, currentId) {
  const existing = document.getElementById("cmp-picker-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "cmp-picker-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1100;display:flex;align-items:center;justify-content:center;padding:16px";

  const em = "—";
  const items = allSessions
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((s) => {
      const dist = s.distance_meters != null ? `${Math.round(s.distance_meters)} m` : em;
      const dur = s.total_seconds != null ? _fmtDur(s.total_seconds) : em;
      const isCurrent = currentId != null && s.id === currentId;
      return `<div class="comparator-session-item${isCurrent ? " " : ""}" data-id="${s.id}" style="${isCurrent ? "border-color:#185fa5;background:#f0f7ff;" : ""}">
        <span style="font-weight:600;color:#185fa5">#${s.id}</span>
        <span style="color:#94a3b8;font-size:11px">${escapeHtml(fmtDate(s.created_at))}</span>
        <span>${escapeHtml(dist)}</span>
        <span>${escapeHtml(dur)}</span>
        <span style="color:#64748b;font-size:11px">${escapeHtml(s.team_name || "")}</span>
      </div>`;
    }).join("");

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:80vh;overflow-y:auto;display:flex;flex-direction:column">
      <div style="padding:18px 20px 0;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:15px;font-weight:700;color:#1e293b">${escapeHtml(t("sessions.selectSession"))}</div>
        <button id="cmp-picker-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:0 4px">×</button>
      </div>
      <div class="comparator-session-picker" style="padding:14px 20px 20px">${items}</div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("cmp-picker-close").addEventListener("click", () => overlay.remove());
  overlay.querySelectorAll(".comparator-session-item").forEach((el) => {
    el.addEventListener("click", () => {
      overlay.remove();
      onPick(Number(el.dataset.id));
    });
  });
}

export async function renderSessionComparator(idA, idB, layout, allSessions) {
  layout(`<p class="loading-line">${escapeHtml(t("sessions.loadingComparator"))}</p>`);
  _comparatorCharts.forEach((c) => c.destroy());
  _comparatorCharts = [];

  let sessionDataA = null;
  let sessionDataB = null;

  async function fetchAndRender(currentIdA, currentIdB) {
    try {
      const fetches = await Promise.all([
        currentIdA != null ? api.apiGetSession(currentIdA) : Promise.resolve(null),
        currentIdB != null ? api.apiGetSession(currentIdB) : Promise.resolve(null),
      ]);
      // El payload de sesión no incluye el id de la fila BD; lo inyectamos desde el nivel raíz
      sessionDataA = fetches[0]?.session ?? null;
      if (sessionDataA && fetches[0]?.id != null) sessionDataA = { ...sessionDataA, id: fetches[0].id };
      sessionDataB = fetches[1]?.session ?? null;
      if (sessionDataB && fetches[1]?.id != null) sessionDataB = { ...sessionDataB, id: fetches[1].id };
    } catch (ex) {
      layout(`<div class="card"><p class="msg-error">${escapeHtml(String(ex.message || ex))}</p><p><a class="link" href="#/sessions">← Volver</a></p></div>`);
      return;
    }
    renderComparatorView(currentIdA, currentIdB);
  }

  function renderComparatorView(currentIdA, currentIdB) {
    _comparatorCharts.forEach((c) => c.destroy());
    _comparatorCharts = [];

    const selectorAHtml = _buildComparatorSelectorHtml("a", sessionDataA);
    const selectorBHtml = _buildComparatorSelectorHtml("b", sessionDataB);

    let chartsHtml = "";
    if (sessionDataA && sessionDataB) {
      const m = _computeComparatorMetrics(sessionDataA, sessionDataB);
      const speedMetrics = _chartHeaderMetricsHtml({ maxA: m.maxSpeedA, avgA: m.avgSpeedA, maxB: m.maxSpeedB, avgB: m.avgSpeedB, unit: "km/h", showMax: true, decimals: 1 });
      const spmMetrics = _chartHeaderMetricsHtml({ avgA: m.avgSpmA, avgB: m.avgSpmB, unit: "spm", showMax: false, decimals: 0 });
      const dpsMetrics = _chartHeaderMetricsHtml({ avgA: m.avgDpsA, avgB: m.avgDpsB, unit: "m", showMax: false, decimals: 1 });
      const forceMetrics = _chartHeaderMetricsHtml({ avgA: m.avgForceA, avgB: m.avgForceB, unit: "", showMax: false, decimals: 1 });
      chartsHtml = `
        <div class="comparator-charts">
          <div class="comparator-chart-card">
            <div class="cmp-chart-header">
              <span class="cmp-chart-title">${escapeHtml(t("sessions.charts.speed"))}</span>
              <span class="cmp-chart-metrics">${speedMetrics}</span>
            </div>
            <div class="chart-canvas-wrap"><canvas id="cmp-chart-speed"></canvas></div>
          </div>
          <div class="comparator-chart-card">
            <div class="cmp-chart-header">
              <span class="cmp-chart-title">${escapeHtml(t("sessions.charts.spm"))}</span>
              <span class="cmp-chart-metrics">${spmMetrics}</span>
            </div>
            <div class="chart-canvas-wrap"><canvas id="cmp-chart-spm"></canvas></div>
          </div>
          <div class="comparator-chart-card">
            <div class="cmp-chart-header">
              <span class="cmp-chart-title">${escapeHtml(t("sessions.charts.dps"))}</span>
              <span class="cmp-chart-metrics">${dpsMetrics}</span>
            </div>
            <div class="chart-canvas-wrap"><canvas id="cmp-chart-dps"></canvas></div>
          </div>
          <div class="comparator-chart-card">
            <div class="cmp-chart-header">
              <span class="cmp-chart-title">${escapeHtml(t("sessions.charts.force"))}</span>
              <span class="cmp-chart-metrics">${forceMetrics}</span>
            </div>
            <div class="chart-canvas-wrap"><canvas id="cmp-chart-force"></canvas></div>
          </div>
        </div>`;
    }

    const promptHtml = (!sessionDataA || !sessionDataB)
      ? `<div style="text-align:center;color:#94a3b8;padding:1.5rem;font-size:13px">${escapeHtml(t("sessions.selectBoth"))}</div>`
      : "";

    layout(`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <a class="link" href="#/sessions" style="font-size:13px;color:#185fa5;text-decoration:none">← ${escapeHtml(t("sessions.title"))}</a>
        <span style="color:#e2e8f0">|</span>
        <h2 style="margin:0;font-size:16px;font-weight:700;color:#1e293b">${escapeHtml(t("sessions.comparatorTitle"))}</h2>
      </div>
      <div class="session-comparator card">
        <div class="comparator-selectors-row">
          ${selectorAHtml}
          <div class="vs-badge">VS</div>
          ${selectorBHtml}
        </div>
        ${promptHtml}
        ${chartsHtml}
      </div>
    `);

    if (sessionDataA && sessionDataB) {
      _initComparatorCharts(sessionDataA.dataPoints || [], sessionDataB.dataPoints || [], sessionDataA, sessionDataB);
    }

    // Wiring de selectores
    function wireSelectorClick(which) {
      const card = document.getElementById(`selector-card-${which}`);
      if (!card) return;
      card.addEventListener("click", () => {
        _openSessionPickerModal(allSessions || [], async (pickedId) => {
          if (which === "a") { currentIdA = pickedId; sessionDataA = null; }
          else { currentIdB = pickedId; sessionDataB = null; }
          await fetchAndRender(currentIdA, currentIdB);
        }, which === "a" ? currentIdA : currentIdB);
      });
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") card.click(); });
    }
    wireSelectorClick("a");
    wireSelectorClick("b");
  }

  await fetchAndRender(idA, idB);
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
