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
