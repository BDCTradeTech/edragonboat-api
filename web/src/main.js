/**
 * Panel web E-DragonBoat — entry point.
 * Solo contiene: imports, layout(), route(), renderLogin(), renderRegister(), init().
 */

import { Chart, registerables } from "chart.js";
import "leaflet/dist/leaflet.css";
import "./style.css";
import * as api from "./api.js";
import {
  UI_LANGUAGES,
  applyDocumentLang,
  getStoredUiLang,
  setSessionUserId,
  setStoredUiLang,
} from "./locale.js";
import { t } from "./i18n.js";
import { escapeHtml } from "./utils.js";
import panelPkg from "../package.json";

// Pages
import { renderHome, destroyHomeCharts } from "./pages/home.js";
import { renderSessionsList, renderSessionDetail, renderSessionComparator, destroySessionCharts } from "./pages/sessions.js";
import { renderCompetencias } from "./pages/competencias.js";
import { renderTeamsList, renderTeamNew, renderTeamDetail } from "./pages/teams.js";
import { renderRutinasHub, renderRutinasNew, renderRutinasViewer, renderRutinasEditor } from "./pages/routines.js";
import { renderComunidad } from "./pages/community.js";
import { renderForum, renderForumPost } from "./pages/forum.js";
import { renderAccount } from "./pages/account.js";
import { renderBalance } from "./pages/balance.js";

// Router
import { setRouteFn } from "./router.js";

Chart.register(...registerables);

// ─── Estado global ────────────────────────────────────────────────────────────

const SERVER_UI_LANG_SYNC_KEY = "edb_server_ui_lang_merged";
let _serverUiLangSyncInFlight = false;
let currentTeamLogo = null;

function destroyCharts() {
  destroyHomeCharts();
  destroySessionCharts();
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function _activePageTitle() {
  const hash = (location.hash.replace(/^#\/?/, "") || "/").split("/").filter(Boolean);
  const key = hash[0] || "home";
  if (!key || key === "home") return escapeHtml(t("nav.home"));
  if (key === "sessions" || key === "session") return escapeHtml(t("nav.sessions"));
  if (key === "teams" || key === "team") return escapeHtml(t("nav.teams"));
  if (key === "balance") return escapeHtml(t("nav.balance"));
  if (key === "rutinas") return escapeHtml(t("nav.routines"));
  if (key === "competencias" || key === "regatas") return escapeHtml(t("nav.competitions"));
  if (key === "comunidad") return escapeHtml(t("nav.community"));
  if (key === "foro") return escapeHtml(t("nav.forum"));
  if (key === "cuenta") return escapeHtml(t("nav.account"));
  if (key === "login") return "Login";
  if (key === "register") return "Register";
  return "";
}

function highlightNav() {
  const hash = (location.hash.replace(/^#\/?/, "") || "/").split("/").filter(Boolean);
  let key = "home";
  if (hash[0] === "sessions" || hash[0] === "session") key = "sessions";
  else if (hash[0] === "teams") key = "teams";
  else if (hash[0] === "balance") key = "balance";
  else if (hash[0] === "rutinas") key = "rutinas";
  else if (hash[0] === "comunidad") key = "comunidad";
  else if (hash[0] === "foro") key = "foro";
  else if (hash[0] === "cuenta") key = "cuenta";
  else if (hash[0] === "regatas" || hash[0] === "competencias") key = "competencias";

  document.querySelectorAll(".nav-item").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-match") === key);
  });
}

/**
 * Renderiza el shell de la app (sidebar + topbar + contenido).
 * @param {string} content
 * @param {{ showNav?: boolean, wide?: boolean }} [opts]
 */
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
        <a class="nav-item" href="#/balance" data-match="balance"><i data-lucide="scale"></i>${escapeHtml(t("nav.balance"))}</a>
        <a class="nav-item" href="#/rutinas" data-match="rutinas"><i data-lucide="clipboard-list"></i>${escapeHtml(t("nav.routines"))}</a>
        <a class="nav-item" href="#/sessions" data-match="sessions"><i data-lucide="activity"></i>${escapeHtml(t("nav.sessions"))}</a>
        <a class="nav-item" href="#/competencias" data-match="competencias"><i data-lucide="trophy"></i>${escapeHtml(t("nav.competitions"))}</a>
        <a class="nav-item" href="#/comunidad" data-match="comunidad"><i data-lucide="message-circle"></i>${escapeHtml(t("nav.community"))}</a>
        <a class="nav-item" href="#/foro" data-match="foro"><i data-lucide="message-square"></i>${escapeHtml(t("nav.forum"))}</a>
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

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      destroyCharts();
      api.clearSession();
      try { sessionStorage.removeItem(SERVER_UI_LANG_SYNC_KEY); } catch { /* ignore */ }
      location.hash = "#/login";
      route();
    });
  }

  highlightNav();

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

