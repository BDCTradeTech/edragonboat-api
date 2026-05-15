/**
 * Página: Equipos — lista, detalle, nuevo equipo, plantel.
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { countrySelectOptionsHtml, countryCellHtml } from "../countries.js";
import { humanizeApiError, roleLabel, rosterBirthInputValue, preferredSideLabel } from "../utils/format.js";
import { route } from "../router.js";

const SESSION_TEAM_FILTER_KEY = "edb_team_sessions_filter";

const AVATAR_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

function buildTeamInviteHtml(teamId, myRole, isCoach, isPlatformAdmin) {
  if (myRole === "captain" || isPlatformAdmin) {
    return `
      <div class="invite-card-modern" style="border-radius:12px;background:#fff;border:0.5px solid #e2e8f0;padding:1rem;margin-top:0.75rem">
        <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
          <span style="font-size:1rem">&#128101;</span>
          <strong style="font-size:0.9rem">${escapeHtml(t("teams.inviteTitle"))}</strong>
        </div>
        <div style="display:inline-flex;align-items:center;background:#fef9c3;border:1px solid #fde047;border-radius:999px;padding:0.15rem 0.7rem;font-size:0.75rem;color:#854d0e;margin-bottom:0.75rem">
          &#9888; ${escapeHtml(t("teams.invitePasswordHint"))}
        </div>
        <form id="form-invite-${teamId}">
          <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:120px">
              <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:0.2rem" for="inv-name-${teamId}">${escapeHtml(t("teams.name"))}</label>
              <input id="inv-name-${teamId}" type="text" maxlength="200" autocomplete="name" style="width:100%;padding:0.35rem 0.5rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.82rem" />
            </div>
            <div style="flex:1.5;min-width:150px">
              <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:0.2rem" for="inv-email-${teamId}">${escapeHtml(t("teams.email"))}</label>
              <input id="inv-email-${teamId}" type="email" required autocomplete="email" style="width:100%;padding:0.35rem 0.5rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.82rem" />
            </div>
            <div style="min-width:110px">
              <label style="font-size:0.75rem;color:#64748b;display:block;margin-bottom:0.2rem" for="inv-role-${teamId}">${escapeHtml(t("teams.role"))}</label>
              <select id="inv-role-${teamId}" style="width:100%;padding:0.35rem 0.5rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.82rem;background:#fff">
                <option value="coach">${escapeHtml(t("teams.roleCoach"))}</option>
                <option value="paddler" selected>${escapeHtml(t("teams.rolePaddler"))}</option>
              </select>
            </div>
            <div>
              <button type="submit" style="padding:0.38rem 1rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:0.82rem;cursor:pointer;white-space:nowrap">${escapeHtml(t("teams.inviteSubmit"))}</button>
            </div>
          </div>
          <p id="inv-err-${teamId}" class="msg-error" style="margin-top:0.4rem"></p>
        </form>
      </div>`;
  }
  if (isCoach) return `<p class="muted small">${t("teams.inviteCoachOnlyHtml")}</p>`;
  return `<p class="muted small">${t("teams.inviteOnlyCaptain")}</p>`;
}

function bindTeamInviteForm(teamId, renderTeamsListFn) {
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
      if (result.account_created) msg = result.invite_email_sent ? t("teams.inviteSuccessNewWithEmail") : t("teams.inviteSuccessNewNoSmtp");
      errEl.textContent = msg;
      document.getElementById(`inv-email-${teamId}`).value = "";
      const nameIn = document.getElementById(`inv-name-${teamId}`);
      if (nameIn) nameIn.value = "";
      try { sessionStorage.setItem("edb-teams-selected-team", String(teamId)); } catch {}
      await renderTeamsListFn();
    } catch (ex) {
      errEl.textContent = humanizeApiError(ex.message) || String(ex.message);
    }
  });
}

function formatBirthDateDisplay(birthDateStr) {
  if (!birthDateStr) return null;
  // birthDateStr is ISO format: YYYY-MM-DD
  const [year, month, day] = birthDateStr.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
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

function sexSelectOptionsHtml(m) {
  const v = m.sex === "male" ? "male" : "female";
  return `<option value="female" ${v === "female" ? "selected" : ""}>${escapeHtml(t("teams.sexFemale"))}</option>
    <option value="male" ${v === "male" ? "selected" : ""}>${escapeHtml(t("teams.sexMale"))}</option>`;
}

function sexCellHtml(m, canEditRoster) {
  if (canEditRoster) return `<td><select class="roster-sex" aria-label="${escapeHtml(t("teams.sexAria"))}">${sexSelectOptionsHtml(m)}</select></td>`;
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

const ROLE_BADGE_STYLES = {
  captain: "background:#dbeafe;color:#1d4ed8",
  coach:   "background:#dcfce7;color:#166534",
  paddler: "background:#f3f4f6;color:#374151",
  timonel: "background:#dbeafe;color:#1d4ed8",
  drummer: "background:#fef3c7;color:#92400e",
};

function roleBadgeHtml(role) {
  const style = ROLE_BADGE_STYLES[role] || ROLE_BADGE_STYLES.paddler;
  return `<span style="display:inline-block;${style};border-radius:999px;padding:0.1rem 0.55rem;font-size:0.72rem;font-weight:600">${escapeHtml(roleLabel(role))}</span>`;
}

function rosterInputStyle() {
  return "padding:0.28rem 0.45rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.78rem;background:#fff;width:100%";
}

function buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin, canEditEmail }, teamId) {
  const canManage = isCaptain || isCoach || isPlatformAdmin;
  const canEditRoster = canManage;

  const thStyle = "font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:600;padding:0.5rem 0.6rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;white-space:nowrap";
  const tdStyle = "padding:0.45rem 0.6rem;border-bottom:1px solid #f1f5f9;vertical-align:middle";

  // Grid columns (exact widths): 220px avatar+name+email, 70px sex, 110px birth, 90px height, 90px weight, 120px side, 120px role, 80px manage
  const gridCols = canManage
    ? "220px 70px 110px 90px 90px 120px 120px 80px"
    : "220px 70px 110px 90px 90px 120px 120px";

  const theadStyle = `display:grid;grid-template-columns:${gridCols};width:100%;gap:0`;
  const trStyle = `display:grid;grid-template-columns:${gridCols};width:100%;gap:0`;

  const th = (label, sortKey = null) => {
    if (sortKey === null) {
      return `<th style="${thStyle}">${escapeHtml(label)}</th>`;
    }
    return `<th style="${thStyle};cursor:pointer" data-sort-key="${sortKey}" role="button" tabindex="0">${escapeHtml(label)}</th>`;
  };

  const thead = `<thead style="${theadStyle}"><tr style="display:grid;grid-template-columns:${gridCols};gap:0">
    ${th("")}
    ${th(t("teams.thName"), "name")}
    ${th(t("teams.thSex"), "sex")}
    ${th(t("teams.thBirth"), "birth")}
    ${th(t("teams.thHeight"), "height")}
    ${th(t("teams.thWeight"), "weight")}
    ${th(t("teams.thPreferredSide"), "side")}
    ${th(t("teams.thRole"), "role")}
    ${canManage ? th(t("teams.thManage")) : ""}
  </tr></thead>`;

  function avatarCell(m, idx) {
    const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    const initial = (m.full_name || m.email || "?")[0].toUpperCase();
    const nameHtml = escapeHtml(m.full_name || t("account.emptyDash"));
    let emailHtml;
    if (canEditEmail) {
      emailHtml = `<input type="email" class="member-email" maxlength="320" autocomplete="email" value="${escapeHtml(m.email)}" style="${rosterInputStyle()};font-size:0.72rem;color:#64748b" />`;
    } else {
      emailHtml = `<span style="font-size:0.72rem;color:#64748b">${escapeHtml(m.email)}</span>`;
    }
    return `<td style="${tdStyle}">
      <div style="display:flex;align-items:center;gap:0.5rem">
        <div style="width:32px;height:32px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.82rem;font-weight:700;flex-shrink:0">${initial}</div>
        <div style="min-width:0">
          <div style="font-weight:600;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${nameHtml}</div>
          ${emailHtml}
        </div>
      </div>
    </td>`;
  }

  function sexTd(m) {
    if (canEditRoster) return `<td style="${tdStyle}"><select class="roster-sex" aria-label="${escapeHtml(t("teams.sexAria"))}" style="${rosterInputStyle()}">${sexSelectOptionsHtml(m)}</select></td>`;
    const label = m.sex === "male" ? t("teams.sexMale") : t("teams.sexFemale");
    return `<td style="${tdStyle};font-size:0.82rem">${escapeHtml(label)}</td>`;
  }

  function rosterTds(m) {
    if (canEditRoster) {
      return `
        <td style="${tdStyle}"><input class="roster-birth" type="date" value="${rosterBirthInputValue(m.birth_date)}" style="${rosterInputStyle()}" /></td>
        <td style="${tdStyle}"><input class="roster-h" type="number" step="0.1" min="0" placeholder="${escapeHtml(t("teams.placeholderCm"))}" value="${m.height_cm != null ? escapeHtml(String(m.height_cm)) : ""}" style="${rosterInputStyle()};width:68px" /></td>
        <td style="${tdStyle}"><input class="roster-w" type="number" step="0.1" min="0" placeholder="${escapeHtml(t("teams.placeholderKg"))}" value="${m.weight_kg != null ? escapeHtml(String(m.weight_kg)) : ""}" style="${rosterInputStyle()};width:68px" /></td>
        <td style="${tdStyle}"><select class="roster-side" style="${rosterInputStyle()}">${preferredSideOptionsHtml(m)}</select></td>`;
    }
    const d = t("account.emptyDash");
    const birthDisplay = m.birth_date ? formatBirthDateDisplay(m.birth_date) : null;
    return `
      <td style="${tdStyle};font-size:0.82rem">${birthDisplay ? escapeHtml(birthDisplay) : escapeHtml(d)}</td>
      <td style="${tdStyle};font-size:0.82rem">${m.height_cm != null ? escapeHtml(String(m.height_cm)) : escapeHtml(d)}</td>
      <td style="${tdStyle};font-size:0.82rem">${m.weight_kg != null ? escapeHtml(String(m.weight_kg)) : escapeHtml(d)}</td>
      <td style="${tdStyle};font-size:0.82rem">${escapeHtml(preferredSideLabel(m.preferred_side))}</td>`;
  }

  function roleTd(m) {
    const rAria = escapeHtml(t("teams.roleAria"));
    const selStyle = rosterInputStyle();
    if (isPlatformAdmin) return `<td style="${tdStyle}"><select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="${rAria}" style="${selStyle}"><option value="captain" ${m.role === "captain" ? "selected" : ""}>${escapeHtml(t("roles.captain"))}</option><option value="coach" ${m.role === "coach" ? "selected" : ""}>${escapeHtml(t("roles.coach"))}</option><option value="paddler" ${m.role === "paddler" ? "selected" : ""}>${escapeHtml(t("roles.paddler"))}</option></select></td>`;
    if (m.role === "captain") return `<td style="${tdStyle}">${roleBadgeHtml(m.role)}</td>`;
    if (isCoach && m.role === "coach") return `<td style="${tdStyle}">${roleBadgeHtml(m.role)}</td>`;
    if (isCaptain) return `<td style="${tdStyle}"><select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="${rAria}" style="${selStyle}"><option value="coach" ${m.role === "coach" ? "selected" : ""}>${escapeHtml(t("roles.coach"))}</option><option value="paddler" ${m.role === "paddler" ? "selected" : ""}>${escapeHtml(t("roles.paddler"))}</option></select></td>`;
    return `<td style="${tdStyle}">${roleBadgeHtml(m.role)}</td>`;
  }

  function manageTd(m) {
    if (!canManage) return "";
    const btnStyle = "padding:0.22rem 0.6rem;border:1px solid #ef4444;color:#ef4444;background:transparent;border-radius:5px;font-size:0.75rem;cursor:pointer";
    if (isPlatformAdmin) return `<td style="${tdStyle}"><button type="button" class="btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}" style="${btnStyle}" ${m.role === "captain" ? `disabled title="${escapeHtml(t("teams.removeCaptainHint"))}"` : ""}>${escapeHtml(t("teams.remove"))}</button></td>`;
    if (m.role === "captain") return `<td style="${tdStyle}"><span style="color:#94a3b8;font-size:0.78rem">${escapeHtml(t("account.emptyDash"))}</span></td>`;
    if (isCoach && m.role === "coach") return `<td style="${tdStyle}"><span style="color:#94a3b8;font-size:0.78rem">${escapeHtml(t("teams.coachOnlyManagesPaddler"))}</span></td>`;
    return `<td style="${tdStyle}"><button type="button" class="btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}" style="${btnStyle}">${escapeHtml(t("teams.remove"))}</button></td>`;
  }

  const rows = members.map((m, idx) => {
    const rowAttrs = `data-user-id="${m.user_id}" data-initial-role="${m.role}" data-initial-email="${encodeURIComponent(m.email)}" style="transition:background 0.15s;${trStyle}" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''"`;
    return `<tr ${rowAttrs}>${avatarCell(m, idx)}${sexTd(m)}${rosterTds(m)}${roleTd(m)}${manageTd(m)}</tr>`;
  }).join("");

  const tableWrapStyle = "border-radius:10px;overflow:hidden;border:0.5px solid #e2e8f0";

  // Store members and sort info for later re-rendering
  const tableHtml = `<div style="${tableWrapStyle}"><div class="table-scroll"><table class="plantel-table" data-team="${teamId}" style="width:100%;border-collapse:collapse">${thead}<tbody style="display:contents" class="plantel-tbody">${rows}</tbody></table></div></div>`;

  // Return HTML with metadata
  return {
    html: tableHtml,
    _members: members,
    _gridCols: gridCols,
    _tdStyle: tdStyle,
    _teamId: teamId,
    _canEditRoster: canEditRoster,
    _canManage: canManage,
  };
}

function wireTeamPlantelPage(teamId, { canChangeRoles, canRemoveMember, canEditEmail }, renderTeamsListFn) {
  let rosterSort = { col: null, dir: "asc" };

  // Wire up table header sorting
  const table = document.querySelector(`.plantel-table[data-team="${teamId}"]`);
  if (table) {
    const headers = table.querySelectorAll("thead th[data-sort-key]");
    headers.forEach((th) => {
      th.addEventListener("click", () => {
        const sortKey = th.getAttribute("data-sort-key");
        const tbody = table.querySelector("tbody");
        if (!tbody) return;

        // Toggle sort direction if same column, else reset to asc
        if (rosterSort.col === sortKey) {
          rosterSort.dir = rosterSort.dir === "asc" ? "desc" : "asc";
        } else {
          rosterSort.col = sortKey;
          rosterSort.dir = "asc";
        }

        // Get all rows
        const rows = Array.from(tbody.querySelectorAll("tr[data-user-id]"));
        if (rows.length === 0) return;

        // Sort rows based on sortKey
        rows.sort((a, b) => {
          let aVal, bVal;

          switch (sortKey) {
            case "name":
              aVal = (a.querySelector("td:nth-child(2)")?.textContent || "").toLowerCase();
              bVal = (b.querySelector("td:nth-child(2)")?.textContent || "").toLowerCase();
              break;
            case "sex":
              aVal = a.querySelector("select.roster-sex, td:nth-child(3)")?.textContent || "";
              bVal = b.querySelector("select.roster-sex, td:nth-child(3)")?.textContent || "";
              aVal = aVal.toLowerCase();
              bVal = bVal.toLowerCase();
              break;
            case "birth":
              // Extract date from input or text
              const birthInputA = a.querySelector("input.roster-birth");
              const birthInputB = b.querySelector("input.roster-birth");
              aVal = birthInputA ? birthInputA.value : (a.querySelector("td:nth-child(4)")?.textContent || "");
              bVal = birthInputB ? birthInputB.value : (b.querySelector("td:nth-child(4)")?.textContent || "");
              // Convert dd/mm/yyyy back to ISO or compare as is
              if (aVal && aVal.includes("/")) aVal = aVal.split("/").reverse().join("-");
              if (bVal && bVal.includes("/")) bVal = bVal.split("/").reverse().join("-");
              break;
            case "height":
              const heightInputA = a.querySelector("input.roster-h");
              const heightInputB = b.querySelector("input.roster-h");
              aVal = heightInputA ? parseFloat(heightInputA.value) || 0 : parseFloat(a.querySelector("td:nth-child(5)")?.textContent || "0");
              bVal = heightInputB ? parseFloat(heightInputB.value) || 0 : parseFloat(b.querySelector("td:nth-child(5)")?.textContent || "0");
              break;
            case "weight":
              const weightInputA = a.querySelector("input.roster-w");
              const weightInputB = b.querySelector("input.roster-w");
              aVal = weightInputA ? parseFloat(weightInputA.value) || 0 : parseFloat(a.querySelector("td:nth-child(6)")?.textContent || "0");
              bVal = weightInputB ? parseFloat(weightInputB.value) || 0 : parseFloat(b.querySelector("td:nth-child(6)")?.textContent || "0");
              break;
            case "side":
              aVal = a.querySelector("select.roster-side, td:nth-child(7)")?.textContent || "";
              bVal = b.querySelector("select.roster-side, td:nth-child(7)")?.textContent || "";
              aVal = aVal.toLowerCase();
              bVal = bVal.toLowerCase();
              break;
            case "role":
              aVal = a.getAttribute("data-initial-role") || "";
              bVal = b.getAttribute("data-initial-role") || "";
              aVal = aVal.toLowerCase();
              bVal = bVal.toLowerCase();
              break;
            default:
              return 0;
          }

          // Compare
          if (typeof aVal === "string" && typeof bVal === "string") {
            return rosterSort.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          } else {
            const aNum = typeof aVal === "number" ? aVal : parseFloat(aVal) || 0;
            const bNum = typeof bVal === "number" ? bVal : parseFloat(bVal) || 0;
            return rosterSort.dir === "asc" ? aNum - bNum : bNum - aNum;
          }
        });

        // Update visual indicators (▲/▼)
        headers.forEach((h) => {
          const hSortKey = h.getAttribute("data-sort-key");
          if (hSortKey === sortKey) {
            h.textContent = h.textContent.replace(/[\s▲▼]$/, "");
            h.textContent += (rosterSort.dir === "asc" ? " ▲" : " ▼");
          } else {
            h.textContent = h.textContent.replace(/[\s▲▼]$/, "");
          }
        });

        // Re-insert rows in sorted order
        rows.forEach((row) => tbody.appendChild(row));
      });
    });
  }

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
          if (!newEmail) { alert(t("teams.alertEmailEmpty")); return; }
          if (newEmail !== initialEmail) await api.apiPatchMember(teamId, uid, { email: newEmail });
        }
        const sel = tr.querySelector(".role-select-acc");
        if (sel && canChangeRoles) {
          const newRole = sel.value;
          const initialRole = tr.getAttribute("data-initial-role");
          if (newRole !== initialRole) await api.apiPatchMember(teamId, uid, { role: newRole });
        }
        const doc = tr.querySelector(".roster-doc")?.value?.trim() ?? "";
        const birthRaw = tr.querySelector(".roster-birth")?.value || "";
        const hRaw = tr.querySelector(".roster-h")?.value ?? "";
        const wRaw = tr.querySelector(".roster-w")?.value ?? "";
        const sideRaw = tr.querySelector(".roster-side")?.value ?? "";
        const sexRaw = tr.querySelector(".roster-sex")?.value ?? "female";
        const body = { document_number: doc || null, birth_date: birthRaw ? birthRaw : null, height_cm: hRaw === "" ? null : Number(hRaw), weight_kg: wRaw === "" ? null : Number(wRaw), preferred_side: sideRaw || null, sex: sexRaw === "male" ? "male" : "female" };
        if (body.height_cm != null && (Number.isNaN(body.height_cm) || body.height_cm < 0)) { alert(t("teams.alertHeightInvalid")); return; }
        if (body.weight_kg != null && (Number.isNaN(body.weight_kg) || body.weight_kg < 0)) { alert(t("teams.alertWeightInvalid")); return; }
        await api.apiPatchMemberRoster(teamId, uid, body);
      }
      try { sessionStorage.setItem("edb-teams-selected-team", String(teamId)); } catch {}
      await renderTeamsListFn();
    } catch (ex) { alert(humanizeApiError(ex.message) || String(ex.message)); }
  });
  if (canRemoveMember) {
    document.querySelectorAll(`.btn-remove-acc[data-team="${teamId}"]`).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = Number(btn.getAttribute("data-user"));
        if (!confirm(t("teams.confirmRemoveMember"))) return;
        try {
          await api.apiRemoveMember(teamId, uid);
          try { sessionStorage.setItem("edb-teams-selected-team", String(teamId)); } catch {}
          await renderTeamsListFn();
        } catch (ex) { alert(ex.message || t("teams.errGeneric")); }
      });
    });
  }
}

function renderTeamPlantelWrapHtml(teamId, members, { isCaptain, isCoach, isPlatformAdmin }, inviteBlock) {
  const canManage = isCaptain || isCoach || isPlatformAdmin;
  const count = members.length;
  const subtitle = t("teams.plantelSubtitle").replace("{count}", String(count));
  const saveBtn = canManage
    ? `<button type="button" class="btn-plantel-save-all" data-team="${teamId}" style="padding:0.3rem 0.85rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:0.82rem;cursor:pointer">${escapeHtml(t("teams.saveRoster"))}</button>`
    : "";
  const tableData = buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin, canEditEmail: isCaptain || isPlatformAdmin }, teamId);
  return `
    <div class="card team-plantel-card" style="margin-top:1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-bottom:0.6rem;flex-wrap:wrap">
        <div>
          <h3 style="margin:0;font-size:1rem">${escapeHtml(t("teams.plantelTitle"))}</h3>
          <p class="muted small" style="margin:0.15rem 0 0">${escapeHtml(subtitle)}</p>
        </div>
        ${saveBtn}
      </div>
      ${tableData.html}
      ${inviteBlock}
    </div>`;
}

export async function renderTeamsList(layout) {
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
      if (saved) { const n = Number(saved); if (list.some((x) => x.team.id === n)) selectedTeamId = n; }
    } catch {}
    let members = await api.apiListMembers(selectedTeamId);
    const rows = list.map((x) => `
      <tr>
        <td>${escapeHtml(x.team.name)}</td>
        <td>${escapeHtml(x.team.country || t("account.emptyDash"))}</td>
        <td>${roleLabel(x.role)}</td>
        <td><a class="link" href="#/teams/${x.team.id}">${escapeHtml(t("teams.configure"))}</a></td>
      </tr>`).join("");

    let topCardHtml;
    if (isPlatformAdmin && list.length > 1) {
      topCardHtml = `
        <div class="card">
          <h2 class="card-title">${escapeHtml(t("teams.adminAllTitle"))}</h2>
          <p class="muted">${t("teams.adminAllHint")}</p>
          <div class="table-scroll"><table><thead><tr><th>${escapeHtml(t("teams.colName"))}</th><th>${escapeHtml(t("teams.colCountry"))}</th><th>${escapeHtml(t("teams.colYourRole"))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
        <div class="session-team-filter" style="margin-top:0.75rem">
          <label for="sel-inline-plantel-team">${escapeHtml(t("teams.rosterPickerLabel"))}</label>
          <select id="sel-inline-plantel-team">${list.map((x) => `<option value="${x.team.id}" ${x.team.id === selectedTeamId ? "selected" : ""}>${escapeHtml(x.team.name)}</option>`).join("")}</select>
        </div>`;
    } else {
      const x = list[0];
      topCardHtml = `
        <div class="card team-card-with-logo">
          <div class="team-list-head">
            ${x.team.logo_url ? `<img src="${api.API}${x.team.logo_url}" alt="" class="team-logo-thumb" width="64" height="64" />` : ""}
            <div>
              <h2 class="card-title">${escapeHtml(x.team.name)}</h2>
              <p class="muted">${t("teams.countryAndRole", { country: escapeHtml(x.team.country || t("account.emptyDash")), roleHtml: `<strong>${escapeHtml(roleLabel(x.role))}</strong>` })}</p>
              <p><a class="link" href="#/teams/${x.team.id}">${escapeHtml(t("teams.linkConfigureTeam"))}</a></p>
            </div>
          </div>
        </div>`;
    }

    function plantelContextForTeam(tid) {
      const entry = list.find((x) => x.team.id === tid);
      const myRole = entry?.role;
      const isCaptain = myRole === "captain" || isPlatformAdmin;
      const isCoach = myRole === "coach";
      const inviteBlock = buildTeamInviteHtml(tid, myRole, isCoach, isPlatformAdmin);
      return { myRole, isCaptain, isCoach, inviteBlock, wire: { canChangeRoles: isPlatformAdmin || myRole === "captain", canRemoveMember: isPlatformAdmin || myRole === "captain" || myRole === "coach", canEditEmail: isPlatformAdmin || myRole === "captain" } };
    }

    const ctx0 = plantelContextForTeam(selectedTeamId);
    const plantelWrapHtml = renderTeamPlantelWrapHtml(selectedTeamId, members, { isCaptain: ctx0.isCaptain, isCoach: ctx0.isCoach, isPlatformAdmin }, ctx0.inviteBlock);

    // Closure para el re-render
    const renderTeamsListBound = () => renderTeamsList(layout);

    layout(`
      <p><a class="link" href="#/">${escapeHtml(t("nav.home"))}</a></p>
      ${topCardHtml}
      <div id="team-plantel-wrap">${plantelWrapHtml}</div>
    `, { wide: true });

    wireTeamPlantelPage(selectedTeamId, ctx0.wire, renderTeamsListBound);
    bindTeamInviteForm(selectedTeamId, renderTeamsListBound);

    document.getElementById("sel-inline-plantel-team")?.addEventListener("change", async (e) => {
      const tid = Number(e.target.value);
      if (!Number.isFinite(tid)) return;
      try {
        sessionStorage.setItem("edb-teams-selected-team", String(tid));
        const m = await api.apiListMembers(tid);
        const c = plantelContextForTeam(tid);
        const plantelHtml = renderTeamPlantelWrapHtml(tid, m, { isCaptain: c.isCaptain, isCoach: c.isCoach, isPlatformAdmin }, c.inviteBlock);
        document.getElementById("team-plantel-wrap").innerHTML = plantelHtml;
        wireTeamPlantelPage(tid, c.wire, renderTeamsListBound);
        bindTeamInviteForm(tid, renderTeamsListBound);
      } catch (ex) { alert(humanizeApiError(ex.message) || String(ex.message)); }
    });
  } catch (ex) {
    layout(`<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p></div>`);
  }
}

export async function renderTeamNew(layout) {
  let existing, me;
  try {
    [existing, me] = await Promise.all([api.apiMyTeams(), api.apiMe()]);
  } catch (ex) {
    layout(`<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backShort"))}</a></p></div>`);
    return;
  }
  if (existing.length > 0 && me.is_platform_admin !== true) { location.hash = "#/teams"; route(); return; }

  layout(`
    <p><a class="link" href="#/teams">${escapeHtml(t("teams.backToList"))}</a></p>
    <div class="card narrow">
      <h2 class="card-title">${escapeHtml(t("teams.newTitle"))}</h2>
      <form id="form-new-team">
        <label for="t-name">${escapeHtml(t("teams.newTeamName"))}</label>
        <input id="t-name" required maxlength="200" />
        <label for="t-country">${escapeHtml(t("teams.newCountryOptional"))}</label>
        <select id="t-country">${countrySelectOptionsHtml("")}</select>
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

export async function renderTeamDetail(id, layout) {
  const teamId = Number(id);
  if (!Number.isFinite(teamId) || teamId < 1) {
    layout(`<div class="card"><p class="msg-error">${escapeHtml(t("teams.detailInvalid"))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backShort"))}</a></p></div>`);
    return;
  }
  layout(`<p class="loading-line">${escapeHtml(t("teams.loading"))}</p>`);
  try {
    const [team, myTeams, me] = await Promise.all([api.apiGetTeam(teamId), api.apiMyTeams(), api.apiMe()]);
    const myEntry = myTeams.find((x) => x.team.id === teamId);
    const myRole = myEntry?.role;
    const isPlatformAdmin = me.is_platform_admin === true;
    const isCaptain = myRole === "captain" || isPlatformAdmin;
    const isCoach = myRole === "coach";
    const countryOptsEdit = countrySelectOptionsHtml(team.country || "");
    const roleLine = myRole != null ? roleLabel(myRole) : isPlatformAdmin ? t("roles.platformAdmin") : t("account.emptyDash");
    const logoPreview = team.logo_url ? `<img src="${api.API}${team.logo_url}" alt="" class="team-logo-preview" width="112" height="112" />` : `<span class="muted">${escapeHtml(t("teams.logoNone"))}</span>`;
    const logoDeleteBtn = team.logo_url ? `<button type="button" class="secondary btn-sm" id="btn-team-logo-delete">${escapeHtml(t("teams.btnRemoveLogo"))}</button>` : "";

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

    layout(`
      <p><a class="link" href="#/teams">${escapeHtml(t("teams.backToList"))}</a></p>
      <div class="card">
        <div class="team-detail-head">
          ${team.logo_url ? `<img src="${api.API}${team.logo_url}" alt="" class="team-logo-preview team-logo-preview--header" width="72" height="72" />` : ""}
          <div>
            <h2 class="card-title">${escapeHtml(team.name)}</h2>
            <p class="muted">${t("teams.countryAndRole", { country: escapeHtml(team.country || t("account.emptyDash")), roleHtml: `<strong>${escapeHtml(roleLine)}</strong>` })}</p>
          </div>
        </div>
        ${editBlock}
      </div>
    `, { wide: true });

    if (isCaptain) {
      document.getElementById("form-edit-team").addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = document.getElementById("edit-err");
        errEl.textContent = "";
        try {
          await api.apiUpdateTeam(teamId, { name: document.getElementById("e-name").value.trim(), country: document.getElementById("e-country").value.trim() || null });
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
        } catch (ex) { errEl.textContent = humanizeApiError(ex.message); }
      });

      document.getElementById("btn-team-logo-upload")?.addEventListener("click", async () => {
        const input = document.getElementById("team-logo-file");
        const f = input?.files?.[0];
        const err = document.getElementById("logo-err");
        if (err) err.textContent = "";
        if (!f) { alert(t("teams.pickPngJpeg")); return; }
        try { await api.apiUploadTeamLogo(teamId, f); route(); }
        catch (ex) { if (err) err.textContent = humanizeApiError(ex.message) || String(ex.message); }
      });

      document.getElementById("btn-team-logo-delete")?.addEventListener("click", async () => {
        const err = document.getElementById("logo-err");
        if (err) err.textContent = "";
        if (!confirm(t("teams.confirmRemoveLogo"))) return;
        try { await api.apiDeleteTeamLogo(teamId); route(); }
        catch (ex) { if (err) err.textContent = humanizeApiError(ex.message) || String(ex.message); }
      });
    }
  } catch (ex) {
    layout(`<div class="card"><p class="msg-error">${escapeHtml(humanizeApiError(ex.message))}</p><p><a class="link" href="#/teams">${escapeHtml(t("teams.backToTeams"))}</a></p></div>`);
  }
}
