/**
 * Preferencia de idioma de la interfaz (panel web, no la app móvil).
 * Idioma por defecto: inglés (primera visita o sin clave en localStorage; p. ej. registro).
 *
 * Importante: `localStorage` es por origen (mismo sitio), no por usuario. Por eso, con el usuario
 * autenticado (id en `sessionStorage`, ver `getSessionUserId`) el idioma se guarda en
 * `edb_ui_lang_u_<id>`. Cada pestaña con otro inicio de sesión tiene su propio `sessionStorage`, así
 * que puede convivir varios usuarios en el mismo navegador.
 */
export const UI_LANG_KEY = "edb_ui_lang";

const UI_LANG_KEY_PREFIX = "edb_ui_lang_u_";

const SESSION_USER_ID_KEY = "edb_session_user_id";

/** Código BCP47 corto alineado con UI_LANGUAGES; usado como fallback de i18n. */
export const UI_LANG_DEFAULT = "en";

/** Orden de visualización fijo (no se ordena dinámicamente). */
export const UI_LANGUAGES = [
  { code: "es", label: "🇪🇸 Español" },
  { code: "en", label: "🇺🇸 English" },
  { code: "pt", label: "🇧🇷 Português" },
  { code: "zh", label: "🇨🇳 中文" },
  { code: "fil", label: "🇵🇭 Filipino" },
  { code: "fr", label: "🇫🇷 Français" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "ja", label: "🇯🇵 日本語" },
  { code: "ms", label: "🇲🇾 Bahasa Melayu" },
];

const BCP47 = {
  zh: "zh-CN",
  en: "en",
  fil: "fil",
  fr: "fr",
  de: "de",
  ja: "ja",
  ms: "ms",
  pt: "pt-BR",
  es: "es",
};

/**
 * @returns {number | null} Usuario cuya preferencia de idioma aplica en esta pestaña.
 */
export function getSessionUserId() {
  try {
    const s = sessionStorage.getItem(SESSION_USER_ID_KEY);
    if (s == null || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param {number | null} id
 */
export function setSessionUserId(id) {
  try {
    if (id == null) {
      sessionStorage.removeItem(SESSION_USER_ID_KEY);
    } else {
      sessionStorage.setItem(SESSION_USER_ID_KEY, String(id));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Código de idioma guardado: por usuario (localStorage) si hay sesión con id; si no, clave global
 * (pantallas sin login) o el defecto. Con usuario conectado, no reutiliza la clave antigua compartida
 * para no mezclar preferencias entre cuentas.
 */
export function getStoredUiLang() {
  const uid = getSessionUserId();
  try {
    if (uid != null) {
      const p = localStorage.getItem(`${UI_LANG_KEY_PREFIX}${uid}`);
      if (p && UI_LANGUAGES.some((x) => x.code === p)) {
        return p;
      }
      return UI_LANG_DEFAULT;
    }
    const v = localStorage.getItem(UI_LANG_KEY);
    if (v && UI_LANGUAGES.some((x) => x.code === v)) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return UI_LANG_DEFAULT;
}

/**
 * @param {string} code
 * @param {number | null} [forUserId]
 */
export function setStoredUiLang(code, forUserId = null) {
  const uid = forUserId != null ? forUserId : getSessionUserId();
  try {
    if (uid != null) {
      localStorage.setItem(`${UI_LANG_KEY_PREFIX}${uid}`, code);
    } else {
      localStorage.setItem(UI_LANG_KEY, code);
    }
  } catch {
    /* ignore */
  }
}

export function applyDocumentLang(langCode) {
  document.documentElement.lang = BCP47[langCode] || langCode || BCP47[UI_LANG_DEFAULT] || "en";
}

/** BCP-47 para `Intl` (fechas, números, `localeCompare`) según el idioma guardado de la UI. */
export function getUiLocale() {
  const code = getStoredUiLang();
  return BCP47[code] || BCP47[UI_LANG_DEFAULT] || "en";
}