// ─── Login / Register ─────────────────────────────────────────────────────────

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
      try { sessionStorage.removeItem(SERVER_UI_LANG_SYNC_KEY); } catch { /* ignore */ }
      try {
        const me = await api.apiMe();
        if (me && me.id != null) {
          setSessionUserId(me.id);
          if (me.ui_language && UI_LANGUAGES.some((o) => o.code === me.ui_language)) {
            setStoredUiLang(me.ui_language);
            applyDocumentLang(me.ui_language);
          }
        }
      } catch { /* route seguirá con /me */ }
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
    if (password !== password2) { err.textContent = t("register.errorPasswordMismatch"); return; }
    if (password.length < 8) { err.textContent = t("register.errorPasswordShort"); return; }
    try {
      await api.apiRegister(email, password, fullName || null);
      const data = await api.apiLogin(email, password);
      api.setSession(data.access_token, email);
      try { sessionStorage.removeItem(SERVER_UI_LANG_SYNC_KEY); } catch { /* ignore */ }
      try {
        const me = await api.apiMe();
        if (me && me.id != null) {
          setSessionUserId(me.id);
          if (me.ui_language && UI_LANGUAGES.some((o) => o.code === me.ui_language)) {
            setStoredUiLang(me.ui_language);
            applyDocumentLang(me.ui_language);
          }
        }
      } catch { /* ignore */ }
      location.hash = "#/";
      route();
    } catch (ex) {
      const s = String(ex.message || "");
      const humanized = (!s) ? t("common.errorUnknown") : (s.includes('"Not Found"') || s === "Not Found" || s.includes("404")) ? t("errors.notFoundDeploy") : s;
      err.textContent = humanized || String(ex.message);
    }
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

function route() {
  destroyCharts();
  applyDocumentLang(getStoredUiLang());

  if (api.getToken() && !sessionStorage.getItem(SERVER_UI_LANG_SYNC_KEY) && !_serverUiLangSyncInFlight) {
    _serverUiLangSyncInFlight = true;
    void api.apiMe()
      .then((me) => {
        if (me && me.id != null) setSessionUserId(me.id);
        const prev = getStoredUiLang();
        let changed = false;
        if (me && me.ui_language && UI_LANGUAGES.some((o) => o.code === me.ui_language) && me.ui_language !== prev) {
          setStoredUiLang(me.ui_language);
          applyDocumentLang(me.ui_language);
          changed = true;
        }
        try { sessionStorage.setItem(SERVER_UI_LANG_SYNC_KEY, "1"); } catch { /* ignore */ }
        if (changed) route();
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        _serverUiLangSyncInFlight = false;
        try {
          if (!sessionStorage.getItem(SERVER_UI_LANG_SYNC_KEY)) sessionStorage.setItem(SERVER_UI_LANG_SYNC_KEY, "1");
        } catch { /* ignore */ }
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
      layout(`<div class="card"><p class="msg-error">${escapeHtml(t("errors.invalidSessionId"))}</p><p><a class="link" href="#/sessions">${escapeHtml(t("sessionDetail.backToSessions"))}</a></p></div>`);
      return;
    }
    return renderSessionDetail(parts[1], layout);
  }

  if (parts[0] === "teams") {
    if (!parts[1]) return renderTeamsList(layout);
    if (parts[1] === "new") return renderTeamNew(layout);
    if (!/^\d+$/.test(parts[1])) {
      layout(`<div class="card"><p class="msg-error">${escapeHtml(t("errors.invalidTeamId"))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backToTeams"))}</a></p></div>`);
      return;
    }
    return renderTeamDetail(parts[1], layout);
  }

  if (parts[0] === "regatas") {
    location.hash = "#/competencias";
    return route();
  }

  if (parts[0] === "competencias") return renderCompetencias(layout);
  if (parts[0] === "comunidad") return renderComunidad(layout);

  if (parts[0] === "foro") {
    if (parts[1] === "post" && parts[2] && /^\d+$/.test(parts[2])) return renderForumPost(Number(parts[2]), layout);
    return renderForum(layout);
  }

  if (parts[0] === "cuenta") return renderAccount(layout);

  if (parts[0] === "balance") return renderBalance(layout);

  if (parts[0] === "rutinas") {
    if (!parts[1]) return renderRutinasHub(layout);
    if (parts[1] === "new") return renderRutinasNew(layout);
    if (parts[2] === "view" && /^\d+$/.test(parts[1])) return renderRutinasViewer(parts[1], layout);
    if (/^\d+$/.test(parts[1])) return renderRutinasEditor(parts[1], layout);
    location.hash = "#/rutinas";
    return route();
  }

  if (parts[0] === "sessions") {
    const routePart = parts[1]?.split("?")[0] || "";
    if (routePart === "compare") {
      // Parsear hash correctamente: #/sessions/compare?a=138&b=130
      const hash = location.hash.slice(1); // remove #
      const [pathPart, queryString] = hash.split("?");
      const params = new URLSearchParams(queryString || "");
      const aStr = params.get("a");
      const bStr = params.get("b");
      const idA = aStr !== null ? Number(aStr) : null;
      const idB = bStr !== null ? Number(bStr) : null;
      // Precargamos lista de sesiones para el picker modal
      void (async () => {
        let allSessions = [];
        try {
          const teams = await api.apiMyTeams();
          if (teams.length) allSessions = await api.apiListSessions(teams[0].team.id);
        } catch { /* ignore — picker funcionará vacío */ }
        renderSessionComparator(idA, idB, layout, allSessions);
      })();
      return;
    }
    return renderSessionsList(layout);
  }

  // Home (default)
  const homeState = {
    currentTeamLogo,
    setCurrentTeamLogo: (v) => { currentTeamLogo = v; },
  };
  return renderHome(layout, homeState);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Registrar la función route en el router para que las páginas puedan llamarla
setRouteFn(route);

window.addEventListener("hashchange", route);
route();
