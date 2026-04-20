/**
 * Preferencia de idioma de la interfaz (panel web). Valor por defecto: inglés.
 */

export const UI_LANG_KEY = "edb_ui_lang";

/** Orden alfabético por nombre en inglés. */
export const UI_LANGUAGES = [
  { code: "zh", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "ms", label: "Malay" },
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
  es: "es",
};

export function getStoredUiLang() {
  try {
    const v = localStorage.getItem(UI_LANG_KEY);
    if (v && UI_LANGUAGES.some((x) => x.code === v)) return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export function setStoredUiLang(code) {
  try {
    localStorage.setItem(UI_LANG_KEY, code);
  } catch {
    /* ignore */
  }
}

export function applyDocumentLang(langCode) {
  document.documentElement.lang = BCP47[langCode] || langCode || "en";
}
