/**
 * Países en español (ISO 3166-1) vía i18n-iso-countries.
 * Evita Intl.DisplayNames/supportedValuesOf("region"), que en algunos navegadores lanza "Invalid key : region".
 * Sin Palestina (PS).
 */

import countries from "i18n-iso-countries";
import de from "i18n-iso-countries/langs/de.json";
import en from "i18n-iso-countries/langs/en.json";
import es from "i18n-iso-countries/langs/es.json";
import fr from "i18n-iso-countries/langs/fr.json";
import ja from "i18n-iso-countries/langs/ja.json";
import ms from "i18n-iso-countries/langs/ms.json";
import pt from "i18n-iso-countries/langs/pt.json";
import zh from "i18n-iso-countries/langs/zh.json";

import { getStoredUiLang } from "./locale.js";
import { escapeHtml } from "./utils.js";

countries.registerLocale(de);
countries.registerLocale(en);
countries.registerLocale(es);
countries.registerLocale(fr);
countries.registerLocale(ja);
countries.registerLocale(ms);
countries.registerLocale(pt);
countries.registerLocale(zh);

const EXCLUDE_CODES = new Set(["PS"]);

/**
 * @returns {{ code: string, name: string }[]}
 */
export function getCountryOptions() {
  const raw = countries.getNames("es", { select: "official" });
  const out = [];
  for (const [code, name] of Object.entries(raw)) {
    const c = code.toUpperCase();
    if (c.length !== 2 || EXCLUDE_CODES.has(c)) continue;
    if (/palestin/i.test(name)) continue;
    out.push({ code: c, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}

/** Mapa nombre oficial (es) → código ISO 3166-1 alpha-2 (listado i18n-iso-countries es). */
let nameToCodeCache = null;

function getNameToCodeMap() {
  if (!nameToCodeCache) {
    nameToCodeCache = new Map();
    for (const { code, name } of getCountryOptions()) {
      nameToCodeCache.set(name.trim().toLowerCase(), code);
    }
  }
  return nameToCodeCache;
}

/**
 * @param {string} countryName Nombre del país como en la app (español oficial).
 * @returns {string | null} Código ISO de 2 letras o null.
 */
export function getCountryCodeFromSpanishName(countryName) {
  if (!countryName || !String(countryName).trim()) return null;
  return getNameToCodeMap().get(String(countryName).trim().toLowerCase()) || null;
}

const UI_TO_I18N = {
  zh: "zh",
  en: "en",
  fil: "en",
  fr: "fr",
  de: "de",
  ja: "ja",
  ms: "ms",
  pt: "pt",
  es: "es",
};

/**
 * Muestra el país (BD: nombre oficial en ES o ISO-3166-1 alfa-2) en el idioma de la UI.
 * @param {string | null | undefined} stored
 * @returns {string}
 */
export function getCountryNameForUi(stored) {
  if (stored == null) return "";
  const raw = String(stored).trim();
  if (!raw) return "";
  let code = null;
  if (raw.length === 2 && /^[A-Za-z]{2}$/.test(raw)) {
    code = raw.toUpperCase();
  } else {
    code = getCountryCodeFromSpanishName(raw);
  }
  if (code) {
    const l = UI_TO_I18N[getStoredUiLang()] || "en";
    const n = countries.getName(code, l) || countries.getName(code, "en");
    if (n) return n;
  }
  return raw;
}

/** Emoji de bandera regional (🇦🇷) a partir de código ISO alpha-2. */
export function flagEmojiFromIso2(code) {
  if (!code || String(code).length !== 2) return "";
  const A = 0x1f1e6;
  const up = String(code).toUpperCase();
  if (up.length !== 2 || up < "AA" || up > "ZZ") return "";
  return (
    String.fromCodePoint(A + up.charCodeAt(0) - 65) +
    String.fromCodePoint(A + up.charCodeAt(1) - 65)
  );
}

/**
 * Icono junto al nombre del país: emoji de bandera si hay coincidencia con el listado en español.
 * @returns {string} HTML seguro (solo emoji + texto escapado).
 */
export function countryCellHtml(countryName) {
  const text = countryName != null && String(countryName).trim() !== "" ? String(countryName).trim() : "";
  if (!text) return "—";
  let code = null;
  let display = text;
  if (/^[A-Za-z]{2}$/.test(text)) {
    const up = text.toUpperCase();
    const nameEs = countries.getName(up, "es");
    if (nameEs) {
      code = up;
      display = nameEs;
    }
  }
  if (!code) code = getCountryCodeFromSpanishName(text);
  const lc = code ? String(code).toLowerCase() : "";
  const flag = lc
    ? `<img class="country-flag-img" src="https://flagcdn.com/16x12/${lc}.png" width="16" height="12" alt="" loading="lazy" decoding="async" /> `
    : "";
  return `${flag}${escapeHtml(display)}`;
}

/** Genera <option>… para un <select>; value = nombre para guardar en API. */
export function countrySelectOptionsHtml(selectedName) {
  const opts = getCountryOptions();
  const selNorm = (selectedName || "").trim().toLowerCase();
  const parts = [
    `<option value="">— Sin país —</option>`,
    ...opts.map((o) => {
      const picked = selNorm && o.name.toLowerCase() === selNorm ? " selected" : "";
      return `<option value="${escapeAttr(o.name)}"${picked}>${escapeHtml(o.name)}</option>`;
    }),
  ];
  return parts.join("");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
