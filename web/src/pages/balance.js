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
let _strategy = 'normal';
let _zigzagPhase = 0;
let _seats = {};        // { 'L-1': { memberId: '...' }, 'R-1': ..., 'drummer': ..., 'timonel': ... }
let _locked = new Set();
let _drumWeight = 3;
let _helmWeight = 3;
let _genderFilter = '';

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

  if (seatId === "drummer" || seatId === "timonel") {
    if (!seat?.memberId) {
      const emoji = seatId === "drummer" ? "🥁" : "🚣";
      const label = seatId === "drummer" ? "DRUMMER" : "TIMONEL";
      return `
      <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);border-radius:8px">
        <span style="font-size:0.75rem">${emoji}</span>
        <span style="font-size:0.65rem;font-weight:600;color:#f1f5f9">${label}</span>
        <span style="font-size:0.7rem;color:#94a3b8">Vacío</span>
      </div>
    `;
    }
    const member = memberById(seat.memberId);
    if (!member) return `<div style="text-align:center;color:rgba(255,255,255,0.4);font-size:0.7rem;padding:0.2rem">?</div>`;
    const idx = memberIndex(seat.memberId);
    const color = avatarColor(idx);
    const weightStr = member.weight_kg != null ? `${member.weight_kg}kg` : "—";
    const emoji = seatId === "drummer" ? "🥁" : "🎯";
    const label = seatId === "drummer" ? "DRUMMER" : "TIMONEL";
    return `
      <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);border-radius:8px">
        <span style="font-size:0.75rem">${emoji}</span>
        <span style="font-size:0.65rem;font-weight:600;color:#f1f5f9">${label}</span>
        <div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;font-weight:700">${escapeHtml(initial(member.full_name))}</div>
        <span style="font-size:0.7rem;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">${escapeHtml(member.full_name)}</span>
        <span style="font-size:0.65rem;color:rgba(255,255,255,0.7);white-space:nowrap">${weightStr}</span>
      </div>
    `;
  }

  if (!seat || !seat.memberId) {
    return `<div style="display:flex;align-items:center;justify-content:center;min-height:34px;color:#94a3b8;font-size:11px;">Vacío</div>`;
  }

  const member = memberById(seat.memberId);
  if (!member) {
    return `<div style="display:flex;align-items:center;justify-content:center;min-height:34px;color:rgba(255,255,255,0.3);font-size:11px;">?</div>`;
  }

  const idx = memberIndex(seat.memberId);
  const color = avatarColor(idx);
  const led = ledColor(member, seatId);
  const lockIcon = locked ? "🔒" : "🔓";
  const weightVal = member.weight_kg != null ? member.weight_kg : "—";
  const ps = member.preferred_side;
  const slLabel = ps === 'left' ? 'Izq' : ps === 'right' ? 'Der' : '';
  const infoLine = slLabel ? `${slLabel} · ${weightVal}kg` : `${weightVal}kg`;
  const initials = escapeHtml(initial(member.full_name));
  const name = escapeHtml(member.full_name);

  const ledColor_ = led !== null ? led : null;
  const ledHtml = ledColor_ !== null
    ? `<div style="width:6px;height:6px;border-radius:50%;background:${ledColor_};flex-shrink:0;"></div>`
    : `<div style="font-size:9px;flex-shrink:0;">⭐</div>`;

  const sideStr = ps === 'left' ? 'Izq' : ps === 'right' ? 'Der' : 'Ind';
  const weightStr = member.weight_kg != null ? `${member.weight_kg}kg` : '—';

  return `
  <div style="display:flex;align-items:center;gap:5px;width:100%;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:3px 5px;box-sizing:border-box">
    ${ledHtml}
    <div style="width:24px;height:24px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:700;flex-shrink:0">${escapeHtml(initial(member.full_name))}</div>
    <div style="flex:1;min-width:0;overflow:hidden;display:flex;align-items:baseline;gap:0">
      <span style="font-size:12px;font-weight:500;color:#fff;white-space:nowrap">${escapeHtml(member.full_name)}</span>
      <span style="font-size:10px;color:rgba(255,255,255,0.6);margin-left:4px;white-space:nowrap">(${sideStr}) · ${weightStr}</span>
    </div>
    <span style="font-size:11px;cursor:pointer;opacity:${locked?'1':'0.25'};color:${locked?'#f59e0b':'#94a3b8'}" onclick="event.stopPropagation();balToggleLock('${seatId}')">${lockIcon}</span>
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

    const bgL = "transparent";
    const bgR = "transparent";
    const borderL = lockedL ? "1px solid #fbbf24" : (hasL ? "none" : "1px dashed rgba(255,255,255,0.3)");
    const borderR = lockedR ? "1px solid #fbbf24" : (hasR ? "none" : "1px dashed rgba(255,255,255,0.3)");

    html += `
      <div style="display:grid;grid-template-columns:1fr 20px 1fr;gap:0.2rem;align-items:center">
        <div id="seat-${seatL}" data-seat="${seatL}" onclick="balToggleLock('${seatL}')"
          ${hasL && !lockedL ? `draggable="true" ondragstart="balDragStart(event,'${seatL}')"` : ''}
          ondragover="balDragOver(event,'${seatL}')" ondrop="balDrop(event,'${seatL}')" ondragleave="balDragLeave(event,'${seatL}')"
          style="border-radius:8px;cursor:pointer;min-height:34px;background:${bgL};border:${borderL};transition:border 0.2s">
          ${renderSeatHtml(seatL)}
        </div>
        <div style="width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#cbd5e1;flex-shrink:0">${i}</div>
        <div id="seat-${seatR}" data-seat="${seatR}" onclick="balToggleLock('${seatR}')"
          ${hasR && !lockedR ? `draggable="true" ondragstart="balDragStart(event,'${seatR}')"` : ''}
          ondragover="balDragOver(event,'${seatR}')" ondrop="balDrop(event,'${seatR}')" ondragleave="balDragLeave(event,'${seatR}')"
          style="border-radius:8px;cursor:pointer;min-height:34px;background:${bgR};border:${borderR};transition:border 0.2s">
          ${renderSeatHtml(seatR)}
        </div>
      </div>
    `;

    // Eje central entre fila 5 y 6 en bote grande, o entre fila 3 y 4 en bote chico
    if ((_boatSize === "large" && i === 5) || (_boatSize === "small" && i === 3)) {
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
  let wL = 0, wR = 0, wF = 0, wB = 0, assigned = 0, onSide = 0, total = 0;

  // Calcular pesos por lado (izq/der) y posición (adelante/atrás)
  for (let i = 1; i <= rows; i++) {
    const lSeat = _seats[`L-${i}`];
    const rSeat = _seats[`R-${i}`];
    const lMember = lSeat ? memberById(lSeat.memberId) : null;
    const rMember = rSeat ? memberById(rSeat.memberId) : null;

    if (lMember) {
      const w = memberWeight(lMember);
      wL += w;
      assigned++;
      if (i <= rows / 2) wF += w;
      else wB += w;
    }
    if (rMember) {
      const w = memberWeight(rMember);
      wR += w;
      assigned++;
      if (i <= rows / 2) wF += w;
      else wB += w;
    }
  }

  // Contar palistas en su lado preferido
  Object.entries(_seats).forEach(([sid, seat]) => {
    if (!seat?.memberId || !sid.startsWith('L-') && !sid.startsWith('R-')) return;
    const m = memberById(seat.memberId);
    if (!m) return;
    const ps = m.preferred_side;
    if (ps === 'left' || ps === 'right') {
      total++;
      if ((ps === 'left' && sid.startsWith('L-')) || (ps === 'right' && sid.startsWith('R-'))) onSide++;
    }
  });

  // Calcular scores
  const totalLR = wL + wR || 1;
  const totalFB = wF + wB || 1;
  const scoreLR = Math.round(100 - (Math.abs(wL - wR) / totalLR) * 100);
  const scoreFB = Math.round(100 - (Math.abs(wF - wB) / totalFB) * 100);
  const scoreSide = total > 0 ? Math.round((onSide / total) * 100) : 0;
  const diffLR = Math.abs(wL - wR);
  const diffFB = Math.abs(wF - wB);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Actualizar score boxes
  setEl("score-lr", `${scoreLR}%`);
  setEl("score-fb", `${scoreFB}%`);
  setEl("score-side", total > 0 ? `${onSide}/${total}` : "—");
  setEl("score-count", `${assigned}`);

  // Actualizar barras Izq/Der
  const pctL = totalLR > 0 ? (wL / totalLR) * 100 : 50;
  const pctR = 100 - pctL;
  const setWidth = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; };
  setWidth("bar-lr-left", pctL);
  setWidth("bar-lr-right", pctR);
  setEl("bar-lr-left-label", `${wL.toFixed(0)}`);
  setEl("bar-lr-right-label", `${wR.toFixed(0)}`);
  let lrDiffText;
  if (wL === wR) lrDiffText = 'Perfectamente equilibrado';
  else if (wL > wR) lrDiffText = `${(wL - wR).toFixed(1)} kg más a la izquierda`;
  else lrDiffText = `${(wR - wL).toFixed(1)} kg más a la derecha`;
  setEl("bar-lr-diff", lrDiffText);

  // Actualizar barras Ade/Atr
  const pctF = totalFB > 0 ? (wF / totalFB) * 100 : 50;
  const pctB = 100 - pctF;
  setWidth("bar-fb-front", pctF);
  setWidth("bar-fb-back", pctB);
  setEl("bar-fb-front-label", `${wF.toFixed(0)}`);
  setEl("bar-fb-back-label", `${wB.toFixed(0)}`);
  let fbDiffText;
  if (wF === wB) fbDiffText = 'Perfectamente equilibrado';
  else if (wF > wB) fbDiffText = `${(wF - wB).toFixed(1)} kg más adelante`;
  else fbDiffText = `${(wB - wF).toFixed(1)} kg más atrás`;
  setEl("bar-fb-diff", fbDiffText);

  // Instrucción timonel
  const instrBox = document.getElementById("timonel-instruction");
  const instrWrapper = document.getElementById("timonel-instruction-wrapper");
  if (instrBox && instrWrapper) {
    const msgs = [];
    if (diffLR > 5) {
      msgs.push(`Correrse hacia ${wL > wR ? "la derecha" : "la izquierda"} (${diffLR.toFixed(1)}kg de diferencia)`);
    }
    if (msgs.length > 0) {
      instrBox.textContent = "🎯 " + msgs.join(" · ");
      instrWrapper.style.display = "block";
    } else {
      instrWrapper.style.display = "none";
    }
  }
}

// ---------------------------------------------------------------------------
// Estrategia de distribución
// ---------------------------------------------------------------------------
function applyStrategy(freeLeft, freeRight, strategy, phase) {
  if (strategy === 'normal') {
    return { left: freeLeft, right: freeRight };
  }

  if (strategy === 'zigzag') {
    // Generar secuencia de asientos intercalada adelante-atrás
    // phase=0: [L-1, R-2, L-3, R-4, ...]
    // phase=1: [R-1, L-2, R-3, L-4, ...]
    const rows = rowCount();
    const allSeats = [];

    if (phase === 0) {
      // L-1, R-2, L-3, R-4, ...
      for (let i = 1; i <= rows; i++) {
        if (i % 2 === 1) allSeats.push(`L-${i}`);
        else allSeats.push(`R-${i}`);
      }
    } else {
      // R-1, L-2, R-3, L-4, ...
      for (let i = 1; i <= rows; i++) {
        if (i % 2 === 1) allSeats.push(`R-${i}`);
        else allSeats.push(`L-${i}`);
      }
    }

    // Particionar los asientos zig-zag en left y right
    const newLeft = allSeats.filter(s => s.startsWith('L-'));
    const newRight = allSeats.filter(s => s.startsWith('R-'));

    return { left: newLeft, right: newRight };
  }

  if (strategy === 'dispersed') {
    const leftOdd  = freeLeft.filter(s => parseInt(s.split('-')[1]) % 2 === 1);
    const leftEven = freeLeft.filter(s => parseInt(s.split('-')[1]) % 2 === 0);
    const rightOdd  = freeRight.filter(s => parseInt(s.split('-')[1]) % 2 === 1);
    const rightEven = freeRight.filter(s => parseInt(s.split('-')[1]) % 2 === 0);
    return { left: [...leftOdd, ...leftEven], right: [...rightOdd, ...rightEven] };
  }

  return { left: freeLeft, right: freeRight };
}

function balSetStrategy(s) {
  if (s === 'zigzag' && _strategy === 'zigzag') {
    _zigzagPhase = _zigzagPhase === 0 ? 1 : 0;
  } else {
    _zigzagPhase = 0;
  }
  _strategy = s;
  document.querySelectorAll('.bal-strategy-btn').forEach(b => {
    const active = b.dataset.strategy === s;
    b.style.border = active ? '2px solid #3b82f6' : '1px solid #e2e8f0';
    b.style.background = active ? '#e6f1fb' : '#f8fafc';
    b.style.color = active ? '#1d4ed8' : '#334155';
  });
  const hasSeated = Object.values(_seats).some(v => v !== null);
  if (hasSeated) balRun();
}
window.balSetStrategy = balSetStrategy;

// ---------------------------------------------------------------------------
// Algoritmo de balanceo
// ---------------------------------------------------------------------------
function balRun() {
  if (!_members || _members.length === 0) {
    alert('No hay palistas cargados.');
    return;
  }

  const checkboxes = document.querySelectorAll('#bal-member-list input[type="checkbox"]:checked');
  const drummerSel = document.getElementById("sel-drummer")?.value || "";
  const timonelSel = document.getElementById("sel-timonel")?.value || "";
  if (checkboxes.length === 0 && !drummerSel && !timonelSel) {
    alert('Seleccioná al menos un palista, drummer o timonel.');
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
  let freeLeft  = allLeftSeats.filter(s => !newSeats[s]);
  let freeRight = allRightSeats.filter(s => !newSeats[s]);
  const stratResult = applyStrategy(freeLeft, freeRight, _strategy, _zigzagPhase);
  freeLeft  = stratResult.left;
  freeRight = stratResult.right;
  const nL = freeLeft.length;
  const nR = freeRight.length;

  // ------------------------------------------------------------------
  // Distribuir palistas a lados según _priority
  // ------------------------------------------------------------------
  let assignedLeft  = [];  // palistas que irán a la izquierda
  let assignedRight = [];  // palistas que irán a la derecha

  if (_priority <= 25) {
    // Solo peso: ordenar desc y alternar izq/der
    const allSorted = [...pool].sort((a, b) => memberWeight(b) - memberWeight(a));
    let li = 0, ri = 0;
    allSorted.forEach((m, idx) => {
      if (idx % 2 === 0 && li < freeLeft.length) {
        assignedLeft.push(m); li++;
      } else if (ri < freeRight.length) {
        assignedRight.push(m); ri++;
      } else if (li < freeLeft.length) {
        assignedLeft.push(m); li++;
      }
    });
  } else if (_priority >= 75) {
    // Solo lado: respetar preferencia estrictamente; indiferentes al lado más liviano
    const lPref = pool.filter(m => m.preferred_side === "left").sort((a, b) => memberWeight(b) - memberWeight(a));
    const rPref = pool.filter(m => m.preferred_side === "right").sort((a, b) => memberWeight(b) - memberWeight(a));
    const ePref = pool.filter(m => m.preferred_side !== "left" && m.preferred_side !== "right").sort((a, b) => memberWeight(b) - memberWeight(a));
    assignedLeft  = [...lPref];
    assignedRight = [...rPref];
    // Completar con indiferentes al lado más liviano
    ePref.forEach(m => {
      let wL = assignedLeft.reduce((s, x) => s + memberWeight(x), 0);
      let wR = assignedRight.reduce((s, x) => s + memberWeight(x), 0);
      if (wL <= wR && assignedLeft.length < nL) {
        assignedLeft.push(m);
      } else if (assignedRight.length < nR) {
        assignedRight.push(m);
      } else if (assignedLeft.length < nL) {
        assignedLeft.push(m);
      }
    });
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
  if (_locked.has(seatId)) {
    _locked.delete(seatId);
  } else {
    _locked.add(seatId);
  }
  // Re-renderizar solo el asiento afectado
  const seatEl = document.getElementById(`seat-${seatId}`);
  if (seatEl) {
    seatEl.innerHTML = renderSeatHtml(seatId);
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
  // (max-height eliminado — la lista usa todo el alto disponible)

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

  // Si ya hay palistas asignados, re-balancear automáticamente
  const hasSeated = Object.values(_seats).some(v => v !== null);
  if (hasSeated) balRun();
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

  // Si ya hay palistas asignados, re-balancear automáticamente
  const hasSeated = Object.values(_seats).some(v => v !== null);
  if (hasSeated) balRun();
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
function balRenderRoster() {
  const container = document.getElementById("bal-member-list");
  if (!container) return;

  const filtered = _members.filter(m =>
    !_genderFilter || m.sex === _genderFilter
  );

  let html = "";
  filtered.forEach((m) => {
    const idx = memberIndex(m.user_id);
    const color = avatarColor(idx);
    const sc = sideColor(m.preferred_side);
    const sl = sideLabel(m.preferred_side);
    const weightStr = m.weight_kg != null ? `${m.weight_kg} kg` : "— kg";
    html += `
      <label style="display:flex;align-items:center;gap:0.4rem;padding:0.25rem 0.5rem;border-radius:6px;cursor:pointer;min-height:32px;border-bottom:0.5px solid #f1f5f9">
        <input type="checkbox" data-member-id="${escapeHtml(String(m.user_id))}" style="accent-color:#0ea5e9;width:16px;height:16px;flex-shrink:0" onchange="balUpdateCount()">
        <div style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;font-weight:700;flex-shrink:0">${escapeHtml(initial(m.full_name))}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.75rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1e293b">${escapeHtml(m.full_name)}</div>
          <div style="display:flex;align-items:center;gap:0.25rem;margin-top:0.1rem">
            <span style="font-size:0.5rem;font-weight:600;padding:1px 5px;border-radius:3px;background:${sc};color:#fff">${sl}</span>
            <span style="font-size:0.7rem;color:#475569">${weightStr}</span>
          </div>
        </div>
      </label>
    `;
  });
  container.innerHTML = html;
  balUpdateCount();
}

// Alias para compatibilidad con llamadas internas existentes
function buildMemberList() { balRenderRoster(); }

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
  const cardStyle = `background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:8px 10px`;
  const labelStyle = `font-size:10px;font-weight:600;color:#64748b;margin-bottom:0.5rem`;

  return `
<div style="display:grid;grid-template-columns:220px 240px 1fr;gap:8px;align-items:start">

  <!-- ===== COLUMNA 1: controles ===== -->
  <div id="bal-left" style="display:flex;flex-direction:column;gap:8px;height:100%">

    <!-- Card 1: tipo de bote -->
    <div style="${cardStyle};flex:1">
      <div style="${labelStyle}">TIPO DE BOTE</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button id="btn-boat-small" onclick="balSetBoatSize('small')"
          style="width:100%;padding:0.5rem;border-radius:8px;border:2px solid #e2e8f0;background:#f8fafc;cursor:pointer;font-size:0.8rem;color:#334155">
          🚣 Chico
        </button>
        <button id="btn-boat-large" onclick="balSetBoatSize('large')"
          style="width:100%;padding:0.5rem;border-radius:8px;border:2px solid #0ea5e9;background:#eff6ff;cursor:pointer;font-size:0.8rem;font-weight:600;color:#185fa5">
          🚣🚣 Grande
        </button>
      </div>
    </div>

    <!-- Card 2a: drummer -->
    <div style="background:#fff7ed;border:1px solid #f97316;border-radius:8px;padding:10px;flex:1">
      <div style="font-size:11px;font-weight:600;color:#ea580c;margin-bottom:6px;">🥁 Drummer</div>
      <select id="sel-drummer" onchange="balRun && balRun()" style="width:100%;font-size:11px;padding:4px;border-radius:4px;border:1px solid #e2e8f0;margin-bottom:6px;">
        <option value="">— ninguno —</option>
      </select>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
        <span style="font-size:11px;color:#64748b;">Peso tambor:</span>
        <input type="number" min="0" id="bal-drum-weight" value="3"
          style="width:52px;font-size:12px;border:1px solid #e2e8f0;border-radius:4px;padding:3px 6px;"
          oninput="balSetDrumWeight(+this.value)">
        <span style="font-size:11px;color:#64748b;">kg</span>
      </div>
    </div>

    <!-- Card 2b: timonel -->
    <div style="background:#f5f3ff;border:1px solid #7c3aed;border-radius:8px;padding:10px;flex:1">
      <div style="font-size:11px;font-weight:600;color:#7c3aed;margin-bottom:6px;">🚣 Timonel</div>
      <select id="sel-timonel" onchange="balRun && balRun()" style="width:100%;font-size:11px;padding:4px;border-radius:4px;border:1px solid #e2e8f0;margin-bottom:6px;">
        <option value="">— ninguno —</option>
      </select>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
        <span style="font-size:11px;color:#64748b;">Peso timón:</span>
        <input type="number" min="0" id="bal-helm-weight" value="3"
          style="width:52px;font-size:12px;border:1px solid #e2e8f0;border-radius:4px;padding:3px 6px;"
          oninput="balSetHelmWeight(+this.value)">
        <span style="font-size:11px;color:#64748b;">kg</span>
      </div>
    </div>

    <!-- Card 3: prioridad de balanceo -->
    <div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:12px;padding:8px 10px;flex:1">
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
      <p id="bal-priority-text" style="font-size:0.7rem;color:#334155;margin-top:0.25rem;min-height:2em">
        Equilibrado: combina peso y preferencia de lado por igual
      </p>
    </div>

    <!-- Card 4: estrategia de distribución -->
    <div style="background:#fff;border:0.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;flex:1">
      <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Estrategia</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="bal-strategy-btn" data-strategy="normal" onclick="balSetStrategy('normal')"
          style="width:100%;text-align:left;padding:8px 10px;border-radius:6px;background:#e6f1fb;color:#1d4ed8;border:2px solid #3b82f6;font-size:10px;cursor:pointer;">
          <div>Normal</div>
          <div style="font-size:10px;color:#94a3b8;font-weight:normal">llena desde adelante hacia atrás</div>
        </button>
        <button class="bal-strategy-btn" data-strategy="zigzag" onclick="balSetStrategy('zigzag')"
          style="width:100%;text-align:left;padding:8px 10px;border-radius:6px;background:#f8fafc;color:#334155;border:1px solid #e2e8f0;font-size:10px;cursor:pointer;">
          <div>Zig-zag</div>
          <div style="font-size:10px;color:#94a3b8;font-weight:normal">alterna izquierda/derecha por fila (presionar 2× para invertir)</div>
        </button>
        <button class="bal-strategy-btn" data-strategy="dispersed" onclick="balSetStrategy('dispersed')"
          style="width:100%;text-align:left;padding:8px 10px;border-radius:6px;background:#f8fafc;color:#334155;border:1px solid #e2e8f0;font-size:10px;cursor:pointer;">
          <div>Fila c/2</div>
          <div style="font-size:10px;color:#94a3b8;font-weight:normal">de a 2 por fila, dejando una fila vacía entre cada par</div>
        </button>
      </div>
    </div>

  </div><!-- /bal-left -->

  <!-- ===== COLUMNA 2: palistas ===== -->
  <div id="bal-center" style="display:flex;flex-direction:column;gap:8px;height:100%">

    <!-- Card palistas -->
    <div style="${cardStyle};flex:1;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <div style="${labelStyle}">PALISTAS</div>
        <div id="bal-selected-count" style="font-size:0.75rem;color:#0ea5e9;font-weight:600">0 seleccionados</div>
      </div>
      <button id="btn-balance" onclick="balRun()" style="width:100%;margin-bottom:0.5rem;padding:0.5rem;background:#0ea5e9;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem">⚡ Balancear</button>
      <div id="bal-gender-filter" style="display:flex;gap:4px;margin:8px 0">
        <button data-g="" onclick="balSetGender('')"
          style="flex:1;padding:5px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#3b82f6;color:#fff">Todos</button>
        <button data-g="male" onclick="balSetGender('male')"
          style="flex:1;padding:5px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;color:#334155">Masc.</button>
        <button data-g="female" onclick="balSetGender('female')"
          style="flex:1;padding:5px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;color:#334155">Fem.</button>
      </div>
      <div id="bal-member-list" style="overflow-y:auto;display:flex;flex-direction:column;gap:0.3rem;flex:1;">
      </div>
    </div>

  </div><!-- /bal-center -->

  <!-- ===== COLUMNA 3: bote + barras ===== -->
  <div id="bal-right" style="display:flex;flex-direction:column;gap:0.75rem">

    <!-- Row 1: nombre del bote + PDF -->
    <div style="display:flex;gap:8px;align-items:center">
      <input id="inp-boat-name" type="text" placeholder="Ej: Open Premier 20 palistas"
        style="flex:1;padding:0.5rem 0.75rem;border:0.5px solid #e2e8f0;border-radius:8px;font-size:0.85rem">
      <button onclick="balPrint()" style="padding:7px 12px;background:#fff;border:1px solid #3b82f6;color:#3b82f6;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;height:36px">🖨️ PDF</button>
    </div>

    <!-- Barras de balance ARRIBA del bote -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:0.75rem">
      <!-- Card Izq/Der -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#64748b;font-weight:600;text-align:center;margin-bottom:8px">Izquierda / Derecha</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="white-space:nowrap"><span id="bar-lr-left-label" style="font-size:18px;font-weight:700;color:#3b82f6">0</span><span style="font-size:11px;color:#3b82f6">kg</span></span>
          <div style="flex:1;height:6px;border-radius:3px;overflow:hidden;background:#f1f5f9;display:flex">
            <div id="bar-lr-left" style="height:100%;background:#3b82f6;transition:width 0.3s;width:50%"></div>
            <div id="bar-lr-right" style="height:100%;background:#f97316;transition:width 0.3s;width:50%"></div>
          </div>
          <span style="white-space:nowrap"><span id="bar-lr-right-label" style="font-size:18px;font-weight:700;color:#f97316">0</span><span style="font-size:11px;color:#f97316">kg</span></span>
        </div>
        <div style="font-size:20px;font-weight:700;color:#f59e0b;text-align:center;margin-top:6px">
          <span id="bar-lr-diff">—</span>
        </div>
      </div>
      <!-- Card Ade/Atr -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px">
        <div style="font-size:11px;color:#64748b;font-weight:600;text-align:center;margin-bottom:8px">Adelante / Atrás</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="white-space:nowrap"><span id="bar-fb-front-label" style="font-size:18px;font-weight:700;color:#1d4ed8">0</span><span style="font-size:11px;color:#1d4ed8">kg</span></span>
          <div style="flex:1;height:6px;border-radius:3px;overflow:hidden;background:#f1f5f9;display:flex">
            <div id="bar-fb-front" style="height:100%;background:#1d4ed8;transition:width 0.3s;width:50%"></div>
            <div id="bar-fb-back" style="height:100%;background:#8b5cf6;transition:width 0.3s;width:50%"></div>
          </div>
          <span style="white-space:nowrap"><span id="bar-fb-back-label" style="font-size:18px;font-weight:700;color:#8b5cf6">0</span><span style="font-size:11px;color:#8b5cf6">kg</span></span>
        </div>
        <div style="font-size:20px;font-weight:700;color:#f59e0b;text-align:center;margin-top:6px">
          <span id="bar-fb-diff">—</span>
        </div>
      </div>
    </div>

    <!-- Card bote visual -->
    <div style="background:linear-gradient(180deg,#0c4a6e 0%,#075985 50%,#0c4a6e 100%);color:#fff;padding:1rem;border-radius:12px;border:0.5px solid #0c4a6e">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:600;margin-bottom:0.5rem;opacity:0.8">
        <span>◀ Izquierda</span><span>Derecha ▶</span>
      </div>

      <!-- Proa label -->
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.5);text-align:center;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">▲ Proa</div>

      <!-- Drummer -->
      <div style="display:grid;grid-template-columns:1fr 20px 1fr;gap:0.2rem;align-items:center;margin-bottom:0.5rem">
        <div></div>
        <div id="seat-drummer" onclick="balToggleLock('drummer')"
          style="cursor:pointer;display:flex;justify-content:center;align-items:center;">
          <div id="slot-drummer">
            <div style="font-size:0.65rem;color:#94a3b8;text-align:center;padding:0.2rem">Vacío</div>
          </div>
        </div>
        <div></div>
      </div>

      <!-- Filas de asientos -->
      <div id="bal-rows" style="display:flex;flex-direction:column;gap:0.2rem;margin:0.5rem 0"></div>

      <!-- Timonel -->
      <div style="display:grid;grid-template-columns:1fr 20px 1fr;gap:0.2rem;align-items:center;margin-top:0.5rem">
        <div></div>
        <div id="seat-timonel" onclick="balToggleLock('timonel')"
          style="cursor:pointer;display:flex;justify-content:center;align-items:center;">
          <div id="slot-timonel">
            <div style="font-size:0.65rem;color:#94a3b8;text-align:center;padding:0.2rem">Vacío</div>
          </div>
        </div>
        <div></div>
      </div>

      <!-- Popa label -->
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.5);text-align:center;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px">▼ Popa</div>

      <!-- Instrucción timonel -->
      <div style="text-align:center;display:none" id="timonel-instruction-wrapper">
        <div id="timonel-instruction"
          style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:6px 14px;font-size:12px;color:#fff;margin:4px auto;width:auto">
        </div>
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
    _strategy = 'normal';
    _zigzagPhase = 0;
    _drumWeight = 3;
    _helmWeight = 3;
    _genderFilter = '';

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
// Drag & Drop entre asientos
// ---------------------------------------------------------------------------
function balDragStart(e, seatId) {
  e.dataTransfer.setData('text/plain', seatId);
  e.dataTransfer.effectAllowed = 'move';
}

function balDragOver(e, seatId) {
  if (_locked.has(seatId)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const el = document.getElementById(`seat-${seatId}`);
  if (el) el.style.outline = '2px dashed #fff';
}

function balDragLeave(e, seatId) {
  const el = document.getElementById(`seat-${seatId}`);
  if (el) el.style.outline = '';
}

function balDrop(e, targetId) {
  e.preventDefault();
  const el = document.getElementById(`seat-${targetId}`);
  if (el) el.style.outline = '';
  if (_locked.has(targetId)) return;
  const sourceId = e.dataTransfer.getData('text/plain');
  if (!sourceId || sourceId === targetId) return;
  // Swap
  const tmp = _seats[sourceId] ? { ..._seats[sourceId] } : null;
  _seats[sourceId] = _seats[targetId] ? { ..._seats[targetId] } : null;
  _seats[targetId] = tmp;
  balRenderBoat();
  balUpdateScores();
}

// ---------------------------------------------------------------------------
// Peso del tambor y del timón
// ---------------------------------------------------------------------------
function balSetDrumWeight(val) {
  _drumWeight = isFinite(val) && val >= 0 ? val : 0;
  balUpdateScores();
}

function balSetHelmWeight(val) {
  _helmWeight = isFinite(val) && val >= 0 ? val : 0;
  balUpdateScores();
}

// ---------------------------------------------------------------------------
// Filtro de género
// ---------------------------------------------------------------------------
function balSetGender(g) {
  _genderFilter = g;
  document.querySelectorAll('#bal-gender-filter button').forEach(btn => {
    const active = btn.dataset.g === g;
    btn.style.background = active ? '#3b82f6' : '#f8fafc';
    btn.style.color = active ? '#fff' : '#334155';
  });
  balRenderRoster();
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
window.balPrint = () => window.print();
window.balDragStart = balDragStart;
window.balDragOver = balDragOver;
window.balDrop = balDrop;
window.balDragLeave = balDragLeave;
window.balSetDrumWeight = balSetDrumWeight;
window.balSetHelmWeight = balSetHelmWeight;
window.balSetGender = balSetGender;
