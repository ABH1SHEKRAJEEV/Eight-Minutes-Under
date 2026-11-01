import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Inject a strict Content-Security-Policy into the production HTML only.
 * Dev mode stays CSP-free so the dev server / HMR keep working.
 *
 * The production bundle is a single inlined <script> and <style>, and all
 * images are inlined as data: URIs, so nothing may touch the network except
 * Google Fonts. connect-src 'none' blocks any attempt to phone home
 * (fetch/XHR/WebSocket exfiltration), object-src 'none' blocks Flash/Java/
 * embedded plugins, base-uri 'none' blocks <base> hijacking.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src data: 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const cspForProduction = (): Plugin => ({
  name: "inject-csp-meta",
  apply: "build",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
  },
});

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), viteSingleFile(), cspForProduction()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Production hardening: never ship sourcemaps; strip console/debugger noise.
  build: {
    sourcemap: false,
  },
  esbuild: command === "build" ? { drop: ["console", "debugger"] } : undefined,
}));
