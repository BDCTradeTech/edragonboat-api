/**
 * Página: Rutinas de entrenamiento.
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { humanizeApiError } from "../utils/format.js";
import { route } from "../router.js";

const RUTINAS_TEAM_KEY = "edb_rutinas_team_id";

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

export async function renderRutinasHub(layout) {
  layout(`<p class="loading-line">${escapeHtml(t("routines.loading"))}</p>`);
  try {
    const teams = await api.apiMyTeams();
    if (!teams.length) {
      layout(`<div class="card"><p>${t("routines.noTeams")}</p></div>`);
      return;
    }
    let tid = Number(sessionStorage.getItem(RUTINAS_TEAM_KEY)) || teams[0].team.id;
    if (!teams.some((tx) => tx.team.id === tid)) tid = teams[0].team.id;
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

export async function renderRutinasNew(layout) {
  layout(`<p class="loading-line">${escapeHtml(t("routines.loadingGeneric"))}</p>`);
  try {
    const teams = await api.apiMyTeams();
    if (!teams.length) {
      layout(`<div class="card"><p>${t("routines.noTeamsShort")}</p></div>`);
      return;
    }
    let tid = Number(sessionStorage.getItem(RUTINAS_TEAM_KEY)) || teams[0].team.id;
    if (!teams.some((tx) => tx.team.id === tid)) tid = teams[0].team.id;
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

export async function renderRutinasViewer(id, layout) {
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

export async function renderRutinasEditor(id, layout) {
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
