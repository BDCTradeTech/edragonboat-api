/**
 * Comprueba que `npm run build` generó un dist listo para subir al servidor.
 * Ejecutar desde la carpeta `web/` (lo llama `postbuild`).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "..", "dist");
const indexPath = resolve(dist, "index.html");
const favPath = resolve(dist, "favicon.svg");
const assetsDir = resolve(dist, "assets");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!existsSync(indexPath)) fail("No existe dist/index.html. ¿Corriste npm run build desde la carpeta web/?");
if (!existsSync(favPath)) fail("No existe dist/favicon.svg. Debe estar en web/public/favicon.svg");

const html = readFileSync(indexPath, "utf-8");
if (!html.includes("favicon.svg")) fail("dist/index.html no enlaza favicon.svg — revisá el build.");
if (!html.includes("edb-panel-version")) fail("dist/index.html sin meta edb-panel-version — revisá vite.config.js");

const pkg = JSON.parse(readFileSync(resolve(root, "..", "package.json"), "utf-8"));
const v = pkg.version;
if (!html.includes(`content="${v}"`)) {
  fail(`Versión en index (${v}) no coincide con meta inyectada.`);
}

if (!existsSync(assetsDir)) fail("No existe dist/assets/");
const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".js") && f.startsWith("index-"));
if (!jsFiles.length) fail("No hay dist/assets/index-*.js");
const bundle = readFileSync(resolve(assetsDir, jsFiles[0]), "utf-8");
if (!bundle.includes('data-match="home"') || !bundle.includes("Panel v")) {
  fail("El bundle JS no contiene el menú Home ni Panel v — código viejo o build incorrecto.");
}

console.log(`dist/ OK — panel v${v}, favicon, Home. Subí el CONTENIDO de web/dist/ al root del sitio (no la carpeta dist).`);
