/**
 * Comprueba que todos los `src/locales/*.json` tengan exactamente las mismas claves
 * que el idioma de referencia (es.json). Ejecutar desde `web/`: `npm run i18n:check`
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(root, "..", "src", "locales");
const REF = "es.json";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/**
 * @param {unknown} obj
 * @param {string} [prefix]
 * @returns {string[]}
 */
function flatKeys(obj, prefix = "") {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? [prefix] : [];
  }
  const keys = [];
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flatKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

if (!existsSync(localesDir)) fail(`No existe ${localesDir}`);

const refPath = resolve(localesDir, REF);
if (!existsSync(refPath)) fail(`Falta el archivo de referencia ${REF}`);

const ref = JSON.parse(readFileSync(refPath, "utf-8"));
const refSet = new Set(flatKeys(ref).sort());
if (refSet.size === 0) fail(`${REF} no tiene claves anidadas (vacío o formato inválido).`);

const files = readdirSync(localesDir).filter((f) => f.endsWith(".json"));
let err = 0;
for (const f of files) {
  if (f === REF) continue;
  const p = resolve(localesDir, f);
  let j;
  try {
    j = JSON.parse(readFileSync(p, "utf-8"));
  } catch (e) {
    console.error(`JSON inválido: ${f}`, e);
    err++;
    continue;
  }
  const s = new Set(flatKeys(j));
  for (const k of refSet) {
    if (!s.has(k)) {
      console.error(`[i18n] Falta clave en ${f}: ${k}`);
      err++;
    }
  }
  for (const k of s) {
    if (!refSet.has(k)) {
      console.error(`[i18n] Clave extra en ${f} (no está en ${REF}): ${k}`);
      err++;
    }
  }
}

if (err) fail(`[i18n] ${err} problema(s) de claves. Actualizá los JSON o sincronizá con ${REF}.`);

// PASO 2: Verificar valores idénticos a en.json (warning, no falla el build)
const enPath = resolve(localesDir, "en.json");
let enData = null;
if (existsSync(enPath)) {
  try { enData = JSON.parse(readFileSync(enPath, "utf-8")); } catch { /* ignorar */ }
}

/**
 * @param {unknown} obj
 * @param {string} [prefix]
 * @returns {Map<string, string>}
 */
function flatLeaves(obj, prefix = "") {
  const map = new Map();
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return map;
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      for (const [kk, vv] of flatLeaves(v, p)) map.set(kk, vv);
    } else {
      map.set(p, String(v));
    }
  }
  return map;
}

if (enData) {
  const enLeaves = flatLeaves(enData);
  // Claves que en en.json tienen valores considerados técnicos/neutros (números, siglas, símbolos)
  // Las excluimos del check de valores idénticos porque es esperable que coincidan.
  const neutralPattern = /^(\d[\d\s.]*m?|[A-Z]{2,5}|[Rr]\d|cm|kg|m\/s²|—|-|←|↪|↑|↓|[<>{}[\]@#]|Senior [ABC]|Premier|ACS|Open|Id|SPM|DPS|JPG|JSON|SMTP|v\{version\}|12345678)$/;

  const SKIP_LOCALES = new Set(["es.json", "en.json"]);
  for (const f of files) {
    if (SKIP_LOCALES.has(f)) continue;
    const p = resolve(localesDir, f);
    let j;
    try { j = JSON.parse(readFileSync(p, "utf-8")); } catch { continue; }
    const leaves = flatLeaves(j);
    let warnCount = 0;
    for (const [key, val] of leaves) {
      const enVal = enLeaves.get(key);
      if (enVal === undefined) continue;
      if (val === enVal && !neutralPattern.test(val.trim())) {
        warnCount++;
      }
    }
    if (warnCount > 0) {
      console.warn(`[i18n] WARNING — ${f}: ${warnCount} clave(s) con valor igual a en.json`);
    }
  }
}

console.log(`[i18n] OK — ${refSet.size} claves, ${files.length} archivos, referencia ${REF}`);
