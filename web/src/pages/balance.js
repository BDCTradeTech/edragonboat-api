/**
 * Página de Balance del Plantel — distribución interactiva de palistas en bote Dragon Boat.
 */

import * as api from "../api.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../utils.js";
import { preferredSideLabel } from "../utils/format.js";

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------
let _members = [];
let _boatSize = "large";
let _priority = 50;
let _seats = {};        // { 'L-1': { memberId: '...' }, 'R-1': ..., 'drummer': ..., 'timonel': ... }
let _locked = new Set();

const AVATAR_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function memberWeight(m) {
  return m.weight_kg || 70;
}

function avatarColor(idx) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function initial(name) {
  return (name || "?")[0].toUpperCase();
}

function memberById(id) {
  return _members.find((m) => String(m.user_id) === String(id)) || null;
}

function memberIndex(id) {
  return _members.findIndex((m) => String(m.user_id) === String(id));
}

function sideColor(side) {
  if (side === "left") return "#0ea5e9";
  if (side === "right") return "#f97316";
  return "#94a3b8";
}

function sideLabel(side) {
  if (side === "left") return "Izq";
  if (side === "right") return "Der";
  return "Ind";
}

function ledColor(member, seatId) {
  const side = member.preferred_side;
  if (!side || side === "either") return null; // null = usar estrella
  const isLeft = seatId.startsWith("L");
  if ((side === "left" && isLeft) || (side === "right" && !isLeft)) return "#22c55e";
  return "#ef4444";
}

function rowCount() {
  return _boatSize === "large" ? 10 : 6;
}

