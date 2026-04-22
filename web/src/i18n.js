/**
 * Internacionalización del panel (claves anidadas: nav.sessions, shell.logout).
 * Fallback: idioma en curso → UI_LANG_DEFAULT (es) → se muestra la clave.
 *
 * Idiomas actuales (mismas claves en los 9): es, en, pt, zh, fil, fr, de, ja, ms — alineados con `UI_LANGUAGES` en locale.js.
 *
 * Añadir un idioma nuevo:
 * 1) `src/locales/XX.json` con las mismas claves que `es.json`.
 * 2) import aquí y entrada en `bundles`.
 * 3) `UI_LANGUAGES` en locale.js + `BCP47` si aplica.
 * 4) `npm run i18n:check` y `npm run build`.
 */
import { getStoredUiLang, UI_LANG_DEFAULT } from "./locale.js";

import es from "./locales/es.json";
import en from "./locales/en.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh.json";
import fil from "./locales/fil.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import ms from "./locales/ms.json";

const bundles = { es, en, pt, zh, fil, fr, de, ja, ms };

/**
 * @param {string} key  ej. "nav.home" o "shell.panelVersion"
 * @param {Record<string, string | number>|undefined} params  Reemplazos {name} en el texto
 * @returns {string}
 */
export function t(key, params) {
  const code = getStoredUiLang();
  const primary = bundles[code] || bundles[UI_LANG_DEFAULT];
  const fallback = bundles[UI_LANG_DEFAULT];
  let str = getByPath(primary, key);
  if (str === undefined || str === null) {
    str = getByPath(fallback, key);
  }
  if (str === undefined || str === null) {
    return key;
  }
  if (typeof str !== "string") {
    return key;
  }
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

/**
 * @param {object|undefined} obj
 * @param {string} path  "a.b.c"
 * @returns {unknown}
 */
function getByPath(obj, path) {
  if (obj == null || typeof path !== "string") return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
