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

function buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin, canEditEmail }, teamId) {
  const canManage = isCaptain || isCoach || isPlatformAdmin;
  const canEditRoster = canManage;
  const th = (k) => escapeHtml(t(k));
  const thead = canManage
    ? `<thead><tr><th>${th("teams.thEmail")}</th><th>${th("teams.thName")}</th><th>${th("teams.thSex")}</th><th>${th("teams.thDocument")}</th><th>${th("teams.thBirth")}</th><th>${th("teams.thAge")}</th><th>${th("teams.thHeight")}</th><th>${th("teams.thWeight")}</th><th>${th("teams.thPreferredSide")}</th><th>${th("teams.thRole")}</th><th>${th("teams.thManage")}</th></tr></thead>`
    : `<thead><tr><th>${th("teams.thEmail")}</th><th>${th("teams.thName")}</th><th>${th("teams.thSex")}</th><th>${th("teams.thDocument")}</th><th>${th("teams.thBirth")}</th><th>${th("teams.thAge")}</th><th>${th("teams.thHeight")}</th><th>${th("teams.thWeight")}</th><th>${th("teams.thPreferredSide")}</th><th>${th("teams.thRole")}</th></tr></thead>`;

  function emailCell(m) {
    if (canEditEmail) return `<td><input type="email" class="member-email" maxlength="320" autocomplete="email" value="${escapeHtml(m.email)}" /></td>`;
    return `<td>${escapeHtml(m.email)}</td>`;
  }
  function rolCell(m) {
    const rAria = escapeHtml(t("teams.roleAria"));
    if (isPlatformAdmin) return `<td><select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="${rAria}"><option value="captain" ${m.role === "captain" ? "selected" : ""}>${escapeHtml(t("roles.captain"))}</option><option value="coach" ${m.role === "coach" ? "selected" : ""}>${escapeHtml(t("roles.coach"))}</option><option value="paddler" ${m.role === "paddler" ? "selected" : ""}>${escapeHtml(t("roles.paddler"))}</option></select></td>`;
    if (m.role === "captain") return `<td>${escapeHtml(roleLabel(m.role))}</td>`;
    if (isCoach && m.role === "coach") return `<td>${escapeHtml(roleLabel(m.role))}</td>`;
    if (isCaptain) return `<td><select class="role-select-acc" data-team="${teamId}" data-user="${m.user_id}" aria-label="${rAria}"><option value="coach" ${m.role === "coach" ? "selected" : ""}>${escapeHtml(t("roles.coach"))}</option><option value="paddler" ${m.role === "paddler" ? "selected" : ""}>${escapeHtml(t("roles.paddler"))}</option></select></td>`;
    return `<td>${escapeHtml(roleLabel(m.role))}</td>`;
  }
  function gestionCell(m) {
    if (!canManage) return "";
    if (isPlatformAdmin) return `<td class="actions-cell"><button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}" ${m.role === "captain" ? `disabled title="${escapeHtml(t("teams.removeCaptainHint"))}"` : ""}>${escapeHtml(t("teams.remove"))}</button></td>`;
    if (m.role === "captain") return `<td class="actions-cell"><span class="muted">${escapeHtml(t("account.emptyDash"))}</span></td>`;
    if (isCoach && m.role === "coach") return `<td class="actions-cell"><span class="muted">${escapeHtml(t("teams.coachOnlyManagesPaddler"))}</span></td>`;
    if (isCaptain) return `<td class="actions-cell"><button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}">${escapeHtml(t("teams.remove"))}</button></td>`;
    return `<td class="actions-cell"><button type="button" class="secondary btn-sm btn-remove-acc" data-team="${teamId}" data-user="${m.user_id}">${escapeHtml(t("teams.remove"))}</button></td>`;
  }
  const rows = members.map((m) => {
    const rc = rosterCellsHtml(m, canEditRoster);
    const trOpen = `<tr data-user-id="${m.user_id}" data-initial-role="${m.role}" data-initial-email="${encodeURIComponent(m.email)}">`;
    if (!canManage) return `${trOpen}${emailCell(m)}<td>${escapeHtml(m.full_name || t("account.emptyDash"))}</td>${sexCellHtml(m, canEditRoster)}${rc}${rolCell(m)}</tr>`;
    return `${trOpen}${emailCell(m)}<td>${escapeHtml(m.full_name || t("account.emptyDash"))}</td>${sexCellHtml(m, canEditRoster)}${rc}${rolCell(m)}${gestionCell(m)}</tr>`;
  }).join("");
  return `<div class="table-scroll"><table class="plantel-table" data-team="${teamId}">${thead}<tbody>${rows}</tbody></table></div>`;
}

function wireTeamPlantelPage(teamId, { canChangeRoles, canRemoveMember, canEditEmail }, renderTeamsListFn) {
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
  const saveBtn = canManage
    ? `<p style="margin-top:0.75rem"><button type="button" class="secondary btn-plantel-save-all" data-team="${teamId}">${escapeHtml(t("teams.saveRoster"))}</button></p>`
    : "";
  return `
    <div class="card team-plantel-card" style="margin-top:1rem">
      <h3 style="margin-top:0">${escapeHtml(t("teams.plantelTitle"))}</h3>
      <p class="muted small">${t("teams.plantelHint")}</p>
      ${buildTeamPlantelTable(members, { isCaptain, isCoach, isPlatformAdmin, canEditEmail: isCaptain || isPlatformAdmin }, teamId)}
      ${saveBtn}
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
    const plantelHtml = renderTeamPlantelWrapHtml(selectedTeamId, members, { isCaptain: ctx0.isCaptain, isCoach: ctx0.isCoach, isPlatformAdmin }, ctx0.inviteBlock);

    // Closure para el re-render
    const renderTeamsListBound = () => renderTeamsList(layout);

    layout(`
      <p><a class="link" href="#/">${escapeHtml(t("nav.home"))}</a></p>
      ${topCardHtml}
      <div id="team-plantel-wrap">${plantelHtml}</div>
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
        document.getElementById("team-plantel-wrap").innerHTML = renderTeamPlantelWrapHtml(tid, m, { isCaptain: c.isCaptain, isCoach: c.isCoach, isPlatformAdmin }, c.inviteBlock);
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
