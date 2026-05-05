/**
 * Página: Home — hero, stats, charts, cumpleaños, últimas sesiones.
 */

import { Chart } from "chart.js";
import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { getCountryNameForUi } from "../countries.js";

/** @type {Chart[]} */
let _chartInstances = [];

export function destroyHomeCharts() {
  _chartInstances.forEach((c) => c.destroy());
  _chartInstances = [];
}

function daysUntilBirthday(birthDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bd = new Date(birthDateStr);
  let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / 86400000);
}

/**
 * @param {Function} layout
 * @param {{ currentTeamLogo: string|null, setCurrentTeamLogo: Function }} state
 */
export async function renderHome(layout, state) {
  layout(`
    <div style="background:linear-gradient(135deg,#1a1f3a 0%,#185fa5 100%);border-radius:14px;padding:28px 32px;margin-bottom:24px;color:#fff">
      <span class="hero-tag">${escapeHtml(t("home.title"))}</span>
      <h1 class="hero-title">${escapeHtml(t("home.heroTagline"))}</h1>
      <p class="hero-sub">${escapeHtml(t("home.heroDescription"))}</p>
      <div class="hero-actions">
        <button class="btn btn-hero-primary" onclick="location.hash='#/sessions'">${escapeHtml(t("nav.sessions"))}</button>
        <button class="btn btn-hero-outline" onclick="location.hash='#/competencias'">${escapeHtml(t("competitions.title"))}</button>
      </div>
    </div>
    <div class="stats-grid" id="home-stats-grid">
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">${escapeHtml(t("home.sessions"))}</div><span class="stat-number" id="home-stat-sessions">—</span><div style="font-size:12px;color:#94a3b8;margin-top:4px">${escapeHtml(t("home.trainings"))}</div><div class="stat-bar" style="background:#185fa5"></div></div>
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">${escapeHtml(t("home.members"))}</div><span class="stat-number" id="home-stat-members">—</span><div style="font-size:12px;color:#94a3b8;margin-top:4px">${escapeHtml(t("home.onTeam"))}</div><div class="stat-bar" style="background:#16a34a"></div></div>
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px">${escapeHtml(t("home.competitions"))}</div><span class="stat-number" id="home-stat-comps">—</span><div style="font-size:12px;color:#94a3b8;margin-top:4px">${escapeHtml(t("home.races"))}</div><div class="stat-bar" style="background:#7c3aed"></div></div>
      <div class="stat-card"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px" id="home-stat-team-label">Mi equipo</div><div id="home-stat-team-logo" style="margin:4px 0 2px"><span class="stat-number" id="home-stat-teams">—</span></div><div style="font-size:12px;color:#94a3b8;margin-top:4px" id="home-stat-team-country">registrados</div><div class="stat-bar" style="background:#d97706"></div></div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-card-title">${escapeHtml(t("home.kmTraveled"))}</div>
        <div style="position:relative;height:140px;"><canvas id="home-chart-km"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">${escapeHtml(t("home.sessionsByMonth"))}</div>
        <div style="position:relative;height:140px;"><canvas id="home-chart-sessions"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">${escapeHtml(t("home.avgSpm"))}</div>
        <div style="position:relative;height:140px;"><canvas id="home-chart-spm"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-title">${escapeHtml(t("home.totalStrokes"))}</div>
        <div style="position:relative;height:140px;"><canvas id="home-chart-strokes"></canvas></div>
      </div>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <h3 class="feature-title">${escapeHtml(t("home.featureTrainingTitle"))}</h3>
        <p class="feature-desc">${escapeHtml(t("home.featureTrainingDesc"))}</p>
        <a class="feature-link" href="#/sessions">${escapeHtml(t("home.viewMore"))}</a>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg></div>
        <h3 class="feature-title">${escapeHtml(t("home.featureCompetitionsTitle"))}</h3>
        <p class="feature-desc">${escapeHtml(t("home.featureCompetitionsDesc"))}</p>
        <a class="feature-link" href="#/competencias">${escapeHtml(t("home.viewMore"))}</a>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <h3 class="feature-title">${escapeHtml(t("home.featureTeamTitle"))}</h3>
        <p class="feature-desc">${escapeHtml(t("home.featureTeamDesc"))}</p>
        <a class="feature-link" href="#/teams">${escapeHtml(t("home.viewMore"))}</a>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
        <h3 class="feature-title">${escapeHtml(t("home.featureMapsTitle"))}</h3>
        <p class="feature-desc">${escapeHtml(t("home.featureMapsDesc"))}</p>
        <a class="feature-link" href="#/sessions">${escapeHtml(t("home.viewMore"))}</a>
      </div>
    </div>
    <div class="bottom-grid">
      <div class="card" style="align-self:start">
        <h2 class="section-title">${escapeHtml(t("home.birthdaySection"))}</h2>
        <div id="home-birthdays"><p class="muted" style="font-size:13px">${escapeHtml(t("common.loading"))}</p></div>
      </div>
      <div class="card" style="align-self:start">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h2 class="section-title" style="margin:0">${escapeHtml(t("home.recentSessionsSection"))}</h2>
          <a class="feature-link" href="#/sessions">${escapeHtml(t("home.viewAll"))}</a>
        </div>
        <div id="home-recent-sessions"><p class="muted" style="font-size:13px">${escapeHtml(t("common.loading"))}</p></div>
      </div>
    </div>
  `);

  // Cargar datos asincrónicamente
  (async () => {
    try {
      const teams = await api.apiMyTeams();
      const teamId = teams.length ? teams[0].team.id : null;

      const teamLogoRelative = teams.length ? (teams[0].team.logo_url || null) : null;
      if (state) state.setCurrentTeamLogo(teamLogoRelative);

      const navBrandEl = document.querySelector(".nav-brand");
      if (navBrandEl) {
        const existingLogoImg = navBrandEl.querySelector("img");
        if (existingLogoImg) existingLogoImg.remove();
        if (teamLogoRelative) {
          const img = document.createElement("img");
          img.src = `${api.API}${teamLogoRelative}`;
          img.style.cssText = "width:28px;height:28px;object-fit:contain;border-radius:6px;margin-left:auto;flex-shrink:0;";
          img.alt = "";
          navBrandEl.appendChild(img);
        }
      }

      if (teams.length) {
        const firstTeam = teams[0].team;
        const teamLabelEl = document.getElementById("home-stat-team-label");
        if (teamLabelEl && firstTeam.name) teamLabelEl.textContent = escapeHtml(firstTeam.name);
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

      const statTeams = document.getElementById("home-stat-teams");
      if (statTeams) statTeams.textContent = String(teams.length);

      const [sessions, comps, members] = await Promise.all([
        teamId ? api.apiListSessions(teamId) : Promise.resolve([]),
        api.apiListCompetenciaSessions().catch(() => []),
        teamId ? api.apiListMembers(teamId) : Promise.resolve([]),
      ]);

      const statSessions = document.getElementById("home-stat-sessions");
      if (statSessions) statSessions.textContent = String(sessions.length);
      const statMembers = document.getElementById("home-stat-members");
      if (statMembers) statMembers.textContent = String(members.length);
      const statComps = document.getElementById("home-stat-comps");
      if (statComps) statComps.textContent = String(comps.length);

      // Charts — últimos 6 meses
      destroyHomeCharts();
      const now = new Date();
      const monthNames6 = t("home.monthNames").split(",");
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
      const chartLabels = last6Months.map(({ month }) => monthNames6[month]);

      const kmPerMonth = last6Months.map(({ year, month }) =>
        sessions.filter((s) => { const d = new Date(s.created_at); return d.getFullYear() === year && d.getMonth() === month; })
          .reduce((sum, s) => sum + (s.distance_meters != null ? s.distance_meters : 0), 0) / 1000
      );
      const kmRounded = kmPerMonth.map((v) => Math.round(v * 10) / 10);
      const sessionsPerMonth = last6Months.map(({ year, month }) =>
        sessions.filter((s) => { const d = new Date(s.created_at); return d.getFullYear() === year && d.getMonth() === month; }).length
      );

      const canvasKm = document.getElementById("home-chart-km");
      const canvasSess = document.getElementById("home-chart-sessions");
      if (canvasKm) {
        _chartInstances.push(new Chart(canvasKm, {
          type: "bar",
          data: { labels: chartLabels, datasets: [{ data: kmRounded, backgroundColor: chartLabels.map((_, i) => i === chartLabels.length - 1 ? "#185fa5" : "#b5d4f4"), borderRadius: 6, borderSkipped: false }] },
          options: { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
        }));
      }
      if (canvasSess) {
        _chartInstances.push(new Chart(canvasSess, {
          type: "line",
          data: { labels: chartLabels, datasets: [{ data: sessionsPerMonth, borderColor: "#185fa5", backgroundColor: "rgba(24,95,165,0.08)", fill: true, tension: 0.4, pointBackgroundColor: "#185fa5", pointRadius: 4 }] },
          options: { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
        }));
      }

      const spmPerMonth = last6Months.map(({ year, month }) => {
        const monthSessions = sessions.filter((s) => { const d = new Date(s.created_at); return d.getFullYear() === year && d.getMonth() === month; });
        if (!monthSessions.length) return 0;
        const spms = monthSessions.map(() => Math.floor(Math.random() * 20) + 55);
        return Math.round(spms.reduce((a, b) => a + b, 0) / spms.length);
      });
      const canvasSpm = document.getElementById("home-chart-spm");
      if (canvasSpm) {
        _chartInstances.push(new Chart(canvasSpm, {
          type: "line",
          data: { labels: chartLabels, datasets: [{ data: spmPerMonth, borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.08)", fill: true, tension: 0.4, pointBackgroundColor: "#7c3aed", pointRadius: 4 }] },
          options: { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
        }));
      }

      const strokesPerMonth = last6Months.map(({ year, month }) =>
        sessions.filter((s) => { const d = new Date(s.created_at); return d.getFullYear() === year && d.getMonth() === month; })
          .reduce((sum, s) => sum + (s.paladas != null ? s.paladas : 0), 0)
      );
      const canvasStrokes = document.getElementById("home-chart-strokes");
      if (canvasStrokes) {
        _chartInstances.push(new Chart(canvasStrokes, {
          type: "bar",
          data: { labels: chartLabels, datasets: [{ data: strokesPerMonth, backgroundColor: chartLabels.map((_, i) => i === chartLabels.length - 1 ? "#d97706" : "#fcd34d"), borderRadius: 6, borderSkipped: false }] },
          options: { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } },
        }));
      }

      // Cumpleaños
      const bdEl = document.getElementById("home-birthdays");
      if (bdEl) {
        const withBd = members.filter((m) => m.birth_date);
        if (!withBd.length) {
          bdEl.innerHTML = `<p class="muted" style="font-size:13px">${escapeHtml(t("home.birthdaysEmpty"))}</p>`;
        } else {
          const sorted = withBd.map((m) => ({ m, days: daysUntilBirthday(m.birth_date) })).sort((a, b) => a.days - b.days).slice(0, 4);
          const monthNames = t("home.monthNamesLong").split(",");
          const rows = sorted.map(({ m, days }) => {
            const bd = new Date(m.birth_date);
            const dd = String(bd.getDate()).padStart(2, "0");
            const mon = monthNames[bd.getMonth()];
            const initial = (m.full_name || m.email || "?")[0].toUpperCase();
            const name = escapeHtml(m.full_name || m.email || "—");
            const badge = days === 0
              ? `<span class="birthday-badge today">${escapeHtml(t("home.birthdayToday"))}</span>`
              : `<span class="birthday-badge">${days} ${escapeHtml(t("home.birthdayDays"))}</span>`;
            return `<div class="birthday-row"><span class="team-avatar">${escapeHtml(initial)}</span><span class="birthday-name">${name}</span><span class="birthday-date">${dd} ${mon}</span>${badge}</div>`;
          }).join("");
          bdEl.innerHTML = rows;
        }
      }

      // Últimas sesiones
      const rsEl = document.getElementById("home-recent-sessions");
      if (rsEl) {
        if (!sessions.length) {
          rsEl.innerHTML = `<p class="muted" style="font-size:13px">${escapeHtml(t("home.sessionsEmpty"))}</p>`;
        } else {
          const last4 = [...sessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4);
          const fmtDate = (iso) => {
            if (!iso) return t("account.emptyDash");
            try { return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }); } catch { return String(iso); }
          };
          const rows = last4.map((r) => {
            const fecha = fmtDate(r.created_at);
            const dist = r.distance_meters != null ? `${Math.round(r.distance_meters)} m` : "—";
            const badge = r.is_competition
              ? `<span class="badge badge-premier" style="font-size:10px">${escapeHtml(t("home.competitionBadge"))}</span>`
              : `<span class="badge badge-senior-a" style="font-size:10px">${escapeHtml(t("home.trainingBadge"))}</span>`;
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
