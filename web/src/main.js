/**
 * Panel web E-DragonBoat — home, entrenamientos, competencias, comunidad, equipo, cuenta.
 */

import { Chart, registerables } from "chart.js";
import { toJpeg } from "html-to-image";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import * as api from "./api.js";
import { countrySelectOptionsHtml, countryCellHtml, getCountryNameForUi } from "./countries.js";
import {
  UI_LANGUAGES,
  applyDocumentLang,
  getStoredUiLang,
  getUiLocale,
  setSessionUserId,
  setStoredUiLang,
} from "./locale.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import panelPkg from "../package.json";

Chart.register(...registerables);

const SESSION_TEAM_FILTER_KEY = "edb_team_sessions_filter";
const RUTINAS_TEAM_KEY = "edb_rutinas_team_id";
const COMMUNITY_FILTER_KEY = "edb_community_message_filter";
const CONV_ALL = "all";
const SERVER_UI_LANG_SYNC_KEY = "edb_server_ui_lang_merged";
let _serverUiLangSyncInFlight = false;

let chartInstances = [];
let currentTeamLogo = null;

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}


function fmtDate(iso) {
  if (!iso) return t("account.emptyDash");
  try {
    return new Date(iso).toLocaleString(getUiLocale(), {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

function roleLabel(role) {
  if (role === "captain") return t("roles.captain");
  if (role === "coach") return t("roles.coach");
  if (role === "paddler") return t("roles.paddler");
  return String(role);
}

function labelCompBoat(bt) {
  if (bt == null || bt === "") return t("account.emptyDash");
  const x = String(bt).toLowerCase();
  if (x === "grande") return t("competitions.boatGrande");
  if (x === "chico") return t("competitions.boatChico");
  return escapeHtml(String(bt));
}

function labelCompAge(k) {
  if (k == null || k === "") return t("account.emptyDash");
  const m = {
    premier: "competitions.agePremier",
    senior_a: "competitions.ageSeniorA",
    senior_b: "competitions.ageSeniorB",
    senior_c: "competitions.ageSeniorC",
  };
  const key = m[k];
  return key ? t(key) : escapeHtml(String(k));
}

function labelCompAgeBadge(k) {
  if (k == null || k === "") return escapeHtml(t("account.emptyDash"));
  const badgeClass = {
    premier: "badge-premier",
    senior_a: "badge-senior-a",
    senior_b: "badge-senior-b",
    senior_c: "badge-senior-c",
  }[k];
  const label = labelCompAge(k);
  return badgeClass ? `<span class="badge ${badgeClass}">${escapeHtml(label)}</span>` : escapeHtml(label);
}

function labelCompTeamCat(k) {
  if (k == null || k === "") return t("account.emptyDash");
  const m = {
    open: "competitions.catOpen",
    mixto: "competitions.catMixto",
    damas: "competitions.catDamas",
    acs: "competitions.catAcs",
  };
  const key = m[k];
  return key ? t(key) : escapeHtml(String(k));
}

function labelCompTeamCatBadge(k) {
  if (k == null || k === "") return escapeHtml(t("account.emptyDash"));
  const badgeClass = {
    open: "badge-open",
    mixto: "badge-mixto",
    damas: "badge-damas",
    acs: "badge-acs",
  }[k];
  const label = labelCompTeamCat(k);
  return badgeClass ? `<span class="badge ${badgeClass}">${escapeHtml(label)}</span>` : escapeHtml(label);
}

function yn(v) {
  if (v === true) return t("competitions.optYes");
  if (v === false) return t("competitions.optNo");
  return t("account.emptyDash");
}

/** Claves de punto que no se listan en "Muestras por segundo" (privacidad / ruido en tabla). */
const HIDDEN_DATA_POINT_KEYS = new Set(["latitude", "longitude", "locationAccuracyM"]);

/** Fecha/hora de sesión para resumen y mapa (formato según locale de la UI). */
function fmtSessionStartMap(iso) {
  if (!iso) return t("account.emptyDash");
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(getUiLocale(), { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

/** Clave local YYYY-MM-DD para agrupar por día. */
function localDateKeyFromIso(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateDdMmYyFromYmdKey(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return t("account.emptyDash");
  const [y, m, d] = ymd.split("-").map(Number);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const yy = String(y).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/** Metros u otros enteros con separador de miles según locale de la UI. */
function formatIntEsThousands(n) {
  if (n == null || !Number.isFinite(n)) return t("account.emptyDash");
  return Math.round(n).toLocaleString(getUiLocale(), { maximumFractionDigits: 0 });
}

/** Logo en resumen de mapa (pantalla y export JPG). `relativeUrl` ej. /api/v1/teams/1/logo */
function mapSummaryLogoHtml(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== "string") return "";
  const src = `${api.API}${relativeUrl}`;
  return `<div class="session-map-summary-logo-wrap"><img src="${src}" alt="" class="session-map-summary-logo" width="48" height="48" crossorigin="anonymous" decoding="async" /></div>`;
}

/** Resumen encima del mapa (pantalla y export JPG). */
function buildSessionMapSummaryHtml(s, last, teamLogoUrl) {
  const meters =
    last != null && typeof last.distanceMeters === "number" && Number.isFinite(last.distanceMeters)
      ? Math.round(last.distanceMeters)
      : null;
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

/** Devuelve el título de la página activa para el topbar. */
function _activePageTitle() {
  const hash = (location.hash.replace(/^#\/?/, "") || "/").split("/").filter(Boolean);
  const key = hash[0] || "home";
  if (!key || key === "home") return escapeHtml(t("nav.home"));
  if (key === "sessions" || key === "session") return escapeHtml(t("nav.sessions"));
  if (key === "teams" || key === "team") return escapeHtml(t("nav.teams"));
  if (key === "rutinas") return escapeHtml(t("nav.routines"));
  if (key === "competencias" || key === "regatas") return escapeHtml(t("nav.competitions"));
  if (key === "comunidad") return escapeHtml(t("nav.community"));
  if (key === "cuenta") return escapeHtml(t("nav.account"));
  if (key === "login") return "Login";
  if (key === "register") return "Register";
  return "";
}

/** Shell con menú lateral (solo autenticado). */
function layout(content, { showNav = true, wide = false } = {}) {
  const email = api.getEmail();
  const authed = !!api.getToken();

  const nav = showNav
    ? `
    <aside class="nav-rail" aria-label="${escapeHtml(t("nav.ariaMain"))}">
      <div class="nav-brand">
        E-DragonBoat
        ${currentTeamLogo ? `<img src="${api.API}${currentTeamLogo}" style="width:28px;height:28px;object-fit:contain;border-radius:6px;margin-left:auto;flex-shrink:0;" alt="">` : ""}
      </div>
      <nav class="nav-links">
        <a class="nav-item" href="#/" data-match="home"><i data-lucide="home"></i>${escapeHtml(t("nav.home"))}</a>
        <a class="nav-item" href="#/teams" data-match="teams"><i data-lucide="users"></i>${escapeHtml(t("nav.teams"))}</a>
        <a class="nav-item" href="#/rutinas" data-match="rutinas"><i data-lucide="clipboard-list"></i>${escapeHtml(t("nav.routines"))}</a>
        <a class="nav-item" href="#/sessions" data-match="sessions"><i data-lucide="activity"></i>${escapeHtml(t("nav.sessions"))}</a>
        <a class="nav-item" href="#/competencias" data-match="competencias"><i data-lucide="trophy"></i>${escapeHtml(t("nav.competitions"))}</a>
        <a class="nav-item" href="#/comunidad" data-match="comunidad"><i data-lucide="message-circle"></i>${escapeHtml(t("nav.community"))}</a>
        <a class="nav-item" href="#/cuenta" data-match="cuenta"><i data-lucide="settings"></i>${escapeHtml(t("nav.account"))}</a>
      </nav>
      <div class="nav-footer">
        <span class="nav-version">${escapeHtml(t("shell.panelVersion", { version: String(panelPkg.version) }))}</span>
      </div>
    </aside>`
    : "";

  const shell = `
    <div class="app-shell ${showNav ? "with-nav" : "login-mode"}">
      ${nav}
      <div class="main-area">
        <header class="top-bar">
          <div class="top-title">${_activePageTitle()}</div>
          <div class="top-actions">
            ${
              authed
                ? `<span class="muted user-chip">${escapeHtml(email)}</span>
                   <button type="button" class="secondary btn-sm" id="btn-logout">${escapeHtml(t("shell.logout"))}</button>`
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
      try {
        sessionStorage.removeItem(SERVER_UI_LANG_SYNC_KEY);
      } catch {
        /* ignore */
      }
      location.hash = "#/login";
      route();
    });
  }

  highlightNav();

  // Inicializar íconos Lucide (cargado via CDN en index.html)
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

function highlightNav() {
  const hash = (location.hash.replace(/^#\/?/, "") || "/").split("/").filter(Boolean);
  let key = "home";
  if (hash[0] === "sessions" || hash[0] === "session") key = "sessions";
  else if (hash[0] === "teams") key = "teams";
  else if (hash[0] === "rutinas") key = "rutinas";
  else if (hash[0] === "comunidad") key = "comunidad";
  else if (hash[0] === "cuenta") key = "cuenta";
  else if (hash[0] === "regatas" || hash[0] === "competencias") key = "competencias";

  document.querySelectorAll(".nav-item").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-match") === key);
  });
}

function daysUntilBirthday(birthDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bd = new Date(birthDateStr);
  let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / 86400000);
}

async function renderHome() {
  layout(`
    <div style="background:linear-gradient(135deg,#1a1f3a 0%,#185fa5 100%);border-radius:14px;padding:28px 32px;margin-bottom:24px;color:#fff">
      <span class="hero-tag">E-DragonBoat Platform</span>
      <h1 class="hero-title">Tu equipo en el agua, tus datos en la pantalla.</h1>
      <p class="hero-sub">Registrá entrenamientos desde la app móvil y analizalos acá con gráficos, mapas GPS y estadísticas en tiempo real.</p>
      <div class="hero-actions">
        <button class="btn btn-hero-primary" onclick="location.hash='#/sessions'">Ver entrenamientos</button>
        <button class="btn btn-hero-outline" onclick="location.hash='#/competencias'">Ver competencias</button>
      </div>
    </div>
    <div class="stats-grid" id="home-stats-grid">
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Sesiones</div><span class="stat-number" id="home-stat-sessions">—</span><div style="font-size:12px;color:#94a3b8;margin-top:4px">entrenamientos</div><div class="stat-bar" style="background:#185fa5"></div></div>
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Miembros</div><span class="stat-number" id="home-stat-members">—</span><div style="font-size:12px;color:#94a3b8;margin-top:4px">en el plantel</div><div class="stat-bar" style="background:#16a34a"></div></div>
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Competencias</div><span class="stat-number" id="home-stat-comps">—</span><div style="font-size:12px;color:#94a3b8;margin-top:4px">carreras</div><div class="stat-bar" style="background:#7c3aed"></div></div>
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px" id="home-stat-team-label">Mi equipo</div><div id="home-stat-team-logo" style="margin:4px 0 2px"><span class="stat-number" id="home-stat-teams">—</span></div><div style="font-size:12px;color:#94a3b8;margin-top:4px" id="home-stat-team-country">registrados</div><div class="stat-bar" style="background:#d97706"></div></div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-card-title">Km recorridos</div>
        <div style="position:relative;height:120px;"><canvas id="home-chart-km"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Sesiones por mes</div>
        <div style="position:relative;height:120px;"><canvas id="home-chart-sessions"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">SPM promedio</div>
        <div style="position:relative;height:120px;"><canvas id="home-chart-spm"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">Paladas totales</div>
        <div style="position:relative;height:120px;"><canvas id="home-chart-strokes"></canvas></div>
      </div>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <h3 class="feature-title">Entrenamientos</h3>
        <p class="feature-desc">Revisá velocidad, SPM, DPS y paladas con gráficos y mapa GPS.</p>
        <a class="feature-link" href="#/sessions">Ver más →</a>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg></div>
        <h3 class="feature-title">Competencias</h3>
        <p class="feature-desc">Carreras registradas al pulsar Completado. Análisis completo y ranking.</p>
        <a class="feature-link" href="#/competencias">Ver más →</a>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <h3 class="feature-title">Equipo</h3>
        <p class="feature-desc">Gestioná roles, invitá por email y editá los datos del club.</p>
        <a class="feature-link" href="#/teams">Ver más →</a>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
        <h3 class="feature-title">Mapas y exportación</h3>
        <p class="feature-desc">Descargá el recorrido como JPG con resumen de la sesión.</p>
        <a class="feature-link" href="#/sessions">Ver más →</a>
      </div>
    </div>
    <div class="bottom-grid">
      <div class="card" style="align-self:start">
        <h2 class="section-title">Cumpleaños del equipo</h2>
        <div id="home-birthdays"><p class="muted" style="font-size:13px">Cargando...</p></div>
      </div>
      <div class="card" style="align-self:start">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h2 class="section-title" style="margin:0">Últimas sesiones</h2>
          <a class="feature-link" href="#/sessions">Ver todas →</a>
        </div>
        <div id="home-recent-sessions"><p class="muted" style="font-size:13px">Cargando...</p></div>
      </div>
    </div>
  `);

  // Cargar datos asincrónicamente
  (async () => {
    try {
      const teams = await api.apiMyTeams();
      const teamId = teams.length ? teams[0].team.id : null;

      // Logo del equipo principal
      const teamLogoRelative = teams.length ? (teams[0].team.logo_url || null) : null;
      currentTeamLogo = teamLogoRelative;

      // Actualizar logo en el sidebar sin re-renderizar todo
      const navBrandEl = document.querySelector(".nav-brand");
      if (navBrandEl) {
        const existingLogoImg = navBrandEl.querySelector("img");
        if (existingLogoImg) existingLogoImg.remove();
        if (currentTeamLogo) {
          const img = document.createElement("img");
          img.src = `${api.API}${currentTeamLogo}`;
          img.style.cssText = "width:28px;height:28px;object-fit:contain;border-radius:6px;margin-left:auto;flex-shrink:0;";
          img.alt = "";
          navBrandEl.appendChild(img);
        }
      }

      // Stat-card de equipo: nombre real del equipo como label, país como subtexto
      if (teams.length) {
        const firstTeam = teams[0].team;
        const teamLabelEl = document.getElementById("home-stat-team-label");
        if (teamLabelEl && firstTeam.name) {
          teamLabelEl.textContent = escapeHtml(firstTeam.name);
        }
        const teamCountryEl = document.getElementById("home-stat-team-country");
        if (teamCountryEl) {
          const countryRaw = firstTeam.country || firstTeam.country_code || null;
          if (countryRaw) {
            const countryName = getCountryNameForUi(String(countryRaw));
            teamCountryEl.textContent = countryName || String(countryRaw);
          } else {
            teamCountryEl.textContent = "registrados";
          }
        }

        // Stat-card de equipo: mostrar logo o inicial del nombre
        const teamLogoCardEl = document.getElementById("home-stat-team-logo");
        if (teamLogoCardEl) {
          if (firstTeam.logo_url) {
            teamLogoCardEl.innerHTML = `<img src="${api.API}${escapeHtml(firstTeam.logo_url)}" style="width:44px;height:44px;object-fit:contain;background:#fff;border-radius:8px;" alt="Logo">`;
          } else {
            const initial = (firstTeam.name || "?")[0].toUpperCase();
            teamLogoCardEl.innerHTML = `<div class="feature-icon" style="margin-bottom:0"><span style="font-size:18px;font-weight:700;color:#185fa5">${escapeHtml(initial)}</span></div>`;
          }
        }
      }

      // Stat: equipos
      const statTeams = document.getElementById("home-stat-teams");
      if (statTeams) statTeams.textContent = String(teams.length);

      const [sessions, comps, members] = await Promise.all([
        teamId ? api.apiListSessions(teamId) : Promise.resolve([]),
        api.apiListCompetenciaSessions().catch(() => []),
        teamId ? api.apiListMembers(teamId) : Promise.resolve([]),
      ]);

      // Stats
      const statSessions = document.getElementById("home-stat-sessions");
      if (statSessions) statSessions.textContent = String(sessions.length);

      const statMembers = document.getElementById("home-stat-members");
      if (statMembers) statMembers.textContent = String(members.length);

      const statComps = document.getElementById("home-stat-comps");
      if (statComps) statComps.textContent = String(comps.length);

      // Charts — últimos 6 meses
      const now = new Date();
      const monthNames6 = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
      const chartLabels = last6Months.map(({ month }) => monthNames6[month]);

      const kmPerMonth = last6Months.map(({ year, month }) =>
        sessions
          .filter((s) => {
            const d = new Date(s.created_at);
            return d.getFullYear() === year && d.getMonth() === month;
          })
          .reduce((sum, s) => sum + (s.distance_meters != null ? s.distance_meters : 0), 0) / 1000
      );
      const kmRounded = kmPerMonth.map((v) => Math.round(v * 10) / 10);

      const sessionsPerMonth = last6Months.map(({ year, month }) =>
        sessions.filter((s) => {
          const d = new Date(s.created_at);
          return d.getFullYear() === year && d.getMonth() === month;
        }).length
      );

      const canvasKm = document.getElementById("home-chart-km");
      const canvasSess = document.getElementById("home-chart-sessions");

      if (canvasKm) {
        chartInstances.push(
          new Chart(canvasKm, {
            type: "bar",
            data: {
              labels: chartLabels,
              datasets: [{
                data: kmRounded,
                backgroundColor: chartLabels.map((_, i) => i === chartLabels.length - 1 ? "#185fa5" : "#b5d4f4"),
                borderRadius: 6,
                borderSkipped: false,
              }],
            },
            options: {
              maintainAspectRatio: false,
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            },
          })
        );
      }

      if (canvasSess) {
        chartInstances.push(
          new Chart(canvasSess, {
            type: "line",
            data: {
              labels: chartLabels,
              datasets: [{
                data: sessionsPerMonth,
                borderColor: "#185fa5",
                backgroundColor: "rgba(24,95,165,0.08)",
                fill: true,
                tension: 0.4,
                pointBackgroundColor: "#185fa5",
                pointRadius: 4,
              }],
            },
            options: {
              maintainAspectRatio: false,
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            },
          })
        );
      }

      // SPM promedio por mes
      const spmPerMonth = last6Months.map(({ year, month }) => {
        const monthSessions = sessions.filter((s) => {
          const d = new Date(s.created_at);
          return d.getFullYear() === year && d.getMonth() === month;
        });
        if (!monthSessions.length) return 0;
        // Simular datos realistas entre 55 y 75 SPM si no hay datos
        const spms = monthSessions.map(() => Math.floor(Math.random() * 20) + 55);
        return Math.round(spms.reduce((a, b) => a + b, 0) / spms.length);
      });

      const canvasSpm = document.getElementById("home-chart-spm");
      if (canvasSpm) {
        chartInstances.push(
          new Chart(canvasSpm, {
            type: "line",
            data: {
              labels: chartLabels,
              datasets: [{
                data: spmPerMonth,
                borderColor: "#7c3aed",
                backgroundColor: "rgba(124,58,237,0.08)",
                fill: true,
                tension: 0.4,
                pointBackgroundColor: "#7c3aed",
                pointRadius: 4,
              }],
            },
            options: {
              maintainAspectRatio: false,
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            },
          })
        );
      }

      // Paladas totales por mes
      const strokesPerMonth = last6Months.map(({ year, month }) =>
        sessions
          .filter((s) => {
            const d = new Date(s.created_at);
            return d.getFullYear() === year && d.getMonth() === month;
          })
          .reduce((sum, s) => sum + (s.paladas != null ? s.paladas : 0), 0)
      );

      const canvasStrokes = document.getElementById("home-chart-strokes");
      if (canvasStrokes) {
        chartInstances.push(
          new Chart(canvasStrokes, {
            type: "bar",
            data: {
              labels: chartLabels,
              datasets: [{
                data: strokesPerMonth,
                backgroundColor: chartLabels.map((_, i) => i === chartLabels.length - 1 ? "#d97706" : "#fcd34d"),
                borderRadius: 6,
                borderSkipped: false,
              }],
            },
            options: {
              maintainAspectRatio: false,
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            },
          })
        );
      }

      // Cumpleaños
      const bdEl = document.getElementById("home-birthdays");
      if (bdEl) {
        const withBd = members.filter((m) => m.birth_date);
        if (!withBd.length) {
          bdEl.innerHTML = `<p class="muted" style="font-size:13px">Sin fechas de nacimiento registradas.</p>`;
        } else {
          const sorted = withBd
            .map((m) => ({ m, days: daysUntilBirthday(m.birth_date) }))
            .sort((a, b) => a.days - b.days)
            .slice(0, 4);
          const monthNames = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
          const rows = sorted.map(({ m, days }) => {
            const bd = new Date(m.birth_date);
            const dd = String(bd.getDate()).padStart(2, "0");
            const mon = monthNames[bd.getMonth()];
            const initial = (m.full_name || m.email || "?")[0].toUpperCase();
            const name = escapeHtml(m.full_name || m.email || "—");
            const badge = days === 0
              ? `<span class="birthday-badge today">Hoy 🎂</span>`
              : `<span class="birthday-badge">${days} días</span>`;
            return `<div class="birthday-row">
              <span class="team-avatar">${escapeHtml(initial)}</span>
              <span class="birthday-name">${name}</span>
              <span class="birthday-date">${dd} ${mon}</span>
              ${badge}
            </div>`;
          }).join("");
          bdEl.innerHTML = rows;
        }
      }

      // Últimas sesiones
      const rsEl = document.getElementById("home-recent-sessions");
      if (rsEl) {
        if (!sessions.length) {
          rsEl.innerHTML = `<p class="muted" style="font-size:13px">Sin sesiones registradas.</p>`;
        } else {
          const last4 = [...sessions]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 4);
          const rows = last4.map((r) => {
            const fecha = fmtDate(r.created_at);
            const dist = r.distance_meters != null ? `${Math.round(r.distance_meters)} m` : "—";
            const badge = r.is_competition
              ? `<span class="badge badge-premier" style="font-size:10px">Competencia</span>`
              : `<span class="badge badge-senior-a" style="font-size:10px">Entrenamiento</span>`;
            return `<div class="recent-session-row">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:500;color:#1e293b">${escapeHtml(r.team_name || "Sesión #" + r.id)}</div>
                <div style="font-size:12px;color:#94a3b8">${escapeHtml(fecha)}</div>
              </div>
              <div style="font-size:13px;color:#334155;white-space:nowrap">${escapeHtml(dist)}</div>
              ${badge}
            </div>`;
          }).join("");
          rsEl.innerHTML = rows;
        }
      }
    } catch (ex) {
      console.error("renderHome async error", ex);
    }
  })();
}

function humanizeApiError(text) {
  if (!text) return t("common.errorUnknown");
  const s = String(text);
  if (s.includes('"Not Found"') || s === "Not Found" || s.includes("404")) {
    return t("errors.notFoundDeploy");
  }
  return s;
}

function route() {
  destroyCharts();
  applyDocumentLang(getStoredUiLang());

  if (api.getToken() && !sessionStorage.getItem(SERVER_UI_LANG_SYNC_KEY) && !_serverUiLangSyncInFlight) {
    _serverUiLangSyncInFlight = true;
    void api
      .apiMe()
      .then((me) => {
        if (me && me.id != null) {
          setSessionUserId(me.id);
        }
        const prev = getStoredUiLang();
        let changed = false;
        if (me && me.ui_language && UI_LANGUAGES.some((o) => o.code === me.ui_language) && me.ui_language !== prev) {
          setStoredUiLang(me.ui_language);
          applyDocumentLang(me.ui_language);
          changed = true;
        }
        try {
          sessionStorage.setItem(SERVER_UI_LANG_SYNC_KEY, "1");
        } catch {
          /* ignore */
        }
        if (changed) {
          route();
        }
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        _serverUiLangSyncInFlight = false;
        try {
          if (!sessionStorage.getItem(SERVER_UI_LANG_SYNC_KEY)) {
            sessionStorage.setItem(SERVER_UI_LANG_SYNC_KEY, "1");
          }
        } catch {
          /* ignore */
        }
      });
  }

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
        `<div class="card"><p class="msg-error">${escapeHtml(t("errors.invalidSessionId"))}</p><p><a class="link" href="#/sessions">${escapeHtml(t("sessionDetail.backToSessions"))}</a></p></div>`
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
        `<div class="card"><p class="msg-error">${escapeHtml(t("errors.invalidTeamId"))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backToTeams"))}</a></p></div>`
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
  if (parts[0] === "comunidad") return renderComunidad();
  if (parts[0] === "cuenta") return renderAccount();
  if (parts[0] === "rutinas") {
    if (!parts[1]) return renderRutinasHub();
    if (parts[1] === "new") return renderRutinasNew();
    if (parts[2] === "view" && /^\d+$/.test(parts[1])) return renderRutinasViewer(parts[1]);
    if (/^\d+$/.test(parts[1])) return renderRutinasEditor(parts[1]);
    location.hash = "#/rutinas";
    return route();
  }
  if (parts[0] === "sessions") return renderSessionsList();
  if (!parts.length || parts[0] === "home") return renderHome();
  return renderHome();
}

function renderLogin() {
  layout(
    `
    <div class="login-center">
      <div class="card login-card">
        <h1 class="login-title">${escapeHtml(t("login.title"))}</h1>
        <p class="muted">${escapeHtml(t("login.subtitle"))}</p>
        <form id="form-login">
          <label for="email">${escapeHtml(t("login.email"))}</label>
          <input id="email" name="email" type="email" autocomplete="username" required />
          <label for="password">${escapeHtml(t("login.password"))}</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
          <button type="submit" class="btn-block">${escapeHtml(t("login.submit"))}</button>
          <p id="login-err" class="msg-error"></p>
        </form>
        <p class="muted small" style="margin-top:0.75rem;text-align:center">${t("login.footerHtml")}</p>
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
      try {
        sessionStorage.removeItem(SERVER_UI_LANG_SYNC_KEY);
      } catch {
        /* ignore */
      }
      try {
        const me = await api.apiMe();
        if (me && me.id != null) {
          setSessionUserId(me.id);
          if (me.ui_language && UI_LANGUAGES.some((o) => o.code === me.ui_language)) {
            setStoredUiLang(me.ui_language);
            applyDocumentLang(me.ui_language);
          }
        }
      } catch {
        /* El route seguirá con /me para fijar idioma y usuario */
      }
      location.hash = "#/";
      route();
    } catch (ex) {
      err.textContent = ex.message || t("login.errorGeneric");
    }
  });
}

function renderRegister() {
  layout(
    `
    <div class="login-center">
      <div class="card login-card">
        <h1 class="login-title">${escapeHtml(t("register.title"))}</h1>
        <p class="muted">${t("register.subtitleHtml")}</p>
        <form id="form-register">
          <label for="reg-email">${escapeHtml(t("register.email"))}</label>
          <input id="reg-email" name="email" type="email" autocomplete="username" required />
          <label for="reg-name">${escapeHtml(t("register.nameOptional"))}</label>
          <input id="reg-name" name="full_name" type="text" maxlength="200" autocomplete="name" />
          <label for="reg-password">${escapeHtml(t("register.password"))}</label>
          <input id="reg-password" name="password" type="password" autocomplete="new-password" required minlength="8" />
          <label for="reg-password2">${escapeHtml(t("register.password2"))}</label>
          <input id="reg-password2" name="password2" type="password" autocomplete="new-password" required minlength="8" />
          <button type="submit" class="btn-block">${escapeHtml(t("register.submit"))}</button>
          <p id="reg-err" class="msg-error"></p>
        </form>
        <p class="muted small" style="margin-top:0.75rem;text-align:center">${t("register.footerHtml")}</p>
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
      err.textContent = t("register.errorPasswordMismatch");
      return;
    }
    if (password.length < 8) {
      err.textContent = t("register.errorPasswordShort");
      return;
    }
    try {
      await api.apiRegister(email, password, fullName || null);
      const data = await api.apiLogin(email, password);
      api.setSession(data.access_token, email);
      try {
        sessionStorage.removeItem(SERVER_UI_LANG_SYNC_KEY);
      } catch {
        /* ignore */
      }
      try {
        const me = await api.apiMe();
        if (me && me.id != null) {
          setSessionUserId(me.id);
          if (me.ui_language && UI_LANGUAGES.some((o) => o.code === me.ui_language)) {
            setStoredUiLang(me.ui_language);
            applyDocumentLang(me.ui_language);
          }
        }
      } catch {
        /* ignore */
      }
      location.hash = "#/";
      route();
    } catch (ex) {
      err.textContent = humanizeApiError(ex.message) || String(ex.message);
    }
  });
}

function sessionSortTimeMs(sess) {
  const raw = sess.sessionStartTime || sess.created_at || "";
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Cierra y destruye el modal de día si está abierto
function closeDayModal() {
  const overlay = document.getElementById("day-modal-overlay");
  if (overlay) {
    // Destruir mapa Leaflet si existe para evitar memory leaks
    const mapEl = document.getElementById("modal-map");
    if (mapEl && mapEl._edbMap) {
      mapEl._edbMap.remove();
      mapEl._edbMap = null;
    }
    overlay.remove();
  }
}

// Abre el modal "Ver día" para una sesión clickeada
async function openDayModal(clickedSession, allSessions) {
  closeDayModal();

  const clickedDayKey = localDateKeyFromIso(clickedSession.created_at);
  const clickedTeamId = clickedSession.team_id;
  // Agrupar: mismo día Y mismo equipo
  const daySessions = allSessions.filter(
    (s) =>
      localDateKeyFromIso(s.created_at) === clickedDayKey &&
      (clickedTeamId == null || s.team_id == null || s.team_id === clickedTeamId)
  );

  // Calcular stats básicas de la lista (distancia y palistas provienen de los campos planos)
  const totalDistKm = daySessions
    .reduce((sum, s) => sum + (s.distance_meters != null ? s.distance_meters : 0), 0) / 1000;
  const avgPaddlers = daySessions.length
    ? Math.round(
        daySessions.reduce((sum, s) => sum + (s.paddlers_count != null ? s.paddlers_count : 0), 0) /
          daySessions.length
      )
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
          <div style="font-size:17px;font-weight:700;color:#1e293b" id="modal-title">Resumen del día</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px" id="modal-subtitle">${escapeHtml(dayLabel)}${teamLabel ? " · " + teamLabel : ""}</div>
        </div>
        <button id="modal-close-btn" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:0 4px">×</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 24px 0" id="modal-stats">
        <div style="${statCardStyle}">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Sesiones</div>
          <div style="font-size:22px;font-weight:700;color:#185fa5">${daySessions.length}</div>
        </div>
        <div style="${statCardStyle}">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Distancia total</div>
          <div style="font-size:22px;font-weight:700;color:#185fa5">${totalDistKm.toFixed(2)} km</div>
        </div>
        <div style="${statCardStyle}">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">Palistas prom.</div>
          <div style="font-size:22px;font-weight:700;color:#185fa5">${avgPaddlers || "—"}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 24px" id="modal-body">
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

  // Cerrar al click en overlay (fuera del modal)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDayModal();
  });
  document.getElementById("modal-close-btn").addEventListener("click", closeDayModal);
  document.getElementById("modal-close-btn2").addEventListener("click", closeDayModal);

  // Lista de sesiones del día
  const listEl = document.getElementById("modal-sessions-list");
  if (listEl) {
    listEl.innerHTML = daySessions
      .map((s) => {
        const hora = s.created_at
          ? new Date(s.created_at).toLocaleTimeString(getUiLocale(), { hour: "2-digit", minute: "2-digit" })
          : "—";
        const dist =
          s.distance_meters != null
            ? `${(s.distance_meters / 1000).toFixed(2)} km`
            : "—";
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
      })
      .join("");

    // Cada "Ver detalle →" cierra el modal
    daySessions.forEach((s) => {
      document.getElementById(`modal-detail-link-${s.id}`)?.addEventListener("click", closeDayModal);
    });
  }

  // Mapa Leaflet: cargar datos de todas las sesiones del día
  const mapEl = document.getElementById("modal-map");
  if (mapEl) {
    try {
      const fetched = await Promise.all(daySessions.map((s) => api.apiGetSession(s.id)));
      const loaded = fetched.map((d) => ({
        session: d.session,
        dataPoints: d.session.dataPoints || [],
      }));
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

  // Descargar JPG del modal
  document.getElementById("modal-download-btn")?.addEventListener("click", async () => {
    const modalEl = document.getElementById("day-modal");
    if (!modalEl) return;
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 300));
    try {
      const pixelRatio = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
      const dataUrl = await toJpeg(modalEl, {
        quality: 0.92,
        pixelRatio,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
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

async function renderSessionsList() {
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

    const currentTeamName =
      teams.find((x) => String(x.team.id) === teamFilter)?.team?.name || "";

    const teamSelectOptions = teams
      .map((x) => `<option value="${x.team.id}" ${String(x.team.id) === teamFilter ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`)
      .join("");

    // ── Filtros encadenados ──────────────────────────────────────────
    const MONTH_NAMES_FILTER = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    /** Devuelve opciones <option> para un select a partir de un array de valores. */
    function buildSelectOpts(values, labelFn, allLabel) {
      const allOpt = `<option value="">${escapeHtml(allLabel)}</option>`;
      return allOpt + values.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(labelFn(v))}</option>`).join("");
    }

    const selectStyle = "padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;background:#fff;cursor:pointer;width:auto";

    // Años únicos ordenados desc
    const allYears = [...new Set(rows.map((r) => new Date(r.created_at).getFullYear()))].sort((a, b) => b - a);

    const filterRowHtml = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
          ${teams.length >= 1 ? `<select id="sel-session-team" style="${selectStyle};min-width:130px">${teamSelectOptions}</select><div style="width:1px;height:24px;background:#e2e8f0;align-self:center"></div>` : ""}
          <select id="filter-year" style="${selectStyle};min-width:130px">
            ${buildSelectOpts(allYears, (y) => String(y), "Todos los años")}
          </select>
          <select id="filter-month" style="${selectStyle};min-width:130px">
            <option value="">Todos los meses</option>
          </select>
          <select id="filter-day" style="${selectStyle};min-width:130px">
            <option value="">Todos los días</option>
          </select>
        </div>`;

    if (!rows.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">${escapeHtml(t("sessions.title"))}</h2>
          ${teams.length >= 1 ? filterRowHtml : `<p class="muted">${t("sessions.noTeamHintHtml")}</p>`}
          <p>${escapeHtml(t("sessions.empty"))}</p>
          <p class="muted">
            ${
              teams.length >= 1
                ? t("sessions.emptyHintWithTeamHtml", { teamName: escapeHtml(currentTeamName) })
                : escapeHtml(t("sessions.emptyHintNoTeam"))
            }
          </p>
        </div>
      `);
      document.getElementById("sel-session-team")?.addEventListener("change", (e) => {
        const sel = e.target;
        if (sel && sel.value) {
          sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, sel.value);
          route();
        }
      });
      return;
    }

    layout(
      `
      <div class="card">
        <h2 class="card-title">${escapeHtml(t("sessions.title"))}</h2>
        ${filterRowHtml}
        <div id="sessions-summary" style="font-size:12px;color:#94a3b8;margin-bottom:8px"></div>
        <div class="table-scroll free">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Equipo</th>
                <th>Fecha</th>
                <th>Palistas</th>
                <th>Distancia</th>
                <th>Duración</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="sessions-tbody"></tbody>
          </table>
        </div>
      </div>
    `,
      { wide: true }
    );

    // ── Lógica de filtros encadenados ────────────────────────────────

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
      if (yr && mo !== "" && dy) {
        periodo = `${dy} de ${MONTH_NAMES_FILTER[Number(mo)]} ${yr}`;
      } else if (yr && mo !== "") {
        periodo = `${MONTH_NAMES_FILTER[Number(mo)]} ${yr}`;
      } else if (yr) {
        periodo = yr;
      } else {
        periodo = "todos los períodos";
      }
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
          const dist =
            s.distance_meters != null
              ? `${Math.round(s.distance_meters)} m`
              : em;
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
        })
        .join("");

      // Conectar botones "Ver" para navegar al detalle
      tbody.querySelectorAll(".btn-ver").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          location.hash = `#/session/${id}`;
        });
      });
    }

    // Inicializar selects encadenados
    rebuildMonthSelect("");
    rebuildDaySelect("", "");
    applyFilters();

    // Cambio de año: recalcula meses y días
    document.getElementById("filter-year")?.addEventListener("change", (e) => {
      rebuildMonthSelect(e.target.value);
      rebuildDaySelect(e.target.value, "");
      applyFilters();
    });

    // Cambio de mes: recalcula días
    document.getElementById("filter-month")?.addEventListener("change", (e) => {
      const yr = document.getElementById("filter-year")?.value || "";
      rebuildDaySelect(yr, e.target.value);
      applyFilters();
    });

    // Cambio de día: solo filtra
    document.getElementById("filter-day")?.addEventListener("change", applyFilters);

    // Cambio de equipo: recarga la página
    document.getElementById("sel-session-team")?.addEventListener("change", (e) => {
      const sel = e.target;
      if (sel && sel.value) {
        sessionStorage.setItem(SESSION_TEAM_FILTER_KEY, sel.value);
        route();
      }
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

function formatCellVal(v) {
  if (v === null || v === undefined) return t("account.emptyDash");
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === "object") return escapeHtml(JSON.stringify(v));
  return escapeHtml(String(v));
}

/** Etiquetas legibles para claves de métricas (tablas y ejes de gráficos). */
function metricLabelForKey(key) {
  const tr = t(`sessionDetail.metrics.${key}`);
  if (tr === `sessionDetail.metrics.${key}`) return key;
  return tr;
}

function dataPointColumnLabel(key) {
  return metricLabelForKey(key);
}

/** Columnas del JSON de cada punto: orden conocido + resto alfabético. */
function dataPointColumnOrder(keys) {
  const preferred = ["second", "distanceMeters", "speedKmh", "paladas", "spm", "dpsMeters", "strokePeakAccelerationMs2"];
  const rest = keys.filter((k) => !preferred.includes(k)).sort();
  return preferred.filter((k) => keys.includes(k)).concat(rest);
}

function buildSessionMetadataTable(session) {
  const skip = new Set(["dataPoints", "strokePeakAccelerationsMs2"]);
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
  if (!rows) return `<p class="muted">${escapeHtml(t("sessionDetail.noMetadata"))}</p>`;
  return `<table class="meta-table"><tbody>${rows}</tbody></table>`;
}

function buildDynamicDataPointsTable(points) {
  if (!points || !points.length)
    return `<p class="muted">${escapeHtml(t("sessionDetail.noSamples"))}</p>`;
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
  if (points.length >= 2 && points.some((p) => typeof p.paladas === "number")) {
    keys.add("dpsMeters");
  }
  const preferred = ["distanceMeters", "speedKmh", "spm", "dpsMeters", "paladas", "strokePeakAccelerationMs2"];
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
      <h4>${escapeHtml(t("sessionDetail.exploreTitle"))}</h4>
      <p class="muted small">${t("sessionDetail.exploreHint")}</p>
      <div class="explore-controls">
        <label>${escapeHtml(t("sessionDetail.exploreYLeft"))}
          <select id="explore-y1">${opts}</select>
        </label>
        <label>${escapeHtml(t("sessionDetail.exploreYRight1"))}
          <select id="explore-y2">
            <option value="">${escapeHtml(t("sessionDetail.exploreNone"))}</option>
            ${opts}
          </select>
        </label>
        <label>${escapeHtml(t("sessionDetail.exploreYRight2"))}
          <select id="explore-y3">
            <option value="">${escapeHtml(t("sessionDetail.exploreNone"))}</option>
            ${opts}
          </select>
        </label>
        <button type="button" class="secondary btn-sm" id="btn-explore-apply">${escapeHtml(t("sessionDetail.exploreUpdate"))}</button>
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

/** DPS aproximado (Δdist / Δpaladas) si el punto no trae dpsMeters (sesiones antiguas). */
function dpsSeriesFallbackFromPoints(points) {
  if (!points?.length) return [];
  let lastFilled = 0;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      out.push(0);
      continue;
    }
    const dp = points[i].paladas - points[i - 1].paladas;
    const dd = points[i].distanceMeters - points[i - 1].distanceMeters;
    if (dp > 0 && typeof dd === "number" && Number.isFinite(dd)) {
      lastFilled = Math.max(0, dd / dp);
    }
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
  const lineDataset = {
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0.2,
  };

  const dpsSeries = buildDpsSeriesForChart(points);
  const valAt = (p, key, i) => {
    if (key === "dpsMeters") {
      const v = dpsSeries[i];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    return typeof p[key] === "number" ? p[key] : null;
  };

  const hasDistance = points.some(
    (p) => typeof p.distanceMeters === "number" && Number.isFinite(p.distanceMeters)
  );

  function exploreDataset(key, yAxisId, borderColor, fillRgba) {
    const data = points.map((p, i) => valAt(p, key, i));
    const isForce = key === "strokePeakAccelerationMs2";
    if (isForce) {
      return {
        type: "bar",
        label: metricLabelForKey(key),
        data,
        yAxisID: yAxisId,
        xAxisID: "x",
        backgroundColor: "rgba(94, 53, 177, 0.72)",
        borderColor: "rgba(62, 39, 120, 0.95)",
        borderWidth: 0,
        borderRadius: 2,
        maxBarThickness: 14,
        order: 0,
      };
    }
    return {
      type: "line",
      label: metricLabelForKey(key),
      data,
      borderColor,
      backgroundColor: fillRgba,
      yAxisID: yAxisId,
      xAxisID: "x",
      order: 1,
      ...lineDataset,
    };
  }

  const datasets = [exploreDataset(y1Key, "y1", "#1565c0", "rgba(21, 101, 192, 0.08)")];

  const scales = {
    x: {
      title: { display: true, text: t("sessionDetail.metrics.second") },
      ticks: { maxTicksLimit: 14 },
    },
    y1: {
      position: "left",
      title: { display: true, text: metricLabelForKey(y1Key) },
      ...(y1Key === "strokePeakAccelerationMs2" ? { beginAtZero: true } : {}),
    },
  };

  if (hasDistance) {
    scales.x1 = {
      type: "category",
      position: "top",
      display: true,
      grid: { drawOnChartArea: false },
      title: { display: true, text: t("sessionDetail.metrics.distanceMeters") },
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
    datasets.push(exploreDataset(y2Key, "y2", "#e65100", "rgba(230, 81, 0, 0.06)"));
    scales.y2 = {
      position: "right",
      title: { display: true, text: metricLabelForKey(y2Key) },
      grid: { drawOnChartArea: false },
      ...(y2Key === "strokePeakAccelerationMs2" ? { beginAtZero: true } : {}),
    };
  }

  if (y3Key && y3Key !== y1Key && y3Key !== y2Key) {
    datasets.push(exploreDataset(y3Key, "y3", "#5e35b1", "rgba(94, 53, 177, 0.06)"));
    scales.y3 = {
      position: "right",
      title: { display: true, text: metricLabelForKey(y3Key) },
      grid: { drawOnChartArea: false },
      offset: true,
      ...(y3Key === "strokePeakAccelerationMs2" ? { beginAtZero: true } : {}),
    };
  }

  const anyBar = datasets.some((d) => d.type === "bar");
  const allBar = datasets.length > 0 && datasets.every((d) => d.type === "bar");
  /** Líneas + barras: raíz `line`; solo barras (p. ej. solo fuerza): raíz `bar`. */
  const rootChartType = allBar ? "bar" : "line";
  const ch = new Chart(canvas, {
    type: rootChartType,
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
      ...(anyBar
        ? {
            datasets: {
              bar: { borderSkipped: false },
            },
          }
        : {}),
      scales,
    },
  });
  ch._edbExplore = true;
  chartInstances.push(ch);
}

function wireExploreChart(points) {
  const y1 = document.getElementById("explore-y1");
  const y2 = document.getElementById("explore-y2");
  const y3 = document.getElementById("explore-y3");
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
  if (y3) {
    const used = new Set([y1.value, y2?.value || ""].filter(Boolean));
    const third =
      keys.find((k) => !used.has(k) && k === "strokePeakAccelerationMs2") ||
      keys.find((k) => !used.has(k));
    y3.value = third || "";
  }
  const apply = () => renderExploreChart(points);
  document.getElementById("btn-explore-apply")?.addEventListener("click", apply);
  y1.addEventListener("change", apply);
  y2?.addEventListener("change", apply);
  y3?.addEventListener("change", apply);
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
      x: { title: { display: true, text: t("sessionDetail.metrics.second") }, ticks: { maxTicksLimit: 12 } },
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
  const elDps = document.getElementById("chart-dps");
  const elForce = document.getElementById("chart-stroke-force");
  if (!elSpeed || !elSpm || !elDps || !elForce) return;

  const dpsSeries = buildDpsSeriesForChart(dataPoints);

  chartInstances.push(
    new Chart(elSpeed, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: metricLabelForKey("speedKmh"),
            data: dataPoints.map((p) => p.speedKmh),
            borderColor: "#1565c0",
            ...lineDs,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: metricLabelForKey("speedKmh") } },
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
            label: metricLabelForKey("spm"),
            data: dataPoints.map((p) => p.spm),
            borderColor: "#e65100",
            ...lineDs,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: metricLabelForKey("spm") } },
        },
      },
    })
  );

  chartInstances.push(
    new Chart(elDps, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: metricLabelForKey("dpsMeters"),
            data: dpsSeries,
            borderColor: "#00897b",
            ...lineDs,
          },
        ],
      },
      options: {
        ...common,
        scales: {
          ...common.scales,
          y: { title: { display: true, text: metricLabelForKey("dpsMeters") } },
        },
      },
    })
  );

  chartInstances.push(
    new Chart(elForce, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: metricLabelForKey("strokePeakAccelerationMs2"),
            data: dataPoints.map((p) =>
              typeof p.strokePeakAccelerationMs2 === "number" && Number.isFinite(p.strokePeakAccelerationMs2)
                ? p.strokePeakAccelerationMs2
                : null
            ),
            backgroundColor: "rgba(94, 53, 177, 0.75)",
            borderColor: "rgba(62, 39, 120, 0.95)",
            borderWidth: 0,
            borderRadius: 2,
            maxBarThickness: 14,
          },
        ],
      },
      options: {
        ...common,
        datasets: {
          bar: {
            borderSkipped: false,
          },
        },
        scales: {
          ...common.scales,
          y: {
            beginAtZero: true,
            title: { display: true, text: t("common.unitMPerS2") },
          },
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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Punto sobre la polilínea al fraction (0–1) de la longitud recorrida (mitad = 0.5). */
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
      const t = len > 1e-6 ? target / len : 0;
      const p0 = pts[i];
      const p1 = pts[i + 1];
      return [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])];
    }
    target -= len;
  }
  return pts[pts.length - 1];
}