// ---------------------------------------------------------------------------
// Render de un asiento
// ---------------------------------------------------------------------------
function renderSeatHtml(seatId, isSpecial = false) {
  const seat = _seats[seatId];
  const locked = _locked.has(seatId);

  if (!seat || !seat.memberId) {
    return `<div style="font-size:0.65rem;color:#475569;text-align:center;padding:0.3rem">Vacío</div>`;
  }

  const member = memberById(seat.memberId);
  if (!member) {
    return `<div style="font-size:0.65rem;color:#475569;text-align:center;padding:0.3rem">?</div>`;
  }

  const idx = memberIndex(seat.memberId);
  const color = avatarColor(idx);
  const led = ledColor(member, seatId);
  const lockIcon = locked ? "🔒" : "🔓";
  const weightStr = member.weight_kg != null ? `${member.weight_kg}kg` : "—";
  const sideStr = sideLabel(member.preferred_side);

  const ledHtml = led !== null
    ? `<div id="led-${seatId}" style="width:8px;height:8px;border-radius:50%;background:${led};flex-shrink:0"></div>`
    : `<div id="led-${seatId}" style="font-size:0.6rem;flex-shrink:0">⭐</div>`;

  return `
    <div style="display:flex;align-items:center;gap:0.3rem">
      ${ledHtml}
      <div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;font-weight:700;flex-shrink:0">${escapeHtml(initial(member.full_name))}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.7rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1e293b">${escapeHtml(member.full_name)}</div>
        <div style="font-size:0.6rem;color:#64748b">(${sideStr})·${weightStr}</div>
      </div>
      <div id="lock-${seatId}" onclick="event.stopPropagation();balToggleLock('${seatId}')" style="font-size:0.75rem;cursor:pointer" title="Fijar posición">${lockIcon}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Render del bote
// ---------------------------------------------------------------------------
function balRenderBoat() {
  const rows = rowCount();

  // Drummer (solo el slot interno, preserva el label)
  const drummerSlot = document.getElementById("slot-drummer");
  if (drummerSlot) {
    drummerSlot.innerHTML = renderSeatHtml("drummer", true);
  }

  // Timonel (solo el slot interno, preserva el label)
  const timonelSlot = document.getElementById("slot-timonel");
  if (timonelSlot) {
    timonelSlot.innerHTML = renderSeatHtml("timonel", true);
  }

  // Filas de remeros
  const rowsContainer = document.getElementById("bal-rows");
  if (!rowsContainer) return;

  let html = "";
  for (let i = 1; i <= rows; i++) {
    const seatL = `L-${i}`;
    const seatR = `R-${i}`;
    const hasL = !!(_seats[seatL] && _seats[seatL].memberId);
    const hasR = !!(_seats[seatR] && _seats[seatR].memberId);
    const lockedL = _locked.has(seatL);
    const lockedR = _locked.has(seatR);

    const bgL = hasL ? "#ffffff" : "rgba(255,255,255,0.1)";
    const bgR = hasR ? "#ffffff" : "rgba(255,255,255,0.1)";
    const borderL = lockedL ? "1px solid #fbbf24" : (hasL ? "1px solid #334155" : "1px dashed rgba(255,255,255,0.3)");
    const borderR = lockedR ? "1px solid #fbbf24" : (hasR ? "1px solid #334155" : "1px dashed rgba(255,255,255,0.3)");

    html += `
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.3rem;align-items:center">
        <div id="seat-${seatL}" data-seat="${seatL}" onclick="balToggleLock('${seatL}')"
          style="border-radius:8px;padding:0.4rem 0.5rem;cursor:pointer;min-height:44px;background:${bgL};border:${borderL};transition:border 0.2s">
          ${renderSeatHtml(seatL)}
        </div>
        <div style="width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#cbd5e1;flex-shrink:0">${i}</div>
        <div id="seat-${seatR}" data-seat="${seatR}" onclick="balToggleLock('${seatR}')"
          style="border-radius:8px;padding:0.4rem 0.5rem;cursor:pointer;min-height:44px;background:${bgR};border:${borderR};transition:border 0.2s">
          ${renderSeatHtml(seatR)}
        </div>
      </div>
    `;

    // Eje central entre fila 5 y 6 en bote grande
    if (_boatSize === "large" && i === 5) {
      html += `<div style="height:1px;background:rgba(255,255,255,0.2);margin:0.1rem 0;border-radius:999px"></div>`;
    }
  }
  rowsContainer.innerHTML = html;
}

// ---------------------------------------------------------------------------
// SVG vistas
// ---------------------------------------------------------------------------
function balUpdateSvgFront(leftKg, rightKg) {
  const svg = document.getElementById("svg-front");
  if (!svg) return;
  const total = leftKg + rightKg || 1;
  const maxR = 28;
  const minR = 4;
  const rL = Math.max(minR, (leftKg / total) * maxR * 2);
  const rR = Math.max(minR, (rightKg / total) * maxR * 2);
  svg.innerHTML = `
    <ellipse cx="60" cy="40" rx="50" ry="28" fill="#0ea5e9" opacity="0.15" stroke="#0369a1" stroke-width="1"/>
    <line x1="60" y1="12" x2="60" y2="68" stroke="#334155" stroke-width="1" stroke-dasharray="3,2"/>
    <circle cx="30" cy="40" r="${Math.min(rL, 22)}" fill="#0ea5e9" opacity="0.7"/>
    <circle cx="90" cy="40" r="${Math.min(rR, 22)}" fill="#f97316" opacity="0.7"/>
    <text x="30" y="44" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold">${leftKg > 0 ? Math.round(leftKg) : ""}</text>
    <text x="90" y="44" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold">${rightKg > 0 ? Math.round(rightKg) : ""}</text>
  `;
}

function balUpdateSvgSide(frontKg, backKg) {
  const svg = document.getElementById("svg-side");
  if (!svg) return;
  const total = frontKg + backKg || 1;
  const maxR = 22;
  const minR = 4;
  const rF = Math.max(minR, (frontKg / total) * maxR * 2);
  const rB = Math.max(minR, (backKg / total) * maxR * 2);
  svg.innerHTML = `
    <ellipse cx="60" cy="40" rx="50" ry="20" fill="#1d4ed8" opacity="0.15" stroke="#1d4ed8" stroke-width="1"/>
    <line x1="10" y1="40" x2="110" y2="40" stroke="#334155" stroke-width="1" stroke-dasharray="3,2"/>
    <circle cx="30" cy="40" r="${Math.min(rF, 18)}" fill="#1d4ed8" opacity="0.7"/>
    <circle cx="90" cy="40" r="${Math.min(rB, 18)}" fill="#7c3aed" opacity="0.7"/>
    <text x="30" y="44" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold">${frontKg > 0 ? Math.round(frontKg) : ""}</text>
    <text x="90" y="44" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold">${backKg > 0 ? Math.round(backKg) : ""}</text>
  `;
}

// ---------------------------------------------------------------------------
// Scores y barras
// ---------------------------------------------------------------------------
function balUpdateScores() {
  const rows = rowCount();
  let leftKg = 0, rightKg = 0, frontKg = 0, backKg = 0;
  let onCorrectSide = 0, totalWithPref = 0;

  for (let i = 1; i <= rows; i++) {
    const lSeat = _seats[`L-${i}`];
    const rSeat = _seats[`R-${i}`];
    const lMember = lSeat ? memberById(lSeat.memberId) : null;
    const rMember = rSeat ? memberById(rSeat.memberId) : null;
    const lW = lMember ? memberWeight(lMember) : 0;
    const rW = rMember ? memberWeight(rMember) : 0;
    leftKg += lW;
    rightKg += rW;
    if (i <= rows / 2) {
      frontKg += lW + rW;
    } else {
      backKg += lW + rW;
    }
    for (const [seatId, member] of [[`L-${i}`, lMember], [`R-${i}`, rMember]]) {
      if (!member) continue;
      const side = member.preferred_side;
      if (side === "left" || side === "right") {
        totalWithPref++;
        const isLeft = seatId.startsWith("L");
        if ((side === "left" && isLeft) || (side === "right" && !isLeft)) onCorrectSide++;
      }
    }
  }

  const totalLR = leftKg + rightKg;
  const totalFB = frontKg + backKg;
  const scoreLR = totalLR > 0 ? Math.round(100 - (Math.abs(leftKg - rightKg) / totalLR) * 100) : 100;
  const scoreFB = totalFB > 0 ? Math.round(100 - (Math.abs(frontKg - backKg) / totalFB) * 100) : 100;
  const scoreSide = totalWithPref > 0 ? Math.round((onCorrectSide / totalWithPref) * 100) : 100;
  const diffKg = Math.abs(leftKg - rightKg);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setEl("val-score-lr", `${scoreLR}%`);
  setEl("val-score-fb", `${scoreFB}%`);
  setEl("val-score-side", `${scoreSide}%`);
  setEl("val-score-diff", `${diffKg.toFixed(1)}kg`);

  const leftPct = totalLR > 0 ? (leftKg / totalLR) * 100 : 50;
  const frontPct = totalFB > 0 ? (frontKg / totalFB) * 100 : 50;

  const setWidth = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; };
  setWidth("bar-left-fill", leftPct);
  setWidth("bar-right-fill", 100 - leftPct);
  setWidth("bar-front-fill", frontPct);
  setWidth("bar-back-fill", 100 - frontPct);

  setEl("bar-left-kg", `${leftKg.toFixed(0)}kg`);
  setEl("bar-right-kg", `${rightKg.toFixed(0)}kg`);
  setEl("bar-front-kg", `${frontKg.toFixed(0)}kg`);
  setEl("bar-back-kg", `${backKg.toFixed(0)}kg`);

  balUpdateSvgFront(leftKg, rightKg);
  balUpdateSvgSide(frontKg, backKg);

  // Instrucción timonel
  const instrBox = document.getElementById("timonel-instruction");
  if (instrBox) {
    const msgs = [];
    if (diffKg > 5) {
      msgs.push(`Correrse hacia ${leftKg > rightKg ? "la derecha" : "la izquierda"} (${diffKg.toFixed(1)}kg de diferencia)`);
    }
    const diffFB = Math.abs(frontKg - backKg);
    if (diffFB > 20) {
      msgs.push(`Correrse hacia ${frontKg > backKg ? "atrás" : "adelante"} (${diffFB.toFixed(1)}kg de diferencia)`);
    }
    if (msgs.length > 0) {
      instrBox.textContent = "🎯 " + msgs.join(" · ");
      instrBox.style.display = "block";
    } else {
      instrBox.style.display = "none";
    }
  }
}

// ---------------------------------------------------------------------------
// Algoritmo de balanceo
// ---------------------------------------------------------------------------
function balRun() {
  if (!_members || _members.length === 0) {
    alert('No hay palistas cargados.');
    return;
  }

  const checkboxes = document.querySelectorAll('#bal-member-list input[type="checkbox"]:checked');
  if (checkboxes.length === 0) {
    alert('Seleccioná al menos un palista.');
    return;
  }

  const selectedIds = new Set([...checkboxes].map(cb => String(cb.dataset.memberId)));

  console.log('IDs seleccionados:', [...selectedIds]);
  console.log('primer checkbox dataset:', checkboxes[0]?.dataset);
  console.log('primer checkbox getAttribute:', checkboxes[0]?.getAttribute('data-member-id'));

  // Construir lista deduplicada respetando el orden de _members
  const seenSel = new Set();
  const selected = [];
  for (const m of _members) {
    if (selectedIds.has(String(m.user_id)) && !seenSel.has(String(m.user_id))) {
      seenSel.add(String(m.user_id));
      selected.push(m);
    }
  }

  console.log('=== BALRUN DEBUG ===');
  console.log('checkboxes marcados:', checkboxes.length);
  console.log('selectedIds:', [...selectedIds]);
  console.log('_members count:', _members.length);
  console.log('selected:', selected.map(m => m.full_name + ':' + m.user_id));

  const drummerSel = document.getElementById("sel-drummer")?.value || "";
  const timonelSel = document.getElementById("sel-timonel")?.value || "";

  const rows = rowCount();

  // Función para generar orden intercalado (adelante-atrás)
  function interleavedSeats(side, numRows) {
    const result = [];
    let front = 1, back = numRows;
    while (front <= back) {
      result.push(`${side}-${front}`);
      if (front !== back) result.push(`${side}-${back}`);
      front++;
      back--;
    }
    return result;
  }

  const allLeftSeats  = interleavedSeats('L', rows);
  const allRightSeats = interleavedSeats('R', rows);

  // Preservar posiciones bloqueadas
  const newSeats = {};
  // Reconstruir lista completa de seats desde el orden intercalado
  const allSeats = [...allLeftSeats, ...allRightSeats, "drummer", "timonel"];
  for (const seatId of allSeats) {
    if (_locked.has(seatId) && _seats[seatId]) {
      newSeats[seatId] = { ..._seats[seatId] };
    }
  }

  // Asignar roles especiales si no están bloqueados
  if (drummerSel && !_locked.has("drummer")) newSeats["drummer"] = { memberId: drummerSel };
  if (timonelSel && !_locked.has("timonel")) newSeats["timonel"] = { memberId: timonelSel };

  // Pool de palistas: seleccionados menos los ya colocados en asientos bloqueados/roles
  const placed = new Set(Object.values(newSeats).map(s => s.memberId).filter(Boolean));
  const poolSeen = new Set(placed);
  const pool = [];
  for (const m of selected) {
    if (!poolSeen.has(String(m.user_id))) {
      poolSeen.add(String(m.user_id));
      pool.push(m);
    }
  }

  // Asientos libres (no bloqueados) — usar orden intercalado
  const freeLeft  = allLeftSeats.filter(s => !newSeats[s]);
  const freeRight = allRightSeats.filter(s => !newSeats[s]);
  const nL = freeLeft.length;
  const nR = freeRight.length;

  // ------------------------------------------------------------------
  // Distribuir palistas a lados según _priority
  // ------------------------------------------------------------------
  let assignedLeft  = [];  // palistas que irán a la izquierda
  let assignedRight = [];  // palistas que irán a la derecha

  if (_priority === 0) {
    // Solo peso: ignorar preferencia, alternar más pesado izq/der
    const allSorted = [...pool].sort((a, b) => memberWeight(b) - memberWeight(a));
    for (let i = 0; i < allSorted.length; i++) {
      if (i % 2 === 0) assignedLeft.push(allSorted[i]);
      else             assignedRight.push(allSorted[i]);
    }
  } else if (_priority === 100) {
    // Solo lado: respetar preferencia estrictamente; indiferentes llenan huecos
    const lPref = pool.filter(m => m.preferred_side === "left").sort((a, b) => memberWeight(b) - memberWeight(a));
    const rPref = pool.filter(m => m.preferred_side === "right").sort((a, b) => memberWeight(b) - memberWeight(a));
    const ePref = pool.filter(m => m.preferred_side !== "left" && m.preferred_side !== "right").sort((a, b) => memberWeight(b) - memberWeight(a));
    assignedLeft  = [...lPref];
    assignedRight = [...rPref];
    // Completar con indiferentes donde falten
    while (assignedLeft.length < nL && ePref.length > 0) assignedLeft.push(ePref.shift());
    while (assignedRight.length < nR && ePref.length > 0) assignedRight.push(ePref.shift());
    // Si aún sobran indiferentes, llenar el que tenga espacio
    while (ePref.length > 0) {
      if (assignedLeft.length < nL) assignedLeft.push(ePref.shift());
      else if (assignedRight.length < nR) assignedRight.push(ePref.shift());
      else break;
    }
  } else {
    // Equilibrado (0 < priority < 100): peso + lado
    let lPool = pool.filter(m => m.preferred_side === "left").sort((a, b) => memberWeight(b) - memberWeight(a));
    let rPool = pool.filter(m => m.preferred_side === "right").sort((a, b) => memberWeight(b) - memberWeight(a));
    let ePool = pool.filter(m => m.preferred_side !== "left" && m.preferred_side !== "right").sort((a, b) => memberWeight(b) - memberWeight(a));

    // Mover exceso de lPool (los más livianos) a ePool
    while (lPool.length > nL) ePool.unshift(lPool.pop());
    // Mover exceso de rPool (los más livianos) a ePool
    while (rPool.length > nR) ePool.unshift(rPool.pop());

    assignedLeft  = [...lPool];
    assignedRight = [...rPool];

    // Distribuir ePool al lado más liviano
    ePool.sort((a, b) => memberWeight(b) - memberWeight(a));
    for (const m of ePool) {
      if (assignedLeft.length >= nL && assignedRight.length >= nR) break;
      const sumL = assignedLeft.reduce((s, x) => s + memberWeight(x), 0);
      const sumR = assignedRight.reduce((s, x) => s + memberWeight(x), 0);
      const canL = assignedLeft.length < nL;
      const canR = assignedRight.length < nR;
      if (canL && (!canR || sumL <= sumR)) assignedLeft.push(m);
      else if (canR)                        assignedRight.push(m);
    }
  }

  console.log('assignedLeft:', assignedLeft.map(m => m.full_name + ':' + memberWeight(m) + 'kg'));
  console.log('assignedRight:', assignedRight.map(m => m.full_name + ':' + memberWeight(m) + 'kg'));

  // ------------------------------------------------------------------
  // Asignar palistas a asientos en orden intercalado
  // (adelante-atrás): primer palista a fila 1, segundo a fila N,
  // tercero a fila 2, etc. Así el peso se distribuye desde los extremos.
  // ------------------------------------------------------------------
  // Ordenar por peso descendente (más pesados primero)
  const sortedLeft = [...assignedLeft].sort((a, b) => memberWeight(b) - memberWeight(a));
  const sortedRight = [...assignedRight].sort((a, b) => memberWeight(b) - memberWeight(a));

  // Asignar al orden intercalado
  for (let i = 0; i < sortedLeft.length && i < freeLeft.length; i++) {
    const seatId = freeLeft[i];
    newSeats[seatId] = { memberId: String(sortedLeft[i].user_id) };
  }

  for (let i = 0; i < sortedRight.length && i < freeRight.length; i++) {
    const seatId = freeRight[i];
    newSeats[seatId] = { memberId: String(sortedRight[i].user_id) };
  }

  console.log('newSeats:', JSON.stringify(newSeats));

  _seats = newSeats;
  balRenderBoat();
  balUpdateScores();
}

// ---------------------------------------------------------------------------
// Candados
// ---------------------------------------------------------------------------
function balToggleLock(seatId) {
  if (!_seats[seatId] || !_seats[seatId].memberId) return;
  const seatEl = document.getElementById(`seat-${seatId}`);
  if (_locked.has(seatId)) {
    _locked.delete(seatId);
    const lockEl = document.getElementById(`lock-${seatId}`);
    if (lockEl) lockEl.textContent = "🔓";
    if (seatEl) seatEl.style.opacity = "1";
  } else {
    _locked.add(seatId);
    const lockEl = document.getElementById(`lock-${seatId}`);
    if (lockEl) lockEl.textContent = "🔒";
    if (seatEl) seatEl.style.opacity = "0.8";
  }
}

// ---------------------------------------------------------------------------
// Tipo de bote
// ---------------------------------------------------------------------------
function balSetBoatSize(size) {
  _boatSize = size;
  const btnSmall = document.getElementById("btn-boat-small");
  const btnLarge = document.getElementById("btn-boat-large");
  if (btnSmall && btnLarge) {
    const activeStyle = "border:2px solid #0ea5e9;background:#eff6ff;font-weight:600";
    const inactiveStyle = "border:2px solid #e2e8f0;background:#f8fafc;font-weight:normal";
    btnSmall.style.cssText = btnSmall.style.cssText.replace(/border:[^;]+;background:[^;]+;font-weight:[^;]+/, "");
    btnLarge.style.cssText = btnLarge.style.cssText.replace(/border:[^;]+;background:[^;]+;font-weight:[^;]+/, "");
    if (size === "small") {
      btnSmall.style.border = "2px solid #0ea5e9";
      btnSmall.style.background = "#eff6ff";
      btnSmall.style.fontWeight = "600";
      btnSmall.style.color = "#185fa5";
      btnLarge.style.border = "2px solid #e2e8f0";
      btnLarge.style.background = "#f8fafc";
      btnLarge.style.fontWeight = "normal";
      btnLarge.style.color = "#334155";
    } else {
      btnLarge.style.border = "2px solid #0ea5e9";
      btnLarge.style.background = "#eff6ff";
      btnLarge.style.fontWeight = "600";
      btnLarge.style.color = "#185fa5";
      btnSmall.style.border = "2px solid #e2e8f0";
      btnSmall.style.background = "#f8fafc";
      btnSmall.style.fontWeight = "normal";
      btnSmall.style.color = "#334155";
    }
  }
  const memberListEl = document.getElementById("bal-member-list");
  if (memberListEl) memberListEl.style.maxHeight = size === "large" ? "520px" : "330px";

  // Limpiar asientos que ya no existen si se reduce el bote
  if (size === "small") {
    for (let i = 7; i <= 10; i++) {
      delete _seats[`L-${i}`];
      delete _seats[`R-${i}`];
      _locked.delete(`L-${i}`);
      _locked.delete(`R-${i}`);
    }
  }
  balRenderBoat();
  balUpdateScores();
}

// ---------------------------------------------------------------------------
// Prioridad
// ---------------------------------------------------------------------------
function balUpdatePriorityText(val) {
  _priority = Number(val);
  const el = document.getElementById("bal-priority-text");
  if (!el) return;
  const v = Number(val);
  if (v === 0) el.textContent = "Solo peso: distribuye por peso sin importar el lado preferido";
  else if (v < 50) el.textContent = "Prioridad peso: considera peso principalmente, con algo de preferencia de lado";
  else if (v === 50) el.textContent = "Equilibrado: combina peso y preferencia de lado por igual";
  else if (v < 100) el.textContent = "Prioridad lado: respeta la preferencia de lado principalmente";
  else el.textContent = "Solo lado: respeta el lado preferido sin considerar el peso";
}

function balSetPriority(val) {
  _priority = Number(val);
  const slider = document.getElementById("bal-priority-slider");
  if (slider) slider.value = val;
  balUpdatePriorityText(val);

  // Resaltar preset activo
  const btns = document.querySelectorAll(".bal-priority-preset");
  btns.forEach((btn) => {
    const v = Number(btn.dataset.val);
    if (v === Number(val)) {
      btn.style.border = "1px solid #0ea5e9";
      btn.style.background = "#eff6ff";
      btn.style.fontWeight = "600";
      btn.style.color = "#185fa5";
    } else {
      btn.style.border = "1px solid #e2e8f0";
      btn.style.background = "#f8fafc";
      btn.style.fontWeight = "normal";
      btn.style.color = "#334155";
    }
  });
}

// ---------------------------------------------------------------------------
// Contador de seleccionados
// ---------------------------------------------------------------------------
function balUpdateCount() {
  const count = document.querySelectorAll("#bal-member-list input[type=checkbox]:checked").length;
  const el = document.getElementById("bal-selected-count");
  if (el) el.textContent = `${count} seleccionados`;
}

// ---------------------------------------------------------------------------
// Generar la lista de miembros en el panel izquierdo
// ---------------------------------------------------------------------------
function buildMemberList() {
  const container = document.getElementById("bal-member-list");
  if (!container) return;

  let html = "";
  _members.forEach((m, idx) => {
    const color = avatarColor(idx);
    const sc = sideColor(m.preferred_side);
    const sl = sideLabel(m.preferred_side);
    const weightStr = m.weight_kg != null ? `${m.weight_kg} kg` : "— kg";
    html += `
      <label style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.4rem;border-radius:8px;cursor:pointer;border:0.5px solid #e2e8f0;background:#fff">
        <input type="checkbox" data-member-id="${escapeHtml(String(m.user_id))}" style="accent-color:#0ea5e9;width:14px;height:14px" onchange="balUpdateCount()">
        <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:#fff;font-weight:700;flex-shrink:0">${escapeHtml(initial(m.full_name))}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.78rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.full_name)}</div>
          <div style="display:flex;gap:0.3rem;align-items:center">
            <span style="font-size:0.65rem;padding:0.1rem 0.35rem;border-radius:999px;background:${sc};color:#fff">${sl}</span>
            <span style="font-size:0.65rem;color:#94a3b8">${weightStr}</span>
          </div>
        </div>
      </label>
    `;
  });
  container.innerHTML = html;
  balUpdateCount();
}

// ---------------------------------------------------------------------------
// Poblar los selects de drummer y timonel
// ---------------------------------------------------------------------------
function buildRoleSelects() {
  const selDrummer = document.getElementById("sel-drummer");
  const selTimonel = document.getElementById("sel-timonel");
  if (!selDrummer || !selTimonel) return;

  const options = _members
    .map((m) => `<option value="${escapeHtml(String(m.user_id))}">${escapeHtml(m.full_name)}</option>`)
    .join("");

  const emptyOpt = `<option value="">— ninguno —</option>`;
  selDrummer.innerHTML = emptyOpt + options;
  selTimonel.innerHTML = emptyOpt + options;
}

// ---------------------------------------------------------------------------
// HTML estático de la página
// ---------------------------------------------------------------------------
function buildPageHtml(teamName) {
  const cardStyle = `background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:1rem`;
  const labelStyle = `font-size:0.8rem;font-weight:600;color:#64748b;margin-bottom:0.5rem`;

  return `
<div style="display:grid;grid-template-columns:260px 1fr;gap:1rem;align-items:start">

  <!-- ===== PANEL IZQUIERDO ===== -->
  <div id="bal-left" style="display:flex;flex-direction:column;gap:0.75rem;height:100%">

    <!-- Card 1: tipo de bote -->
    <div style="${cardStyle}">
      <div style="${labelStyle}">TIPO DE BOTE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
        <button id="btn-boat-small" onclick="balSetBoatSize('small')"
          style="padding:0.5rem;border-radius:8px;border:2px solid #e2e8f0;background:#f8fafc;cursor:pointer;font-size:0.8rem;color:#334155">
          🚣 Chico
        </button>
        <button id="btn-boat-large" onclick="balSetBoatSize('large')"
          style="padding:0.5rem;border-radius:8px;border:2px solid #0ea5e9;background:#eff6ff;cursor:pointer;font-size:0.8rem;font-weight:600;color:#185fa5">
          🚣🚣 Grande
        </button>
      </div>
    </div>

    <!-- Card 2: roles especiales -->
    <div style="${cardStyle}">
      <div style="${labelStyle}">ROLES ESPECIALES</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;overflow:hidden">
        <div style="border:1px solid #fed7aa;border-radius:8px;padding:0.5rem;background:#fff7ed;min-width:0;overflow:hidden">
          <div style="font-size:0.75rem;font-weight:600;color:#ea580c;margin-bottom:0.3rem">🥁 Drummer</div>
          <select id="sel-drummer" style="width:100%;max-width:100%;font-size:0.75rem;border:1px solid #e2e8f0;border-radius:6px;padding:0.25rem;margin-bottom:0.3rem;box-sizing:border-box">
            <option value="">— ninguno —</option>
          </select>
          <div style="display:flex;align-items:center;gap:0.25rem;font-size:0.7rem;color:#64748b;min-width:0">
            <span style="flex-shrink:0">Tambor</span>
            <input id="inp-drummer-weight" type="number" min="0" step="0.1" value="3"
              style="width:40px;min-width:0;border:1px solid #e2e8f0;border-radius:4px;padding:0.15rem 0.25rem;font-size:0.75rem;box-sizing:border-box">
            <span style="flex-shrink:0">kg</span>
          </div>
        </div>
        <div style="border:1px solid #e9d5ff;border-radius:8px;padding:0.5rem;background:#faf5ff;min-width:0;overflow:hidden">
          <div style="font-size:0.75rem;font-weight:600;color:#7c3aed;margin-bottom:0.3rem">🎯 Timonel</div>
          <select id="sel-timonel" style="width:100%;max-width:100%;font-size:0.75rem;border:1px solid #e2e8f0;border-radius:6px;padding:0.25rem;margin-bottom:0.3rem;box-sizing:border-box">
            <option value="">— ninguno —</option>
          </select>
          <div style="display:flex;align-items:center;gap:0.25rem;font-size:0.7rem;color:#64748b;min-width:0">
            <span style="flex-shrink:0">Timón</span>
            <input id="inp-timonel-weight" type="number" min="0" step="0.1" value="3"
              style="width:40px;min-width:0;border:1px solid #e2e8f0;border-radius:4px;padding:0.15rem 0.25rem;font-size:0.75rem;box-sizing:border-box">
            <span style="flex-shrink:0">kg</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card 3: prioridad de balanceo -->
    <div style="${cardStyle}">
      <div style="${labelStyle}">PRIORIDAD DE BALANCEO</div>
      <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem">
        <button class="bal-priority-preset" data-val="0" onclick="balSetPriority(0)"
          style="flex:1;font-size:0.7rem;padding:0.25rem;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#334155">Solo peso</button>
        <button class="bal-priority-preset" data-val="50" onclick="balSetPriority(50)"
          style="flex:1;font-size:0.7rem;padding:0.25rem;border-radius:6px;border:1px solid #0ea5e9;background:#eff6ff;font-weight:600;cursor:pointer;color:#185fa5">Equilibrado</button>
        <button class="bal-priority-preset" data-val="100" onclick="balSetPriority(100)"
          style="flex:1;font-size:0.7rem;padding:0.25rem;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;color:#334155">Solo lado</button>
      </div>
      <input id="bal-priority-slider" type="range" min="0" max="100" value="50"
        style="width:100%;accent-color:#0ea5e9;border-radius:4px"
        oninput="balUpdatePriorityText(this.value)">
      <p id="bal-priority-text" style="font-size:0.72rem;color:#334155;margin-top:0.25rem;min-height:2em">
        Equilibrado: combina peso y preferencia de lado por igual
      </p>
    </div>

    <!-- Card 4: palistas -->
    <div style="${cardStyle};flex:1">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <div style="${labelStyle}">PALISTAS</div>
        <div id="bal-selected-count" style="font-size:0.75rem;color:#0ea5e9;font-weight:600">0 seleccionados</div>
      </div>
      <div id="bal-member-list" style="max-height:520px;overflow-y:auto;display:flex;flex-direction:column;gap:0.3rem">
      </div>
      <button id="btn-balance" onclick="balRun()"
        style="width:100%;margin-top:0.75rem;padding:0.6rem;background:#0ea5e9;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem">
        Balancear
      </button>
    </div>

  </div><!-- /bal-left -->

  <!-- ===== PANEL DERECHO ===== -->
  <div id="bal-right" style="display:flex;flex-direction:column;gap:0.75rem">

    <!-- Row 1: nombre del bote + PDF -->
    <div style="display:flex;gap:0.5rem;align-items:center">
      <input id="inp-boat-name" type="text" placeholder="Ej: Open Premier 20 palistas"
        style="flex:1;padding:0.5rem 0.75rem;border:0.5px solid #e2e8f0;border-radius:8px;font-size:0.85rem">
      <button onclick="balExportPDF()"
        style="padding:0.5rem 0.75rem;border:0.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:0.85rem">
        🖨️ PDF
      </button>
    </div>

    <!-- Card scores -->
    <div style="${cardStyle}">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.75rem">
        <div style="text-align:center;padding:0.5rem;border-radius:8px;background:#f0f9ff;border:0.5px solid #bae6fd">
          <div style="font-size:1.25rem;font-weight:700;color:#0369a1" id="val-score-lr">—</div>
          <div style="font-size:0.65rem;color:#64748b">Balance Izq/Der</div>
        </div>
        <div style="text-align:center;padding:0.5rem;border-radius:8px;background:#f0fdf4;border:0.5px solid #bbf7d0">
          <div style="font-size:1.25rem;font-weight:700;color:#15803d" id="val-score-fb">—</div>
          <div style="font-size:0.65rem;color:#64748b">Balance Ade/Atr</div>
        </div>
        <div style="text-align:center;padding:0.5rem;border-radius:8px;background:#fefce8;border:0.5px solid #fef08a">
          <div style="font-size:1.25rem;font-weight:700;color:#a16207" id="val-score-side">—</div>
          <div style="font-size:0.65rem;color:#64748b">En su lado</div>
        </div>
        <div style="text-align:center;padding:0.5rem;border-radius:8px;background:#fff7ed;border:0.5px solid #fed7aa">
          <div style="font-size:1.25rem;font-weight:700;color:#c2410c" id="val-score-diff">—</div>
          <div style="font-size:0.65rem;color:#64748b">Dif. peso</div>
        </div>
      </div>

      <!-- Barra Izq/Der -->
      <div style="margin-bottom:0.5rem">
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#64748b;margin-bottom:0.2rem">
          <span>◀ Izquierda <span id="bar-left-kg">0kg</span></span>
          <span><span id="bar-right-kg">0kg</span> Derecha ▶</span>
        </div>
        <div style="height:12px;border-radius:999px;overflow:hidden;background:#f1f5f9;display:flex">
          <div id="bar-left-fill" style="background:#0ea5e9;width:50%;transition:width 0.3s"></div>
          <div id="bar-right-fill" style="background:#f97316;width:50%;transition:width 0.3s"></div>
        </div>
      </div>

      <!-- Barra Ade/Atr -->
      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#64748b;margin-bottom:0.2rem">
          <span>▲ Adelante <span id="bar-front-kg">0kg</span></span>
          <span><span id="bar-back-kg">0kg</span> Atrás ▼</span>
        </div>
        <div style="height:12px;border-radius:999px;overflow:hidden;background:#f1f5f9;display:flex">
          <div id="bar-front-fill" style="background:#1d4ed8;width:50%;transition:width 0.3s"></div>
          <div id="bar-back-fill" style="background:#7c3aed;width:50%;transition:width 0.3s"></div>
        </div>
      </div>

      <!-- SVG views -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.75rem">
        <div style="border:0.5px solid #e2e8f0;border-radius:8px;padding:0.5rem;text-align:center">
          <div style="font-size:0.7rem;color:#64748b;margin-bottom:0.3rem">Vista frontal</div>
          <svg id="svg-front" width="100%" height="80" viewBox="0 0 120 80"></svg>
        </div>
        <div style="border:0.5px solid #e2e8f0;border-radius:8px;padding:0.5rem;text-align:center">
          <div style="font-size:0.7rem;color:#64748b;margin-bottom:0.3rem">Vista lateral</div>
          <svg id="svg-side" width="100%" height="80" viewBox="0 0 120 80"></svg>
        </div>
      </div>
    </div>

    <!-- Card bote visual -->
    <div style="background:linear-gradient(180deg,#0c4a6e 0%,#075985 50%,#0c4a6e 100%);color:#fff;padding:1rem;border-radius:12px;border:0.5px solid #0c4a6e">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:600;margin-bottom:0.5rem;opacity:0.8">
        <span>◀ Izquierda</span><span>Derecha ▶</span>
      </div>

      <!-- Drummer -->
      <div id="seat-drummer" onclick="balToggleLock('drummer')"
        style="border:1px solid #fed7aa;border-radius:8px;padding:0.4rem 0.5rem;cursor:pointer;min-height:40px;background:rgba(234,88,12,0.15);margin-bottom:0.5rem">
        <div style="font-size:0.6rem;color:#fed7aa;font-weight:600;margin-bottom:0.2rem">🥁 DRUMMER</div>
        <div id="slot-drummer">
          <div style="font-size:0.65rem;color:#94a3b8;text-align:center;padding:0.2rem">Vacío</div>
        </div>
      </div>

      <!-- Filas de asientos -->
      <div id="bal-rows" style="display:flex;flex-direction:column;gap:0.3rem;margin:0.5rem 0"></div>

      <!-- Timonel -->
      <div id="seat-timonel" onclick="balToggleLock('timonel')"
        style="border:1px solid #e9d5ff;border-radius:8px;padding:0.4rem 0.5rem;cursor:pointer;min-height:40px;background:rgba(124,58,237,0.15);margin-top:0.5rem">
        <div style="font-size:0.6rem;color:#e9d5ff;font-weight:600;margin-bottom:0.2rem">🎯 TIMONEL</div>
        <div id="slot-timonel">
          <div style="font-size:0.65rem;color:#94a3b8;text-align:center;padding:0.2rem">Vacío</div>
        </div>
      </div>

      <!-- Instrucción timonel -->
      <div id="timonel-instruction"
        style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:0.5rem;margin-top:0.5rem;font-size:0.72rem;color:#854d0e;display:none">
      </div>
    </div>

    <!-- Card leyenda -->
    <div style="${cardStyle};display:flex;flex-wrap:wrap;gap:0.75rem;font-size:0.72rem;color:#64748b">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:4px;vertical-align:middle"></span>En su lado</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:4px;vertical-align:middle"></span>Lado contrario</span>
      <span>⭐ Indistinto</span>
      <span>🔓 Libre &nbsp;·&nbsp; 🔒 Fijo</span>
      <span style="color:#94a3b8">· Clic en asiento para fijar/liberar</span>
    </div>

  </div><!-- /bal-right -->

</div>
  `;
}

