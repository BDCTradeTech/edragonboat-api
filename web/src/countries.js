/**
 * Países en español (ISO 3166-1) vía i18n-iso-countries.
 * Evita Intl.DisplayNames/supportedValuesOf("region"), que en algunos navegadores lanza "Invalid key : region".
 * Sin Palestina (PS).
 */

import countries from "i18n-iso-countries";
import es from "i18n-iso-countries/langs/es.json";

countries.registerLocale(es);

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
  const code = getCountryCodeFromSpanishName(text);
  const flag = code ? `<span class="country-flag" aria-hidden="true">${flagEmojiFromIso2(code)}</span> ` : "";
  return `${flag}${escapeHtml(text)}`;
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
