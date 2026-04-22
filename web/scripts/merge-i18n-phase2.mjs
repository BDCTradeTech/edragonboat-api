/**
 * Fusión one-shot de claves fase-2 (roles, teams, competitions, routines, errores de ruta).
 * Uso: node scripts/merge-i18n-phase2.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(root, "..", "src", "locales");

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 */
function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = target[k];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      deepMerge(/** @type {Record<string, unknown>} */ (tv), /** @type {Record<string, unknown>} */ (sv));
    } else {
      target[k] = sv;
    }
  }
}

const addEs = JSON.parse(readFileSync(resolve(root, "phase2-add-es.json"), "utf-8"));
const addEn = JSON.parse(readFileSync(resolve(root, "phase2-add-en.json"), "utf-8"));

const esPath = resolve(localesDir, "es.json");
const es = JSON.parse(readFileSync(esPath, "utf-8"));
deepMerge(es, addEs);
writeFileSync(esPath, JSON.stringify(es, null, 2) + "\n", "utf-8");
console.log("Merged phase2 into es.json");

const others = ["en", "pt", "zh", "fil", "fr", "de", "ja", "ms"];
for (const code of others) {
  const p = resolve(localesDir, `${code}.json`);
  if (!existsSync(p)) {
    console.error("Missing", p);
    process.exit(1);
  }
  const j = JSON.parse(readFileSync(p, "utf-8"));
  deepMerge(j, addEn);
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n", "utf-8");
  console.log("Merged phase2 (EN) into", code + ".json");
}
