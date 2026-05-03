/**
 * Página: Foro de la comunidad.
 */

import * as api from "../api.js";
import { escapeHtml, humanizeApiError, forumRelativeTime, forumAvatarColor } from "../utils/format.js";

// Constantes de categoría del foro
const FORUM_CATEGORY_COLORS = {
  todos: "#3b82f6",
  anuncios: "#22c55e",
  entrenamiento: "#f59e0b",
  competencias: "#a855f7",
  general: "#94a3b8",
};

const FORUM_CATEGORY_LABELS = {
  todos: "Todos",
  anuncios: "Anuncios",
  entrenamiento: "Entrenamiento",
  competencias: "Competencias",
  general: "General",
};

function forumCategoryBadge(cat) {
  const color = FORUM_CATEGORY_COLORS[cat] || FORUM_CATEGORY_COLORS.general;
  const label = FORUM_CATEGORY_LABELS[cat] || escapeHtml(String(cat || "General"));
  return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600">${escapeHtml(label)}</span>`;
}

function renderForumPostsList(posts, category, sortBy) {
  const listEl = document.getElementById("foro-posts-list");
  if (!listEl) return;

  let filtered = category === "all" || category === "todos"
    ? posts
    : posts.filter((p) => (p.category || "general") === category);

  if (sortBy === "comments") {
    filtered = [...filtered].sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0));
  } else if (sortBy === "pinned") {
    filtered = [...filtered].sort((a, b) => {
      if (b.is_pinned && !a.is_pinned) return 1;
      if (a.is_pinned && !b.is_pinned) return -1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  } else {
    filtered = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-muted)">No hay publicaciones en esta categoría.</div>`;
    return;
  }

  const now = Date.now();
  listEl.innerHTML = filtered.map((post) => {
    const authorName = post.author_name || post.author_email || "Usuario";
    const initial = (authorName)[0].toUpperCase();
    const color = forumAvatarColor(authorName);
    const cat = post.category || "general";
    const isNew = (now - new Date(post.created_at)) < 86400000;
    const pinnedBadge = post.is_pinned
      ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600">Fijado</span>`
      : "";
    const newBadge = isNew
      ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600">NUEVO</span>`
      : "";
    const borderLeft = post.is_pinned ? "border-left:3px solid #3b82f6;" : "";

    return `<div class="card foro-post-card" data-post-id="${post.id}" style="cursor:pointer;${borderLeft}margin-bottom:12px;transition:box-shadow 0.15s">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:600;flex-shrink:0;font-size:1em">
          ${escapeHtml(initial)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-weight:500">${escapeHtml(authorName)}</span>
            ${post.team_name ? `<span style="color:var(--text-muted);font-size:0.85em">· ${escapeHtml(post.team_name)}</span>` : ""}
            ${forumCategoryBadge(cat)}
            ${pinnedBadge}
            ${newBadge}
          </div>
          <h4 style="margin:0 0 4px;font-size:1em;font-weight:600">${escapeHtml(post.title)}</h4>
          <p style="margin:0 0 8px;color:var(--text-muted);font-size:0.9em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
            ${escapeHtml(post.content || "")}
          </p>
          <div style="display:flex;gap:16px;font-size:0.8em;color:var(--text-muted)">
            <span>💬 ${post.comment_count || 0} comentarios</span>
            <span>👁 ${post.view_count || 0} vistas</span>
            <span>${forumRelativeTime(post.created_at)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  listEl.querySelectorAll(".foro-post-card").forEach((card) => {
    card.addEventListener("mouseenter", () => { card.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; });
    card.addEventListener("mouseleave", () => { card.style.boxShadow = ""; });
    card.addEventListener("click", () => {
      const postId = Number(card.dataset.postId);
      location.hash = `#/foro/post/${postId}`;
    });
  });
}

