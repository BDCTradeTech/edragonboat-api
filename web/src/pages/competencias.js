/**
 * Página: Competencias (sesiones de competición globales).
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { getUiLocale } from "../locale.js";
import { countryCellHtml } from "../countries.js";
import {
  humanizeApiError,
  fmtDate,
  labelCompBoat,
  labelCompAgeBadge,
  labelCompTeamCatBadge,
  yn,
} from "../utils/format.js";
import { route } from "../router.js";

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

export async function renderCompetencias(layout) {
  layout(`<p class="loading-line">${escapeHtml(t("competitions.loading"))}</p>`, { wide: true });
  try {
    const [allRows, teamCountriesRaw, me, myTeams] = await Promise.all([
      api.apiListCompetenciaSessions(),
      api.apiListTeamCountries().catch(() => []),
      api.apiMe(),
      api.apiMyTeams(),
    ]);
    const teamCountries = Array.isArray(teamCountriesRaw) ? teamCountriesRaw : [];
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
      `, { wide: true });
      return;
    }

    const oAllM = escapeHtml(t("competitions.optAllM"));
    const oAllF = escapeHtml(t("competitions.optAllF"));
    const oAllDist = escapeHtml(t("competitions.optAllDist"));
    const oAllTurn = escapeHtml(t("competitions.optAllTurn"));
    const oYes = escapeHtml(t("competitions.optYes"));
    const oNo = escapeHtml(t("competitions.optNo"));

    const countryFilterOptions = `<option value="todos" selected>${oAllM}</option>` +
      teamCountries.map((c) => {
        const v = String(c);
        const safeVal = v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        return `<option value="${safeVal}">${escapeHtml(v)}</option>`;
      }).join("");

    const filterBar = `
      <div class="competencia-filters" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-start;margin-bottom:0.75rem">
        <div>
          <label for="comp-filter-pais" class="muted small" style="display:block">${escapeHtml(t("competitions.filterCountry"))}</label>
          <select id="comp-filter-pais">${countryFilterOptions}</select>
        </div>
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
    `, { wide: true });

    const state = { sortKey: "total_seconds", sortDir: "asc" };

    function rowMatchesFilters(r) {
      const pais = document.getElementById("comp-filter-pais")?.value ?? "todos";
      if (pais !== "todos" && (r.team_country || "").trim() !== pais) return false;
      const boat = document.getElementById("comp-filter-boat")?.value ?? "todos";
      if (boat !== "todos" && (r.boat_type || "").toString().toLowerCase() !== boat) return false;
      const paddlers = document.getElementById("comp-filter-paddlers")?.value ?? "todos";
      if (paddlers !== "todos" && r.paddlers_count !== Number(paddlers)) return false;
      const drummer = document.getElementById("comp-filter-drummer")?.value ?? "todos";
      if (drummer === "si" && r.drummer !== true) return false;
      if (drummer === "no" && r.drummer !== false) return false;
      const age = document.getElementById("comp-filter-age")?.value ?? "todos";
      if (age !== "todos" && (r.age_category || "") !== age) return false;
      const teamcat = document.getElementById("comp-filter-teamcat")?.value ?? "todos";
      if (teamcat !== "todos" && (r.team_category || "") !== teamcat) return false;
      const dist = document.getElementById("comp-filter-dist")?.value ?? "todas";
      if (dist !== "todas" && r.target_distance_meters !== Number(dist)) return false;
      const virada = document.getElementById("comp-filter-virada")?.value ?? "todas";
      if (virada === "si" && r.virada !== true) return false;
      if (virada === "no" && r.virada !== false) return false;
      return true;
    }

    function renderCompetenciaBody() {
      const filtered = allRows.filter(rowMatchesFilters);
      filtered.sort((a, b) => compareCompetenciaRows(state.sortKey, state.sortDir, a, b));
      const em = t("account.emptyDash");
      const html = filtered.map((r) => {
        const idCell = r.can_view_detail
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
          </tr>`;
      }).join("");
      document.getElementById("comp-tbody").innerHTML = html || `<tr><td colspan="12" class="muted">${escapeHtml(t("competitions.noRows"))}</td></tr>`;
    }

    ["comp-filter-pais","comp-filter-boat","comp-filter-paddlers","comp-filter-drummer","comp-filter-age","comp-filter-teamcat","comp-filter-dist","comp-filter-virada"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", renderCompetenciaBody);
    });

    document.getElementById("comp-thead").addEventListener("click", (e) => {
      const thEl = e.target.closest("th[data-sort]");
      if (!thEl) return;
      const key = thEl.getAttribute("data-sort");
      if (!key) return;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = key; state.sortDir = key === "created_at" || key === "id" ? "desc" : "asc"; }
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
    `, { wide: true });
    document.getElementById("btn-retry-comp").addEventListener("click", route);
  }
}