// ---------------------------------------------------------------------------
// renderBalanceDetail — carga datos y pinta la UI
// ---------------------------------------------------------------------------
async function renderBalanceDetail(teamId, layout, teams) {
  try {
    const [team, members] = await Promise.all([
      api.apiGetTeam(teamId),
      api.apiListMembers(teamId),
    ]);

    if (!team) {
      layout(`<div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:1rem"><p style="color:#ef4444">${escapeHtml(t("balance.noMembers"))}</p></div>`);
      return;
    }

    // Reiniciar estado
    _members = (members || []).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    _seats = {};
    _locked = new Set();
    _boatSize = "large";
    _priority = 50;

    const teamName = escapeHtml(team.name || t("teams.emptyNoTeam"));

    // Selector de equipo si tiene varios
    let selectorHtml = "";
    if (teams && teams.length > 1) {
      const opts = teams
        .map((tm) => `<option value="${tm.team.id}"${String(tm.team.id) === String(teamId) ? " selected" : ""}>${escapeHtml(tm.team.name)}</option>`)
        .join("");
      selectorHtml = `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
          <label style="font-size:0.8rem;color:#64748b;white-space:nowrap">${escapeHtml(t("balance.selectTeam"))}:</label>
          <select id="bal-team-select" onchange="balChangeTeam(this.value)"
            style="flex:1;padding:0.35rem 0.5rem;border:0.5px solid #e2e8f0;border-radius:8px;font-size:0.85rem">
            ${opts}
          </select>
        </div>
      `;
    }

    const pageHtml = `
      <div>
        <div style="display:flex;align-items:baseline;gap:0.75rem;margin-bottom:0.75rem">
          <h1 style="margin:0;font-size:1.25rem">${escapeHtml(t("balance.title"))}</h1>
          <span style="font-size:0.85rem;color:#64748b">${teamName}</span>
        </div>
        ${selectorHtml}
        ${_members.length === 0
          ? `<p style="color:#94a3b8">${escapeHtml(t("balance.noMembers"))}</p>`
          : buildPageHtml(teamName)
        }
      </div>
    `;

    layout(pageHtml);

    if (_members.length > 0) {
      buildMemberList();
      buildRoleSelects();
      balRenderBoat();
    }
  } catch (ex) {
    layout(`<div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:1rem"><p style="color:#ef4444">${escapeHtml(ex.message || t("common.errorUnknown"))}</p></div>`);
  }
}