/** @param {Function} layout */
export async function renderForum(layout) {
  layout(`<p class="loading-line">Cargando foro...</p>`, { wide: true });

  let posts = [];
  try {
    posts = await api.apiRequest("GET", "/forum/posts");
    if (!Array.isArray(posts)) posts = posts.posts || posts.items || [];
  } catch (ex) {
    const detail = humanizeApiError(ex.message);
    layout(`<div class="card"><h2 class="card-title">Foro de la comunidad</h2>
      <p class="msg-error">${escapeHtml(detail)}</p>
      <p class="muted small">El módulo de foro requiere que el endpoint <code>/forum/posts</code> esté disponible en la API.</p></div>`);
    return;
  }

  const catCounts = { todos: posts.length, anuncios: 0, entrenamiento: 0, competencias: 0, general: 0 };
  posts.forEach((p) => {
    const c = p.category || "general";
    if (c in catCounts) catCounts[c]++;
    else catCounts.general++;
  });

  const oneWeekAgo = Date.now() - 7 * 86400000;
  const postsThisWeek = posts.filter((p) => new Date(p.created_at) > oneWeekAgo).length;

  const catOrder = ["todos", "anuncios", "entrenamiento", "competencias", "general"];

  const categoriesHtml = catOrder.map((cat) => {
    const color = FORUM_CATEGORY_COLORS[cat];
    const label = FORUM_CATEGORY_LABELS[cat];
    return `<div class="foro-cat-item" data-cat="${cat}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:background 0.1s">
      <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span style="flex:1;font-size:0.9em">${escapeHtml(label)}</span>
      <span style="font-size:0.8em;color:var(--text-muted);background:#f1f5f9;padding:1px 7px;border-radius:10px">${catCounts[cat] || 0}</span>
    </div>`;
  }).join("");

  const html = `
    <div style="display:flex;gap:20px;padding:24px;min-height:100%">
      <!-- Panel izquierdo 240px -->
      <div style="width:240px;flex-shrink:0;display:flex;flex-direction:column;gap:12px">
        <button id="btn-nuevo-post" style="width:100%;padding:10px 16px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.95em;display:flex;align-items:center;justify-content:center;gap:6px">
          + Nueva publicación
        </button>
        <div class="card" style="padding:12px" id="card-categorias">
          <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px;padding:0 4px">Categorías</div>
          ${categoriesHtml}
        </div>
        <div class="card" style="padding:16px" id="card-stats">
          <div style="font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:12px">Estadísticas</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:0.85em;color:var(--text-muted)">Posts totales</span>
            <span style="font-weight:700;color:#1e293b">${posts.length}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:0.85em;color:var(--text-muted)">Esta semana</span>
            <span style="font-weight:700;color:#3b82f6">${postsThisWeek}</span>
          </div>
        </div>
      </div>
      <!-- Panel derecho -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="margin:0 0 4px;font-size:1.25em;font-weight:700">Foro de la comunidad</h2>
            <p style="margin:0;color:var(--text-muted);font-size:0.9em">Conectate con tu equipo</p>
          </div>
          <select id="foro-sort" style="padding:6px 12px;border:1px solid var(--border-color,#e2e8f0);border-radius:8px;font-size:0.9em;background:#fff;cursor:pointer">
            <option value="recent">Más recientes</option>
            <option value="comments">Más comentados</option>
            <option value="pinned">Fijados primero</option>
          </select>
        </div>
        <div id="foro-posts-list">Cargando...</div>
      </div>
    </div>
  `;

  layout(html, { wide: true });

  let currentCategory = "todos";
  let currentSort = "recent";

  renderForumPostsList(posts, currentCategory, currentSort);

  document.getElementById("card-categorias").querySelectorAll(".foro-cat-item").forEach((item) => {
    item.addEventListener("mouseenter", () => { item.style.background = "#f8fafc"; });
    item.addEventListener("mouseleave", () => {
      item.style.background = item.dataset.cat === currentCategory ? "#f0f7ff" : "";
    });
    item.addEventListener("click", () => {
      currentCategory = item.dataset.cat;
      document.getElementById("card-categorias").querySelectorAll(".foro-cat-item").forEach((el) => {
        el.style.background = el.dataset.cat === currentCategory ? "#f0f7ff" : "";
        el.style.fontWeight = el.dataset.cat === currentCategory ? "600" : "";
      });
      renderForumPostsList(posts, currentCategory, currentSort);
    });
  });
  const todosItem = document.querySelector(".foro-cat-item[data-cat='todos']");
  if (todosItem) { todosItem.style.background = "#f0f7ff"; todosItem.style.fontWeight = "600"; }

  document.getElementById("foro-sort").addEventListener("change", (e) => {
    currentSort = e.target.value;
    renderForumPostsList(posts, currentCategory, currentSort);
  });

  document.getElementById("btn-nuevo-post").addEventListener("click", () => openNewPostModal(layout));
}