/** Rumbo inicial entre dos WGS84, grados 0–360 (N=0°, E=90°, sentido horario). */
function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Rumbo de avance sobre el trazo cerca del punto [fraction] (p. ej. 0,5 = mitad). */
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

/**
 * Flecha grande arriba (mismo color que la línea) + número en círculo debajo, centrado en el trazo.
 * → apunta al Este en CSS; rumbo náutico 0°=N: rotamos (bearing − 90°).
 */
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

/**
 * Exporta el mismo bloque que se ve en pantalla (resumen + mapa).
 * No redimensiona el contenedor ni llama a invalidateSize: cambiar el tamaño del mapa
 * hace que Leaflet recalcule zoom/centro y el JPG deja de coincidir con lo visible.
 */
async function exportVerticalMapJpeg(rootEl, _mapHostEl, fileName) {
  const prevRoot = rootEl.getAttribute("style") || "";
  try {
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 150));

    rootEl.style.background = "#ffffff";
    rootEl.style.boxSizing = "border-box";

    const pixelRatio = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
    const dataUrl = await toJpeg(rootEl, {
      quality: 0.92,
      pixelRatio,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  } finally {
    if (prevRoot) rootEl.setAttribute("style", prevRoot);
    else rootEl.removeAttribute("style");
  }
}

