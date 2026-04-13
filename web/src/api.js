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

export async function apiMe() {
  const paths = ["/api/v1/profile", "/api/v1/me", "/api/v1/auth/me"];
  let lastText = "";
  for (const p of paths) {
    const res = await fetch(`${API}${p}`, { headers: authHeaders() });
    lastText = await res.text();
    if (res.ok) {
      try {
        return JSON.parse(lastText);
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

export async function apiPatchMemberRole(teamId, userId, role) {
  const res = await fetch(`${API}/api/v1/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
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

/** Listado de regatas (requiere API con GET /api/v1/regatas). */
export async function apiListRegatas() {
  const res = await fetch(`${API}/api/v1/regatas`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