/** @param {Function} layout */
export async function renderForumPost(postId, layout) {
  layout(`<p class="loading-line">Cargando post...</p>`);

  let post, comments;
  try {
    [post, comments] = await Promise.all([
      api.apiRequest("GET", `/forum/posts/${postId}`),
      api.apiRequest("GET", `/forum/posts/${postId}/comments`),
    ]);
    if (!Array.isArray(comments)) comments = comments.comments || comments.items || [];
  } catch (ex) {
    const detail = humanizeApiError(ex.message);
    layout(`<div class="card" style="max-width:800px;margin:0 auto">
      <button onclick="location.hash='#/foro'" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:0.9em;padding:0;margin-bottom:16px">← Volver al foro</button>
      <p class="msg-error">${escapeHtml(detail)}</p></div>`);
    return;
  }

  const authorName = post.author_name || post.author_email || "Usuario";
  const authorInitial = authorName[0].toUpperCase();
  const authorColor = forumAvatarColor(authorName);
  const cat = post.category || "general";

  const commentsHtml = comments.length === 0
    ? `<p style="color:var(--text-muted);font-size:0.9em">Sin comentarios aún. ¡Sé el primero!</p>`
    : comments.map((c) => {
        const cAuthor = c.author_name || c.author_email || "Usuario";
        const cInitial = cAuthor[0].toUpperCase();
        const cColor = forumAvatarColor(cAuthor);
        return `<div style="display:flex;gap:12px;margin-bottom:16px">
          <div style="width:36px;height:36px;border-radius:50%;background:${cColor};display:flex;align-items:center;justify-content:center;color:white;font-size:0.85em;font-weight:600;flex-shrink:0">
            ${escapeHtml(cInitial)}
          </div>
          <div style="flex:1">
            <div style="font-weight:500">${escapeHtml(cAuthor)} <span style="color:var(--text-muted);font-size:0.85em">· ${c.team_name ? escapeHtml(c.team_name) + " · " : ""}${forumRelativeTime(c.created_at)}</span></div>
            <p style="margin:4px 0 0;white-space:pre-wrap;font-size:0.9em;line-height:1.5">${escapeHtml(c.content)}</p>
          </div>
        </div>`;
      }).join("");

  const postDetailHtml = `
    <div style="padding:24px;max-width:800px;margin:0 auto">
      <button id="btn-volver-foro" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:0.9em;padding:0;margin-bottom:16px;display:flex;align-items:center;gap:4px">← Volver al foro</button>
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px">
          <div style="width:44px;height:44px;border-radius:50%;background:${authorColor};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;flex-shrink:0;font-size:1.1em">
            ${escapeHtml(authorInitial)}
          </div>
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-weight:600">${escapeHtml(authorName)}</span>
              ${post.team_name ? `<span style="color:var(--text-muted);font-size:0.85em">· ${escapeHtml(post.team_name)}</span>` : ""}
              ${forumCategoryBadge(cat)}
              ${post.is_pinned ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600">Fijado</span>` : ""}
            </div>
            <div style="font-size:0.8em;color:var(--text-muted)">${forumRelativeTime(post.created_at)} · 👁 ${post.view_count || 0} vistas</div>
          </div>
        </div>
        <h2 style="margin:0 0 12px;font-size:1.3em">${escapeHtml(post.title)}</h2>
        <p style="white-space:pre-wrap;line-height:1.7;color:#334155;font-size:0.95em;margin:0">${escapeHtml(post.content)}</p>
      </div>
      <div id="foro-comments-section" style="margin-bottom:16px">
        <h3 style="margin:0 0 16px;font-size:1em;font-weight:700">${comments.length} comentario${comments.length !== 1 ? "s" : ""}</h3>
        ${commentsHtml}
      </div>
      <div class="card" style="margin-top:16px">
        <h4 style="margin:0 0 10px;font-size:0.95em;font-weight:600">Agregar comentario</h4>
        <textarea id="nuevo-comentario" placeholder="Escribí tu comentario..." style="width:100%;min-height:80px;padding:8px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;font-family:inherit;resize:vertical;box-sizing:border-box;font-size:0.9em"></textarea>
        <button id="btn-comentar" style="margin-top:8px;padding:8px 20px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.9em">Comentar</button>
        <span id="foro-comment-err" style="margin-left:12px;font-size:0.85em;color:#dc2626"></span>
      </div>
    </div>
  `;

  layout(postDetailHtml);

  document.getElementById("btn-volver-foro").addEventListener("click", () => {
    location.hash = "#/foro";
  });

  document.getElementById("btn-comentar").addEventListener("click", async () => {
    const content = (document.getElementById("nuevo-comentario").value || "").trim();
    const errEl = document.getElementById("foro-comment-err");
    if (!content) { if (errEl) errEl.textContent = "Escribí un comentario antes de enviar."; return; }
    if (errEl) errEl.textContent = "";
    const btn = document.getElementById("btn-comentar");
    if (btn) btn.disabled = true;
    try {
      await api.apiRequest("POST", `/forum/posts/${postId}/comments`, { content });
      location.hash = `#/foro/post/${postId}`;
      renderForumPost(postId, layout);
    } catch (ex) {
      if (errEl) errEl.textContent = humanizeApiError(ex.message);
      if (btn) btn.disabled = false;
    }
  });
}