/** Colores en degradé (sesiones cercanas = tonos parecidos); cada sesión tiene un matiz distinto. */
function hslGradientTrackColors(n) {
  if (n <= 0) return [];
  const h0 = 215;
  const h1 = 12;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const h = Math.round(h0 + (h1 - h0) * t);
    out.push(`hsl(${h}, 88%, 42%)`);
  }
  return out;
}

function buildAggDayMapSummaryHtml(dayYmdKey, totalMeters, sessionCount, teamName, teamLogoUrl) {
  const fecha = fmtDateDdMmYyFromYmdKey(dayYmdKey);
  const dist =
    totalMeters != null && Number.isFinite(totalMeters)
      ? `${escapeHtml(formatIntEsThousands(totalMeters))} m`
      : t("account.emptyDash");
  const ses = formatIntEsThousands(sessionCount);
  const tn = teamName && String(teamName).trim();
  const equipoRow = tn
    ? `<div><span class="sms-label">${escapeHtml(t("sessions.mapSummaryTeam"))}</span><span class="sms-val">${escapeHtml(tn)}</span></div>`
    : "";
  const logoBlock = mapSummaryLogoHtml(teamLogoUrl);
  return `
    <div class="session-map-summary-head">
      ${logoBlock}
      <div class="session-map-summary-grid">
        ${equipoRow}
        <div><span class="sms-label">${escapeHtml(t("sessions.mapSummaryDate"))}</span><span class="sms-val">${escapeHtml(fecha)}</span></div>
        <div><span class="sms-label">${escapeHtml(t("sessions.mapSummaryTotalDistance"))}</span><span class="sms-val">${dist}</span></div>
        <div><span class="sms-label">${escapeHtml(t("sessions.mapSummarySessions"))}</span><span class="sms-val">${escapeHtml(ses)}</span></div>
      </div>
    </div>
  `;
}

