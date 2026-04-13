import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  plugins: [
    {
      name: "edb-panel-version-meta",
      transformIndexHtml(html) {
        const v = pkg.version;
        const inject = `    <!-- EDB deploy check: panel v${v} -->\n    <meta name="edb-panel-version" content="${v}" />\n`;
        return html.replace("<head>", `<head>\n${inject}`);
      },
    },
  ],
});