function openNewPostModal(layout) {
  const existing = document.getElementById("modal-nuevo-post");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "modal-nuevo-post";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;";
  overlay.innerHTML = `
    <div style="background:var(--card-bg,#fff);border-radius:12px;padding:24px;width:500px;max-width:90vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)">
      <h3 style="margin:0 0 16px;font-size:1.1em;font-weight:700">Nueva publicación</h3>
      <div style="margin-bottom:12px">
        <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9em">Título</label>
        <input id="nuevo-post-titulo" type="text" placeholder="Título de la publicación" style="width:100%;padding:8px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;font-family:inherit;box-sizing:border-box;font-size:0.9em">
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9em">Categoría</label>
        <select id="nuevo-post-categoria" style="width:100%;padding:8px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;font-family:inherit;font-size:0.9em">
          <option value="general">General</option>
          <option value="anuncios">Anuncios</option>
          <option value="entrenamiento">Entrenamiento</option>
          <option value="competencias">Competencias</option>
        </select>
      </div>
      <div style="margin-bottom:16px">
        <label style="display:block;font-weight:500;margin-bottom:4px;font-size:0.9em">Contenido</label>
        <textarea id="nuevo-post-contenido" placeholder="¿Qué querés compartir?" style="width:100%;min-height:120px;padding:8px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;font-family:inherit;resize:vertical;box-sizing:border-box;font-size:0.9em"></textarea>
      </div>
      <p id="nuevo-post-err" style="color:#dc2626;font-size:0.85em;margin:0 0 10px;min-height:1em"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="btn-cancelar-post" style="padding:8px 16px;border:1px solid var(--border-color,#e2e8f0);border-radius:6px;background:transparent;cursor:pointer;font-size:0.9em">Cancelar</button>
        <button id="btn-publicar-post" style="padding:8px 20px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.9em">Publicar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("btn-cancelar-post").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById("btn-publicar-post").addEventListener("click", async () => {
    const title = (document.getElementById("nuevo-post-titulo").value || "").trim();
    const category = document.getElementById("nuevo-post-categoria").value;
    const content = (document.getElementById("nuevo-post-contenido").value || "").trim();
    const errEl = document.getElementById("nuevo-post-err");
    if (!title || !content) {
      if (errEl) errEl.textContent = "Completá título y contenido antes de publicar.";
      return;
    }
    if (errEl) errEl.textContent = "";
    const btn = document.getElementById("btn-publicar-post");
    if (btn) btn.disabled = true;
    try {
      await api.apiRequest("POST", "/forum/posts", { title, category, content });
      overlay.remove();
      location.hash = "#/foro";
      renderForum(layout);
    } catch (ex) {
      if (errEl) errEl.textContent = humanizeApiError(ex.message);
      if (btn) btn.disabled = false;
    }
  });
}