// ---------------------------------------------------------------------------
// Exportar página — entry point
// ---------------------------------------------------------------------------
export async function renderBalance(layout) {
  layout(`<p style="color:#94a3b8;padding:1rem">${escapeHtml(t("balance.loading"))}</p>`);

  try {
    const teams = await api.apiMyTeams();

    if (!teams || teams.length === 0) {
      layout(`<div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:1rem"><p style="color:#ef4444">${escapeHtml(t("balance.noTeams"))}</p></div>`);
      return;
    }

    if (teams.length === 1) {
      await renderBalanceDetail(teams[0].team.id, layout, teams);
    } else {
      // Mostrar selector inicial
      const opts = teams
        .map((tm) => `<option value="${tm.team.id}">${escapeHtml(tm.team.name)}</option>`)
        .join("");

      layout(`
        <div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:1rem;max-width:400px">
          <h2 style="margin:0 0 0.75rem">${escapeHtml(t("balance.title"))}</h2>
          <label style="font-size:0.85rem;color:#64748b">${escapeHtml(t("balance.selectTeam"))}</label>
          <select id="balance-team-select"
            style="width:100%;padding:0.5rem;margin-top:0.5rem;border-radius:6px;border:0.5px solid #e2e8f0;font-size:0.9rem">
            <option value="">${escapeHtml(t("balance.selectTeam"))}</option>
            ${opts}
          </select>
        </div>
      `);

      document.getElementById("balance-team-select")?.addEventListener("change", (e) => {
        const id = e.target.value;
        if (id) renderBalanceDetail(id, layout, teams);
      });
    }
  } catch (ex) {
    layout(`<div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:1rem"><p style="color:#ef4444">${escapeHtml(ex.message || t("common.errorUnknown"))}</p></div>`);
  }
}

// ---------------------------------------------------------------------------
// Cambio de equipo desde el selector en la vista de detalle
// ---------------------------------------------------------------------------
function balChangeTeam(teamId) {
  if (!teamId) return;
  // Re-render con el nuevo team. Necesitamos recuperar la lista completa.
  // Como no tenemos la referencia a layout ni teams en el scope del handler,
  // usamos un evento personalizado que el router puede interceptar o simplemente
  // navegar al hash de balance con el team id.
  window.location.hash = `#balance?team=${teamId}`;
}

// ---------------------------------------------------------------------------
// Exports globales para handlers onclick
// ---------------------------------------------------------------------------
window.balSetBoatSize = balSetBoatSize;
window.balSetPriority = balSetPriority;
window.balUpdatePriorityText = balUpdatePriorityText;
window.balRun = balRun;
window.balToggleLock = balToggleLock;
window.balUpdateCount = balUpdateCount;
window.balChangeTeam = balChangeTeam;
window.balExportPDF = () => window.print();
