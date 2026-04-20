/**
 * Cliente HTTP del panel (Bearer JWT).
 */

const TOKEN_KEY = "edb_token";
const EMAIL_KEY = "edb_email";

export const API =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "https://api.edragonboat.com";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setSession(token, email) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EMAIL_KEY, email);
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
}

export function getEmail() {
  return sessionStorage.getItem(EMAIL_KEY) || "";
}

function authHeaders() {
  const t = getToken();
  if (!t) throw new Error("No hay sesión");
  return { Authorization: `Bearer ${t}` };
}

export async function apiLogin(email, password) {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Error ${res.status}`);
  }
  return res.json();
}

/** Registro (sin email de verificación: solo crea usuario en la API). */
export async function apiRegister(email, password, fullName = null) {
  const body = {
    email: String(email).trim(),
    password: String(password),
  };
  if (fullName && String(fullName).trim()) body.full_name = String(fullName).trim();
  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiMe() {
  /** Preferir `/me` y `/auth/me` (UserRead completo); `/profile` como alias por compatibilidad con proxies viejos. */
  const paths = ["/api/v1/me", "/api/v1/auth/me", "/api/v1/profile"];
  let lastText = "";
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const res = await fetch(`${API}${p}`, { headers: authHeaders() });
    lastText = await res.text();
    if (res.ok) {
      try {
        const me = JSON.parse(lastText);
        const hasAdminFlag = me && typeof me.is_platform_admin === "boolean";
        if (!hasAdminFlag && i < paths.length - 1) {
          continue;
        }
        return me;
      } catch {
        throw new Error(lastText || `Error ${res.status}`);
      }
    }
  }
  throw new Error(lastText || "No se pudo cargar el perfil");
}

export async function apiListSessions(teamId) {
  let url = `${API}/api/v1/sessions/libre`;
  if (teamId != null && teamId !== "") {
    url += `?team_id=${encodeURIComponent(String(teamId))}`;
  }
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Sesiones de competencia: listado global (todos los equipos), POST /api/v1/sessions/competencia. */
export async function apiListCompetenciaSessions() {
  const res = await fetch(`${API}/api/v1/sessions/competencia`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetSession(id) {
  const res = await fetch(`${API}/api/v1/sessions/libre/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDeleteSession(id) {
  const res = await fetch(`${API}/api/v1/sessions/libre/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function apiMyTeams() {
  const res = await fetch(`${API}/api/v1/teams/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Países distintos que tienen al menos un equipo (tabla equipos). */
export async function apiListTeamCountries() {
  const res = await fetch(`${API}/api/v1/teams/countries`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetTeam(teamId) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiCreateTeam(body) {
  const res = await fetch(`${API}/api/v1/teams`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDeleteTeam(teamId) {
  let res = await fetch(`${API}/api/v1/teams/${teamId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 404) {
    res = await fetch(`${API}/api/v1/equipo/${teamId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }
  if (!res.ok) throw new Error(await res.text());
}

export async function apiUploadTeamLogo(teamId, file) {
  const t = getToken();
  if (!t) throw new Error("No hay sesión");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/v1/teams/${teamId}/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}` },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDeleteTeamLogo(teamId) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}/logo`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiListRoutines(teamId) {
  const res = await fetch(`${API}/api/v1/routines?team_id=${encodeURIComponent(String(teamId))}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiCreateRoutine(body) {
  const res = await fetch(`${API}/api/v1/routines`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetRoutine(routineId) {
  const res = await fetch(`${API}/api/v1/routines/${routineId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiSaveRoutine(routineId, body) {
  const res = await fetch(`${API}/api/v1/routines/${routineId}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDeleteRoutine(routineId) {
  const res = await fetch(`${API}/api/v1/routines/${routineId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function apiUpdateTeam(teamId, body) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiListMembers(teamId) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}/members`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Respuestas de APIs viejas que obligan a probar la otra ruta de invitación. */
function shouldTryAlternateInviteUrl(status, bodyText) {
  if (status === 404 || status === 405) return true;
  return /No hay usuario registrado|debe crear cuenta primero/i.test(bodyText || "");
}

export async function apiAddMember(teamId, email, role, fullName = null) {
  const body = { email: String(email).trim(), role };
  if (fullName && String(fullName).trim()) body.full_name = String(fullName).trim();
  const opts = {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  // Primero /teams (código actual crea usuario). Si el servidor tiene teams.py viejo, reintentar /panel/... (main.py).
  const urls = [
    `${API}/api/v1/teams/${teamId}/members`,
    `${API}/api/v1/panel/teams/${teamId}/members`,
  ];
  let lastText = "";
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], opts);
    const text = await res.text();
    lastText = text;
    if (res.ok) {
      return JSON.parse(text);
    }
    const retry = i === 0 && shouldTryAlternateInviteUrl(res.status, text);
    if (!retry) throw new Error(text);
  }
  throw new Error(lastText);
}

/** PATCH miembro: `role` y/o `email` (al menos uno). */
export async function apiPatchMember(teamId, userId, body) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPatchMemberRole(teamId, userId, role) {
  return apiPatchMember(teamId, userId, { role });
}

/** Datos de plantel (documento, nacimiento, medidas, lado) en la membresía. */
export async function apiPatchMemberRoster(teamId, userId, body) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}/members/${userId}/roster`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiRemoveMember(teamId, userId) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function apiChangePassword(currentPassword, newPassword) {
  const res = await fetch(`${API}/api/v1/auth/change-password`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

/** @deprecated Listado legacy; el panel usa {@link apiListCompetenciaSessions}. */
export async function apiListRegatas() {
  const res = await fetch(`${API}/api/v1/regatas`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