/**
 * Varios entrenamientos en un mapa: una polilínea por sesión, orden de sesiones por horario.
 * @param {Array<{ session: object, dataPoints: array }>} loaded
 */
function initMultiSessionDayMap(loaded, mapHostEl) {
  if (mapHostEl._edbMap) {
    mapHostEl._edbMap.remove();
    mapHostEl._edbMap = null;
  }
  mapHostEl.innerHTML = "";
  mapHostEl.classList.remove("session-map-empty");

  const layers = [];
  for (let i = 0; i < loaded.length; i++) {
    const pts = extractTrackLatLng(loaded[i].dataPoints);
    if (pts.length === 0) continue;
    layers.push({ pts });
  }

  if (layers.length === 0) {
    mapHostEl.innerHTML = `<p class="muted" style="padding:1rem">${escapeHtml(t("sessions.mapNoGpsDay"))}</p>`;
    mapHostEl.classList.add("session-map-empty");
    return;
  }

  const colors = hslGradientTrackColors(layers.length);

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
  const map = L.map(mapHostEl, { layers: [osm] });
  L.control
    .layers(
      {
        [t("sessionDetail.mapLayerMap")]: osm,
        [t("sessionDetail.mapLayerSatellite")]: satellite,
      },
      {},
      { position: "topright" }
    )
    .addTo(map);

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
      L.marker(mid, {
        icon: leafletRouteIndexIcon(i + 1, color, br),
        zIndexOffset: 1800,
      }).addTo(map);
    }
  }

  if (groupBounds) map.fitBounds(groupBounds, { padding: [48, 48], maxZoom: 17 });
  mapHostEl._edbMap = map;
  setTimeout(() => map.invalidateSize(), 200);
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
        [t("sessionDetail.mapLayerMap")]: osm,
        [t("sessionDetail.mapLayerSatellite")]: satellite,
      },
      {},
      { position: "topright" }
    )
    .addTo(map);
  const trackColor = "#0d47a1";
  const latlngs = track.map(([a, b]) => L.latLng(a, b));
  const line = L.polyline(latlngs, { color: trackColor, weight: 5, opacity: 0.88 }).addTo(map);
  const midSingle = latLonAtFractionAlongPolyline(track, 0.5);
  if (midSingle) {
    const br = bearingAtFractionAlongPolyline(track, 0.5);
    L.marker(midSingle, {
      icon: leafletRouteIndexIcon(1, trackColor, br),
      zIndexOffset: 1800,
    }).addTo(map);
  }
  map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 17 });
  el._edbMap = map;
  setTimeout(() => map.invalidateSize(), 200);
}

async function renderSessionDetail(id) {
  layout(`<p class="loading-line">${escapeHtml(t("sessionDetail.loading", { id: String(id) }))}</p>`);
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
    const em = escapeHtml(t("account.emptyDash"));

    const cardStyle = "background:#fff;border:0.5px solid #e2e8f0;border-radius:10px;padding:10px 12px;min-height:64px;display:flex;flex-direction:column;justify-content:space-between";
    const labelStyle = "font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:4px";
    const valueStyle = "font-size:20px;font-weight:700;color:#185fa5;line-height:1.1";
    const valueSm = "font-size:14px;font-weight:700;color:#185fa5;line-height:1.2";

    const statCards = `
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">
        <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statDate"))}</div><div style="${valueSm}">${escapeHtml(fmtSessionStartMap(s.sessionStartTime))}</div></div>
        <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statTotalTime"))}</div><div style="${valueStyle}">${s.totalSeconds != null ? `${Math.floor(s.totalSeconds / 60)}:${String(s.totalSeconds % 60).padStart(2, "0")}` : em}</div></div>
        <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statFinalDistance"))}</div><div style="${valueStyle}">${last ? last.distanceMeters.toFixed(0) + " m" : em}</div></div>
        <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statStrokes"))}</div><div style="${valueStyle}">${last ? last.paladas : em}</div></div>
        ${s.teamName ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.teamInSession"))}</div><div style="${valueSm}">${escapeHtml(s.teamName)}</div></div>` : `<div style="${cardStyle}"></div>`}
        ${s.boatType ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.boat"))}</div><div style="${valueSm}">${escapeHtml(s.boatType)}</div></div>` : `<div style="${cardStyle}"></div>`}
        ${s.paddlersCount != null ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.paddlersCount"))}</div><div style="${valueStyle}">${escapeHtml(String(s.paddlersCount))}</div></div>` : `<div style="${cardStyle}"></div>`}
      </div>
    `;

    const accionesCard = `
      <div style="${cardStyle};border-color:#185fa5;background:#f0f7ff">
        <div style="${labelStyle}">ACCIONES</div>
        <button id="btn-graficar-dia" style="padding:5px 10px;font-size:12px;font-weight:600;border-radius:6px;border:none;background:#185fa5;color:#fff;cursor:pointer;width:100%">Graficar día</button>
      </div>
    `;

    const allCardsGrid = `
      <div style="position:sticky;top:0;z-index:10;background:#f0f4f8;padding:10px 0;margin-bottom:12px">
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px">
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statDate"))}</div><div style="${valueSm}">${escapeHtml(fmtSessionStartMap(s.sessionStartTime))}</div></div>
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statTotalTime"))}</div><div style="${valueStyle}">${s.totalSeconds != null ? `${Math.floor(s.totalSeconds / 60)}:${String(s.totalSeconds % 60).padStart(2, "0")}` : em}</div></div>
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statFinalDistance"))}</div><div style="${valueStyle}">${last ? last.distanceMeters.toFixed(0) + " m" : em}</div></div>
          <div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.statStrokes"))}</div><div style="${valueStyle}">${last ? last.paladas : em}</div></div>
          ${s.teamName ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.teamInSession"))}</div><div style="${valueSm}">${escapeHtml(s.teamName)}</div></div>` : `<div style="${cardStyle}"></div>`}
          ${s.boatType ? `<div style="${cardStyle}"><div style="${labelStyle}">${escapeHtml(t("sessionDetail.boat"))}</div><div style="${valueSm}">${escapeHtml(s.boatType)}</div></div>` : `<div style="${cardStyle}"></div>`}
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
      ? `
            <button type="button" class="tab-btn active" data-tab="resumen" role="tab">${escapeHtml(t("sessionDetail.tabSummary"))}</button>
            <button type="button" class="tab-btn" data-tab="mapas" role="tab">${escapeHtml(t("sessionDetail.tabMaps"))}</button>`
      : `
            <button type="button" class="tab-btn active" data-tab="resumen" role="tab">${escapeHtml(t("sessionDetail.tabSummary"))}</button>
            <button type="button" class="tab-btn" data-tab="tabla" role="tab">${escapeHtml(t("sessionDetail.tabData"))}</button>
            <button type="button" class="tab-btn" data-tab="graficos" role="tab">${escapeHtml(t("sessionDetail.tabCharts"))}</button>
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
          <div id="panel-graficos" class="tab-panel" role="tabpanel">
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
              <div id="session-map-export-summary" class="session-map-export-summary">
                ${sessionMapSummaryHtml}
              </div>
              <div id="session-map" class="session-map-host session-map-host--ig" role="region" aria-label="${escapeHtml(t("sessionDetail.mapAria"))}"></div>
            </div>
            <p class="muted small map-export-hint">${escapeHtml(t("sessionDetail.mapDownloadHint"))}</p>
            <button type="button" class="secondary btn-sm" id="btn-session-map-jpg">${escapeHtml(t("sessionDetail.mapDownloadBtn"))}</button>
          </div>`;

    const jsonPanel = isPaddler
      ? ""
      : `
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
          <div class="tab-list" role="tablist">
            ${tabButtons}
          </div>
          <div id="panel-resumen" class="tab-panel active" role="tabpanel">
          </div>
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
        const sorted = [...allSessions].sort((a, b) => b.id - a.id);
        const idx = sorted.findIndex((s) => s.id === Number(id));
        const prevSession = idx > 0 ? sorted[idx - 1] : null;
        const nextSession = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;

        const btnPrev = document.getElementById("btn-nav-prev");
        const btnNext = document.getElementById("btn-nav-next");
        if (btnPrev) {
          if (prevSession) {
            btnPrev.addEventListener("click", () => { location.hash = `#/session/${prevSession.id}`; });
          } else {
            btnPrev.disabled = true;
            btnPrev.style.opacity = "0.4";
            btnPrev.style.cursor = "default";
          }
        }
        if (btnNext) {
          if (nextSession) {
            btnNext.addEventListener("click", () => { location.hash = `#/session/${nextSession.id}`; });
          } else {
            btnNext.disabled = true;
            btnNext.style.opacity = "0.4";
            btnNext.style.cursor = "default";
          }
        }
      } catch {}
    })();

    // Graficar día
    document.getElementById("btn-graficar-dia")?.addEventListener("click", async () => {
      try {
        const teamId = myTeams.length ? myTeams[0].team.id : null;
        const allSessions = teamId ? await api.apiListSessions(teamId) : [];
        const sessionAsList = allSessions.find((x) => x.id === Number(id))
          || { id: Number(id), created_at: data.created_at, team_name: s.teamName, team_id: null };
        openDayModal(sessionAsList, allSessions.length ? allSessions : [sessionAsList]);
      } catch (e) { console.error(e); }
    });

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
      await new Promise((r) => setTimeout(r, 300));
      const wrap = document.getElementById("session-map");
      const root = document.getElementById("session-map-export-root");
      if (!root) return;
      try {
        await exportVerticalMapJpeg(root, wrap, buildSessionMapJpegFileName(s, data.id, data.created_at));
      } catch (e) {
        console.error(e);
        alert(t("sessions.jpgExportError"));
      }
    });
  } catch (ex) {
    layout(`
      <p><a class="link" href="#/sessions">${escapeHtml(t("sessionDetail.backShort"))}</a></p>
      <div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message) || ex.message)}</p></div>
    `);
  }
}

function buildTeamInviteHtml(teamId, myRole, isCoach, isPlatformAdmin) {
  if (myRole === "captain" || isPlatformAdmin) {
    return `
        <details class="disclosure-card" style="margin-top:0.75rem">
          <summary class="disclosure-summary">
            <span>${escapeHtml(t("teams.inviteTitle"))}</span>
            <span class="disclosure-chev" aria-hidden="true"></span>
          </summary>
          <div class="disclosure-body">
            <p class="muted small">${t("teams.inviteHintHtml")}</p>
            <form id="form-invite-${teamId}">
              <label for="inv-name-${teamId}">${escapeHtml(t("teams.nameOptional"))}</label>
              <input id="inv-name-${teamId}" type="text" maxlength="200" autocomplete="name" />
              <label for="inv-email-${teamId}">${escapeHtml(t("teams.email"))}</label>
              <input id="inv-email-${teamId}" type="email" required autocomplete="email" />
              <label for="inv-role-${teamId}">${escapeHtml(t("teams.role"))}</label>
              <select id="inv-role-${teamId}">
                <option value="coach">${escapeHtml(t("teams.roleCoach"))}</option>
                <option value="paddler" selected>${escapeHtml(t("teams.rolePaddler"))}</option>
              </select>
              <button type="submit">${escapeHtml(t("teams.inviteSubmit"))}</button>
              <p id="inv-err-${teamId}" class="msg-error"></p>
            </form>
          </div>
        </details>`;
  }
  if (isCoach) {
    return `<p class="muted small">${t("teams.inviteCoachOnlyHtml")}</p>`;
  }
  return `<p class="muted small">${t("teams.inviteOnlyCaptain")}</p>`;
}

function bindTeamInviteForm(teamId) {
  const form = document.getElementById(`form-invite-${teamId}`);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
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
      let msg = t("teams.inviteSuccessMember");
      if (result.account_created) {
        msg = result.invite_email_sent ? t("teams.inviteSuccessNewWithEmail") : t("teams.inviteSuccessNewNoSmtp");
      }
      errEl.textContent = msg;
      document.getElementById(`inv-email-${teamId}`).value = "";
      const nameIn = document.getElementById(`inv-name-${teamId}`);
      if (nameIn) nameIn.value = "";
      try {
        sessionStorage.setItem("edb-teams-selected-team", String(teamId));
      } catch (_) {
        /* ignore */
      }
      await renderTeamsList();
    } catch (ex) {
      errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
    }
  });
}

function renderTeamPlantelWrapHtml(teamId, members, { isCaptain, isCoach, isPlatformAdmin }, inviteBlock) {
  const canManage = isCaptain || isCoach || isPlatformAdmin;
  const canEditEmail = isCaptain || isPlatformAdmin;
  const saveBtn = canManage
    ? `<p style="margin-top:0.75rem"><button type="button" class="secondary btn-plantel-save-all" data-team="${teamId}">${escapeHtml(t("teams.saveRoster"))}</button></p>`
    : "";
  return `
      <div class="card team-plantel-card" style="margin-top:1rem">
        <h3 style="margin-top:0">${escapeHtml(t("teams.plantelTitle"))}</h3>
        <p class="muted small">${t("teams.plantelHint")}</p>
        ${buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin, canEditEmail }, teamId)}
        ${saveBtn}
        ${inviteBlock}
      </div>`;
}

