/**
 * Preferencia de idioma de la interfaz (panel web, no la app móvil).
 * Idioma por defecto: español (primera visita o sin clave en localStorage).
 */
export const UI_LANG_KEY = "edb_ui_lang";

/** Código BCP47 corto alineado con UI_LANGUAGES; usado como fallback de i18n. */
export const UI_LANG_DEFAULT = "es";

/** Orden alfabético por nombre en inglés. */
export const UI_LANGUAGES = [
  { code: "zh", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "ms", label: "Malay" },
  { code: "pt", label: "Portuguese" },
  { code: "es", label: "Spanish" },
].sort((a, b) => a.label.localeCompare(b.label, "en"));

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

export function getStoredUiLang() {
  try {
    const v = localStorage.getItem(UI_LANG_KEY);
    if (v && UI_LANGUAGES.some((x) => x.code === v)) return v;
  } catch {
    /* ignore */
  }
  return UI_LANG_DEFAULT;
}

export function setStoredUiLang(code) {
  try {
    localStorage.setItem(UI_LANG_KEY, code);
  } catch {
    /* ignore */
  }
}

export function applyDocumentLang(langCode) {
  document.documentElement.lang = BCP47[langCode] || langCode || BCP47[UI_LANG_DEFAULT] || "es";
}
