/**
 * Página: Cuenta / perfil de usuario.
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml, humanizeApiError, roleLabel } from "../utils/format.js";
import {
  UI_LANGUAGES,
  applyDocumentLang,
  getStoredUiLang,
  setStoredUiLang,
} from "../locale.js";
import { route } from "../router.js";

/** @param {Function} layout */
export async function renderAccount(layout) {
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
      if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
      if (okEl) { okEl.textContent = ""; okEl.style.display = "none"; }
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
        /* ignore */
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