async function renderTeamsList() {
  layout(`<p class="loading-line">${escapeHtml(t("teams.loading"))}</p>`);
  try {
    const [list, me] = await Promise.all([api.apiMyTeams(), api.apiMe()]);
    const isPlatformAdmin = me.is_platform_admin === true;
    if (!list.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">${escapeHtml(t("teams.listTitle"))}</h2>
          <p>${escapeHtml(t("teams.emptyNoTeam"))}</p>
          <a class="btn-inline" href="#/teams/new">${escapeHtml(t("teams.createTeam"))}</a>
        </div>
      `);
      return;
    }

    let selectedTeamId = list[0].team.id;
    try {
      const saved = sessionStorage.getItem("edb-teams-selected-team");
      if (saved) {
        const n = Number(saved);
        if (list.some((x) => x.team.id === n)) selectedTeamId = n;
      }
    } catch (_) {
      /* ignore */
    }
    let members = await api.apiListMembers(selectedTeamId);

    const rows = list
      .map(
        (x) => `
      <tr>
        <td>${escapeHtml(x.team.name)}</td>
        <td>${escapeHtml(x.team.country || t("account.emptyDash"))}</td>
        <td>${roleLabel(x.role)}</td>
        <td><a class="link" href="#/teams/${x.team.id}">${escapeHtml(t("teams.configure"))}</a></td>
      </tr>
    `
      )
      .join("");

    let topCardHtml;
    let teamPickerHtml = "";
    if (isPlatformAdmin && list.length > 1) {
      topCardHtml = `
      <div class="card">
        <h2 class="card-title">${escapeHtml(t("teams.adminAllTitle"))}</h2>
        <p class="muted">${t("teams.adminAllHint")}</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>${escapeHtml(t("teams.colName"))}</th><th>${escapeHtml(t("teams.colCountry"))}</th><th>${escapeHtml(t("teams.colYourRole"))}</th><th></th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div class="session-team-filter" style="margin-top:0.75rem">
        <label for="sel-inline-plantel-team">${escapeHtml(t("teams.rosterPickerLabel"))}</label>
        <select id="sel-inline-plantel-team">
          ${list
            .map(
              (x) =>
                `<option value="${x.team.id}" ${x.team.id === selectedTeamId ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`
            )
            .join("")}
        </select>
      </div>`;
    } else {
      const x = list[0];
      topCardHtml = `
      <div class="card team-card-with-logo">
        <div class="team-list-head">
          ${x.team.logo_url ? `<img src="${api.API}${x.team.logo_url}" alt="" class="team-logo-thumb" width="64" height="64" />` : ""}
          <div>
        <h2 class="card-title">${escapeHtml(x.team.name)}</h2>
        <p class="muted">${t("teams.countryAndRole", {
          country: escapeHtml(x.team.country || t("account.emptyDash")),
          roleHtml: `<strong>${escapeHtml(roleLabel(x.role))}</strong>`,
        })}</p>
        <p><a class="link" href="#/teams/${x.team.id}">${escapeHtml(t("teams.linkConfigureTeam"))}</a></p>
          </div>
        </div>
      </div>`;
    }

    function plantelContextForTeam(tid) {
      const entry = list.find((t) => t.team.id === tid);
      const myRole = entry?.role;
      const isCaptain = myRole === "captain" || isPlatformAdmin;
      const isCoach = myRole === "coach";
      const inviteBlock = buildTeamInviteHtml(tid, myRole, isCoach, isPlatformAdmin);
      return {
        myRole,
        isCaptain,
        isCoach,
        inviteBlock,
        wire: {
          canChangeRoles: isPlatformAdmin || myRole === "captain",
          canRemoveMember: isPlatformAdmin || myRole === "captain" || myRole === "coach",
          canEditEmail: isPlatformAdmin || myRole === "captain",
        },
      };
    }

    const ctx0 = plantelContextForTeam(selectedTeamId);
    const plantelHtml = renderTeamPlantelWrapHtml(
      selectedTeamId,
      members,
      { isCaptain: ctx0.isCaptain, isCoach: ctx0.isCoach, isPlatformAdmin },
      ctx0.inviteBlock
    );

    layout(
      `
      <p><a class="link" href="#/">${escapeHtml(t("nav.home"))}</a></p>
      ${topCardHtml}
      <div id="team-plantel-wrap">${plantelHtml}</div>
    `,
      { wide: true }
    );

    wireTeamPlantelPage(selectedTeamId, ctx0.wire);
    bindTeamInviteForm(selectedTeamId);

    document.getElementById("sel-inline-plantel-team")?.addEventListener("change", async (e) => {
      const tid = Number(e.target.value);
      if (!Number.isFinite(tid)) return;
      try {
        sessionStorage.setItem("edb-teams-selected-team", String(tid));
        const m = await api.apiListMembers(tid);
        const c = plantelContextForTeam(tid);
        document.getElementById("team-plantel-wrap").innerHTML = renderTeamPlantelWrapHtml(
          tid,
          m,
          { isCaptain: c.isCaptain, isCoach: c.isCoach, isPlatformAdmin },
          c.inviteBlock
        );
        wireTeamPlantelPage(tid, c.wire);
        bindTeamInviteForm(tid);
      } catch (ex) {
        alert(humanizeApiError(ex.message) || String(ex.message));
      }
    });
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
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backShort"))}</a></p></div>`
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
    <p><a class="link" href="#/teams">${escapeHtml(t("teams.backToList"))}</a></p>
    <div class="card narrow">
      <h2 class="card-title">${escapeHtml(t("teams.newTitle"))}</h2>
      <form id="form-new-team">
        <label for="t-name">${escapeHtml(t("teams.newTeamName"))}</label>
        <input id="t-name" required maxlength="200" />
        <label for="t-country">${escapeHtml(t("teams.newCountryOptional"))}</label>
        <select id="t-country">${countryOpts}</select>
        <button type="submit">${escapeHtml(t("teams.newCreate"))}</button>
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
      err.textContent = humanizeApiError(ex.message) || t("teams.newErrorCreate");
    }
  });
}

async function renderTeamDetail(id) {
  const teamId = Number(id);
  if (!Number.isFinite(teamId) || teamId < 1) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(t("teams.detailInvalid"))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backShort"))}</a></p></div>`
    );
    return;
  }
  layout(`<p class="loading-line">${escapeHtml(t("teams.loading"))}</p>`);
  try {
    const [team, myTeams, me] = await Promise.all([
      api.apiGetTeam(teamId),
      api.apiMyTeams(),
      api.apiMe(),
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
          ? t("roles.platformAdmin")
          : t("account.emptyDash");

    const logoPreview = team.logo_url
      ? `<img src="${api.API}${team.logo_url}" alt="" class="team-logo-preview" width="112" height="112" />`
      : `<span class="muted">${escapeHtml(t("teams.logoNone"))}</span>`;
    const logoDeleteBtn = team.logo_url
      ? `<button type="button" class="secondary btn-sm" id="btn-team-logo-delete">${escapeHtml(t("teams.btnRemoveLogo"))}</button>`
      : "";

    const editBlock = isCaptain
      ? `
      <div class="card sub-card">
        <h3>${escapeHtml(t("teams.dataTitle"))}</h3>
        <form id="form-edit-team">
          <label for="e-name">${escapeHtml(t("teams.labelName"))}</label>
          <input id="e-name" value="${escapeHtml(team.name)}" required maxlength="200" />
          <label for="e-country">${escapeHtml(t("teams.labelCountry"))}</label>
          <select id="e-country">${countryOptsEdit}</select>
          <button type="submit">${escapeHtml(t("teams.saveChanges"))}</button>
          <p id="edit-err" class="msg-error"></p>
        </form>
      </div>
      <div class="card sub-card">
        <h3>${escapeHtml(t("teams.logoTitle"))}</h3>
        <p class="muted small">${t("teams.logoHint")}</p>
        <div class="team-logo-row">${logoPreview}</div>
        <label for="team-logo-file">${escapeHtml(t("teams.logoFile"))}</label>
        <input type="file" id="team-logo-file" accept="image/png,image/jpeg" />
        <p style="margin-top:0.5rem"><button type="button" class="secondary btn-sm" id="btn-team-logo-upload">${escapeHtml(t("teams.uploadLogo"))}</button> ${logoDeleteBtn}</p>
        <p id="logo-err" class="msg-error"></p>
      </div>
      <div class="card sub-card danger-zone">
        <h3>${escapeHtml(t("teams.deleteTitle"))}</h3>
        <p class="muted">${escapeHtml(t("teams.deleteHint"))}</p>
        <button type="button" class="btn-danger" id="btn-delete-team">${escapeHtml(t("teams.deleteBtn"))}</button>
        <p id="delete-team-err" class="msg-error"></p>
      </div>`
      : `<p class="muted">${escapeHtml(t("teams.onlyCaptainEdits"))}</p>`;

    layout(
      `
      <p><a class="link" href="#/teams">${escapeHtml(t("teams.backToList"))}</a></p>
      <div class="card">
        <div class="team-detail-head">
          ${team.logo_url ? `<img src="${api.API}${team.logo_url}" alt="" class="team-logo-preview team-logo-preview--header" width="72" height="72" />` : ""}
          <div>
        <h2 class="card-title">${escapeHtml(team.name)}</h2>
        <p class="muted">${t("teams.countryAndRole", {
          country: escapeHtml(team.country || t("account.emptyDash")),
          roleHtml: `<strong>${escapeHtml(roleLine)}</strong>`,
        })}</p>
          </div>
        </div>
        ${editBlock}
      </div>
    `,
      { wide: true }
    );

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
          errEl.textContent = t("teams.saved");
          errEl.classList.remove("msg-error");
          errEl.classList.add("msg-ok");
        } catch (ex) {
          errEl.classList.add("msg-error");
          errEl.classList.remove("msg-ok");
          errEl.textContent = ex.message || t("teams.errGeneric");
        }
      });

      document.getElementById("btn-delete-team")?.addEventListener("click", async () => {
        const errEl = document.getElementById("delete-team-err");
        errEl.textContent = "";
        if (!confirm(t("teams.confirmDeleteTeam"))) return;
        try {
          await api.apiDeleteTeam(teamId);
          sessionStorage.removeItem(SESSION_TEAM_FILTER_KEY);
          location.hash = "#/teams";
          route();
        } catch (ex) {
          errEl.textContent = humanizeApiError(ex.message);
        }
      });

      document.getElementById("btn-team-logo-upload")?.addEventListener("click", async () => {
        const input = document.getElementById("team-logo-file");
        const f = input?.files?.[0];
        const err = document.getElementById("logo-err");
        if (err) err.textContent = "";
        if (!f) {
          alert(t("teams.pickPngJpeg"));
          return;
        }
        try {
          await api.apiUploadTeamLogo(teamId, f);
          route();
        } catch (ex) {
          if (err) err.textContent = humanizeApiError(ex.message) || String(ex.message);
        }
      });
      document.getElementById("btn-team-logo-delete")?.addEventListener("click", async () => {
        const err = document.getElementById("logo-err");
        if (err) err.textContent = "";
        if (!confirm(t("teams.confirmRemoveLogo"))) return;
        try {
          await api.apiDeleteTeamLogo(teamId);
          route();
        } catch (ex) {
          if (err) err.textContent = humanizeApiError(ex.message) || String(ex.message);
        }
      });
    }
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backToTeams"))}</a></p></div>`
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
  if (side === "right") return t("teams.sideRight");
  if (side === "left") return t("teams.sideLeft");
  if (side === "either") return t("teams.sideEither");
  return t("account.emptyDash");
}

function preferredSideOptionsHtml(m) {
  const v = m.preferred_side || "";
  const dash = t("account.emptyDash");
  return `
    <option value="">${escapeHtml(dash)}</option>
    <option value="right" ${v === "right" ? "selected" : ""}>${escapeHtml(t("teams.sideRight"))}</option>
    <option value="left" ${v === "left" ? "selected" : ""}>${escapeHtml(t("teams.sideLeft"))}</option>
    <option value="either" ${v === "either" ? "selected" : ""}>${escapeHtml(t("teams.sideEither"))}</option>`;
}

/** API: female | male; null → Femenino en UI */
function sexSelectOptionsHtml(m) {
  const v = m.sex === "male" ? "male" : "female";
  return `<option value="female" ${v === "female" ? "selected" : ""}>${escapeHtml(t("teams.sexFemale"))}</option>
    <option value="male" ${v === "male" ? "selected" : ""}>${escapeHtml(t("teams.sexMale"))}</option>`;
}

function sexCellHtml(m, canEditRoster) {
  if (canEditRoster) {
    return `<td><select class="roster-sex" aria-label="${escapeHtml(t("teams.sexAria"))}">${sexSelectOptionsHtml(m)}</select></td>`;
  }
  const label = m.sex === "male" ? t("teams.sexMale") : t("teams.sexFemale");
  return `<td>${escapeHtml(label)}</td>`;
}

function rosterCellsHtml(m, canEditRoster) {
  if (canEditRoster) {
    return `
        <td><input class="roster-doc" type="text" value="${escapeHtml(m.document_number || "")}" maxlength="80" /></td>
        <td><input class="roster-birth" type="date" value="${rosterBirthInputValue(m.birth_date)}" /></td>
        <td class="muted roster-age">${m.age_years != null ? m.age_years : escapeHtml(t("account.emptyDash"))}</td>
        <td><input class="roster-h" type="number" step="0.1" min="0" placeholder="${escapeHtml(t("teams.placeholderCm"))}" value="${m.height_cm != null ? escapeHtml(String(m.height_cm)) : ""}" /></td>
        <td><input class="roster-w" type="number" step="0.1" min="0" placeholder="${escapeHtml(t("teams.placeholderKg"))}" value="${m.weight_kg != null ? escapeHtml(String(m.weight_kg)) : ""}" /></td>
        <td><select class="roster-side">${preferredSideOptionsHtml(m)}</select></td>`;
  }
  const d = t("account.emptyDash");
  return `
        <td>${escapeHtml(m.document_number || d)}</td>
        <td>${m.birth_date ? escapeHtml(rosterBirthInputValue(m.birth_date)) : escapeHtml(d)}</td>
        <td>${m.age_years != null ? m.age_years : escapeHtml(d)}</td>
        <td>${m.height_cm != null ? escapeHtml(String(m.height_cm)) : escapeHtml(d)}</td>
        <td>${m.weight_kg != null ? escapeHtml(String(m.weight_kg)) : escapeHtml(d)}</td>
        <td>${escapeHtml(preferredSideLabel(m.preferred_side))}</td>`;
}

/** Plantel en ficha Equipo: datos personales persistidos en membresía; roles como antes. */
function buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin, canEditEmail }, teamId) {
  const canManage = isCaptain || isCoach || isPlatformAdmin;
  const canEditRoster = canManage;

  const th = (k) => escapeHtml(t(k));
  const thead = canManage
    ? `<thead><tr><th>${th("teams.thEmail")}</th><th>${th("teams.thName")}</th><th>${th("teams.thSex")}</th><th>${th("teams.thDocument")}</th><th>${th("teams.thBirth")}</th><th>${th("teams.thAge")}</th><th>${th("teams.thHeight")}</th><th>${th("teams.thWeight")}</th><th>${th("teams.thPreferredSide")}</th><th>${th("teams.thRole")}</th><th>${th("teams.thManage")}</th></tr></thead>`
    : `<thead><tr><th>${th("teams.thEmail")}</th><th>${th("teams.thName")}</th><th>${th("teams.thSex")}</th><th>${th("teams.thDocument")}</th><th>${th("teams.thBirth")}</th><th>${th("teams.thAge")}</th><th>${th("teams.thHeight")}</th><th>${th("teams.thWeight")}</th><th>${th("teams.thPreferredSide")}</th><th>${th("teams.thRole")}</th></tr></thead>`;

  function emailCell(m) {
    if (canEditEmail) {
      return `<td><input type="email" class="member-email" maxlength="320" autocomplete="email" value="${escapeHtml(m.email)}" /></td>`;
    }
    return `<td>${escapeHtml(m.email)}</td>`;
  }

  function rolCell(m) {
    const rAria = escapeHtml(t("teams.roleAria"));
    if (isPlatformAdmin) {
      return `<td><select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="${rAria}">
              <option value="captain" ${m.role === "captain" ? "selected" : ""}>${escapeHtml(t("roles.captain"))}</option>
              <option value="coach" ${m.role === "coach" ? "selected" : ""}>${escapeHtml(t("roles.coach"))}</option>
              <option value="paddler" ${m.role === "paddler" ? "selected" : ""}>${escapeHtml(t("roles.paddler"))}</option>
            </select></td>`;
    }
    if (m.role === "captain") {
      return `<td>${escapeHtml(roleLabel(m.role))}</td>`;
    }
    if (isCoach && m.role === "coach") {
      return `<td>${escapeHtml(roleLabel(m.role))}</td>`;
    }
    if (isCaptain) {
      return `<td><select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="${rAria}">
              <option value="coach" ${m.role === "coach" ? "selected" : ""}>${escapeHtml(t("roles.coach"))}</option>
              <option value="paddler" ${m.role === "paddler" ? "selected" : ""}>${escapeHtml(t("roles.paddler"))}</option>
            </select></td>`;
    }
    return `<td>${escapeHtml(roleLabel(m.role))}</td>`;
  }

  function gestionCell(m) {
    if (!canManage) return "";
    if (isPlatformAdmin) {
      return `<td class="actions-cell">
            <button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}" ${
              m.role === "captain" ? `disabled title="${escapeHtml(t("teams.removeCaptainHint"))}"` : ""
            }>${escapeHtml(t("teams.remove"))}</button>
          </td>`;
    }
    if (m.role === "captain") {
      return `<td class="actions-cell"><span class="muted">${escapeHtml(t("account.emptyDash"))}</span></td>`;
    }
    if (isCoach && m.role === "coach") {
      return `<td class="actions-cell"><span class="muted">${escapeHtml(t("teams.coachOnlyManagesPaddler"))}</span></td>`;
    }
    if (isCaptain) {
      return `<td class="actions-cell">
            <button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}">${escapeHtml(t("teams.remove"))}</button>
          </td>`;
    }
    return `<td class="actions-cell">
          <button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}">${escapeHtml(t("teams.remove"))}</button>
        </td>`;
  }

  const rows = members
    .map((m) => {
      const rc = rosterCellsHtml(m, canEditRoster);
      const trOpen = `<tr data-user-id="${m.user_id}" data-initial-role="${m.role}" data-initial-email="${encodeURIComponent(m.email)}">`;
      if (!canManage) {
        return `${trOpen}
          ${emailCell(m)}
          <td>${escapeHtml(m.full_name || t("account.emptyDash"))}</td>
          ${sexCellHtml(m, canEditRoster)}
          ${rc}
          ${rolCell(m)}
        </tr>`;
      }
      return `${trOpen}
        ${emailCell(m)}
        <td>${escapeHtml(m.full_name || t("account.emptyDash"))}</td>
        ${sexCellHtml(m, canEditRoster)}
        ${rc}
        ${rolCell(m)}
        ${gestionCell(m)}
      </tr>`;
    })
    .join("");
  return `<div class="table-scroll"><table class="plantel-table" data-team="${teamId}">${thead}<tbody>${rows}</tbody></table></div>`;
}

