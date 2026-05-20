/**
 * Página de Balance del Plantel.
 * Muestra selector de equipo, vista de bote con distribución izq/der, y tabla completa del plantel.
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { preferredSideLabel } from "../utils/format.js";

/**
 * Renderiza la página de Balance del Plantel.
 * @param {Function} layout - Función que renderiza la estructura general del panel
 */
export async function renderBalance(layout) {
  layout(`<p class="muted">${escapeHtml(t("balance.loading"))}</p>`);

  try {
    const teams = await api.apiMyTeams();

    if (!teams || teams.length === 0) {
      layout(`
        <div class="card">
          <p class="msg-error">${escapeHtml(t("balance.noTeams"))}</p>
        </div>
      `);
      return;
    }

    // Si tiene solo un equipo, cargarlo directo. Si tiene varios, mostrar selector.
    if (teams.length === 1) {
      const teamId = teams[0].team.id;
      renderBalanceDetail(teamId, layout, teams);
    } else {
      // Mostrar selector de equipo
      let html = `
        <div class="card" style="margin-bottom: 2rem;">
          <h2>${escapeHtml(t("balance.title"))}</h2>
          <label for="balance-team-select">${escapeHtml(t("balance.selectTeam"))}</label>
          <select id="balance-team-select" style="width: 100%; padding: 0.5rem; margin-top: 0.5rem; border-radius: 6px; border: 0.5px solid #e2e8f0;">
      `;

      html += `<option value="">${escapeHtml(t("balance.selectTeam"))}</option>`;
      for (const tm of teams) {
        html += `<option value="${tm.team.id}">${escapeHtml(tm.team.name)}</option>`;
      }

      html += `</select></div>`;
      layout(html);

      const select = document.getElementById("balance-team-select");
      if (select) {
        select.addEventListener("change", (e) => {
          const teamId = e.target.value;
          if (teamId) {
            renderBalanceDetail(teamId, layout, teams);
          }
        });
      }
    }
  } catch (ex) {
    layout(`
      <div class="card">
        <p class="msg-error">${escapeHtml(ex.message || t("common.errorUnknown"))}</p>
      </div>
    `);
  }
}

/**
 * Renderiza el detalle de balance del equipo seleccionado.
 * @param {number|string} teamId
 * @param {Function} layout
 * @param {Array} teams
 */
