/**
 * Página: Comunidad — mensajería 1:1 entre capitanes de equipo.
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml, humanizeApiError, fmtDate } from "../utils/format.js";
import { getUiLocale } from "../locale.js";
import { getCountryNameForUi } from "../countries.js";

const COMMUNITY_FILTER_KEY = "edb_community_message_filter";
const CONV_ALL = "all";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const AVATAR_COLORS = ["#185fa5","#7c3aed","#d97706","#16a34a","#dc2626","#0891b2","#be185d","#65a30d"];
function avatarColor(idx) { return AVATAR_COLORS[idx % AVATAR_COLORS.length]; }
function avatarInitial(label) { return (label || "?")[0].toUpperCase(); }

// ─── Render principal ─────────────────────────────────────────────────────────

/** @param {Function} layout */
export async function renderComunidad(layout) {
  layout(`<p class="loading-line">${escapeHtml(t("community.loading"))}</p>`, { wide: true });
  let me, myTeams, dirRaw;
  try {
    [me, myTeams, dirRaw] = await Promise.all([api.apiMe(), api.apiMyTeams(), api.apiCommunityTeams()]);
  } catch (ex) {
    const detail = humanizeApiError(ex.message);
    const is404 = /not found|404/i.test(detail) || /not found|404/i.test(String(ex.message));
    layout(`<div class="card"><h2 class="card-title">${escapeHtml(t("community.title"))}</h2>
      <p class="msg-error">${escapeHtml(t("community.loadFailed"))}</p>
      <p class="muted small">${escapeHtml(detail)}</p>
      ${is404 ? `<p class="muted small">${escapeHtml(t("community.unavailable"))}</p>` : ""}</div>`);
    return;
  }

  const isAdmin = me.is_platform_admin === true;
  if (myTeams.length === 0 && !isAdmin) {
    layout(`<div class="card"><h2 class="card-title">${escapeHtml(t("community.title"))}</h2>
      <p class="muted">${escapeHtml(t("community.noMyTeam"))}</p>
      <p class="small"><a class="link" href="#/teams/new">${escapeHtml(t("nav.teams"))}</a></p></div>`);
    return;
  }

  const myTeamIds = new Set(myTeams.map((x) => x.team.id));
  const dir = unwrapCommunityDir(dirRaw);
  const others = dir
    .map((r) => {
      const id = communityDirTeamId(r);
      const display = communityDirTeamLabel(r) || (id != null ? `#${id}` : "");
      const forThread = communityDirTeamLabelBase(r) || (id != null ? `#${id}` : display);
      return { id, label: display, threadLabel: forThread, raw: r };
    })
    .filter((o) => o.id != null && !myTeamIds.has(o.id));

  const peerLabelById = new Map(others.map((o) => [o.id, o.threadLabel]));
  function getPeerLabel(peerId) {
    if (peerId == null) return "";
    const n = Number(peerId);
    if (!Number.isFinite(n)) return "";
    return peerLabelById.has(n) ? String(peerLabelById.get(n) || "") : `#${n}`;
  }

  // Estado
  let selectedId = null;
  const stored = sessionStorage.getItem(COMMUNITY_FILTER_KEY);
  if (stored && stored !== CONV_ALL) {
    const n = Number(stored);
    if (Number.isFinite(n) && others.some((o) => o.id === n)) selectedId = n;
  }
  if (selectedId == null && others.length > 0) selectedId = others[0].id;

  let lastNormalized = [];
  let replyToId = null;
  let replyToSnippet = "";
  let searchQuery = "";

  layout(`
    <div id="chat-root" style="display:grid;grid-template-columns:300px 1fr;height:calc(100vh - 100px);overflow:hidden;border-radius:12px;border:0.5px solid #e2e8f0;background:#f0f4f8;">

      <!-- PANEL IZQUIERDO -->
      <div style="display:flex;flex-direction:column;background:#fff;border-right:0.5px solid #e2e8f0;overflow:hidden;">
        <div style="padding:16px;border-bottom:0.5px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:15px;font-weight:700;color:#1e293b">${escapeHtml(t("community.messages"))}</span>
          <button id="chat-new-btn" title="${escapeHtml(t("community.newConversation"))}" style="width:28px;height:28px;border-radius:50%;border:none;background:#185fa5;color:#fff;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>
        </div>
        <div style="padding:10px 12px;border-bottom:0.5px solid #f1f5f9;flex-shrink:0">
          <div style="position:relative">
            <svg style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:#94a3b8" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="chat-search" type="text" placeholder="${escapeHtml(t("community.searchPlaceholder"))}" style="width:100%;padding:6px 8px 6px 28px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;background:#f8fafc;box-sizing:border-box;min-width:0">
          </div>
        </div>
        <div id="chat-conv-list" style="flex:1;overflow-y:auto;"></div>
      </div>

      <!-- PANEL DERECHO -->
      <div style="display:flex;flex-direction:column;overflow:hidden;background:#f0f4f8;">
        <div id="chat-header" style="padding:14px 20px;border-bottom:0.5px solid #e2e8f0;background:#fff;display:flex;align-items:center;gap:12px;flex-shrink:0">
          <div style="color:#94a3b8;font-size:14px">${escapeHtml(t("community.selectConversation"))}</div>
        </div>
        <div id="chat-messages" style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px">${escapeHtml(t("community.selectConversation"))}</div>
        </div>
        <div id="chat-reply-bar" style="display:none;padding:8px 16px;background:#f8fafc;border-top:0.5px solid #e2e8f0;font-size:12px;color:#64748b;align-items:center;gap:8px;">
          <span id="chat-reply-text" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
          <button id="chat-reply-clear" style="border:none;background:none;cursor:pointer;color:#94a3b8;font-size:16px;line-height:1">×</button>
        </div>
        <div id="chat-err" style="display:none;padding:6px 16px;background:#fee2e2;color:#dc2626;font-size:12px;"></div>
        <div style="padding:16px;border-top:0.5px solid #e2e8f0;background:#fff;flex-shrink:0">
          <div style="display:flex;gap:10px;align-items:flex-end">
            <textarea id="chat-input" rows="2" placeholder="${escapeHtml(t("community.typeMessage"))}" style="flex:1;resize:none;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:inherit;color:#334155;background:#f8fafc;min-width:0" ${others.length === 0 ? "disabled" : ""}></textarea>
            <button id="chat-send" style="padding:10px 20px;background:#185fa5;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap" ${others.length === 0 ? "disabled" : ""}>${escapeHtml(t("community.send"))}</button>
          </div>
        </div>
      </div>
    </div>
  `, { wide: true });

  const convListEl = document.getElementById("chat-conv-list");
  const messagesEl = document.getElementById("chat-messages");
  const headerEl = document.getElementById("chat-header");
  const inputEl = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const errEl = document.getElementById("chat-err");
  const replyBarEl = document.getElementById("chat-reply-bar");
  const replyTextEl = document.getElementById("chat-reply-text");
  const replyClearBtn = document.getElementById("chat-reply-clear");
  const searchEl = document.getElementById("chat-search");

  function setErr(txt) {
    if (!errEl) return;
    if (txt) { errEl.style.display = "block"; errEl.textContent = txt; }
    else { errEl.style.display = "none"; errEl.textContent = ""; }
  }

  function updateReplyBar() {
    if (!replyBarEl) return;
    if (replyToId == null) {
      replyBarEl.style.display = "none";
    } else {
      replyBarEl.style.display = "flex";
      if (replyTextEl) replyTextEl.textContent = `${t("community.replyingLabel")} "${replyToSnippet}"`;
    }
  }

  if (replyClearBtn) {
    replyClearBtn.addEventListener("click", () => {
      replyToId = null; replyToSnippet = "";
      updateReplyBar();
    });
  }

  function renderConvList() {
    if (!convListEl) return;
    if (others.length === 0) {
      convListEl.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">${escapeHtml(t("community.noTeamsInDirectory"))}</div>`;
      return;
    }
    const q = searchQuery.toLowerCase();
    const filtered = q ? others.filter((o) => (o.threadLabel || "").toLowerCase().includes(q)) : others;
    if (filtered.length === 0) {
      convListEl.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">${escapeHtml(t("community.noResults"))}</div>`;
      return;
    }
    convListEl.innerHTML = filtered.map((o, idx) => {
      const isActive = o.id === selectedId;
      const initial = avatarInitial(o.threadLabel);
      const color = avatarColor(idx);
      const parts = (o.threadLabel || "").split(" · ");
      const teamName = parts[0] || o.threadLabel || "";
      const captain = parts[1] || "";
      const bg = isActive ? "#f0f7ff" : "#fff";
      const borderLeft = isActive ? "3px solid #185fa5" : "3px solid transparent";
      return `<div class="chat-conv-item" data-id="${o.id}" style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;background:${bg};border-left:${borderLeft};transition:background 0.1s">
        <div style="width:40px;height:40px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0">${escapeHtml(initial)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(teamName)}</div>
          ${captain ? `<div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(captain)}</div>` : ""}
        </div>
      </div>`;
    }).join("");

    convListEl.querySelectorAll(".chat-conv-item").forEach((el) => {
      el.addEventListener("mouseenter", () => { if (Number(el.dataset.id) !== selectedId) el.style.background = "#f8fafc"; });
      el.addEventListener("mouseleave", () => { if (Number(el.dataset.id) !== selectedId) el.style.background = "#fff"; });
      el.addEventListener("click", () => {
        const newId = Number(el.dataset.id);
        if (newId !== selectedId) {
          selectedId = newId;
          sessionStorage.setItem(COMMUNITY_FILTER_KEY, String(newId));
          replyToId = null; replyToSnippet = "";
          updateReplyBar();
          renderConvList();
          loadConversation();
        }
      });
    });
  }

  function renderChatHeader() {
    if (!headerEl || selectedId == null) return;
    const idx = others.findIndex((o) => o.id === selectedId);
    const peer = idx >= 0 ? others[idx] : null;
    if (!peer) return;
    const color = avatarColor(idx);
    const initial = avatarInitial(peer.threadLabel);
    const parts = (peer.threadLabel || "").split(" · ");
    const teamName = parts[0] || peer.threadLabel || "";
    const captain = parts[1] || "";
    headerEl.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${escapeHtml(initial)}</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:#1e293b">${escapeHtml(teamName)}</div>
        ${captain ? `<div style="font-size:12px;color:#94a3b8">${escapeHtml(captain)}</div>` : ""}
      </div>
      <button id="chat-refresh-btn" style="margin-left:auto;padding:5px 12px;font-size:12px;border-radius:6px;border:0.5px solid #e2e8f0;background:#f8fafc;color:#334155;cursor:pointer">↻ ${escapeHtml(t("community.refresh"))}</button>
    `;
    document.getElementById("chat-refresh-btn")?.addEventListener("click", () => loadConversation());
  }

  function renderMessages() {
    if (!messagesEl) return;
    if (!lastNormalized.length) {
      messagesEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px">${escapeHtml(t("community.noMessages"))}</div>`;
      return;
    }
    const byId = new Map(lastNormalized.map((m) => [m.id, m]));
    const sorted = [...lastNormalized].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    const idx = others.findIndex((o) => o.id === selectedId);
    const peerColor = idx >= 0 ? avatarColor(idx) : "#185fa5";
    const peerInitial = idx >= 0 ? avatarInitial(others[idx].threadLabel) : "?";

    messagesEl.innerHTML = sorted.map((m) => {
      const isMine = m.isMine || m.fromMine;
      const when = m.created ? new Date(m.created).toLocaleTimeString(getUiLocale(), { hour: "2-digit", minute: "2-digit" }) : "";

      const replyHtml = m.inReplyTo != null && byId.has(m.inReplyTo)
        ? `<div style="padding:6px 10px;border-left:3px solid rgba(255,255,255,0.4);background:rgba(0,0,0,0.08);border-radius:4px;margin-bottom:6px;font-size:11px;color:${isMine ? "rgba(255,255,255,0.8)" : "#64748b"};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(String(byId.get(m.inReplyTo).body).slice(0, 80))}…</div>`
        : "";

      if (isMine) {
        return `<div style="display:flex;justify-content:flex-end;align-items:flex-end;gap:8px">
          <div style="max-width:65%">
            <div style="background:#185fa5;color:#fff;padding:10px 14px;border-radius:12px 12px 4px 12px;font-size:14px;line-height:1.4;word-break:break-word">
              ${replyHtml}
              ${escapeHtml(m.body)}
            </div>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:4px">
              <time style="font-size:11px;color:#94a3b8">${escapeHtml(when)}</time>
              <button class="chat-rep-btn" data-mid="${m.id}" style="font-size:11px;color:#94a3b8;background:none;border:none;cursor:pointer;padding:0">↩</button>
              <button class="chat-del-btn" data-mid="${m.id}" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:0">✕</button>
            </div>
          </div>
        </div>`;
      } else {
        const sender = escapeHtml(m.senderCaption || "");
        return `<div style="display:flex;align-items:flex-end;gap:8px">
          <div style="width:32px;height:32px;border-radius:50%;background:${peerColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${escapeHtml(peerInitial)}</div>
          <div style="max-width:65%">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:3px">${sender}</div>
            <div style="background:#f1f5f9;color:#1e293b;padding:10px 14px;border-radius:12px 12px 12px 4px;font-size:14px;line-height:1.4;word-break:break-word">
              ${replyHtml}
              ${escapeHtml(m.body)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <time style="font-size:11px;color:#94a3b8">${escapeHtml(when)}</time>
              <button class="chat-rep-btn" data-mid="${m.id}" style="font-size:11px;color:#94a3b8;background:none;border:none;cursor:pointer;padding:0">${escapeHtml(t("community.replyButton"))}</button>
            </div>
          </div>
        </div>`;
      }
    }).join("");

    messagesEl.scrollTop = messagesEl.scrollHeight;

    messagesEl.querySelectorAll(".chat-rep-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mid = Number(btn.dataset.mid);
        const msg = lastNormalized.find((x) => x.id === mid);
        if (msg) {
          replyToId = mid;
          replyToSnippet = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;
          updateReplyBar();
          inputEl?.focus();
        }
      });
    });
    messagesEl.querySelectorAll(".chat-del-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mid = Number(btn.dataset.mid);
        if (mid && globalThis.confirm(t("community.deleteConfirm"))) {
          (async () => {
            try {
              await api.apiDeleteCommunityMessage(mid);
              setErr("");
              await loadConversation();
            } catch (ex) {
              setErr(humanizeApiError(ex.message));
            }
          })();
        }
      });
    });
  }

  async function loadConversation() {
    if (selectedId == null) return;
    if (!messagesEl) return;
    messagesEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:14px">${escapeHtml(t("community.loading"))}</div>`;
    setErr("");
    try {
      const raw = await api.apiCommunityMessages(selectedId);
      lastNormalized = unwrapCommunityMessages(raw)
        .map((m) => normalizeCommunityMsg(m, myTeamIds))
        .filter((m) => m.id != null);
      renderMessages();
    } catch (ex) {
      const h = humanizeApiError(ex.message);
      if (/not found|404/i.test(h)) setErr(t("community.unavailable"));
      else if (/403|forbidden/i.test(h)) setErr(t("community.forbidden"));
      else setErr(h);
      messagesEl.innerHTML = "";
    }
  }

  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", async () => {
      if (selectedId == null) return;
      const text = (inputEl.value || "").trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        await api.apiPostCommunityMessage({ otherTeamId: selectedId, body: text, inReplyTo: replyToId });
        inputEl.value = "";
        replyToId = null; replyToSnippet = "";
        updateReplyBar();
        setErr("");
        await loadConversation();
      } catch (ex) {
        setErr(humanizeApiError(ex.message));
      } finally {
        sendBtn.disabled = false;
      }
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      searchQuery = e.target.value || "";
      renderConvList();
    });
  }

  document.getElementById("chat-new-btn")?.addEventListener("click", () => searchEl?.focus());

  renderConvList();
  renderChatHeader();
  if (selectedId != null) {
    await loadConversation();
  }
}