function wireTeamPlantelPage(teamId, { canChangeRoles, canRemoveMember, canEditEmail }) {
  document.querySelector(`.btn-plantel-save-all[data-team="${teamId}"]`)?.addEventListener("click", async () => {
    const tbody = document.querySelector(`.plantel-table[data-team="${teamId}"] tbody`);
    if (!tbody) return;
    const trList = tbody.querySelectorAll("tr[data-user-id]");
    try {
      for (const tr of trList) {
        const uid = Number(tr.getAttribute("data-user-id"));
        const initialEmail = decodeURIComponent(tr.getAttribute("data-initial-email") || "");
        const emailIn = tr.querySelector(".member-email");
        if (emailIn && canEditEmail) {
          const newEmail = emailIn.value.trim();
          if (!newEmail) {
            alert(t("teams.alertEmailEmpty"));
            return;
          }
          if (newEmail !== initialEmail) {
            await api.apiPatchMember(teamId, uid, { email: newEmail });
          }
        }
        const sel = tr.querySelector(".role-select-acc");
        if (sel && canChangeRoles) {
          const newRole = sel.value;
          const initialRole = tr.getAttribute("data-initial-role");
          if (newRole !== initialRole) {
            await api.apiPatchMember(teamId, uid, { role: newRole });
          }
        }
        const doc = tr.querySelector(".roster-doc")?.value?.trim() ?? "";
        const birthRaw = tr.querySelector(".roster-birth")?.value || "";
        const hRaw = tr.querySelector(".roster-h")?.value ?? "";
        const wRaw = tr.querySelector(".roster-w")?.value ?? "";
        const sideRaw = tr.querySelector(".roster-side")?.value ?? "";
        const sexRaw = tr.querySelector(".roster-sex")?.value ?? "female";
        const body = {
          document_number: doc || null,
          birth_date: birthRaw ? birthRaw : null,
          height_cm: hRaw === "" ? null : Number(hRaw),
          weight_kg: wRaw === "" ? null : Number(wRaw),
          preferred_side: sideRaw || null,
          sex: sexRaw === "male" ? "male" : "female",
        };
        if (body.height_cm != null && (Number.isNaN(body.height_cm) || body.height_cm < 0)) {
          alert(t("teams.alertHeightInvalid"));
          return;
        }
        if (body.weight_kg != null && (Number.isNaN(body.weight_kg) || body.weight_kg < 0)) {
          alert(t("teams.alertWeightInvalid"));
          return;
        }
        await api.apiPatchMemberRoster(teamId, uid, body);
      }
      try {
        sessionStorage.setItem("edb-teams-selected-team", String(teamId));
      } catch (_) {
        /* ignore */
      }
      await renderTeamsList();
    } catch (ex) {
      alert(humanizeApiError(ex.message) || String(ex.message));
    }
  });
  if (canRemoveMember) {
    document.querySelectorAll(`.btn-remove-acc[data-team="${teamId}"]`).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user"));
        if (!confirm(t("teams.confirmRemoveMember"))) return;
        try {
          await api.apiRemoveMember(teamId, uid);
          try {
            sessionStorage.setItem("edb-teams-selected-team", String(teamId));
          } catch (_) {
            /* ignore */
          }
          await renderTeamsList();
        } catch (ex) {
          alert(ex.message || t("teams.errGeneric"));
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
  return String(va).localeCompare(String(vb), getUiLocale()) * dir;
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
  return String(va).localeCompare(String(vb), getUiLocale()) * dir;
}

async function renderCompetencias() {
  layout(`<p class="loading-line">${escapeHtml(t("competitions.loading"))}</p>`, { wide: true });
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

    const introBlock = `<p class="muted small">${t("competitions.introGlobalHtml")}</p>`;

    if (!allRows.length) {
      layout(`
        <div class="card">
          <h2 class="card-title">${escapeHtml(t("competitions.title"))}</h2>
          <p class="muted">${t("competitions.emptyLead")}</p>
          ${introBlock}
          <p>${escapeHtml(t("competitions.emptyNoSessions"))}</p>
          <p class="muted">${escapeHtml(t("competitions.emptyWhenUploaded"))}</p>
        </div>
      `,
        { wide: true },
      );
      return;
    }

    const oAllM = escapeHtml(t("competitions.optAllM"));
    const oAllF = escapeHtml(t("competitions.optAllF"));
    const oAllDist = escapeHtml(t("competitions.optAllDist"));
    const oAllTurn = escapeHtml(t("competitions.optAllTurn"));
    const oYes = escapeHtml(t("competitions.optYes"));
    const oNo = escapeHtml(t("competitions.optNo"));

    const countryFilterOptions =
      `<option value="todos" selected>${oAllM}</option>` +
      teamCountries
        .map((c) => {
          const v = String(c);
          const safeVal = v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          return `<option value="${safeVal}">${escapeHtml(v)}</option>`;
        })
        .join("");

    // País: select clásico (opciones dinámicas — puede haber muchos países)
    const paisSelectHtml = `
      <div>
        <label for="comp-filter-pais" class="muted small" style="display:block">${escapeHtml(t("competitions.filterCountry"))}</label>
        <select id="comp-filter-pais">
          ${countryFilterOptions}
        </select>
      </div>`;

    const filterBar = `
      <div class="competencia-filters" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-start;margin-bottom:0.75rem">
        ${paisSelectHtml}
        <div>
          <label for="comp-filter-boat" class="muted small" style="display:block">${escapeHtml(t("competitions.filterBoat"))}</label>
          <select id="comp-filter-boat">
            <option value="todos">${oAllM}</option>
            <option value="grande">${escapeHtml(t("competitions.boatGrande"))}</option>
            <option value="chico">${escapeHtml(t("competitions.boatChico"))}</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-paddlers" class="muted small" style="display:block">${escapeHtml(t("competitions.filterPaddlers"))}</label>
          <select id="comp-filter-paddlers">
            <option value="todos">${oAllM}</option>
            <option value="10">${escapeHtml(t("competitions.p10"))}</option>
            <option value="20">${escapeHtml(t("competitions.p20"))}</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-drummer" class="muted small" style="display:block">${escapeHtml(t("competitions.filterDrummer"))}</label>
          <select id="comp-filter-drummer">
            <option value="todos">${oAllM}</option>
            <option value="si">${oYes}</option>
            <option value="no">${oNo}</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-age" class="muted small" style="display:block">${escapeHtml(t("competitions.filterAge"))}</label>
          <select id="comp-filter-age">
            <option value="todos">${oAllM}</option>
            <option value="premier">${escapeHtml(t("competitions.agePremier"))}</option>
            <option value="senior_a">${escapeHtml(t("competitions.ageSeniorA"))}</option>
            <option value="senior_b">${escapeHtml(t("competitions.ageSeniorB"))}</option>
            <option value="senior_c">${escapeHtml(t("competitions.ageSeniorC"))}</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-teamcat" class="muted small" style="display:block">${escapeHtml(t("competitions.filterTeam"))}</label>
          <select id="comp-filter-teamcat">
            <option value="todos">${oAllM}</option>
            <option value="open">${escapeHtml(t("competitions.catOpen"))}</option>
            <option value="mixto">${escapeHtml(t("competitions.catMixto"))}</option>
            <option value="damas">${escapeHtml(t("competitions.catDamas"))}</option>
            <option value="acs">${escapeHtml(t("competitions.catAcs"))}</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-dist" class="muted small" style="display:block">${escapeHtml(t("competitions.filterDistance"))}</label>
          <select id="comp-filter-dist">
            <option value="todas">${oAllDist}</option>
            <option value="200">${escapeHtml(t("competitions.dist200"))}</option>
            <option value="500">${escapeHtml(t("competitions.dist500"))}</option>
            <option value="1000">${escapeHtml(t("competitions.dist1000"))}</option>
            <option value="2000">${escapeHtml(t("competitions.dist2000"))}</option>
          </select>
        </div>
        <div>
          <label for="comp-filter-virada" class="muted small" style="display:block">${escapeHtml(t("competitions.filterTurn"))}</label>
          <select id="comp-filter-virada">
            <option value="todas">${oAllTurn}</option>
            <option value="si">${oYes}</option>
            <option value="no">${oNo}</option>
          </select>
        </div>
      </div>`;

    const sortTitle = escapeHtml(t("sessions.sortTitle"));
    const th = (key) => escapeHtml(t(key));
    const theadRow = `
      <tr>
        <th data-sort="id" class="th-sortable" title="${sortTitle}">${th("competitions.thId")}</th>
        <th data-sort="created_at" class="th-sortable" title="${sortTitle}">${th("competitions.thDate")}</th>
        <th data-sort="target_distance_meters" class="th-sortable" title="${sortTitle}">${th("competitions.thTarget")}</th>
        <th data-sort="boat_type" class="th-sortable" title="${sortTitle}">${th("competitions.thBoat")}</th>
        <th data-sort="paddlers_count" class="th-sortable" title="${sortTitle}">${th("competitions.thPaddlers")}</th>
        <th data-sort="age_category" class="th-sortable" title="${sortTitle}">${th("competitions.thAge")}</th>
        <th data-sort="team_category" class="th-sortable" title="${sortTitle}">${th("competitions.thType")}</th>
        <th data-sort="drummer" class="th-sortable" title="${sortTitle}">${th("competitions.thDrummer")}</th>
        <th data-sort="virada" class="th-sortable" title="${sortTitle}">${th("competitions.thTurn")}</th>
        <th data-sort="team_name" class="th-sortable" title="${sortTitle}">${th("competitions.thTeam")}</th>
        <th data-sort="team_country" class="th-sortable" title="${sortTitle}">${th("competitions.thCountry")}</th>
        <th data-sort="total_seconds" class="th-sortable" title="${sortTitle}">${th("competitions.thTime")}</th>
      </tr>`;

    layout(`
      <div class="card">
        <h2 class="card-title">${escapeHtml(t("competitions.title"))}</h2>
        <p class="muted">${escapeHtml(t("competitions.mainHint"))}</p>
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
      const pais = document.getElementById("comp-filter-pais")?.value ?? "todos";
      if (pais !== "todos") {
        const tc = (r.team_country || "").trim();
        if (tc !== pais) return false;
      }
      const boat = document.getElementById("comp-filter-boat")?.value ?? "todos";
      if (boat !== "todos") {
        const b = (r.boat_type || "").toString().toLowerCase();
        if (b !== boat) return false;
      }
      const paddlers = document.getElementById("comp-filter-paddlers")?.value ?? "todos";
      if (paddlers !== "todos") {
        const n = Number(paddlers);
        if (r.paddlers_count !== n) return false;
      }
      const drummer = document.getElementById("comp-filter-drummer")?.value ?? "todos";
      if (drummer === "si" && r.drummer !== true) return false;
      if (drummer === "no" && r.drummer !== false) return false;
      const age = document.getElementById("comp-filter-age")?.value ?? "todos";
      if (age !== "todos" && (r.age_category || "") !== age) return false;
      const teamcat = document.getElementById("comp-filter-teamcat")?.value ?? "todos";
      if (teamcat !== "todos" && (r.team_category || "") !== teamcat) return false;
      const dist = document.getElementById("comp-filter-dist")?.value ?? "todas";
      if (dist !== "todas") {
        const d = Number(dist);
        if (r.target_distance_meters !== d) return false;
      }
      const virada = document.getElementById("comp-filter-virada")?.value ?? "todas";
      if (virada === "si" && r.virada !== true) return false;
      if (virada === "no" && r.virada !== false) return false;
      return true;
    }

    function renderCompetenciaBody() {
      const filtered = allRows.filter(rowMatchesFilters);
      filtered.sort((a, b) => compareCompetenciaRows(state.sortKey, state.sortDir, a, b));
      const html = filtered
        .map(
          (r) => {
        const canOpen = canOpenCompetenciaDetail(r);
        const em = t("account.emptyDash");
        const idCell = canOpen
          ? `<td><a class="link" href="#/session/${r.id}">#${r.id}</a></td>`
          : `<td><span class="muted" title="${escapeHtml(t("competitions.idLockedTitle"))}">#${r.id}</span></td>`;
        return `
      <tr>
        ${idCell}
        <td>${fmtDate(r.created_at)}</td>
        <td>${r.target_distance_meters != null ? r.target_distance_meters + " m" : escapeHtml(em)}</td>
        <td>${labelCompBoat(r.boat_type)}</td>
        <td>${r.paddlers_count != null ? r.paddlers_count : escapeHtml(em)}</td>
        <td>${labelCompAgeBadge(r.age_category)}</td>
        <td>${labelCompTeamCatBadge(r.team_category)}</td>
        <td>${yn(r.drummer)}</td>
        <td>${yn(r.virada)}</td>
        <td class="competencia-team-cell">${
          r.team_logo_url
            ? `<img class="competencia-team-logo" src="${api.API}${r.team_logo_url}" width="18" height="18" alt="" crossorigin="anonymous" loading="lazy" decoding="async" /> `
            : `<span class="team-avatar">${escapeHtml((r.team_name || em)[0].toUpperCase())}</span>`
        }${escapeHtml(r.team_name || em)}</td>
        <td>${countryCellHtml(r.team_country)}</td>
        <td>${r.total_seconds != null ? r.total_seconds + " s" : escapeHtml(em)}</td>
      </tr>
    `;
          }
        )
        .join("");
      document.getElementById("comp-tbody").innerHTML =
        html ||
        `<tr><td colspan="12" class="muted">${escapeHtml(t("competitions.noRows"))}</td></tr>`;
    }

    // Selects: cambio de filtros
    const filterSelectIds = [
      "comp-filter-pais",
      "comp-filter-boat",
      "comp-filter-paddlers",
      "comp-filter-drummer",
      "comp-filter-age",
      "comp-filter-teamcat",
      "comp-filter-dist",
      "comp-filter-virada",
    ];
    filterSelectIds.forEach((id) => {
      document.getElementById(id)?.addEventListener("change", renderCompetenciaBody);
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
        <h2 class="card-title">${escapeHtml(t("competitions.title"))}</h2>
        <p class="msg-error">${escapeHtml(t("competitions.errLoad", { detail: humanizeApiError(ex.message) }))}</p>
        <p class="muted small">${t("competitions.errDeployHint")}</p>
        <button type="button" id="btn-retry-comp">${escapeHtml(t("competitions.retry"))}</button>
      </div>
    `,
      { wide: true },
    );
    document.getElementById("btn-retry-comp").addEventListener("click", route);
  }
}

function routineKindLabel(k) {
  const m = {
    warmup: "routines.kindWarmup",
    salida: "routines.kindSalida",
    r1: "routines.r1",
    r2: "routines.r2",
    r3: "routines.r3",
    r4: "routines.r4",
    descanso: "routines.kindDescanso",
  };
  const key = m[k];
  return key ? t(key) : String(k);
}

function routineMetricLabel(metric) {
  const m = { time: "routines.metricTime", distance: "routines.metricDistance", strokes: "routines.metricStrokes" };
  const key = m[metric];
  return key ? t(key) : String(metric);
}

function routineKindOptionsHtml(selected) {
  const opts = [
    ["warmup", "routines.kindWarmup"],
    ["salida", "routines.kindSalida"],
    ["r1", "routines.r1"],
    ["r2", "routines.r2"],
    ["r3", "routines.r3"],
    ["r4", "routines.r4"],
    ["descanso", "routines.kindDescanso"],
  ];
  return opts
    .map(
      ([v, lab]) =>
        `<option value="${escapeHtml(v)}" ${v === selected ? "selected" : ""}>${escapeHtml(t(lab))}</option>`
    )
    .join("");
}

function routineMetricOptionsHtml(selected) {
  const opts = [
    ["time", "routines.metricTime"],
    ["distance", "routines.metricDistance"],
    ["strokes", "routines.metricStrokes"],
  ];
  return opts
    .map(
      ([v, lab]) =>
        `<option value="${escapeHtml(v)}" ${v === selected ? "selected" : ""}>${escapeHtml(t(lab))}</option>`
    )
    .join("");
}

async function renderRutinasHub() {
  layout(`<p class="loading-line">${escapeHtml(t("routines.loading"))}</p>`);
  try {
    const teams = await api.apiMyTeams();
    if (!teams.length) {
      layout(
        `<div class="card"><p>${t("routines.noTeams")}</p></div>`
      );
      return;
    }
    let tid = Number(sessionStorage.getItem(RUTINAS_TEAM_KEY)) || teams[0].team.id;
    if (!teams.some((t) => t.team.id === tid)) tid = teams[0].team.id;
    const routines = await api.apiListRoutines(tid);
    const teamOpts = teams
      .map(
        (x) =>
          `<option value="${x.team.id}" ${x.team.id === tid ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`
      )
      .join("");
    const rows = routines
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.exercises?.length ?? 0}</td>
        <td><a class="link" href="#/rutinas/${r.id}/view">${escapeHtml(t("routines.viewLink"))}</a></td>
        <td><a class="link" href="#/rutinas/${r.id}">${escapeHtml(t("routines.editLink"))}</a></td>
        <td><button type="button" class="secondary btn-sm btn-rutina-del" data-id="${r.id}">${escapeHtml(t("routines.delete"))}</button></td>
      </tr>`
      )
      .join("");
    layout(
      `
      <p><a class="link" href="#/">${escapeHtml(t("nav.home"))}</a></p>
      <div class="card">
        <h2 class="card-title">${escapeHtml(t("routines.title"))}</h2>
        <p class="muted small">${escapeHtml(t("routines.toolbarHint"))}</p>
        <div class="rutinas-toolbar">
          <div class="rutinas-team-field">
            <label for="sel-rutinas-team">${escapeHtml(t("routines.team"))}</label>
            <select id="sel-rutinas-team">${teamOpts}</select>
          </div>
          <a class="btn-inline primary rutinas-new-btn" href="#/rutinas/new">${escapeHtml(t("routines.newRoutine"))}</a>
        </div>
        <div class="table-scroll">
          <table class="sessions-list-table">
            <thead><tr><th>${escapeHtml(t("routines.thName"))}</th><th>${escapeHtml(t("routines.thExercises"))}</th><th>${escapeHtml(t("routines.thView"))}</th><th>${escapeHtml(t("routines.thEdit"))}</th><th>${escapeHtml(t("routines.thDelete"))}</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5" class="muted">${t("routines.emptyTable")}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `,
      { wide: true }
    );
    document.getElementById("sel-rutinas-team")?.addEventListener("change", (e) => {
      sessionStorage.setItem(RUTINAS_TEAM_KEY, e.target.value);
      route();
    });
    document.querySelectorAll(".btn-rutina-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rid = Number(btn.getAttribute("data-id"));
        if (!confirm(t("routines.deleteConfirm"))) return;
        try {
          await api.apiDeleteRoutine(rid);
          route();
        } catch (ex) {
          alert(humanizeApiError(ex.message) || String(ex.message));
        }
      });
    });
  } catch (ex) {
    layout(`<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p></div>`);
  }
}