async function renderBalanceDetail(teamId, layout, teams) {
  try {
    const team = await api.apiGetTeam(teamId);

    if (!team || !team.members) {
      layout(`
        <div class="card">
          <p class="msg-error">${escapeHtml(t("balance.noMembers"))}</p>
        </div>
      `);
      return;
    }

    // Filtrar solo paddlers (incluir todos menos coaches/captains puros, aunque la API ya filtra)
    // Según especificación: incluir a TODOS los members ya que son el plantel
    const paddlers = team.members || [];

    // Contar por lado
    const leftSide = paddlers.filter(m => m.preferred_side === "left");
    const rightSide = paddlers.filter(m => m.preferred_side === "right");
    const eitherSide = paddlers.filter(m => m.preferred_side === "either" || !m.preferred_side);

    const statTotal = paddlers.length;
    const statLeft = leftSide.length;
    const statRight = rightSide.length;
    const statEither = eitherSide.length;

    // HTML
    const teamName = team.name ? escapeHtml(team.name) : escapeHtml(t("teams.emptyNoTeam"));

    const statsHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div style="background: white; border: 0.5px solid #e2e8f0; border-radius: 12px; padding: 1rem; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${statTotal}</div>
          <div style="font-size: 0.875rem; color: #666;">${escapeHtml(t("balance.statTotal"))}</div>
        </div>
        <div style="background: white; border: 0.5px solid #e2e8f0; border-radius: 12px; padding: 1rem; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${statLeft}</div>
          <div style="font-size: 0.875rem; color: #666;">${escapeHtml(t("balance.statLeft"))}</div>
        </div>
        <div style="background: white; border: 0.5px solid #e2e8f0; border-radius: 12px; padding: 1rem; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #16a34a;">${statRight}</div>
          <div style="font-size: 0.875rem; color: #666;">${escapeHtml(t("balance.statRight"))}</div>
        </div>
        <div style="background: white; border: 0.5px solid #e2e8f0; border-radius: 12px; padding: 1rem; text-align: center;">
          <div style="font-size: 2rem; font-weight: bold; color: #f59e0b;">${statEither}</div>
          <div style="font-size: 0.875rem; color: #666;">${escapeHtml(t("balance.statEither"))}</div>
        </div>
      </div>
    `;

    // Vista de bote: dos columnas
    const boatLeftHtml = leftSide
      .map(m => `<div style="padding: 0.5rem; border-bottom: 0.5px solid #d1d5db;">${escapeHtml(m.full_name)}</div>`)
      .join("");

    const boatRightHtml = rightSide
      .map(m => `<div style="padding: 0.5rem; border-bottom: 0.5px solid #d1d5db;">${escapeHtml(m.full_name)}</div>`)
      .join("");

    const boatHtml = `
      <div style="margin-bottom: 2rem;">
        <h3 style="margin-bottom: 1rem;">${escapeHtml(t("balance.boatTitle"))}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
          <div style="background: #eff6ff; border: 0.5px solid #bfdbfe; border-radius: 12px; padding: 1rem;">
            <div style="font-weight: bold; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 0.5px solid #bfdbfe;">${escapeHtml(t("balance.colLeft"))}</div>
            <div>${boatLeftHtml || `<div style="padding: 0.5rem; color: #999;">${escapeHtml(t("balance.empty"))}</div>`}</div>
          </div>
          <div style="background: #f0fdf4; border: 0.5px solid #bbf7d0; border-radius: 12px; padding: 1rem;">
            <div style="font-weight: bold; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 0.5px solid #bbf7d0;">${escapeHtml(t("balance.colRight"))}</div>
            <div>${boatRightHtml || `<div style="padding: 0.5rem; color: #999;">${escapeHtml(t("balance.empty"))}</div>`}</div>
          </div>
        </div>
        ${eitherSide.length > 0 ? `
          <div style="background: #fef3c7; border: 0.5px solid #fde68a; border-radius: 12px; padding: 1rem;">
            <div style="font-weight: bold; margin-bottom: 0.75rem;">${escapeHtml(t("balance.noSide"))}</div>
            <div>${eitherSide.map(m => `<div style="padding: 0.5rem; border-bottom: 0.5px solid #fde68a;">${escapeHtml(m.full_name)}</div>`).join("")}</div>
          </div>
        ` : ""}
      </div>
    `;

    // Tabla completa ordenada: izquierda, derecha, indistinto
    const allPaddlersSorted = [
      ...leftSide.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
      ...rightSide.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
      ...eitherSide.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
    ];

    const tableRows = allPaddlersSorted
      .map(m => {
        const sideLabel = preferredSideLabel(m.preferred_side);
        const weight = m.weight_kg !== null && m.weight_kg !== undefined ? String(m.weight_kg) : escapeHtml(t("balance.empty"));
        const height = m.height_cm !== null && m.height_cm !== undefined ? String(m.height_cm) : escapeHtml(t("balance.empty"));
        return `
          <tr>
            <td style="padding: 0.75rem; border-bottom: 0.5px solid #e2e8f0;">${escapeHtml(m.full_name)}</td>
            <td style="padding: 0.75rem; border-bottom: 0.5px solid #e2e8f0;">${sideLabel}</td>
            <td style="padding: 0.75rem; border-bottom: 0.5px solid #e2e8f0; text-align: right;">${weight}</td>
            <td style="padding: 0.75rem; border-bottom: 0.5px solid #e2e8f0; text-align: right;">${height}</td>
          </tr>
        `;
      })
      .join("");

    const tableHtml = `
      <div style="margin-bottom: 2rem;">
        <h3 style="margin-bottom: 1rem;">${escapeHtml(t("balance.tableTitle"))}</h3>
        ${paddlers.length === 0 ? `
          <div style="padding: 1rem; background: white; border: 0.5px solid #e2e8f0; border-radius: 12px; color: #999;">
            ${escapeHtml(t("balance.noMembers"))}
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; background: white; border: 0.5px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <thead style="background: #f8fafc; border-bottom: 0.5px solid #e2e8f0;">
                <tr>
                  <th style="padding: 0.75rem; text-align: left; font-weight: bold;">${escapeHtml(t("balance.thName"))}</th>
                  <th style="padding: 0.75rem; text-align: left; font-weight: bold;">${escapeHtml(t("balance.thSide"))}</th>
                  <th style="padding: 0.75rem; text-align: right; font-weight: bold;">${escapeHtml(t("balance.thWeight"))}</th>
                  <th style="padding: 0.75rem; text-align: right; font-weight: bold;">${escapeHtml(t("balance.thHeight"))}</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    const fullHtml = `
      <div>
        <h1 style="margin-bottom: 0.5rem;">${escapeHtml(t("balance.title"))}</h1>
        <p style="color: #666; margin-bottom: 2rem;">${teamName}</p>

        ${statsHtml}
        ${boatHtml}
        ${tableHtml}
      </div>
    `;

    layout(fullHtml);
  } catch (ex) {
    layout(`
      <div class="card">
        <p class="msg-error">${escapeHtml(ex.message || t("common.errorUnknown"))}</p>
      </div>
    `);
  }
}