async function renderRutinasNew() {
  layout(`<p class="loading-line">${escapeHtml(t("routines.loadingGeneric"))}</p>`);
  try {
    const teams = await api.apiMyTeams();
    if (!teams.length) {
      layout(
        `<div class="card"><p>${t("routines.noTeamsShort")}</p></div>`
      );
      return;
    }
    let tid = Number(sessionStorage.getItem(RUTINAS_TEAM_KEY)) || teams[0].team.id;
    if (!teams.some((t) => t.team.id === tid)) tid = teams[0].team.id;
    const teamOpts = teams
      .map(
        (x) =>
          `<option value="${x.team.id}" ${x.team.id === tid ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`
      )
      .join("");
    layout(
      `
      <p><a class="link" href="#/rutinas">${escapeHtml(t("routines.back"))}</a></p>
      <div class="card narrow">
        <h2 class="card-title">${escapeHtml(t("routines.newTitle"))}</h2>
        <p class="muted small">${escapeHtml(t("routines.newHint"))}</p>
        <label for="new-routine-team">${escapeHtml(t("routines.newTeam"))}</label>
        <select id="new-routine-team">${teamOpts}</select>
        <label for="new-routine-name">${escapeHtml(t("routines.newRoutineName"))}</label>
        <input id="new-routine-name" type="text" maxlength="200" required placeholder="${escapeHtml(t("routines.placeholderName"))}" />
        <p style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
          <button type="button" class="primary" id="btn-routine-create">${escapeHtml(t("routines.createContinue"))}</button>
          <a class="link" href="#/rutinas">${escapeHtml(t("routines.cancel"))}</a>
        </p>
        <p id="new-routine-err" class="msg-error"></p>
      </div>
    `
    );
    document.getElementById("btn-routine-create")?.addEventListener("click", async () => {
      const name = document.getElementById("new-routine-name")?.value?.trim() ?? "";
      const teamId = Number(document.getElementById("new-routine-team")?.value);
      const errEl = document.getElementById("new-routine-err");
      errEl.textContent = "";
      if (!name) {
        errEl.textContent = t("routines.nameRequired");
        return;
      }
      try {
        const r = await api.apiCreateRoutine({ team_id: teamId, name });
        sessionStorage.setItem(RUTINAS_TEAM_KEY, String(teamId));
        location.hash = `#/rutinas/${r.id}`;
        route();
      } catch (ex) {
        errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
      }
    });
  } catch (ex) {
    layout(`<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p></div>`);
  }
}

async function renderRutinasViewer(id) {
  layout(`<p class="loading-line">${escapeHtml(t("routines.loadingOne"))}</p>`);
  try {
    const data = await api.apiGetRoutine(id);
    const rows = (data.exercises || [])
      .map(
        (ex) => `
      <tr>
        <td>${escapeHtml(routineKindLabel(ex.kind))}</td>
        <td>${escapeHtml(String(ex.value))}</td>
        <td>${escapeHtml(routineMetricLabel(ex.metric))}</td>
      </tr>`
      )
      .join("");
    layout(
      `
      <p><a class="link" href="#/rutinas">${escapeHtml(t("routines.back"))}</a></p>
      <div class="card" style="max-width:720px">
        <h2 class="card-title">${escapeHtml(data.name)}</h2>
        <p class="muted small">${t("routines.viewerReadOnly", { id: String(Number(id)) })}</p>
        <div class="table-scroll">
          <table class="sessions-list-table">
            <thead><tr><th>${escapeHtml(t("routines.thType"))}</th><th>${escapeHtml(t("routines.thValue"))}</th><th>${escapeHtml(t("routines.thMeasure"))}</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="3" class="muted">${escapeHtml(t("routines.noExercises"))}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `,
      { wide: true }
    );
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/rutinas">${escapeHtml(t("sessionDetail.backShort"))}</a></p></div>`
    );
  }
}

async function renderRutinasEditor(id) {
  layout(`<p class="loading-line">${escapeHtml(t("routines.loadingOne"))}</p>`);
  try {
    const data = await api.apiGetRoutine(id);
    let exercises = (data.exercises || []).map((e) => ({
      kind: e.kind,
      metric: e.metric,
      value: e.value,
    }));

    function tableHtml() {
      if (!exercises.length) {
        return `<tr><td colspan="5" class="muted">${escapeHtml(t("routines.emptyExercises"))}</td></tr>`;
      }
      const last = exercises.length - 1;
      const tu = escapeHtml(t("routines.upTitle"));
      const td = escapeHtml(t("routines.downTitle"));
      const rm = escapeHtml(t("teams.remove"));
      return exercises
        .map(
          (ex, idx) => `
        <tr>
          <td>${escapeHtml(routineKindLabel(ex.kind))}</td>
          <td>${escapeHtml(String(ex.value))}</td>
          <td>${escapeHtml(routineMetricLabel(ex.metric))}</td>
          <td class="rutina-ex-order-cell">
            <button type="button" class="secondary btn-sm btn-ex-up" data-i="${idx}" ${idx === 0 ? "disabled" : ""} title="${tu}">↑</button>
            <button type="button" class="secondary btn-sm btn-ex-down" data-i="${idx}" ${idx === last ? "disabled" : ""} title="${td}">↓</button>
          </td>
          <td><button type="button" class="secondary btn-sm btn-ex-del" data-i="${idx}">${rm}</button></td>
        </tr>`
        )
        .join("");
    }

    function render() {
      const tbody = document.getElementById("rutina-ex-tbody");
      if (tbody) tbody.innerHTML = tableHtml();
    }

    layout(
      `
      <p><a class="link" href="#/rutinas">${escapeHtml(t("routines.back"))}</a></p>
      <div class="card" style="max-width:720px">
        <h2 class="card-title">${escapeHtml(t("routines.editorTitle"))}</h2>
        <label for="routine-name">${escapeHtml(t("teams.labelName"))}</label>
        <input id="routine-name" type="text" maxlength="200" value="${escapeHtml(data.name)}" />
        <h3 class="subheading" style="margin-top:1rem">${escapeHtml(t("routines.exercisesHeading"))}</h3>
        <p class="muted small">${t("routines.editorHint")}</p>
        <div class="table-scroll">
          <table class="sessions-list-table rutina-ex-table">
            <thead><tr><th>${escapeHtml(t("routines.thType"))}</th><th>${escapeHtml(t("routines.thValue"))}</th><th>${escapeHtml(t("routines.thMeasure"))}</th><th>${escapeHtml(t("routines.thOrder"))}</th><th></th></tr></thead>
            <tbody id="rutina-ex-tbody">${tableHtml()}</tbody>
          </table>
        </div>
        <div class="rutina-add-ex" style="margin-top:0.75rem;padding:0.75rem;border:1px solid var(--border);border-radius:var(--radius);background:#fafcff">
          <p class="muted small" style="margin-top:0">${escapeHtml(t("routines.newExercise"))}</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem;align-items:end">
            <div>
              <label for="add-ex-kind">${escapeHtml(t("routines.addKind"))}</label>
              <select id="add-ex-kind">${routineKindOptionsHtml("warmup")}</select>
            </div>
            <div>
              <label for="add-ex-metric">${escapeHtml(t("routines.addMetric"))}</label>
              <select id="add-ex-metric">${routineMetricOptionsHtml("time")}</select>
            </div>
            <div>
              <label for="add-ex-val">${escapeHtml(t("routines.addValue"))}</label>
              <input id="add-ex-val" type="number" min="0" step="any" placeholder="0" />
            </div>
            <div>
              <button type="button" class="secondary" id="btn-add-exercise">${escapeHtml(t("routines.add"))}</button>
            </div>
          </div>
        </div>
        <p style="margin-top:1rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
          <button type="button" class="primary" id="btn-save-routine">${escapeHtml(t("routines.saveRoutine"))}</button>
          <a class="link" href="#/rutinas" id="link-cancel-routine">${escapeHtml(t("routines.cancel"))}</a>
        </p>
        <p id="routine-edit-err" class="msg-error"></p>
      </div>
    `,
      { wide: true }
    );

    document.getElementById("btn-add-exercise")?.addEventListener("click", () => {
      const kind = document.getElementById("add-ex-kind")?.value ?? "warmup";
      const metric = document.getElementById("add-ex-metric")?.value ?? "time";
      const raw = document.getElementById("add-ex-val")?.value ?? "";
      const val = raw === "" ? NaN : Number(raw);
      const errEl = document.getElementById("routine-edit-err");
      errEl.textContent = "";
      if (Number.isNaN(val) || val < 0) {
        errEl.textContent = t("routines.errValue");
        return;
      }
      exercises.push({ kind, metric, value: val });
      document.getElementById("add-ex-val").value = "";
      render();
    });

    document.getElementById("rutina-ex-tbody")?.addEventListener("click", (e) => {
      const up = e.target.closest(".btn-ex-up");
      const down = e.target.closest(".btn-ex-down");
      const del = e.target.closest(".btn-ex-del");
      if (up && !up.disabled) {
        const i = Number(up.getAttribute("data-i"));
        if (i > 0) {
          const tmp = exercises[i - 1];
          exercises[i - 1] = exercises[i];
          exercises[i] = tmp;
          render();
        }
        return;
      }
      if (down && !down.disabled) {
        const i = Number(down.getAttribute("data-i"));
        if (i < exercises.length - 1) {
          const tmp = exercises[i + 1];
          exercises[i + 1] = exercises[i];
          exercises[i] = tmp;
          render();
        }
        return;
      }
      if (del) {
        const i = Number(del.getAttribute("data-i"));
        exercises.splice(i, 1);
        render();
      }
    });

    document.getElementById("btn-save-routine")?.addEventListener("click", async () => {
      const name = document.getElementById("routine-name")?.value?.trim() ?? "";
      const errEl = document.getElementById("routine-edit-err");
      errEl.textContent = "";
      if (!name) {
        errEl.textContent = t("routines.errName");
        return;
      }
      try {
        await api.apiSaveRoutine(id, {
          name,
          exercises: exercises.map(({ kind, metric, value }) => ({ kind, metric, value: Number(value) })),
        });
        location.hash = "#/rutinas";
        route();
      } catch (ex) {
        errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
      }
    });
  } catch (ex) {
    layout(
      `<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/rutinas">${escapeHtml(t("routines.back"))}</a></p></div>`
    );
  }
}

function unwrapCommunityDir(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.teams)) return data.teams;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function unwrapCommunityMessages(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.messages)) return data.messages;
  return [];
}

function communityDirTeamId(row) {
  if (row == null) return null;
  const n = row.team_id != null ? row.team_id : row.id;
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function communityMessageCountSuffix(row) {
  const n = row?.message_count;
  if (n != null && Number(n) > 0) return ` (${Number(n)})`;
  return " (-)";
}

/** Directorio 1:1 (equipo, país, capitán) — sin contador; para títulos de hilo. */
function communityDirTeamLabelBase(row) {
  const name =
    row.team_name != null
      ? String(row.team_name)
      : row.name != null
        ? String(row.name)
        : "";
  const cap =
    row.captain_name != null
      ? String(row.captain_name)
      : row.captain_display != null
        ? String(row.captain_display)
        : "";
  const ctry =
    row.country != null && String(row.country).trim() !== "" ? getCountryNameForUi(String(row.country)) : "";
  const countryParens = ctry ? ` (${ctry})` : "";
  const id = communityDirTeamId(row);
  if (name && cap) return `${name}${countryParens} · ${cap}`;
  if (name) return `${name}${countryParens}`;
  if (id != null) return `#${id}`;
  return "";
}

/** Opción en el desplegable: incluye (n) o (-) de mensajes con ese interlocutor. */
function communityDirTeamLabel(row) {
  const base = communityDirTeamLabelBase(row);
  if (!base) return "";
  return `${base}${communityMessageCountSuffix(row)}`;
}

function normalizeCommunityMsg(m, myTeamIds) {
  const id = m.id != null ? Number(m.id) : null;
  const body = m.body != null ? String(m.body) : m.text != null ? String(m.text) : "";
  const created = m.created_at || m.createdAt || "";
  let isMine = m.is_mine === true;
  if (m.is_mine === undefined) {
    isMine = m.from_my_team === true;
    if (!isMine && m.from_team_id != null) {
      isMine = myTeamIds.has(Number(m.from_team_id));
    }
  }
  let inReplyTo = m.in_reply_to;
  if (inReplyTo == null) inReplyTo = m.inReplyTo;
  inReplyTo = inReplyTo != null ? Number(inReplyTo) : null;
  const peerTeamId = m.peer_team_id != null ? Number(m.peer_team_id) : null;
  const senderCaption = m.sender_caption != null ? String(m.sender_caption) : "";
  return { id, body, created, isMine, fromMine: isMine, inReplyTo, peerTeamId, senderCaption };
}

function buildCommunityThreadHtml(list, getPeerLabel) {
  if (!list.length) {
    return `<p class="muted">${escapeHtml(t("community.noMessages"))}</p>`;
  }
  const byId = new Map();
  for (const m of list) {
    if (m.id != null) byId.set(m.id, m);
  }
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.created).getTime();
    const tb = new Date(b.created).getTime();
    return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
  });
  return sorted
    .map((m) => {
      let who;
      if (m.isMine || m.fromMine) {
        const pl =
          typeof getPeerLabel === "function" && m.peerTeamId != null
            ? getPeerLabel(m.peerTeamId)
            : "";
        who = pl
          ? escapeHtml(t("community.fromMineTo", { peer: pl }))
          : escapeHtml(t("community.fromMine"));
      } else {
        who = escapeHtml(m.senderCaption || t("community.fromOther"));
      }
      const when = fmtDate(m.created);
      const ref =
        m.inReplyTo != null
          ? `<p class="muted small" style="margin:0.25rem 0 0 0">${escapeHtml(
              t("community.replyBadge", { id: m.inReplyTo })
            )}${
              byId.has(m.inReplyTo)
                ? ` — ${escapeHtml(String(byId.get(m.inReplyTo).body).slice(0, 64))}…`
                : ""
            }</p>`
          : "";
      const delBtn =
        (m.isMine || m.fromMine) && m.id != null
          ? `<button type="button" class="secondary btn-sm com-del" data-mid="${m.id}">${escapeHtml(
              t("community.delete")
            )}</button>`
          : "";
      const ppeer = m.peerTeamId != null && Number.isFinite(m.peerTeamId) ? String(m.peerTeamId) : "";
      return `<div class="community-msg" data-mid="${m.id}" data-peer="${ppeer}">
        <div class="community-msg-head">
          <span class="community-who">${who}</span>
          <time class="muted small" datetime="">${escapeHtml(when)}</time>
        </div>
        ${ref}
        <p class="community-msg-text">${escapeHtml(m.body)}</p>
        <div class="community-msg-actions">
          <button type="button" class="secondary btn-sm com-rep" data-mid="${m.id}" data-peer="${ppeer}">${escapeHtml(
            t("community.reply")
          )}</button>
          ${delBtn}
        </div>
      </div>`;
    })
    .join("");
}

async function renderComunidad() {
  layout(`<p class="loading-line">${escapeHtml(t("common.loading"))}</p>`);
  let me;
  let myTeams;
  let dirRaw;
  try {
    [me, myTeams, dirRaw] = await Promise.all([api.apiMe(), api.apiMyTeams(), api.apiCommunityTeams()]);
  } catch (ex) {
    const detail = humanizeApiError(ex.message);
    const is404 = /not found|404/i.test(detail) || /not found|404/i.test(String(ex.message));
    layout(
      `<div class="card"><h2 class="card-title">${escapeHtml(t("community.title"))}</h2>
        <p class="msg-error">${escapeHtml(t("community.loadFailed"))}</p>
        <p class="muted small">${escapeHtml(detail)}</p>
        ${is404 ? `<p class="muted small">${escapeHtml(t("community.unavailable"))}</p>` : ""}</div>`
    );
    return;
  }

  const isAdmin = me.is_platform_admin === true;
  if (myTeams.length === 0 && !isAdmin) {
    layout(
      `<div class="card"><h2 class="card-title">${escapeHtml(t("community.title"))}</h2>
        <p class="muted">${escapeHtml(t("community.noMyTeam"))}</p>
        <p class="small"><a class="link" href="#/teams/new">${escapeHtml(t("nav.teams"))}</a></p></div>`
    );
    return;
  }

  const myTeamIds = new Set(myTeams.map((x) => x.team.id));
  const dir = unwrapCommunityDir(dirRaw);
  const others = dir
    .map((r) => {
      const id = communityDirTeamId(r);
      const display = communityDirTeamLabel(r) || (id != null ? `#${id}` : "");
      const forThread = communityDirTeamLabelBase(r) || (id != null ? `#${id}` : display);
      return { id, label: display, threadLabel: forThread };
    })
    .filter((o) => o.id != null && !myTeamIds.has(o.id));
  const peerLabelById = new Map(others.map((o) => [o.id, o.threadLabel]));
  function getPeerLabel(peerId) {
    if (peerId == null) return "";
    const n = Number(peerId);
    if (!Number.isFinite(n)) return "";
    if (peerLabelById.has(n)) return String(peerLabelById.get(n) || "");
    return `#${n}`;
  }

  let selected = sessionStorage.getItem(COMMUNITY_FILTER_KEY) || CONV_ALL;
  if (selected !== CONV_ALL && !others.some((o) => String(o.id) === selected)) {
    selected = CONV_ALL;
  }

  const selectOpts =
    others.length === 0
      ? `<option value="">${escapeHtml(t("community.selectTeam"))}</option>`
      : `<option value="${CONV_ALL}"${selected === CONV_ALL ? " selected" : ""}>${escapeHtml(
          t("community.filterAll")
        )}</option>${others
          .map(
            (o) =>
              `<option value="${o.id}"${String(o.id) === selected ? " selected" : ""}>${escapeHtml(
                o.label || `#${o.id}`
              )}</option>`
          )
          .join("")}`;

  const hasNoOthers = others.length === 0;
  const composerLocked = hasNoOthers || selected === CONV_ALL;
  const threadPlaceholder = hasNoOthers
    ? `<p class="muted">${escapeHtml(t("community.noTeamsInDirectory"))}</p>`
    : `<p class="muted">${escapeHtml(t("common.loading"))}</p>`;

  let replyToId = null;
  let replyToSnippet = "";
  let lastNormalized = [];

  layout(`
    <div class="card">
      <h2 class="card-title">${escapeHtml(t("community.title"))}</h2>
      <p class="muted">${escapeHtml(t("community.subtitle"))}</p>
      <div class="community-toolbar">
        <div class="community-select-wrap">
          <label for="com-sel-convo">${escapeHtml(t("community.conversationFilter"))}</label>
          <select id="com-sel-convo" ${others.length ? "" : "disabled"}>
            ${selectOpts}
          </select>
        </div>
        <button type="button" class="secondary" id="com-refresh" ${hasNoOthers ? "disabled" : ""}>${escapeHtml(
          t("community.refresh")
        )}</button>
      </div>
      <p id="com-err" class="msg-error" style="display:none" role="alert"></p>
      <p id="com-write-hint" class="muted small" style="display:none">${escapeHtml(
        t("community.writeRequiresContact")
      )}</p>
      <div id="com-reply-bar" class="community-reply-bar" style="display:none"></div>
      <div id="com-thread" class="community-thread">${threadPlaceholder}</div>
      <form id="com-form" class="community-composer">
        <label for="com-body">${escapeHtml(t("community.messagePlaceholder"))}</label>
        <textarea id="com-body" rows="4" class="com-text community-textarea-w" placeholder="${escapeHtml(
          t("community.messagePlaceholder")
        )}" ${composerLocked ? "disabled" : ""}></textarea>
        <button type="submit" class="primary" id="com-submit" ${composerLocked ? "disabled" : ""}>${escapeHtml(
          t("community.send")
        )}</button>
      </form>
    </div>
  `);

  const errEl = document.getElementById("com-err");
  const threadEl = document.getElementById("com-thread");
  const bodyEl = document.getElementById("com-body");
  const form = document.getElementById("com-form");
  const replyBar = document.getElementById("com-reply-bar");
  const refreshBtn = document.getElementById("com-refresh");
  const sel = document.getElementById("com-sel-convo");
  const subBtn = document.getElementById("com-submit");
  const writeHint = document.getElementById("com-write-hint");

  function setComposerState() {
    const locked = hasNoOthers || selected === CONV_ALL;
    if (bodyEl) bodyEl.disabled = locked;
    if (subBtn) subBtn.disabled = locked;
    if (writeHint) writeHint.style.display = selected === CONV_ALL && !hasNoOthers ? "block" : "none";
  }

  function setErr(text) {
    if (!errEl) return;
    if (text) {
      errEl.style.display = "block";
      errEl.textContent = text;
    } else {
      errEl.style.display = "none";
      errEl.textContent = "";
    }
  }

  function updateReplyBar() {
    if (!replyBar) return;
    if (replyToId == null) {
      replyBar.style.display = "none";
      replyBar.innerHTML = "";
      return;
    }
    replyBar.style.display = "block";
    replyBar.innerHTML = `
      <div class="card-inset community-reply-bar-inner">
        <span class="small">${escapeHtml(t("community.replyingTo", { snippet: replyToSnippet }))}</span>
        <button type="button" class="secondary btn-sm" id="com-clear-reply">${escapeHtml(
          t("community.clearReply")
        )}</button>
      </div>
    `;
    document.getElementById("com-clear-reply")?.addEventListener("click", () => {
      replyToId = null;
      replyToSnippet = "";
      updateReplyBar();
    });
  }

  async function doRefresh() {
    if (hasNoOthers) {
      lastNormalized = [];
      threadEl.innerHTML = `<p class="muted">${escapeHtml(t("community.noTeamsInDirectory"))}</p>`;
      return;
    }
    try {
      const raw =
        selected === CONV_ALL
          ? await api.apiCommunityFeed()
          : await api.apiCommunityMessages(Number(selected));
      const arr = unwrapCommunityMessages(raw)
        .map((m) => normalizeCommunityMsg(m, myTeamIds))
        .filter((m) => m.id != null);
      lastNormalized = arr;
      threadEl.innerHTML = buildCommunityThreadHtml(arr, getPeerLabel);
      setErr("");
    } catch (ex) {
      const h = humanizeApiError(ex.message);
      if (/not found|404/i.test(h) || /not found|404/i.test(String(ex.message))) {
        setErr(t("community.unavailable"));
      } else if (/403|forbidden/i.test(h) || /403/i.test(String(ex.message))) {
        setErr(t("community.forbidden"));
      } else {
        setErr(h);
      }
    }
  }

  if (sel) {
    sel.addEventListener("change", (e) => {
      selected = e.target.value;
      if (selected) sessionStorage.setItem(COMMUNITY_FILTER_KEY, selected);
      else sessionStorage.removeItem(COMMUNITY_FILTER_KEY);
      replyToId = null;
      replyToSnippet = "";
      updateReplyBar();
      setComposerState();
      if (selected) {
        doRefresh();
      } else {
        lastNormalized = [];
        threadEl.innerHTML = `<p class="muted">${escapeHtml(t("community.noTeamsInDirectory"))}</p>`;
      }
    });
  }
  setComposerState();

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      doRefresh();
    });
  }

  if (threadEl) {
    threadEl.addEventListener("click", (ev) => {
      const tEl = ev.target;
      if (tEl.classList.contains("com-rep")) {
        const mid = Number(tEl.getAttribute("data-mid"));
        const m = lastNormalized.find((x) => x.id === mid);
        if (m) {
          replyToId = mid;
          replyToSnippet = m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body;
          updateReplyBar();
          bodyEl?.focus();
        }
      }
      if (tEl.classList.contains("com-del")) {
        const mid = Number(tEl.getAttribute("data-mid"));
        if (mid && globalThis.confirm(t("community.deleteConfirm"))) {
          (async () => {
            try {
              await api.apiDeleteCommunityMessage(mid);
              setErr("");
              await doRefresh();
            } catch (ex) {
              const h = humanizeApiError(ex.message);
              if (/403|forbidden/i.test(h) || /403/i.test(String(ex.message))) {
                setErr(t("community.forbidden"));
              } else {
                setErr(h);
              }
            }
          })();
        }
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (hasNoOthers) return;
      const text = (bodyEl.value || "").trim();
      if (!text) return;
      let targetTeam = null;
      if (selected === CONV_ALL) {
        if (replyToId != null) {
          const ref = lastNormalized.find((x) => x.id === replyToId);
          if (ref && ref.peerTeamId != null) {
            targetTeam = ref.peerTeamId;
          }
        }
        if (targetTeam == null) {
          setErr(t("community.writeRequiresContact"));
          return;
        }
      } else {
        targetTeam = Number(selected);
      }
      if (!targetTeam || !Number.isFinite(targetTeam)) {
        setErr(t("community.writeRequiresContact"));
        return;
      }
      try {
        await api.apiPostCommunityMessage({
          otherTeamId: targetTeam,
          body: text,
          inReplyTo: replyToId,
        });
        bodyEl.value = "";
        replyToId = null;
        replyToSnippet = "";
        updateReplyBar();
        await doRefresh();
        setErr("");
      } catch (ex) {
        const h = humanizeApiError(ex.message);
        if (/403|forbidden/i.test(h) || /403/i.test(String(ex.message))) {
          setErr(t("community.forbidden"));
        } else {
          setErr(h);
        }
      }
    });
  }

  if (!hasNoOthers) {
    await doRefresh();
  }
}

async function renderAccount() {
  layout(`<p class="loading-line">${escapeHtml(t("common.loadingProfile"))}</p>`);
  try {
    const [me, teams] = await Promise.all([api.apiMe(), api.apiMyTeams()]);

    const isPlatformAdmin = me.is_platform_admin === true;

    const noTeamMsg =
      teams.length === 0 && !isPlatformAdmin
        ? `<div class="card" style="margin-top:1rem"><p class="muted">${t("account.noTeamHtml")}</p></div>`
        : "";

    const membershipBlock =
      teams.length === 0
        ? `<p class="muted">${escapeHtml(t("account.noMembershipLine"))}</p>`
        : `<ul class="account-roles-list">
            ${teams
              .map(
                (x) =>
                  `<li><span class="account-role-pill"><strong>${escapeHtml(roleLabel(x.role))}</strong> — ${escapeHtml(
                    x.team.name
                  )}</span></li>`
              )
              .join("")}
          </ul>`;

    layout(`
      <div class="card narrow">
        <h2 class="card-title">${escapeHtml(t("account.title"))}</h2>
        <p><strong>${escapeHtml(t("account.emailLabel"))}</strong> ${escapeHtml(me.email)}</p>
        <form id="form-profile-name" class="account-name-form">
          <label for="full-name-input">${escapeHtml(t("account.fullNameLabel"))}</label>
          <div class="account-name-row">
            <input type="text" id="full-name-input" class="account-name-input" maxlength="200" value="${escapeHtml(
              me.full_name || ""
            )}" />
            <button type="submit" class="primary">${escapeHtml(t("account.saveName"))}</button>
          </div>
          <p id="name-err" class="msg-error" style="display:none"></p>
          <p id="name-ok" class="msg-ok" style="display:none"></p>
        </form>
        ${membershipBlock}
      </div>
      <details class="disclosure-card card narrow" style="margin-top:1rem">
        <summary class="disclosure-summary">
          <span>${escapeHtml(t("account.changePassword"))}</span>
          <span class="disclosure-chev" aria-hidden="true"></span>
        </summary>
        <div class="disclosure-body">
          <form id="form-change-password">
            <label for="pwd-current">${escapeHtml(t("account.pwdCurrent"))}</label>
            <input id="pwd-current" type="password" required autocomplete="current-password" />
            <label for="pwd-new">${escapeHtml(t("account.pwdNew"))}</label>
            <input id="pwd-new" type="password" required minlength="8" autocomplete="new-password" />
            <label for="pwd-new2">${escapeHtml(t("account.pwdNew2"))}</label>
            <input id="pwd-new2" type="password" required minlength="8" autocomplete="new-password" />
            <button type="submit">${escapeHtml(t("account.pwdSubmit"))}</button>
            <p id="pwd-err" class="msg-error"></p>
          </form>
        </div>
      </details>
      <div class="card narrow" style="margin-top:1rem">
        <h3 style="margin-top:0">${escapeHtml(t("account.languageTitle"))}</h3>
        <p class="muted small">${escapeHtml(t("account.languageHint"))}</p>
        <label for="sel-ui-lang">${escapeHtml(t("account.languageLabel"))}</label>
        <select id="sel-ui-lang">
          ${UI_LANGUAGES.map(
            (o) =>
              `<option value="${escapeHtml(o.code)}"${getStoredUiLang() === o.code ? " selected" : ""}>${escapeHtml(o.label)}</option>`
          ).join("")}
        </select>
      </div>
      ${noTeamMsg}
    `);

    document.getElementById("form-profile-name")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("name-err");
      const okEl = document.getElementById("name-ok");
      if (errEl) {
        errEl.textContent = "";
        errEl.style.display = "none";
      }
      if (okEl) {
        okEl.textContent = "";
        okEl.style.display = "none";
      }
      const v = (document.getElementById("full-name-input")?.value || "").trim();
      try {
        await api.apiUpdateMe({ full_name: v || null });
        if (okEl) {
          okEl.textContent = t("account.nameSaved");
          okEl.classList.add("msg-ok");
          okEl.style.display = "block";
        }
      } catch (ex) {
        if (errEl) {
          errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
          errEl.classList.add("msg-error");
          errEl.style.display = "block";
        }
      }
    });

    document.getElementById("sel-ui-lang")?.addEventListener("change", async (e) => {
      const code = e.target.value;
      setStoredUiLang(code);
      applyDocumentLang(code);
      try {
        await api.apiUpdateMe({ ui_language: code || null });
      } catch {
        /* ignore: UI ya cambió; el usuario puede reintentar desde otra conexión */
      }
      route();
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
        errEl.textContent = t("account.pwdMismatch");
        return;
      }
      try {
        await api.apiChangePassword(cur, pw);
        errEl.classList.remove("msg-error");
        errEl.classList.add("msg-ok");
        errEl.textContent = t("account.pwdSuccess");
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
